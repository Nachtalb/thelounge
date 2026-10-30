import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import {expect, vi} from "vitest";
import util from "../util";
import Config from "../../server/config";
import previewCache from "../../server/plugins/previewCache";
import link, {backfillPreviews, routeCachedImage} from "../../server/plugins/irc-events/link";

describe("Link plugin with preview cache", function () {
	const testImagePath = path.resolve("client/public/img/logo-grey-bg-120x120px.png");

	let app: any;
	let connection: any;
	let _makeUrl: (_path: string) => string;
	let requests: Record<string, number>;
	let irc: any;
	let network: any;
	let photo: Buffer;
	let animation: Buffer;

	const noise = (width: number, height: number) =>
		sharp({
			create: {width, height, channels: 3, noise: {type: "gaussian", mean: 128, sigma: 20}},
		});

	beforeAll(async function () {
		// Own cache dir: other test files delete the shared one while these tests run
		const dir = path.join(os.tmpdir(), `thelounge-linkcache-${process.pid}`);
		vi.spyOn(Config, "getPreviewCachePath").mockReturnValue(dir);
		photo = await noise(1000, 750).jpeg().toBuffer();
		const frames = await Promise.all([1, 2].map(() => noise(700, 525).png().toBuffer()));
		animation = await sharp(frames, {join: {animated: true}})
			.gif()
			.toBuffer();

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
		app.get("/photo.jpg", (_req: any, res: any) => void res.type("image/jpeg").send(photo));
		app.get("/anim.gif", (_req: any, res: any) => void res.type("image/gif").send(animation));
		app.get(
			"/broken.jpg",
			(_req: any, res: any) => void res.type("image/jpeg").send("not a jpeg")
		);
		app.get("/preview-cache/:hash", (req: any, res: any) => void routeCachedImage(req, res));

		await new Promise<void>((resolve) => {
			connection = app.listen(0, "127.0.0.1", () => {
				const {address, port} = connection.address();
				_makeUrl = (_path: string) => `http://${address}:${port}/${_path}`;
				resolve();
			});
		});
	}, 60000);

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

	it("should keep a user's own filter rules out of the shared cache", async function () {
		const blocking = util.createClient() as any;
		blocking.config.clientSettings = {previewFilters: "||127.0.0.1^"};
		const message = blocking.createMessage({text: _makeUrl("page")});
		const shown: unknown[] = [];
		blocking.on("msg:preview", (data) => shown.push(data));

		// Blocked for that user: no fetch, nothing cached
		link(blocking, network.channels[0], message, message.text);
		expect(message.previews).to.deep.equal([]);
		await previewCache.flush();
		expect(await previewCache.getPreview(_makeUrl("page"))).to.equal(null);
		expect(requests["/page"]).to.equal(undefined);

		// Others still get (and cache) the preview
		const other = await preview(_makeUrl("page"));
		expect(other.head).to.equal("cached title");
		await previewCache.flush();
		expect(await previewCache.getPreview(_makeUrl("page"))).to.not.equal(null);

		// The cached preview is still not shown to the blocking user
		const again = blocking.createMessage({text: _makeUrl("page")});
		link(blocking, network.channels[0], again, again.text);
		expect(again.previews).to.deep.equal([]);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(shown).to.deep.equal([]);
		expect(requests["/page"]).to.equal(1);
	});

	it("should fetch a url once and serve repeats from the cache", async function () {
		const first = await preview(_makeUrl("page"));
		const hash = previewCache.hash(_makeUrl("image.png"));

		expect(first.head).to.equal("cached title");
		expect(first.thumb).to.equal(`preview-cache/${hash}.avif`);
		expect(first.full).to.equal(`preview-cache/${hash}`);
		expect(fs.existsSync(previewCache.getPath(hash, "img"))).to.be.true;

		const second = await preview(_makeUrl("page"));

		expect(second).to.deep.equal(first);
		expect(requests).to.deep.equal({"/page": 1, "/image.png": 1});
	});

	it("should cache an image link once, ignoring its fragment", async function () {
		const result = await preview(_makeUrl("image.png#fragment"));
		const hash = previewCache.hash(_makeUrl("image.png"));

		expect(result.type).to.equal("image");
		expect(result.full).to.equal(`preview-cache/${hash}`);

		const entry = await previewCache.read(hash);
		expect(entry?.image).to.equal("image/png");
		expect(entry?.preview?.type).to.equal("image");
	});

	it("should serve cached images and fetch missing ones on the fly", async function () {
		const thumb = (await preview(_makeUrl("page"))).full;
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

	it("should serve a small avif thumbnail and keep the full image", async function () {
		const result = await preview(_makeUrl("photo.jpg"));
		const hash = previewCache.hash(_makeUrl("photo.jpg"));
		expect(result.thumb).to.equal(`preview-cache/${hash}.avif`);
		expect([result.width, result.height]).to.deep.equal([1000, 750]);
		expect(result.placeholder).to.match(/^data:image\/webp;base64,/);
		expect(result.placeholder.length).to.be.below(300);

		let res = await fetch(_makeUrl(result.thumb));
		expect(res.headers.get("content-type")).to.equal("image/avif");
		const thumb = Buffer.from(await res.arrayBuffer());
		const meta = await sharp(thumb).metadata();
		expect([meta.width, meta.height]).to.deep.equal([640, 480]);
		expect(thumb.length).to.be.below(photo.length / 4);

		res = await fetch(_makeUrl(result.full));
		expect(res.headers.get("content-type")).to.equal("image/jpeg");
		expect(Buffer.from(await res.arrayBuffer())).to.deep.equal(photo);
		expect(requests["/photo.jpg"]).to.equal(1);
	});

	it("should add the full image size and placeholder to previews cached without them", async function () {
		const url = _makeUrl("photo.jpg");
		const result = await preview(url);
		await previewCache.flush();
		const {width, height, placeholder, ...old} = result;
		await previewCache.update(url, {preview: old});

		expect(await previewCache.getPreview(url)).to.include({width, height, placeholder});
		await previewCache.flush();
		// Stored: later hits don't read the image again
		fs.unlinkSync(previewCache.getPath(result.full.split("/")[1], "img"));
		const cached = await previewCache.getPreview(url);
		expect(cached).to.include({width, height, placeholder});
	});

	it("should keep gifs animated in a webp thumbnail", async function () {
		const result = await preview(_makeUrl("anim.gif"));
		expect(result.thumb).to.equal(`${result.full}.webp`);
		expect([result.width, result.height]).to.deep.equal([700, 525]);

		const res = await fetch(_makeUrl(result.thumb));
		expect(res.headers.get("content-type")).to.equal("image/webp");
		const meta = await sharp(Buffer.from(await res.arrayBuffer()), {animated: true}).metadata();
		expect(meta.pages).to.equal(2);
		expect([meta.width, meta.pageHeight]).to.deep.equal([640, 480]);
	});

	it("should serve the original when no thumbnail can be made", async function () {
		const result = await preview(_makeUrl("broken.jpg"));
		const res = await fetch(_makeUrl(result.thumb));

		expect(res.status).to.equal(200);
		expect(res.headers.get("content-type")).to.equal("image/jpeg");
		expect(await res.text()).to.equal("not a jpeg");
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

	describe("history backfill", function () {
		it("should fill previews of history messages and emit msg:preview", async function () {
			const message = irc.createMessage({type: "message", text: `look ${_makeUrl("page")}`});
			const emitted = new Promise<any>((resolve) => {
				irc.once("msg:preview", (data) => {
					resolve(data);
				});
			});

			backfillPreviews(irc, network.channels[0], [message]);

			expect(message.previews[0].type).to.equal("loading");

			const data = await emitted;

			expect(data.id).to.equal(message.id);
			expect(data.chan).to.equal(network.channels[0].id);
			expect(data.preview.head).to.equal("cached title");
			expect(message.previews).to.deep.equal([data.preview]);
		});

		it("should use the cache for urls fetched before", async function () {
			await preview(_makeUrl("page"));
			const message = irc.createMessage({type: "message", text: _makeUrl("page")});
			const emitted = new Promise<void>((resolve) => {
				irc.once("msg:preview", () => {
					resolve();
				});
			});

			backfillPreviews(irc, network.channels[0], [message]);
			await emitted;

			expect(message.previews[0].head).to.equal("cached title");
			expect(requests["/page"]).to.equal(1);
		});

		it("should skip messages with previews, other types and repeats", function () {
			const withPreview = irc.createMessage({type: "message", text: _makeUrl("page")});
			withPreview.previews = [{link: "x"}];
			const notice = irc.createMessage({type: "notice", text: _makeUrl("page")});
			const message = irc.createMessage({type: "message", text: "no links here"});

			backfillPreviews(irc, network.channels[0], [withPreview, notice, message]);
			message.text = _makeUrl("page");
			backfillPreviews(irc, network.channels[0], [message]);

			expect(withPreview.previews).to.deep.equal([{link: "x"}]);
			expect(notice.previews).to.deep.equal([]);
			expect(message.previews).to.deep.equal([]);
		});

		it("should do nothing when the cache is disabled", function () {
			Config.values.prefetchCache = false;
			const message = irc.createMessage({type: "message", text: _makeUrl("page")});

			backfillPreviews(irc, network.channels[0], [message]);

			expect(message.previews).to.deep.equal([]);
		});
	});
});
