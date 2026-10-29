import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import https from "https";
import net, {AddressInfo} from "net";
import forge from "node-forge";
import {expect} from "vitest";
import util from "../util";
import Config from "../../server/config";
import link, {backfillPreviews, routeCachedImage} from "../../server/plugins/irc-events/link";
import previewCache from "../../server/plugins/previewCache";
import {createProxyAgents, parseProxyUrl} from "../../server/plugins/prefetchProxy";

function listen(server: net.Server) {
	return new Promise<number>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port))
	);
}

function close(server: net.Server) {
	return new Promise<void>((resolve) => server.close(() => resolve()));
}

function pipeTo(socket: net.Socket, port: number, reply: Buffer | string, head?: Buffer) {
	const upstream = net.connect(port, "127.0.0.1", () => {
		socket.write(reply);

		if (head?.length) {
			upstream.write(head);
		}

		socket.pipe(upstream).pipe(socket);
	});
	upstream.on("error", () => socket.destroy()).on("close", () => socket.destroy());
	socket.on("error", () => upstream.destroy()).on("close", () => upstream.destroy());
}

// Minimal HTTP proxy: forwards absolute-URI requests and tunnels CONNECT
function createHttpProxy(seen: string[]) {
	const proxy = http.createServer((req, res) => {
		seen.push(`${req.method} ${req.url} ${req.headers["proxy-authorization"] || ""}`);
		const target = new URL(req.url!);
		const upstream = http.request(
			{
				host: "127.0.0.1",
				port: target.port,
				path: target.pathname + target.search,
				method: req.method,
				headers: req.headers,
			},
			(upstreamRes) => {
				res.writeHead(upstreamRes.statusCode!, upstreamRes.headers);
				upstreamRes.pipe(res);
			}
		);
		req.pipe(upstream);
	});
	proxy.on("connect", (req, socket: net.Socket, head) => {
		seen.push(`CONNECT ${req.url} ${req.headers["proxy-authorization"] || ""}`);
		pipeTo(socket, Number(req.url!.split(":").pop()), "HTTP/1.1 200 OK\r\n\r\n", head);
	});
	return proxy;
}

// Minimal SOCKS5 server (no auth) that records the requested destination
function createSocksProxy(seen: string[]) {
	return net.createServer((socket) => {
		socket.once("data", () => {
			socket.write(Buffer.from([5, 0]));
			socket.once("data", (req) => {
				let host: string;
				let offset: number;

				if (req[3] === 3) {
					host = req.subarray(5, 5 + req[4]).toString();
					offset = 5 + req[4];
				} else {
					host = Array.from(req.subarray(4, 8)).join(".");
					offset = 8;
				}

				const port = req.readUInt16BE(offset);
				seen.push(`${host}:${port}`);
				pipeTo(socket, port, Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
			});
		});
	});
}

describe("prefetchProxy", function () {
	let target: http.Server;
	let targetPort: number;
	let targetRequests: number;

	beforeEach(async function () {
		targetRequests = 0;
		target = http.createServer((req, res) => {
			targetRequests++;
			res.setHeader("Content-Type", "text/html");
			res.end("<title>proxied title</title>");
		});
		targetPort = await listen(target);
	});

	afterEach(async function () {
		Config.values.prefetchProxy = "";
		await close(target);
	});

	function preview(url: string) {
		const client = util.createClient();
		const network = util.createNetwork();
		const message = client.createMessage({text: url});

		return new Promise<any>((resolve) => {
			client.on("msg:preview", (data) => resolve(data.preview));
			link(client as any, network.channels[0], message, message.text);
		});
	}

	it("should validate proxy URLs", function () {
		expect(parseProxyUrl("socks5h://u:p@127.0.0.1:1080").hostname).to.equal("127.0.0.1");
		expect(parseProxyUrl("http://proxy").protocol).to.equal("http:");
		expect(() => parseProxyUrl("ftp://proxy:21")).to.throw("Unsupported protocol");
		expect(() => parseProxyUrl("not a url")).to.throw();
	});

	it("should fetch directly without a proxy", async function () {
		const data = await preview(`http://127.0.0.1:${targetPort}/direct`);

		expect(data.head).to.equal("proxied title");
		expect(targetRequests).to.equal(1);
	});

	it("should fetch http links through an HTTP proxy", async function () {
		const seen: string[] = [];
		const proxy = createHttpProxy(seen);
		const proxyPort = await listen(proxy);
		Config.values.prefetchProxy = `http://us%40er:p%3Ass@127.0.0.1:${proxyPort}`;

		const data = await preview(`http://127.0.0.1:${targetPort}/via-http`);
		await close(proxy);

		expect(data.head).to.equal("proxied title");
		expect(seen).to.deep.equal([
			`GET http://127.0.0.1:${targetPort}/via-http Basic ${Buffer.from("us@er:p:ss").toString(
				"base64"
			)}`,
		]);
	});

	it("should fetch through SOCKS5 with remote DNS for socks5h", async function () {
		const seen: string[] = [];
		const proxy = createSocksProxy(seen);
		const proxyPort = await listen(proxy);

		Config.values.prefetchProxy = `socks5h://127.0.0.1:${proxyPort}`;
		const data = await preview(`http://localhost:${targetPort}/via-socks5h`);
		Config.values.prefetchProxy = `socks5://127.0.0.1:${proxyPort}`;
		await preview(`http://127.0.0.1:${targetPort}/via-socks5`);
		await close(proxy);

		expect(data.head).to.equal("proxied title");
		expect(seen).to.deep.equal([`localhost:${targetPort}`, `127.0.0.1:${targetPort}`]);
		expect(targetRequests).to.equal(2);
	});

	it("should tunnel https through HTTP CONNECT and SOCKS5", async function () {
		const keys = crypto.generateKeyPairSync("rsa", {modulusLength: 2048});
		const key = keys.privateKey.export({type: "pkcs1", format: "pem"}).toString();
		const cert = forge.pki.createCertificate();
		cert.publicKey = forge.pki.publicKeyFromPem(
			keys.publicKey.export({type: "spki", format: "pem"}).toString()
		);
		cert.validity.notBefore = new Date(Date.now() - 60000);
		cert.validity.notAfter = new Date(Date.now() + 3600000);
		cert.sign(forge.pki.privateKeyFromPem(key), forge.md.sha256.create());
		const secure = https.createServer(
			{key, cert: forge.pki.certificateToPem(cert)},
			(req, res) => res.end(`secure ${req.url}`)
		);
		const securePort = await listen(secure);
		const seen: string[] = [];
		const httpProxy = createHttpProxy(seen);
		const socksProxy = createSocksProxy(seen);
		const httpPort = await listen(httpProxy);
		const socksPort = await listen(socksProxy);

		const get = (proxy: string) =>
			new Promise<string>((resolve, reject) => {
				https
					.get(
						`https://127.0.0.1:${securePort}/x`,
						{
							agent: createProxyAgents(proxy, 5000).https,
							rejectUnauthorized: false,
						},
						(res) => {
							let body = "";
							res.on("data", (chunk) => (body += chunk));
							res.on("end", () => resolve(body));
						}
					)
					.on("error", reject);
			});

		expect(await get(`http://127.0.0.1:${httpPort}`)).to.equal("secure /x");
		expect(await get(`socks5h://127.0.0.1:${socksPort}`)).to.equal("secure /x");
		await Promise.all([close(secure), close(httpProxy), close(socksProxy)]);

		expect(seen).to.deep.equal([`CONNECT 127.0.0.1:${securePort} `, `127.0.0.1:${securePort}`]);
	});

	it("should send preview cache, cached image and backfill fetches through the proxy", async function () {
		const seen: string[] = [];
		const proxy = createHttpProxy(seen);
		const proxyPort = await listen(proxy);
		const app = util.createWebserver();
		app.get("/page", (_req: any, res: any) => {
			res.send("<title>cached</title><meta property='og:image' content='/image.png'>");
		});
		app.get("/image.png", (_req: any, res: any) => {
			res.sendFile(path.resolve("client/public/img/logo-grey-bg-120x120px.png"));
		});
		app.get("/history", (_req: any, res: any) => {
			res.send("<title>history</title>");
		});
		app.get("/preview-cache/:hash", (req: any, res: any) => void routeCachedImage(req, res));
		const server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		Config.values.prefetchProxy = `http://127.0.0.1:${proxyPort}`;
		Config.values.prefetchCache = true;

		try {
			const thumb = (await preview(`${base}/page`)).thumb;
			expect(thumb).to.equal(`preview-cache/${previewCache.hash(`${base}/image.png`)}`);

			fs.unlinkSync(previewCache.getPath(thumb.split("/")[1], "img"));
			expect((await fetch(`${base}/${thumb}`)).status).to.equal(200);

			const client = util.createClient();
			const network = util.createNetwork();
			const message = client.createMessage({type: "message", text: `${base}/history`});
			const backfilled = new Promise<any>((resolve) =>
				client.once("msg:preview", (data) => resolve(data.preview))
			);
			backfillPreviews(client as any, network.channels[0], [message]);
			expect((await backfilled).head).to.equal("history");

			expect(seen).to.deep.equal([
				`GET ${base}/page `,
				`GET ${base}/image.png `,
				`GET ${base}/image.png `,
				`GET ${base}/history `,
			]);
		} finally {
			Config.values.prefetchCache = false;
			await previewCache.flush();
			fs.rmSync(Config.getPreviewCachePath(), {recursive: true, force: true});
			await Promise.all([close(proxy), close(server)]);
		}
	});

	it("should fail closed with an invalid proxy", async function () {
		Config.values.prefetchProxy = "ftp://127.0.0.1:21";
		const data = await preview(`http://127.0.0.1:${targetPort}/invalid`);

		expect(data.type).to.equal("error");
		expect(targetRequests).to.equal(0);
	});

	it("should disable previews at startup with an invalid proxy", function () {
		const home = Config.getHomePath();
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thelounge-proxy-"));
		fs.writeFileSync(
			path.join(tmp, "config.js"),
			'module.exports = {prefetch: true, prefetchProxy: "nope"};'
		);

		try {
			Config.setHome(tmp);
			expect(Config.values.prefetch).to.equal(false);
		} finally {
			Config.setHome(home);
			Config.values.prefetch = true;
			fs.rmSync(tmp, {recursive: true, force: true});
		}
	});
});
