import {expect} from "vitest";
import {
	copyImage,
	CopyEnv,
	fallbackText,
	pickImageSource,
} from "../../../../client/js/helpers/copyImage";

const base = "https://irc.example.com/";
const cached = {
	link: "https://img.example.org/cat.jpg",
	thumb: "preview-cache/ab/cdef",
};
const external = {
	link: "https://example.org/page",
	thumb: "https://img.example.org/og.jpg",
};

function makeEnv(overrides: Partial<CopyEnv> = {}) {
	const calls: string[] = [];
	const png = {type: "image/png"} as Blob;
	const env: CopyEnv = {
		base,
		write(items) {
			calls.push("write");
			return (items[0] as unknown as {png: Promise<Blob>}).png.then(() => undefined);
		},
		makeItem: (p) => ({png: p} as unknown as ClipboardItem),
		copyText(text) {
			calls.push(`text:${text}`);
			return Promise.resolve();
		},
		isCanvasClean: () => false,
		fetchPng(url) {
			calls.push(`fetch:${url}`);
			return Promise.resolve(png);
		},
		imagePng() {
			calls.push("canvas");
			return Promise.resolve(png);
		},
		...overrides,
	};

	return {env, calls};
}

describe("copyImage helper", function () {
	it("should fetch same-origin images and draw clean cross-origin ones", function () {
		expect(pickImageSource("preview-cache/ab/cdef", base, () => false)).to.equal("fetch");
		expect(
			pickImageSource("https://irc.example.com/storage/x.png", base, () => false)
		).to.equal("fetch");
		expect(pickImageSource(external.thumb, base, () => true)).to.equal("canvas");
		expect(pickImageSource(external.thumb, base, () => false)).to.equal("link");
	});

	it("should copy the image url, or the original link for cached copies", function () {
		expect(fallbackText(external, base)).to.equal(external.thumb);
		expect(fallbackText(cached, base)).to.equal(cached.link);
	});

	it("should copy a same-origin image as png", async function () {
		const {env, calls} = makeEnv();
		expect(await copyImage(cached, env)).to.equal("image");
		expect(calls).to.deep.equal(["fetch:preview-cache/ab/cdef", "write"]);
	});

	it("should draw a CORS-clean cross-origin image", async function () {
		const {env, calls} = makeEnv({isCanvasClean: () => true});
		expect(await copyImage(external, env)).to.equal("image");
		expect(calls).to.deep.equal(["canvas", "write"]);
	});

	it("should copy the link of a tainted cross-origin image", async function () {
		const {env, calls} = makeEnv();
		expect(await copyImage(external, env)).to.equal("link");
		expect(calls).to.deep.equal([`text:${external.thumb}`]);
	});

	it("should copy the link without the async clipboard", async function () {
		const {env, calls} = makeEnv({write: undefined, makeItem: undefined});
		expect(await copyImage(cached, env)).to.equal("insecure");
		expect(calls).to.deep.equal([`text:${cached.link}`]);
	});

	it("should call the clipboard synchronously to keep the user gesture", function () {
		const {env, calls} = makeEnv();
		void copyImage(cached, env);
		expect(calls).to.include("write");

		const insecure = makeEnv({write: undefined});
		void copyImage(cached, insecure.env);
		expect(insecure.calls).to.have.length(1);
	});

	it("should fall back to the link when the image can't be read", async function () {
		const {env, calls} = makeEnv({fetchPng: () => Promise.reject(new Error("404"))});
		expect(await copyImage(cached, env)).to.equal("failed");
		expect(calls).to.deep.equal(["write", `text:${cached.link}`]);
	});

	it("should report an error when nothing could be copied", async function () {
		const {env} = makeEnv({
			write: undefined,
			copyText: () => Promise.reject(new Error("denied")),
		});
		expect(await copyImage(cached, env)).to.equal("error");
	});
});
