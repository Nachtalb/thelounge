import fs from "fs";
import path from "path";
import {expect} from "vitest";
import Config from "../../server/config";
import previewCache from "../../server/plugins/previewCache";

describe("Preview cache", function () {
	const preview = {
		type: "link",
		head: "title",
		body: "body",
		thumb: "",
		size: -1,
		link: "https://example.com/#hash",
		shown: true,
	};

	afterAll(function () {
		fs.rmSync(Config.getPreviewCachePath(), {recursive: true, force: true});
	});

	it("should hash urls with a persisted salt", function () {
		const hash = previewCache.hash("https://example.com/");

		expect(hash).to.match(/^[0-9a-f]{64}$/);
		expect(previewCache.hash("https://example.com/")).to.equal(hash);
		expect(previewCache.hash("https://example.com/other")).to.not.equal(hash);

		const salt = fs.readFileSync(path.join(Config.getPreviewCachePath(), "salt"), "utf-8");
		expect(salt).to.equal(previewCache.getSalt());
		expect(salt).to.have.lengthOf(64);
	});

	it("should shard cache files by hash prefix", function () {
		const hash = "abcdef" + "0".repeat(58);

		expect(previewCache.getPath(hash, "json")).to.equal(
			path.join(Config.getPreviewCachePath(), "ab", "cd", `${hash}.json`)
		);
		expect(previewCache.isValidHash(hash)).to.be.true;
		expect(previewCache.isValidHash("../../config.js")).to.be.false;
	});

	it("should miss, then hit without per-message fields", async function () {
		const url = "https://example.com/cached";

		expect(await previewCache.getPreview(url)).to.be.null;

		await previewCache.setPreview(url, preview);

		expect(await previewCache.getPreview(url)).to.deep.equal({
			type: "link",
			head: "title",
			body: "body",
			thumb: "",
			size: -1,
		});
	});

	it("should store images next to the preview of the same url", async function () {
		const url = "https://example.com/image.png";
		await previewCache.setPreview(url, {...preview, type: "image"});
		const hash = await previewCache.setImage(url, "image/png", Buffer.from("png"));

		expect(hash).to.equal(previewCache.hash(url));
		expect(fs.readFileSync(previewCache.getPath(hash, "img"), "utf-8")).to.equal("png");

		const entry = await previewCache.read(hash);
		expect(entry?.url).to.equal(url);
		expect(entry?.image).to.equal("image/png");
		expect(entry?.preview?.type).to.equal("image");
	});

	it("should delete old files on cleanup", async function () {
		const url = "https://example.com/old";
		await previewCache.setPreview(url, preview);
		const file = previewCache.getPath(previewCache.hash(url), "json");
		const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
		fs.utimesSync(file, old, old);

		await previewCache.cleanup();

		expect(fs.existsSync(file)).to.be.false;
		expect(await previewCache.getPreview("https://example.com/cached")).to.not.be.null;
		expect(fs.existsSync(path.join(Config.getPreviewCachePath(), "salt"))).to.be.true;
	});
});
