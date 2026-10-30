import fs from "fs";
import path from "path";
import log from "../server/log";
import Config from "../server/config";
import {expect, vi} from "vitest";
import got from "got";
import io from "socket.io-client";
import util from "./util";
import changelog from "../server/plugins/changelog";

import sinon from "ts-sinon";
import ClientManager from "../server/clientManager";

describe("Server", function () {
	let server: Bun.Server<any>;
	let logInfoStub: sinon.SinonStub<string[], void>;
	let logWarnStub: sinon.SinonStub<string[], void>;
	let checkForUpdatesStub: sinon.SinonStub<[manager: ClientManager], void>;

	beforeAll(async function () {
		logInfoStub = sinon.stub(log, "info");
		logWarnStub = sinon.stub(log, "warn").callsFake((...args: string[]) => {
			// vapid.json permissions do not survive in git
			if (args.length > 1 && args[1] === "is world readable.") {
				return;
			}

			if (args.length > 0 && args[0].startsWith("run `chmod")) {
				return;
			}

			// eslint-disable-next-line no-console
			console.error(`Unhandled log.warn in server tests: ${args.join(" ")}`);
		});

		checkForUpdatesStub = sinon.stub(changelog, "checkForUpdates");
		Config.values.fileUpload.enable = true;
		server = await (await import("../server/server")).default({} as any);
	});

	afterAll(async function () {
		logInfoStub.restore();
		logWarnStub.restore();
		checkForUpdatesStub.restore();
		Config.values.fileUpload.enable = false;
		await server.stop(true);

		await vi.dynamicImportSettled();
	});

	const webURL = `http://${Config.values.host}:${Config.values.port}/`;

	describe("Web server", () => {
		it("should run a web server on " + webURL, async () => {
			const response = await got(webURL);
			expect(response.statusCode).to.equal(200);
			expect(response.body).to.include("<title>The Lounge</title>");
			expect(response.body).to.include('type="module"');
		});

		it("should serve installed emoji sets, falling back per emoji", async () => {
			const emojiHome = path.join(Config.getHomePath(), "emoji");
			const url = (set: string, file: string) => `${webURL}img/emoji/${set}/${file}`;
			const get = (set: string, file: string) =>
				got(url(set, file), {throwHttpErrors: false, responseType: "buffer"});

			const writeSet = (id: string, format: string, images: Record<string, string>) => {
				fs.mkdirSync(path.join(emojiHome, id), {recursive: true});
				fs.writeFileSync(
					path.join(emojiHome, id, "set.json"),
					JSON.stringify({name: id, license: "MIT", scheme: "codepoints", format})
				);

				for (const [name, data] of Object.entries(images)) {
					fs.writeFileSync(path.join(emojiHome, id, name), data);
				}
			};

			expect((await get("mine", "1f600.png")).statusCode).to.equal(404);

			writeSet("mine", "png", {
				"1f600.png": "png",
				"2764.png": "heart",
				"0023-20e3.png": "#",
			});
			writeSet("vector", "svg", {"1f600.svg": "<svg/>"});

			try {
				const response = await get("mine", "1f600.png");
				expect(response.body.toString()).to.equal("png");
				expect(response.headers["content-type"]).to.equal("image/png");
				expect(response.headers["cache-control"]).to.equal("public, max-age=86400");

				// emoji-datasource names with U+FE0F hit the normalised files
				expect((await get("mine", "2764-fe0f.png")).body.toString()).to.equal("heart");
				expect((await get("mine", "0023-fe0f-20e3.png")).body.toString()).to.equal("#");

				// Not in the set: the bundled Google image
				const bundled = await got(url("google", "1f1e8-1f1ed.png"), {
					responseType: "buffer",
				});
				const fallback = await get("mine", "1f1e8-1f1ed.png");
				expect(fallback.statusCode).to.equal(200);
				expect(fallback.headers["content-type"]).to.equal("image/png");
				expect(fallback.body.equals(bundled.body)).to.equal(true);
				expect(bundled.headers["cache-control"]).to.equal("public, max-age=86400");

				const svg = await get("vector", "1f600.png");
				expect(svg.body.toString()).to.equal("<svg/>");
				expect(svg.headers["content-type"]).to.match(/^image\/svg\+xml/);
				expect(svg.headers["content-security-policy"]).to.equal(
					"default-src 'none'; style-src 'unsafe-inline'"
				);

				expect((await get("mine", "set.json")).statusCode).to.equal(404);
				expect((await get("mine", "zzzz.png")).statusCode).to.equal(404);
				expect((await get("nope", "1f600.png")).statusCode).to.equal(404);
			} finally {
				fs.rmSync(emojiHome, {recursive: true, force: true});
			}
		});

		it("should serve static content correctly", async () => {
			const response = await got(webURL + "thelounge.webmanifest");
			const body = JSON.parse(response.body);

			expect(response.statusCode).to.equal(200);
			expect(body.name).to.equal("The Lounge");
			expect(response.headers["content-type"]).to.equal("application/manifest+json");
		});

		it("should serve static files with validators, ranges and security headers", async () => {
			const url = webURL + "thelounge.webmanifest";
			const full = await fetch(url);
			const body = await full.text();
			const etag = full.headers.get("etag")!;

			expect(full.headers.get("cache-control")).to.equal("public, max-age=86400");
			expect(full.headers.get("last-modified")).to.be.a("string");
			expect(full.headers.get("x-content-type-options")).to.equal("nosniff");
			expect(full.headers.get("content-security-policy")).to.include("default-src 'none'");

			const cached = await fetch(url, {headers: {"If-None-Match": etag}});
			expect(cached.status).to.equal(304);

			const range = await fetch(url, {headers: {Range: "bytes=2-5"}});
			expect(range.status).to.equal(206);
			expect(await range.text()).to.equal(body.slice(2, 6));
		});

		it("should not cache the service worker", async () => {
			const response = await fetch(webURL + "service-worker.js");
			expect(response.status).to.equal(200);
			expect(response.headers.get("cache-control")).to.equal("no-cache, no-transform");
		});

		it("should 404 unknown paths and paths outside public/", async () => {
			for (const p of ["nope.js", "%2e%2e/package.json", "..%2fpackage.json", ".hidden"]) {
				const response = await fetch(webURL + p);
				expect(response.status, p).to.equal(404);
				expect(response.headers.get("content-security-policy")).to.include("default-src");
			}
		});
	});

	describe("WebSockets", function () {
		let client: ReturnType<typeof io>;

		beforeEach(() => {
			client = io(webURL, {
				path: "/socket.io/",
				autoConnect: false,
				reconnection: false,
				timeout: 1000,
				transports: ["websocket"],
			});

			// Server emits events faster than the test can bind them
			setTimeout(() => {
				client.open();
			}, 1);
		});

		afterEach(() => {
			client.close();
		});

		it("should emit authorized message", () =>
			new Promise<void>((resolve) => {
				client.on("auth:success", () => resolve());
			}));

		it("should create network", () =>
			new Promise<void>((resolve) => {
				client.on("init", () => {
					client.emit("network:new", {
						username: "test-user",
						realname: "The Lounge Test",
						nick: "test-user",
						join: "#thelounge, #spam",
						name: "Test Network",
						host: Config.values.host,
						port: 6667,
					});
				});

				client.on("network", (data) => {
					expect(data.network).to.exist;
					expect(data.network.nick).to.equal("test-user");
					expect(data.network.name).to.equal("Test Network");
					expect(data.network.channels).to.have.lengthOf(3);
					expect(data.network.channels[0].name).to.equal("Test Network");
					expect(data.network.channels[1].name).to.equal("#thelounge");
					expect(data.network.channels[2].name).to.equal("#spam");
					resolve();
				});
			}));

		it("should acknowledge accepted and blocked input links before sending previews", () =>
			new Promise<void>((resolve) => {
				client.on("init", () => {
					client.emit("network:new", {
						username: "test-user",
						realname: "The Lounge Test",
						nick: "test-user",
						join: "#preview",
						name: "Preview Network",
						host: Config.values.host,
						port: 6667,
					});
				});

				client.on("network", (data) => {
					const target = data.network.channels[1].id;
					const blocked = "http://blocked.test/";
					const events: string[] = [];
					Config.values.prefetchBlocklist = ["||blocked.test^"];

					client.on("input:preview", (preview) => {
						events.push("preview");
						expect(events).to.deep.equal(["ack", "preview"]);
						expect(preview.target).to.equal(target);
						expect(preview.removed).to.equal(false);
						expect(preview.preview.link).to.equal(webURL);
						expect(preview.preview.head).to.equal("The Lounge");
						resolve();
					});

					client.emit("input:preview", {target, links: [webURL, blocked]}, (result) => {
						Config.values.prefetchBlocklist = [];
						events.push("ack");
						expect(result).to.deep.equal({accepted: [webURL], blocked: [blocked]});
					});
				});
			}));

		it("should emit configuration message", () =>
			new Promise<void>((resolve) => {
				client.on("configuration", (data) => {
					// Private key defined in vapid.json is "01020304050607080910111213141516" for this public key.
					expect(data.applicationServerKey).to.equal(
						"BM0eTDpvDnH7ewlHuXWcPTE1NjlJ06XWIS1cQeBTZmsg4EDx5sOpY7kdX1pniTo8RakL3UdfFuIbC8_zog_BWIM"
					);

					expect(data.public).to.equal(true);
					expect(data.defaultTheme).to.equal("default");
					expect(data.themes).to.be.an("array");
					expect(data.lockNetwork).to.equal(false);
					expect(data.useHexIp).to.equal(false);
					expect(data.emojiSets.map((set: {id: string}) => set.id)).to.deep.equal([
						"google",
						"twitter",
					]);
					expect(data.emojiDefaultStyle).to.equal("google");

					resolve();
				});
			}));

		it("should emit push subscription state message", () =>
			new Promise<void>((resolve) => {
				client.on("push:issubscribed", (data) => {
					expect(data).to.be.false;

					resolve();
				});
			}));

		it("should stream uploads to disk and serve them with ranges", async () => {
			const token = await new Promise<string>((resolve) => {
				client.on("init", () => client.emit("upload:auth"));
				client.on("upload:auth", resolve);
			});
			const form = new FormData();
			form.append("file", new Blob(["0123456789"]), "digits.txt");

			const upload = await fetch(`${webURL}uploads/new/${token}`, {
				method: "POST",
				body: form,
			});
			const {url} = (await upload.json()) as {url: string};
			expect(url).to.match(/^uploads\/[0-9a-f]{16}\/digits\.txt$/);

			const file = await fetch(webURL + url, {headers: {Range: "bytes=3-5"}});
			expect(file.status).to.equal(206);
			expect(file.headers.get("content-type")).to.match(/^text\/plain/);
			expect(file.headers.get("content-disposition")).to.equal(
				'inline; filename="digits.txt"'
			);
			expect(await file.text()).to.equal("345");
			fs.rmSync(Config.getFileUploadPath(), {recursive: true});

			// The token is single use
			const again = await fetch(`${webURL}uploads/new/${token}`, {
				method: "POST",
				body: form,
			});
			expect(again.status).to.equal(400);
		});

		it("should reject uploads over the size limit while streaming", async () => {
			const maxFileSize = Config.values.fileUpload.maxFileSize;
			Config.values.fileUpload.maxFileSize = 1;

			try {
				const token = await new Promise<string>((resolve) => {
					client.on("init", () => client.emit("upload:auth"));
					client.on("upload:auth", resolve);
				});
				const form = new FormData();
				form.append("file", new Blob([new Uint8Array(4096)]), "big.bin");

				const upload = await fetch(`${webURL}uploads/new/${token}`, {
					method: "POST",
					body: form,
				});
				expect(upload.status).to.equal(400);
				expect(await upload.json()).to.deep.equal({error: "File size limit reached"});
			} finally {
				Config.values.fileUpload.maxFileSize = maxFileSize;
			}
		});

		it("should emit init message", () =>
			new Promise<void>((resolve) => {
				client.on("init", (data) => {
					expect(data.active).to.equal(-1);
					expect(data.networks).to.be.an("array");
					expect(data.networks).to.be.empty;
					expect(data.token).to.be.undefined;

					resolve();
				});
			}));
	});
});
