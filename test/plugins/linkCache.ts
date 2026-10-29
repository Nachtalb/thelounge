import fs from "fs";
import path from "path";
import {expect} from "vitest";
import util from "../util";
import Config from "../../server/config";
import previewCache from "../../server/plugins/previewCache";
import link, {routeCachedImage} from "../../server/plugins/irc-events/link";

describe("Link plugin with preview cache", function () {
	const testImagePath = path.resolve("client/public/img/logo-grey-bg-120x120px.png");

	let app: any;
	let connection: any;
	let _makeUrl: (_path: string) => string;
	let requests: Record<string, number>;
	let irc: any;
	let network: any;

	beforeAll(function () {
		app = util.createWebserver();
		app.use((req: any, _res: any, next: () => void) => {
			requests[req.path] = (requests[req.path] || 0) + 1;
			next();
		});
		app.get("/page", function (_req: any, res: any) {
			res.send("<title>cached title</title><meta property='og:image' content='/image.png'>");
		});
		app.get("/image.png", function (_req: any, res: any) {
			res.sendFile(testImagePath);
		});
		app.get("/preview-cache/:hash", (req: any, res: any) => void routeCachedImage(req, res));

		return new Promise<void>((resolve) => {
			connection = app.listen(0, "127.0.0.1", () => {
				const {address, port} = connection.address();
				_makeUrl = (_path: string) => `http://${address}:${port}/${_path}`;
				resolve();
			});
		});
	});

	afterAll(function () {
		fs.rmSync(Config.getPreviewCachePath(), {recursive: true, force: true});
		return new Promise<void>((resolve) => {
			connection.close(() => resolve());
		});
	});

	beforeEach(async function () {
		await previewCache.flush();
		fs.rmSync(Config.getPreviewCachePath(), {recursive: true, force: true});
		requests = {};
		irc = util.createClient();
		network = util.createNetwork();
		Config.values.prefetch = true;
		Config.values.prefetchCache = true;
	});

	afterEach(function () {
		Config.values.prefetch = false;
		Config.values.prefetchCache = false;
	});

	function preview(url: string): Promise<any> {
		const message = irc.createMessage({text: url});
		link(irc, network.channels[0], message, message.text);
		return new Promise((resolve) => {
			irc.once("msg:preview", (data) => {
				resolve(data.preview);
			});
		});
	}

	it("should fetch a url once and serve repeats from the cache", async function () {
		const first = await preview(_makeUrl("page"));
		const hash = previewCache.hash(_makeUrl("image.png"));

		expect(first.head).to.equal("cached title");
		expect(first.thumb).to.equal(`preview-cache/${hash}`);
		expect(fs.existsSync(previewCache.getPath(hash, "img"))).to.be.true;

		const second = await preview(_makeUrl("page"));

		expect(second).to.deep.equal(first);
		expect(requests).to.deep.equal({"/page": 1, "/image.png": 1});
	});

	it("should cache an image link once, ignoring its fragment", async function () {
		const result = await preview(_makeUrl("image.png#fragment"));
		const hash = previewCache.hash(_makeUrl("image.png"));

		expect(result.type).to.equal("image");
		expect(result.thumb).to.equal(`preview-cache/${hash}`);

		const entry = await previewCache.read(hash);
		expect(entry?.image).to.equal("image/png");
		expect(entry?.preview?.type).to.equal("image");
	});

	it("should serve cached images and fetch missing ones on the fly", async function () {
		const thumb = (await preview(_makeUrl("page"))).thumb;
		const hash = thumb.split("/")[1];

		let res = await fetch(_makeUrl(thumb));
		expect(res.status).to.equal(200);
		expect(res.headers.get("content-type")).to.equal("image/png");
		expect(requests["/image.png"]).to.equal(1);

		fs.unlinkSync(previewCache.getPath(hash, "img"));
		res = await fetch(_makeUrl(thumb));

		expect(res.status).to.equal(200);
		expect(Buffer.from(await res.arrayBuffer())).to.deep.equal(fs.readFileSync(testImagePath));
		expect(requests["/image.png"]).to.equal(2);
		expect(fs.existsSync(previewCache.getPath(hash, "img"))).to.be.true;
	});

	it("should refuse hashes that are not recorded preview images", async function () {
		await preview(_makeUrl("page"));

		for (const hash of [
			"0".repeat(64),
			"not-a-hash",
			previewCache.hash(_makeUrl("page")), // recorded as link, not as image
		]) {
			const res = await fetch(_makeUrl(`preview-cache/${hash}`));
			expect(res.status).to.equal(404);
		}
	});

	it("should behave as before when the cache is disabled", async function () {
		Config.values.prefetchCache = false;

		const result = await preview(_makeUrl("page"));

		expect(result.thumb).to.equal(_makeUrl("image.png"));
		expect(fs.existsSync(Config.getPreviewCachePath())).to.be.false;
	});
});
