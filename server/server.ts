import _ from "lodash";
import fs from "fs";
import path from "path";
import {Server as ioServer, Socket as ioSocket} from "socket.io";
import {Server as Engine} from "@socket.io/bun-engine";
import dns from "dns";
import colors from "./colors";
import net from "net";

import log from "./log";
import Client from "./client";
import ClientManager from "./clientManager";
import Uploader from "./plugins/uploader";
import previewCache from "./plugins/previewCache";
import * as prefetchBlocklist from "./plugins/prefetchBlocklist";
import {backfillPreviews, prefetchInputLinks, routeCachedImage} from "./plugins/irc-events/link";
import type Msg from "./models/msg";
import Helper from "./helper";
import Config from "./config";
import Identification from "./identification";
import changelog from "./plugins/changelog";
import inputs from "./plugins/inputs";
import Auth from "./plugins/auth";
import {VALID_TYPING_STATUSES} from "../shared/types/typing";
import {normalizeProxyUrl} from "../shared/stickers";
import {injectServerConfig} from "./plugins/html-config";
import {sendFile, serveStatic} from "./sendFile";

import themes from "./plugins/packages/themes";
themes.loadLocalThemes();

import packages from "./plugins/packages/index";
import {NetworkWithIrcFramework} from "./models/network";
import Utils from "./command-line/utils";
import {
	availableEmojiSets,
	defaultEmojiStyle,
	emojiSetRequest,
	watchEmojiSets,
} from "./plugins/emoji";
import type {
	ClientToServerEvents,
	ServerToClientEvents,
	InterServerEvents,
	SocketData,
	AuthPerformData,
} from "../shared/types/socket-events";
import {ChanType} from "../shared/types/chan";
import {
	LockedSharedConfiguration,
	SharedConfiguration,
	ConfigNetDefaults,
	LockedConfigNetDefaults,
} from "../shared/types/config";

type ServerOptions = {
	dev: boolean;
};

type RouteRequest = Bun.BunRequest<string>;
export type Route = (
	req: RouteRequest,
	server: Bun.Server<any>
) => Response | null | Promise<Response | null>;

// Cached built HTML (production only — read once at startup)
let cachedHtml: string | null = null;

type Socket = ioSocket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type Server = ioServer<
	ClientToServerEvents,
	ServerToClientEvents,
	InterServerEvents,
	SocketData
>;

// A random number that will force clients to reload the page if it differs
const serverHash = Math.floor(Date.now() * Math.random());

let manager: ClientManager | null = null;
let isDev = false;

export default async function (
	options: ServerOptions = {
		dev: false,
	}
) {
	log.info(`The Lounge ${colors.green(Helper.getVersion())} \
(Bun ${colors.green(process.versions.bun)} on ${colors.green(process.platform)} ${process.arch})`);
	log.info(`Configuration file: ${colors.green(Config.getConfigPath())}`);

	const staticOptions = {
		maxAge: 86400,
	};

	isDev = options.dev;

	// Socket.IO on Bun's own WebSocket server, see https://socket.io/blog/bun-engine/
	const engine = new Engine({
		path: "/socket.io/",
		pingTimeout: 60000,
		allowRequest(req) {
			const transport = new URL(req.url).searchParams.get("transport");
			return Config.values.transports.includes(transport as string)
				? Promise.resolve()
				: Promise.reject("Transport unknown");
		},
	});

	// The engine does not set the client's address, Socket.IO reads it from here
	engine.on("connection", (conn, req, bunServer) => {
		(conn as unknown as {remoteAddress?: string}).remoteAddress =
			bunServer.requestIP(req)?.address;
	});

	const sockets: Server = new ioServer();
	sockets.bind(engine as any);

	const routes: Record<string, Route> = {
		"/": indexRequest,
		"/service-worker.js": (req) =>
			servePublic(req, {headers: {"Cache-Control": "no-cache, no-transform"}}),
		"/storage/*": (req) =>
			serveStatic(
				req,
				Config.getStoragePath(),
				new URL(req.url).pathname.slice("/storage/".length),
				staticOptions
			),
		"/preview-cache/:hash": (req) => routeCachedImage(req, req.params.hash),

		// Operator-installed emoji sets (`thelounge emoji install`), next to the
		// bundled ones in public/img/emoji/
		"/img/emoji/:set/:file": (req) =>
			servePublic(req) || emojiSetRequest(req, req.params.set, req.params.file),

		// This route serves *installed themes only*. Local themes are served directly
		// from the `public/themes/` folder as static assets, without entering this
		// handler. Remember this if you make changes to this function, serving of
		// local themes will not get those changes.
		"/themes/:theme"(req) {
			const local = servePublic(req);

			if (local || !req.params.theme.endsWith(".css")) {
				return local;
			}

			const themeName = encodeURIComponent(req.params.theme.slice(0, -".css".length));
			const theme = themes.getByName(themeName);

			if (theme === undefined || theme.filename === undefined) {
				return null;
			}

			return sendFile(req, theme.filename);
		},

		"/packages/:package/:filename"(req) {
			const packageName = req.params.package;
			const fileName = req.params.filename;
			const packageFile = packages.getPackage(packageName);

			if (!packageFile || !packages.getFiles().includes(`${packageName}/${fileName}`)) {
				return null;
			}

			const packagePath = Config.getPackageModulePath(packageName);
			return sendFile(req, path.join(packagePath, fileName));
		},
	};

	if (Config.values.fileUpload.enable) {
		Object.assign(routes, Uploader.routes());
	}

	// Built client files, for every path no route took
	let fallback: Route = (req) => servePublic(req);

	if (options.dev) {
		const vite = await (await import("./plugins/dev-server")).default();
		const viteFirst =
			(handler: Route): Route =>
			async (req, bunServer) =>
				(await vite(req)) || handler(req, bunServer);

		// Vite answers first, like its middleware did in front of Express
		for (const [route, handler] of Object.entries(routes)) {
			routes[route] = viteFirst(handler);
		}

		fallback = viteFirst(fallback);
		routes["/"] = vite.indexRequest;
	}

	if (Config.values.public && (Config.values.ldap || {}).enable) {
		log.warn(
			"Server is public and set to use LDAP. Set to private mode if trying to use LDAP authentication."
		);
	}

	let tls: Bun.TLSOptions | undefined;

	if (Config.values.https.enable) {
		const keyPath = Helper.expandHome(Config.values.https.key);
		const certPath = Helper.expandHome(Config.values.https.certificate);
		const caPath = Helper.expandHome(Config.values.https.ca);

		if (!keyPath.length || !fs.existsSync(keyPath)) {
			log.error("Path to SSL key is invalid. Stopping server...");
			process.exit(1);
		}

		if (!certPath.length || !fs.existsSync(certPath)) {
			log.error("Path to SSL certificate is invalid. Stopping server...");
			process.exit(1);
		}

		if (caPath.length && !fs.existsSync(caPath)) {
			log.error("Path to SSL ca bundle is invalid. Stopping server...");
			process.exit(1);
		}

		tls = {
			key: fs.readFileSync(keyPath),
			cert: fs.readFileSync(certPath),
			ca: caPath ? fs.readFileSync(caPath) : undefined,
		};
	}

	const unix =
		typeof Config.values.host === "string" && Config.values.host.startsWith("unix:")
			? Config.values.host.replace(/^unix:/, "")
			: undefined;
	const listen = unix ? {unix} : {port: Config.values.port, hostname: Config.values.host};

	const {websocket, idleTimeout} = engine.handler();

	const withHeaders =
		(handler: Route) => async (req: RouteRequest, bunServer: Bun.Server<any>) => {
			const res = (await handler(req, bunServer)) || notFound();
			addSecurityHeaders(res);
			return res;
		};

	let server: Bun.Server<any>;

	try {
		server = Bun.serve({
			...listen,
			tls,
			websocket,
			idleTimeout,
			// Uploads enforce their own limit while streaming to disk
			maxRequestBodySize: Number.MAX_SAFE_INTEGER,
			routes: _.mapValues(routes, withHeaders) as any,
			async fetch(req, bunServer) {
				if (new URL(req.url).pathname === engine.opts.path) {
					// Bun's body limit is lifted for uploads, so cap polling payloads here
					const length = Number(req.headers.get("content-length") || 0);

					if (req.method === "POST" && length > engine.opts.maxHttpBufferSize) {
						return new Response(null, {status: 413});
					}

					return engine.handleRequest(req, bunServer);
				}

				return withHeaders(fallback)(req as RouteRequest, bunServer);
			},
			error(err) {
				log.error(`HTTP request failed: ${err.message}`);
				return new Response("Internal Server Error", {status: 500});
			},
		} as Bun.Serve.Options<any>);
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		log.error(`${e}`);
		process.exit(1);
	}

	if (unix) {
		log.info("Available on socket " + colors.green(unix));
	} else {
		const protocol = Config.values.https.enable ? "https" : "http";
		const host = server.hostname?.includes(":") ? `[${server.hostname}]` : server.hostname;

		log.info(
			"Available at " +
				colors.green(`${protocol}://${host}:${server.port}/`) +
				` in ${colors.bold(Config.values.public ? "public" : "private")} mode`
		);
	}

	sockets.on("connect", (socket) => {
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		socket.on("error", (err) => log.error(`io socket error: ${err}`));

		if (Config.values.public) {
			performAuthentication.call(socket, {});
		} else {
			socket.on("auth:perform", performAuthentication);
			socket.emit("auth:start", serverHash);
		}
	});

	// `thelounge emoji install`/`remove` while running: update open pages too
	watchEmojiSets((sets, defaultStyle) => sockets.emit("emoji:sets", {sets, defaultStyle}));

	manager = new ClientManager();
	packages.loadPackages();

	const defaultTheme = themes.getByName(Config.values.theme);

	if (defaultTheme === undefined) {
		log.warn(
			`The specified default theme "${colors.red(
				Config.values.theme
			)}" does not exist, verify your config.`
		);
		Config.values.theme = "default";
	} else if (defaultTheme.themeColor) {
		Config.values.themeColor = defaultTheme.themeColor;
	}

	new Identification((identHandler, err) => {
		if (err) {
			log.error(`Could not start identd server, ${err.message}`);
			process.exit(1);
		} else if (!manager) {
			log.error("Could not start identd server, ClientManager is undefined");
			process.exit(1);
		}

		void manager.init(identHandler, sockets);
	});

	// Handle ctrl+c and kill gracefully
	let suicideTimeout: NodeJS.Timeout | null = null;

	const exitGracefully = async function () {
		if (suicideTimeout !== null) {
			return;
		}

		log.info("Exiting...");

		// Close all client and IRC connections
		if (manager) {
			manager.clients.forEach((client) => client.quit());
		}

		if (Config.values.prefetchStorage) {
			log.info("Clearing prefetch storage folder, this might take a while...");

			(await import("./plugins/storage")).default.emptyDir();
		}

		// Forcefully exit after 3 seconds
		suicideTimeout = setTimeout(() => process.exit(1), 3000);

		// Close http server
		engine.close();
		void server.stop().then(() => {
			if (suicideTimeout !== null) {
				clearTimeout(suicideTimeout);
			}

			process.exit(0);
		});
	};

	/* eslint-disable @typescript-eslint/no-misused-promises */
	process.on("SIGINT", exitGracefully);
	process.on("SIGTERM", exitGracefully);
	/* eslint-enable @typescript-eslint/no-misused-promises */

	// Clear storage folder after server starts successfully
	if (Config.values.prefetchStorage) {
		import("./plugins/storage")
			.then(({default: storage}) => {
				storage.emptyDir();
			})
			.catch((err: Error) => {
				log.error(`Could not clear storage folder, ${err.message}`);
			});
	}

	// Download the remote prefetchBlocklist lists and refresh them daily
	if (Config.values.prefetch) {
		prefetchBlocklist.start();
	}

	if (previewCache.isEnabled()) {
		void previewCache.cleanup();
		setInterval(() => void previewCache.cleanup(), 24 * 60 * 60 * 1000).unref();
	}

	changelog.checkForUpdates(manager);

	return server;
}

function getClientLanguage(socket: Socket): string | undefined {
	const acceptLanguage = socket.handshake.headers["accept-language"];

	if (typeof acceptLanguage === "string" && /^[\x00-\x7F]{1,50}$/.test(acceptLanguage)) {
		// only allow ASCII strings between 1-50 characters in length
		return acceptLanguage;
	}

	return undefined;
}

function getClientIp(socket: Socket): string {
	let ip = socket.handshake.address || "127.0.0.1";

	if (Config.values.reverseProxy) {
		const forwarded = String(socket.handshake.headers["x-forwarded-for"])
			.split(/\s*,\s*/)
			.filter(Boolean);

		if (forwarded.length && net.isIP(forwarded[0])) {
			ip = forwarded[0];
		}
	}

	return ip.replace(/^::ffff:/, "");
}

function getClientSecure(socket: Socket) {
	let secure = socket.handshake.secure;

	if (Config.values.reverseProxy && socket.handshake.headers["x-forwarded-proto"] === "https") {
		secure = true;
	}

	return secure;
}

function notFound() {
	return new Response("Not found", {status: 404});
}

function servePublic(req: Request, options = {}) {
	return serveStatic(req, Utils.getFileFromRelativeToRoot("public"), new URL(req.url).pathname, {
		maxAge: 86400,
		...options,
	});
}

function addSecurityHeaders(res: Response) {
	// Sticker packs, images and videos load straight from the sticker proxy; files are shown
	// from blob: URLs of the client's sticker cache
	const stickerProxy = normalizeProxyUrl(Config.values.stickers?.proxyUrl);
	const stickerSrc = stickerProxy ? " " + new URL(stickerProxy).origin : "";
	const stickerBlob = stickerProxy ? " blob:" : "";
	const policies = [
		"default-src 'none'", // default to nothing
		"base-uri 'none'", // disallow <base>, has no fallback to default-src
		"form-action 'self'", // 'self' to fix saving passwords in Firefox, even though login is handled in javascript
		"connect-src 'self' ws: wss:" + stickerSrc, // allow self for polling; websockets
		"style-src 'self' https: 'unsafe-inline'", // allow inline due to use in irc hex colors
		isDev ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'", // javascript
		"worker-src 'self'", // service worker
		"manifest-src 'self'", // manifest.json
		"font-src 'self' https:", // allow loading fonts from secure sites (e.g. google fonts)
		"media-src 'self' https:" + stickerSrc + stickerBlob, // self for notification sound; allow https media (audio previews)
	];

	// If prefetch is enabled, but storage is not, we have to allow mixed content
	// - https://user-images.githubusercontent.com is where we currently push our changelog screenshots
	// - data: is required for the HTML5 video player
	if (Config.values.prefetchStorage || Config.values.prefetchCache || !Config.values.prefetch) {
		policies.push(
			"img-src 'self' data: https://user-images.githubusercontent.com" +
				stickerSrc +
				stickerBlob
		);
		policies.unshift("block-all-mixed-content");
	} else {
		policies.push("img-src http: https: data:" + stickerBlob);
	}

	// Routes may set a stricter policy of their own (preview images, svg emoji)
	if (!res.headers.has("Content-Security-Policy")) {
		res.headers.set("Content-Security-Policy", policies.join("; "));
	}

	res.headers.set("X-Content-Type-Options", "nosniff");
	res.headers.set("Referrer-Policy", "no-referrer");
}

function getBaseHtml(): string {
	if (cachedHtml) {
		return cachedHtml;
	}

	cachedHtml = fs.readFileSync(Utils.getFileFromRelativeToRoot("public", "index.html"), "utf-8");

	return cachedHtml;
}

function indexRequest() {
	try {
		const html = injectServerConfig(getBaseHtml());
		return new Response(html, {headers: {"Content-Type": "text/html; charset=utf-8"}});
	} catch (e) {
		const err = e as Error;
		log.error(`failed to serve index request: ${err.name}, ${err.message}`);
		return new Response("Internal Server Error", {status: 500});
	}
}

function initializeClient(
	socket: Socket,
	client: Client,
	token: string,
	lastMessage: number,
	openChannel: number
) {
	socket.off("auth:perform", performAuthentication);
	socket.emit("auth:success");

	client.clientAttach(socket.id, token);

	// Client sends currently active channel on reconnect,
	// pass it into `open` directly so it is verified and updated if necessary
	if (openChannel) {
		client.open(socket.id, openChannel);

		// If client provided channel passes checks, use it. if client has invalid
		// channel open (or windows like settings) then use last known server active channel
		openChannel = client.attachedClients[socket.id].openChannel || client.lastActiveChannel;
	} else {
		openChannel = client.lastActiveChannel;
	}

	if (Config.values.fileUpload.enable) {
		new Uploader(socket);
	}

	socket.on("disconnect", function () {
		process.nextTick(() => client.clientDetach(socket.id));
	});

	socket.on("input", (data) => {
		if (_.isPlainObject(data)) {
			client.input(data);
		}
	});

	// Acknowledged right away with the accepted and blocked links, previews follow as events
	socket.on("input:preview", (data, ack) => {
		const result =
			_.isPlainObject(data) && client.find(data.target)
				? // Only the requesting socket gets the previews, the message has not been sent yet
				  prefetchInputLinks(client, data.links, (preview, removed) => {
						socket.emit("input:preview", {
							target: data.target,
							preview,
							removed: !!removed,
						});
				  })
				: {accepted: [], blocked: []};

		if (typeof ack === "function") {
			ack(result);
		}
	});

	socket.on("typing", (data) => {
		if (!_.isPlainObject(data)) {
			return;
		}

		const status = data.status;

		if (!VALID_TYPING_STATUSES.has(status)) {
			return;
		}

		const target = client.find(data.target);

		if (!target) {
			return;
		}

		const {network, chan} = target;

		if (chan.type !== ChanType.CHANNEL && chan.type !== ChanType.QUERY) {
			return;
		}

		const irc = network.irc;

		if (!irc?.network?.cap?.isEnabled("message-tags")) {
			return;
		}

		irc.tagmsg(chan.name, {"+typing": status});
	});

	socket.on("more", (data) => {
		if (_.isPlainObject(data)) {
			const history = client.more(data);

			if (history !== null) {
				socket.emit("more", history);
			}
		}
	});

	socket.on("network:new", (data) => {
		if (_.isPlainObject(data)) {
			// prevent people from overriding webirc settings
			data.uuid = null;
			data.commands = null;
			data.ignoreList = null;

			client.connectToNetwork(data);
		}
	});

	socket.on("network:get", (data) => {
		if (typeof data !== "string") {
			return;
		}

		const network = _.find(client.networks, {uuid: data});

		if (!network) {
			return;
		}

		socket.emit("network:info", network.exportForEdit());
	});

	socket.on("network:edit", (data) => {
		if (!_.isPlainObject(data)) {
			return;
		}

		const network = _.find(client.networks, {uuid: data.uuid});

		if (!network) {
			return;
		}

		(network as NetworkWithIrcFramework).edit(client, data);
	});

	socket.on("network:media-preview-toggle", (data) => {
		if (!_.isPlainObject(data) || typeof data.name !== "string" || !data.name) {
			return;
		}

		const network = _.find(client.networks, {uuid: data.uuid});

		if (!network) {
			return;
		}

		network.toggleMediaPreviewBlock(data.name);
		client.save();

		for (const attachedClient of Object.keys(client.attachedClients)) {
			manager!.sockets.in(attachedClient).emit("network:info", {
				uuid: network.uuid,
				mediaPreviewBlocklist: network.mediaPreviewBlocklist,
			});
		}
	});

	socket.on("history:clear", (data) => {
		if (_.isPlainObject(data)) {
			client.clearHistory(data);
		}
	});

	if (!Config.values.public && !Config.values.ldap.enable) {
		socket.on("change-password", (data) => {
			if (_.isPlainObject(data)) {
				const old = data.old_password;
				const p1 = data.new_password;
				const p2 = data.verify_password;

				if (typeof p1 === "undefined" || p1 === "" || p1 !== p2) {
					socket.emit("change-password", {
						error: "",
						success: false,
					});
					return;
				}

				Helper.password
					.compare(old || "", client.config.password)
					.then((matching) => {
						if (!matching) {
							socket.emit("change-password", {
								error: "password_incorrect",
								success: false,
							});
							return;
						}

						const hash = Helper.password.hash(p1);

						client.setPassword(hash, (success: boolean) => {
							socket.emit("change-password", {
								success: success,
								error: success ? undefined : "update_failed",
							});
						});
					})
					.catch((error: Error) => {
						log.error(`Error while checking users password. Error: ${error.message}`);
					});
			}
		});
	}

	socket.on("open", (data) => {
		client.open(socket.id, data);
	});

	socket.on("sort:networks", (data) => {
		if (!_.isPlainObject(data)) {
			return;
		}

		if (!Array.isArray(data.order)) {
			return;
		}

		client.sortNetworks(data.order);
	});

	socket.on("sort:channels", (data) => {
		if (!_.isPlainObject(data)) {
			return;
		}

		if (!Array.isArray(data.order) || typeof data.network !== "string") {
			return;
		}

		client.sortChannels(data.network, data.order);
	});

	socket.on("names", (data) => {
		if (_.isPlainObject(data)) {
			client.names(data);
		}
	});

	socket.on("last-seen", (data) => {
		if (_.isPlainObject(data)) {
			client.lastSeen(data);
		}
	});

	socket.on("changelog", () => {
		Promise.all([changelog.fetch(), packages.outdated()])
			.then(([changelogData, packageUpdate]) => {
				changelogData.packages = packageUpdate;
				socket.emit("changelog", changelogData);
			})
			.catch((error: Error) => {
				log.error(`Error while fetching changelog. Error: ${error.message}`);
			});
	});

	// In public mode only one client can be connected,
	// so there's no need to handle msg:preview:toggle
	if (!Config.values.public) {
		socket.on("msg:preview:toggle", (data) => {
			if (!_.isPlainObject(data)) {
				return;
			}

			const networkAndChan = client.find(data.target);
			const newState = Boolean(data.shown);

			if (!networkAndChan) {
				return;
			}

			// Process multiple message at once for /collapse and /expand commands
			if (Array.isArray(data.messageIds)) {
				for (const msgId of data.messageIds) {
					const message = networkAndChan.chan.findMessage(msgId);

					if (message) {
						for (const preview of message.previews) {
							preview.shown = newState;
						}
					}
				}

				return;
			}

			const message = data.msgId ? networkAndChan.chan.findMessage(data.msgId) : null;

			if (!message) {
				return;
			}

			const preview = data.link ? message.findPreview(data.link) : null;

			if (preview) {
				preview.shown = newState;
			}
		});
	}

	socket.on("mentions:get", () => {
		socket.emit("mentions:list", client.mentions);
	});

	socket.on("mentions:dismiss", (msgId) => {
		if (typeof msgId !== "number") {
			return;
		}

		client.mentions.splice(
			client.mentions.findIndex((m) => m.msgId === msgId),
			1
		);
	});

	socket.on("mentions:dismiss_all", () => {
		client.mentions = [];
	});

	if (!Config.values.public) {
		socket.on("push:register", (subscription) => {
			if (!Object.prototype.hasOwnProperty.call(client.config.sessions, token)) {
				return;
			}

			const registration = client.registerPushSubscription(
				client.config.sessions[token],
				subscription
			);

			if (registration) {
				void client.manager.webPush.pushSingle(client, registration, {
					type: "notification",
					timestamp: Date.now(),
					title: "The Lounge",
					body: "🚀 Push notifications have been enabled",
				});
			}
		});

		socket.on("push:unregister", () => client.unregisterPushSubscription(token));
	}

	const sendSessionList = () => {
		// TODO: this should use the ClientSession type currently in client
		const sessions = _.map(client.config.sessions, (session, sessionToken) => {
			return {
				current: sessionToken === token,
				active: _.reduce(
					client.attachedClients,
					(count, attachedClient) =>
						count + (attachedClient.token === sessionToken ? 1 : 0),
					0
				),
				lastUse: session.lastUse,
				ip: session.ip,
				agent: session.agent,
				token: sessionToken, // TODO: Ideally don't expose actual tokens to the client
			};
		});

		socket.emit("sessions:list", sessions);
	};

	socket.on("sessions:get", sendSessionList);

	if (!Config.values.public) {
		socket.on("setting:set", (newSetting) => {
			if (!_.isPlainObject(newSetting)) {
				return;
			}

			if (
				typeof newSetting.value === "object" ||
				typeof newSetting.name !== "string" ||
				newSetting.name[0] === "_"
			) {
				return;
			}

			// We do not need to do write operations and emit events if nothing changed.
			if (client.config.clientSettings[newSetting.name] !== newSetting.value) {
				client.config.clientSettings[newSetting.name] = newSetting.value;

				// Pass the setting to all clients.
				client.emit("setting:new", {
					name: newSetting.name,
					value: newSetting.value,
				});

				client.save();

				if (newSetting.name === "highlights" || newSetting.name === "highlightExceptions") {
					client.compileCustomHighlights();
				} else if (newSetting.name === "awayMessage") {
					if (typeof newSetting.value !== "string") {
						newSetting.value = "";
					}

					client.awayMessage = newSetting.value;
				}
			}
		});

		socket.on("setting:get", () => {
			if (!Object.prototype.hasOwnProperty.call(client.config, "clientSettings")) {
				socket.emit("setting:all", {});
				return;
			}

			const clientSettings = client.config.clientSettings;
			socket.emit("setting:all", clientSettings);
		});

		socket.on("search", (query) => {
			const results = client.search(query);
			socket.emit("search:results", results);
		});

		socket.on("mute:change", ({target, setMutedTo}) => {
			const networkAndChan = client.find(target);

			if (!networkAndChan) {
				return;
			}

			const {chan, network} = networkAndChan;

			// If the user mutes the lobby, we mute the entire network.
			if (chan.type === ChanType.LOBBY) {
				for (const channel of network.channels) {
					if (channel.type !== ChanType.SPECIAL) {
						channel.setMuteStatus(setMutedTo);
					}
				}
			} else {
				if (chan.type !== ChanType.SPECIAL) {
					chan.setMuteStatus(setMutedTo);
				}
			}

			for (const attachedClient of Object.keys(client.attachedClients)) {
				manager!.sockets.in(attachedClient).emit("mute:changed", {
					target,
					status: setMutedTo,
				});
			}

			client.save();
		});
	}

	socket.on("sign-out", (tokenToSignOut) => {
		// If no token provided, sign same client out
		if (!tokenToSignOut || typeof tokenToSignOut !== "string") {
			tokenToSignOut = token;
		}

		if (!Object.prototype.hasOwnProperty.call(client.config.sessions, tokenToSignOut)) {
			return;
		}

		delete client.config.sessions[tokenToSignOut];

		client.save();

		_.map(client.attachedClients, (attachedClient, socketId) => {
			if (attachedClient.token !== tokenToSignOut) {
				return;
			}

			const socketToRemove = manager!.sockets.of("/").sockets.get(socketId);

			socketToRemove!.emit("sign-out");
			socketToRemove!.disconnect();
		});

		// Do not send updated session list if user simply logs out
		if (tokenToSignOut !== token) {
			sendSessionList();
		}
	});

	// socket.join is a promise depending on the adapter.
	void socket.join(client.id);

	const sendInitEvent = (tokenToSend?: string) => {
		const networks = client.networks.map((network) => {
			const clone = network.getFilteredClone(openChannel, lastMessage);
			clone.channels.forEach((chan, j) =>
				backfillPreviews(client, network.channels[j], chan.messages as Msg[])
			);
			return clone;
		});

		socket.emit("init", {
			active: openChannel,
			networks,
			token: tokenToSend,
		});
		socket.emit("commands", inputs.getCommands());
	};

	if (Config.values.public) {
		sendInitEvent();
	} else if (!token) {
		client.generateToken((newToken) => {
			token = client.calculateTokenHash(newToken);

			// generateToken is asynchronous, so the socket may have disconnected while it
			// was running, in which case clientDetach has already removed the attached
			// client. There is nothing left to hand the token to: the session would record
			// a connection that is gone and sendInitEvent would emit into a closed socket.
			const attachedClient = client.attachedClients[socket.id];

			if (!attachedClient) {
				return;
			}

			attachedClient.token = token;

			client.updateSession(token, getClientIp(socket), socket.request);
			sendInitEvent(newToken);
		});
	} else {
		client.updateSession(token, getClientIp(socket), socket.request);
		sendInitEvent();
	}
}

function getClientConfiguration(): SharedConfiguration | LockedSharedConfiguration {
	const common = {
		fileUpload: Config.values.fileUpload.enable,
		ldapEnabled: Config.values.ldap.enable,
		isUpdateAvailable: changelog.isUpdateAvailable,
		applicationServerKey: manager!.webPush.vapidKeys!.publicKey,
		version: Helper.getVersionNumber(),
		gitCommit: Helper.getGitCommit(),
		themes: themes.getAll(),
		defaultTheme: Config.values.theme,
		emojiSets: availableEmojiSets(),
		emojiDefaultStyle: defaultEmojiStyle(),
		public: Config.values.public,
		useHexIp: Config.values.useHexIp,
		prefetch: Config.values.prefetch,
		stickerProxyUrl: normalizeProxyUrl(Config.values.stickers?.proxyUrl),
		fileUploadMaxFileSize: Uploader ? Uploader.getMaxFileSize() : undefined, // TODO can't be undefined?
	};

	const defaultsOverride = {
		nick: Config.getDefaultNick(), // expand the number part

		// TODO: this doesn't seem right, if the client needs this as a buffer
		// the client ought to add it on its own
		sasl: "",
		saslAccount: "",
		saslPassword: "",
	};

	if (!Config.values.lockNetwork) {
		const defaults: ConfigNetDefaults = {
			..._.clone(Config.values.defaults),
			...defaultsOverride,
		};
		const result: SharedConfiguration = {
			...common,
			defaults: defaults,
			lockNetwork: Config.values.lockNetwork,
		};
		return result;
	}

	// Only send defaults that are visible on the client
	const defaults: LockedConfigNetDefaults = {
		..._.omit(Config.values.defaults, ["host", "port", "tls", "rejectUnauthorized"]),
		...defaultsOverride,
	};

	const result: LockedSharedConfiguration = {
		...common,
		lockNetwork: Config.values.lockNetwork,
		defaults: defaults,
	};

	return result;
}

function performAuthentication(this: Socket, data: AuthPerformData) {
	if (!_.isPlainObject(data)) {
		return;
	}

	const socket = this;
	let client: Client | undefined;
	let token: string;

	const finalInit = () => {
		let lastMessage = -1;

		if (data && "lastMessage" in data && data.lastMessage) {
			lastMessage = data.lastMessage;
		}

		// TODO: bonkers, but for now good enough until we rewrite the logic properly
		// initializeClient will check for if(openChannel) and as 0 is falsey it does the fallback...
		let openChannel = 0;

		if (data && "openChannel" in data && data.openChannel) {
			openChannel = data.openChannel;
		}

		// TODO: remove this once the logic is cleaned up
		if (!client) {
			throw new Error("finalInit called with undefined client, this is a bug");
		}

		initializeClient(socket, client, token, lastMessage, openChannel);
	};

	const initClient = () => {
		if (!client) {
			throw new Error("initClient called with undefined client");
		}

		// Configuration does not change during runtime of TL,
		// and the client listens to this event only once
		if (data && (!("hasConfig" in data) || !data.hasConfig)) {
			socket.emit("configuration", getClientConfiguration());

			socket.emit(
				"push:issubscribed",
				token && client.config.sessions[token].pushSubscription ? true : false
			);
		}

		const clientIP = getClientIp(socket);

		client.config.browser = {
			ip: clientIP,
			isSecure: getClientSecure(socket),
			language: getClientLanguage(socket),
		};

		// If webirc is enabled perform reverse dns lookup
		if (Config.values.webirc === null) {
			return finalInit();
		}

		const cb_client = client; // ensure that TS figures out that client can't be nil
		reverseDnsLookup(clientIP, (hostname) => {
			cb_client.config.browser!.hostname = hostname;

			finalInit();
		});
	};

	if (Config.values.public) {
		client = new Client(manager!);
		client.connect();
		manager!.clients.push(client);

		const cb_client = client; // ensure TS can see we never have a nil client
		socket.on("disconnect", function () {
			manager!.clients = _.without(manager!.clients, cb_client);
			cb_client.quit();
		});

		initClient();

		return;
	}

	if (typeof data.user !== "string") {
		return;
	}

	const authCallback = (success: boolean) => {
		// Authorization failed
		if (!success) {
			if (!client) {
				log.warn(
					`Authentication for non existing user attempted from ${colors.bold(
						getClientIp(socket)
					)}`
				);
			} else {
				log.warn(
					`Authentication failed for user ${colors.bold(data.user)} from ${colors.bold(
						getClientIp(socket)
					)}`
				);
			}

			socket.emit("auth:failed");
			return;
		}

		// If authorization succeeded but there is no loaded user,
		// load it and find the user again (this happens with LDAP)
		if (!client) {
			client = manager!.loadUser(data.user);

			if (!client) {
				throw new Error(`authCallback: ${data.user} not found after second lookup`);
			}
		}

		initClient();
	};

	client = manager!.findClient(data.user);

	// We have found an existing user and client has provided a token
	if (client && "token" in data && data.token) {
		const providedToken = client.calculateTokenHash(data.token);

		if (Object.prototype.hasOwnProperty.call(client.config.sessions, providedToken)) {
			token = providedToken;

			authCallback(true);
			return;
		}
	}

	if (!("user" in data && "password" in data)) {
		log.warn("performAuthentication: callback data has no user or no password");
		authCallback(false);
		return;
	}

	Auth.initialize().then(() => {
		// Perform password checking
		Auth.auth(manager, client, data.user, data.password, authCallback);
	});
}

function reverseDnsLookup(ip: string, callback: (hostname: string) => void) {
	// node can throw, even if we provide valid input based on the DNS server
	// returning SERVFAIL it seems: https://github.com/thelounge/thelounge/issues/4768
	// so we manually resolve with the ip as a fallback in case something fails
	try {
		dns.reverse(ip, (reverseErr, hostnames) => {
			if (reverseErr || hostnames.length < 1) {
				return callback(ip);
			}

			dns.resolve(
				hostnames[0],
				net.isIP(ip) === 6 ? "AAAA" : "A",
				(resolveErr, resolvedIps) => {
					// TODO: investigate SoaRecord class
					if (!Array.isArray(resolvedIps)) {
						return callback(ip);
					}

					if (resolveErr || resolvedIps.length < 1) {
						return callback(ip);
					}

					for (const resolvedIp of resolvedIps) {
						if (ip === resolvedIp) {
							return callback(hostnames[0]);
						}
					}

					return callback(ip);
				}
			);
		});
	} catch (err) {
		log.error(`failed to resolve rDNS for ${ip}, using ip instead`, (err as any).toString());
		setImmediate(callback, ip); // makes sure we always behave asynchronously
	}
}
