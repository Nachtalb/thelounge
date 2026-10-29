import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import zlib from "zlib";
import crypto from "crypto";
import {AddressInfo} from "net";
import {expect} from "vitest";
import sinon from "ts-sinon";
import Config from "../../server/config";
import {
	availableEmojiSets,
	bundledEmojiSets,
	defaultEmojiStyle,
	emojiCodepoints,
	emojiKey,
	fallbackEmojiSet,
	getEmojiSetPath,
	installedEmojiSets,
	readEmojiSet,
	watchEmojiSets,
} from "../../server/plugins/emoji";
import {
	emojiDatasourceVersion,
	installEmojiSet,
	removeEmojiSet,
} from "../../server/plugins/emojiInstall";

// ustar entry; long names use a pax header like npm tarballs do
function tarEntry(name: string, data: Buffer | string, type = "0"): Buffer {
	const body = Buffer.from(data);
	const header = Buffer.alloc(512);

	if (name.length > 100) {
		const record = (len: number) => `${len} path=${name}\n`;
		let len = record(0).length;
		len = record(len).length;
		return Buffer.concat([tarEntry("PaxHeader", record(len), "x"), tarEntry("x", data, type)]);
	}

	header.write(name, 0);
	header.write("0000644\0", 100);
	header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
	header.write(type, 156);
	header.write("ustar\0", 257);
	header.write("00", 263);
	header.fill(" ", 148, 156);
	let sum = 0;

	for (const b of header) {
		sum += b;
	}

	header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
	const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
	return Buffer.concat([header, body, padding]);
}

// A tar archive; `comment` adds a pax global header like `git archive` does
function tar(files: Record<string, string>, comment?: string) {
	const entries = Object.entries(files).map(([name, data]) => tarEntry(name, data));

	if (comment) {
		const record = `52 comment=${comment}\n`;
		entries.unshift(tarEntry("pax_global_header", record, "g"));
	}

	return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

const tarball = (files: Record<string, string>, comment?: string) =>
	zlib.gzipSync(tar(files, comment));

// A zip archive, deflated except for names ending in .txt
function zip(files: Record<string, string>) {
	const locals: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;

	for (const [name, content] of Object.entries(files)) {
		const raw = Buffer.from(content);
		const stored = name.endsWith(".txt");
		const data = stored ? raw : zlib.deflateRawSync(raw);
		const nameBuf = Buffer.from(name);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(stored ? 0 : 8, 8);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(stored ? 0 : 8, 10);
		entry.writeUInt32LE(data.length, 20);
		entry.writeUInt32LE(raw.length, 24);
		entry.writeUInt16LE(nameBuf.length, 28);
		entry.writeUInt32LE(offset, 42);
		locals.push(local, nameBuf, data);
		central.push(entry, nameBuf);
		offset += local.length + nameBuf.length + data.length;
	}

	const dir = Buffer.concat(central);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(Object.keys(files).length, 8);
	eocd.writeUInt16LE(Object.keys(files).length, 10);
	eocd.writeUInt32LE(dir.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, dir, eocd]);
}

const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const fluentCommit = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc";

describe("Emoji sets", function () {
	let home: string;
	let homeStub: sinon.SinonStub;
	let server: http.Server;
	let base: string;
	let routes: Record<string, Buffer | object>;
	const requests: string[] = [];

	const read = (id: string, file: string) =>
		fs.readFileSync(path.join(getEmojiSetPath(id), file), "utf8");
	const files = (id: string) => fs.readdirSync(getEmojiSetPath(id)).sort();

	const writeSet = (id: string, manifest: object | string) => {
		fs.mkdirSync(path.join(home, "emoji", id), {recursive: true});
		fs.writeFileSync(
			path.join(home, "emoji", id, "set.json"),
			typeof manifest === "string" ? manifest : JSON.stringify(manifest)
		);
	};

	function npmPackage(set: string, contents: Record<string, string>) {
		const tgz = tarball(contents);
		const integrity = "sha512-" + crypto.createHash("sha512").update(tgz).digest("base64");
		routes[`/emoji-datasource-${set}/${emojiDatasourceVersion}`] = {
			dist: {tarball: `${base}/${set}.tgz`, integrity},
		};
		routes[`/${set}.tgz`] = tgz;
	}

	beforeAll(async function () {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "thelounge-emoji-"));
		homeStub = sinon.stub(Config, "getHomePath").returns(home);

		server = http.createServer((req, res) => {
			requests.push(req.url!);
			const body = routes[req.url!];

			if (Buffer.isBuffer(body)) {
				res.end(body);
			} else if (body) {
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify(body));
			} else {
				res.statusCode = 404;
				res.end();
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	beforeEach(function () {
		requests.length = 0;
		routes = {};
	});

	afterEach(function () {
		Config.values.emojiDefaultStyle = "google";
		fs.rmSync(path.join(home, "emoji"), {recursive: true, force: true});
	});

	afterAll(async function () {
		homeStub.restore();
		fs.rmSync(home, {recursive: true, force: true});
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	describe("file names", function () {
		it("reads code points from the common naming schemes", function () {
			expect(emojiCodepoints("1f600.png")).to.deep.equal([0x1f600]);
			expect(emojiCodepoints("1F44D-1F3FB.png")).to.deep.equal([0x1f44d, 0x1f3fb]);
			expect(emojiCodepoints("emoji_u1f44d_1f3fb.png")).to.deep.equal([0x1f44d, 0x1f3fb]);
			expect(emojiCodepoints("u2764_ufe0f.png")).to.deep.equal([0x2764, 0xfe0f]);
			expect(emojiCodepoints("U+1F600.png")).to.deep.equal([0x1f600]);
			expect(emojiCodepoints("23-20e3.png")).to.deep.equal([0x23, 0x20e3]);
			expect(emojiCodepoints("dir/1f600.svg")).to.deep.equal([0x1f600]);
			expect(emojiCodepoints("grinning.png")).to.equal(null);
			expect(emojiCodepoints("1f600 copy.png")).to.equal(null);
			expect(emojiCodepoints("110000.png")).to.equal(null);
			expect(emojiCodepoints("..png")).to.equal(null);
		});

		it("normalises variants so emoji-datasource names hit", function () {
			expect(emojiKey("2764-fe0f.png")).to.equal("2764");
			expect(emojiKey("2764.png")).to.equal("2764");
			expect(emojiKey("0023-FE0F-20E3.png")).to.equal("0023-20e3");
			expect(emojiKey("emoji_u23_20e3.png")).to.equal("0023-20e3");
			expect(emojiKey("1F3F3-FE0F-200D-1F308.png")).to.equal("1f3f3-200d-1f308");
			expect(emojiKey([0x1f600, 0xfe0e])).to.equal("1f600");
			expect(emojiKey("fe0f.png")).to.equal(null);
		});
	});

	describe("discovery", function () {
		it("finds every folder with a valid set.json", function () {
			const manifest = {name: "Mine", license: "MIT", scheme: "codepoints", format: "png"};
			writeSet("mine", manifest);
			writeSet("vector", {
				...manifest,
				name: "Vector",
				format: "svg",
				credit: "Vector by Someone",
				creditUrl: "javascript:alert(1)",
			});
			writeSet("old", {...manifest, name: "Old", recipe: "fluent-flat"});
			writeSet("broken", "{");
			writeSet("noscheme", {name: "X", license: "MIT", format: "png"});
			writeSet("Upper", manifest);
			writeSet("google", manifest);
			writeSet("mine.tmp-1", manifest);
			fs.mkdirSync(path.join(home, "emoji", "empty"));

			expect(installedEmojiSets().map((set) => set.id)).to.deep.equal([
				"mine",
				"old",
				"vector",
			]);
			expect(availableEmojiSets()).to.deep.equal([
				...bundledEmojiSets,
				{id: "mine", name: "Mine", license: "MIT", bundled: false},
				{
					id: "old",
					name: "Old",
					license: "MIT",
					bundled: false,
					credit: "Fluent Emoji by Microsoft, © Microsoft Corporation, MIT License",
					creditUrl: "https://github.com/microsoft/fluentui-emoji",
				},
				{
					id: "vector",
					name: "Vector",
					license: "MIT",
					bundled: false,
					credit: "Vector by Someone",
				},
			]);
			expect(readEmojiSet("../emoji/mine")).to.equal(null);
		});

		it("reports sets installed and removed while running", async function () {
			fs.mkdirSync(path.join(home, "emoji"), {recursive: true});
			const changes: string[][] = [];
			const stop = watchEmojiSets((sets) => changes.push(sets.map((set) => set.id)), 20);

			const until = async (count: number) => {
				for (let i = 0; i < 200 && changes.length < count; i++) {
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			};

			try {
				// A half-built install (temp folder) is not a set yet
				writeSet("mine.tmp-1", {
					name: "Mine",
					license: "MIT",
					scheme: "codepoints",
					format: "png",
				});
				await new Promise((resolve) => setTimeout(resolve, 100));
				expect(changes).to.deep.equal([]);

				fs.renameSync(
					path.join(home, "emoji", "mine.tmp-1"),
					path.join(home, "emoji", "mine")
				);
				await until(1);
				expect(changes).to.deep.equal([["google", "twitter", "mine"]]);

				fs.rmSync(path.join(home, "emoji", "mine"), {recursive: true});
				await until(2);
				expect(changes).to.deep.equal([
					["google", "twitter", "mine"],
					["google", "twitter"],
				]);
			} finally {
				stop();
			}
		});

		it("uses emojiDefaultStyle only when it is available", function () {
			expect(availableEmojiSets().map((set) => set.id)).to.deep.equal(["google", "twitter"]);

			Config.values.emojiDefaultStyle = "apple";
			expect(defaultEmojiStyle()).to.equal("google");
			expect(fallbackEmojiSet()).to.equal("google");

			writeSet("apple", {name: "Apple", license: "x", scheme: "codepoints", format: "png"});
			expect(defaultEmojiStyle()).to.equal("apple");

			Config.values.emojiDefaultStyle = "twitter";
			expect(fallbackEmojiSet()).to.equal("twitter");

			Config.values.emojiDefaultStyle = "native";
			expect(defaultEmojiStyle()).to.equal("native");
		});
	});

	describe("emoji-datasource recipes", function () {
		it("installs the 64px Apple images of the registry tarball", async function () {
			npmPackage("apple", {
				"package/package.json": "{}",
				"package/img/apple/64/1f600.png": "grinning",
				"package/img/apple/64/1f1e8-1f1ed.png": "flag",
				"package/img/apple/64/2764-fe0f.png": "heart",
				"package/img/apple/32/1f600.png": "small",
				"package/img/apple/sheets/64.png": "sheet",
				"package/img/apple/64/../../../../evil.png": "nope",
				[`package/img/apple/64/${"1f468-200d-".repeat(8)}1f466.png`]: "long",
			});

			const result = await installEmojiSet("apple", {registry: base});

			expect(requests).to.deep.equal([
				`/emoji-datasource-apple/${emojiDatasourceVersion}`,
				"/apple.tgz",
			]);
			expect(result.manifest.images).to.equal(4);
			expect(files("apple")).to.deep.equal([
				"1f1e8-1f1ed.png",
				`${"1f468-200d-".repeat(8)}1f466.png`,
				"1f600.png",
				"2764.png",
				"set.json",
			]);
			expect(read("apple", "1f600.png")).to.equal("grinning");
			expect(read("apple", "2764.png")).to.equal("heart");
			expect(result.caveat).to.equal(
				"© Apple Inc., not openly licensed; installed at your discretion"
			);
			expect(JSON.parse(read("apple", "set.json"))).to.deep.equal({
				name: "Apple",
				license: "© Apple Inc., not openly licensed",
				source: `https://www.npmjs.com/package/emoji-datasource-apple/v/${emojiDatasourceVersion}`,
				version: emojiDatasourceVersion,
				scheme: "codepoints",
				format: "png",
				recipe: "apple",
				images: 4,
			});
			expect(fs.existsSync(path.join(home, "evil.png"))).to.be.false;
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal(["apple"]);
			expect(availableEmojiSets().map((set) => set.id)).to.include("apple");

			expect(removeEmojiSet("apple")).to.be.true;
			expect(availableEmojiSets().map((set) => set.id)).to.deep.equal(["google", "twitter"]);
			expect(removeEmojiSet("apple")).to.be.false;
		});

		it("installs the Facebook images", async function () {
			npmPackage("facebook", {
				"package/img/facebook/64/1f600.png": "fb",
				"package/img/apple/64/1f601.png": "other set",
			});

			const result = await installEmojiSet("facebook", {registry: base});

			expect(files("facebook")).to.deep.equal(["1f600.png", "set.json"]);
			expect(result.manifest.name).to.equal("Facebook");
			expect(result.caveat).to.include("Meta Platforms");
		});

		it("installs nothing when the integrity does not match", async function () {
			npmPackage("apple", {"package/img/apple/64/1f600.png": "grinning"});
			await installEmojiSet("apple", {registry: base});

			const meta = routes[`/emoji-datasource-apple/${emojiDatasourceVersion}`];
			routes["/apple.tgz"] = tarball({"package/img/apple/64/1f600.png": "tampered"});
			routes[`/emoji-datasource-apple/${emojiDatasourceVersion}`] = meta;

			await expect(installEmojiSet("apple", {registry: base})).rejects.toThrow(
				/Integrity check/
			);
			expect(read("apple", "1f600.png")).to.equal("grinning");
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal(["apple"]);
		});

		it("fails for an unknown set or a missing package", async function () {
			await expect(installEmojiSet("joypixels", {registry: base})).rejects.toThrow(
				/Unknown emoji set/
			);
			await expect(installEmojiSet("apple", {registry: base})).rejects.toThrow(/HTTP 404/);
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal([]);
		});

		it("uses the shipped emoji-datasource version", function () {
			const pkg = JSON.parse(
				fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
			);
			expect(emojiDatasourceVersion).to.equal(
				pkg.devDependencies["emoji-datasource-twitter"]
			);
		});
	});

	describe("OpenMoji", function () {
		const url = "/hfg-gmuend/openmoji/releases/download/17.0.0/openmoji-72x72-color.zip";
		const archive = () =>
			zip({
				"1F600.png": "grinning",
				"1F44D-1F3FB.png": "thumbs",
				"2764-FE0F.png": "heart",
				"E0C0.png": "openmoji extra",
				"readme.txt": "text",
				"sub/1F601.png": "nested",
			});

		it("installs the 72px colour PNGs of the release asset", async function () {
			const data = archive();
			routes[url] = data;

			const result = await installEmojiSet("openmoji", {github: base, sha256: sha256(data)});

			expect(requests).to.deep.equal([url]);
			expect(files("openmoji")).to.deep.equal([
				"1f44d-1f3fb.png",
				"1f600.png",
				"2764.png",
				"e0c0.png",
				"set.json",
			]);
			expect(read("openmoji", "1f44d-1f3fb.png")).to.equal("thumbs");
			expect(result.manifest).to.include({
				name: "OpenMoji",
				license: "CC BY-SA 4.0",
				version: "17.0.0",
				images: 4,
				credit: "All emojis designed by OpenMoji, the open-source emoji and icon project. License: CC BY-SA 4.0",
				creditUrl: "https://openmoji.org/",
			});
			expect(result.caveat).to.be.undefined;
			expect(availableEmojiSets().find((set) => set.id === "openmoji")).to.include({
				credit: result.manifest.credit,
				creditUrl: "https://openmoji.org/",
			});
		});

		it("checks the pinned release digest", async function () {
			routes[url] = archive();
			await expect(installEmojiSet("openmoji", {github: base})).rejects.toThrow(
				/Integrity check/
			);
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal([]);
		});
	});

	describe("Fluent Emoji", function () {
		const url = `/microsoft/fluentui-emoji/tar.gz/${fluentCommit}`;
		const root = `fluentui-emoji-${fluentCommit}/assets`;
		const thumbs = JSON.stringify({
			unicode: "1f44d",
			unicodeSkintones: [
				"1f44d",
				"1f44d 1f3fb",
				"1f44d 1f3fc",
				"1f44d 1f3fd",
				"1f44d 1f3fe",
				"1f44d 1f3ff",
			],
		});
		const repo = {
			[`fluentui-emoji-${fluentCommit}/README.md`]: "readme",
			[`${root}/Grinning face/3D/grinning_face_3d.png`]: "grin 3d",
			[`${root}/Grinning face/Flat/grinning_face_flat.svg`]: "grin flat",
			[`${root}/Grinning face/High Contrast/grinning_face_high_contrast.svg`]: "grin hc",
			[`${root}/Grinning face/metadata.json`]: JSON.stringify({unicode: "1f600"}),
			[`${root}/Keycap 0/3D/keycap_0_3d.png`]: "keycap",
			[`${root}/Keycap 0/metadata.json`]: JSON.stringify({unicode: "0030 fe0f 20e3"}),
			[`${root}/Thumbs up/Dark/3D/thumbs_up_3d_dark.png`]: "thumbs dark",
			[`${root}/Thumbs up/Default/3D/thumbs_up_3d_default.png`]: "thumbs",
			[`${root}/Thumbs up/Default/High Contrast/thumbs_up_high_contrast_default.svg`]:
				"thumbs hc",
			[`${root}/Thumbs up/Medium-Light/3D/thumbs_up_3d_medium-light.png`]: "thumbs ml",
			[`${root}/Thumbs up/metadata.json`]: thumbs,
			[`${root}/No metadata/3D/no_metadata_3d.png`]: "orphan",
		};

		it("maps the 3D PNGs to code points through metadata.json", async function () {
			const data = tarball(repo, fluentCommit);
			routes[url] = data;

			const result = await installEmojiSet("fluent-3d", {
				codeload: base,
				sha256: sha256(data),
			});

			expect(files("fluent-3d")).to.deep.equal([
				"0030-20e3.png",
				"1f44d-1f3fc.png",
				"1f44d-1f3ff.png",
				"1f44d.png",
				"1f600.png",
				"set.json",
			]);
			expect(read("fluent-3d", "1f44d-1f3ff.png")).to.equal("thumbs dark");
			expect(read("fluent-3d", "1f44d-1f3fc.png")).to.equal("thumbs ml");
			expect(result.manifest).to.include({
				name: "Microsoft Fluent Emoji (3D)",
				license: "MIT",
				format: "png",
				credit: "Fluent Emoji by Microsoft, © Microsoft Corporation, MIT License",
			});
		});

		it("installs the SVG variants, High Contrast for every skin tone", async function () {
			const data = tarball(repo, fluentCommit);
			routes[url] = data;

			await installEmojiSet("fluent-flat", {codeload: base, sha256: sha256(data)});
			await installEmojiSet("fluent-high-contrast", {codeload: base, sha256: sha256(data)});

			expect(files("fluent-flat")).to.deep.equal(["1f600.svg", "set.json"]);
			expect(read("fluent-flat", "1f600.svg")).to.equal("grin flat");
			expect(readEmojiSet("fluent-flat")!.format).to.equal("svg");
			expect(files("fluent-high-contrast")).to.deep.equal([
				"1f44d-1f3fb.svg",
				"1f44d-1f3fc.svg",
				"1f44d-1f3fd.svg",
				"1f44d-1f3fe.svg",
				"1f44d-1f3ff.svg",
				"1f44d.svg",
				"1f600.svg",
				"set.json",
			]);
			expect(read("fluent-high-contrast", "1f44d-1f3fe.svg")).to.equal("thumbs hc");
		});

		it("rejects a tarball of another commit or with another digest", async function () {
			const other = tarball(repo, "0".repeat(40));
			routes[url] = other;

			await expect(
				installEmojiSet("fluent-3d", {codeload: base, sha256: sha256(other)})
			).rejects.toThrow(/not commit/);
			await expect(installEmojiSet("fluent-3d", {codeload: base})).rejects.toThrow(
				/Integrity check/
			);
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal([]);
		});
	});

	describe("custom sets", function () {
		let source: string;

		beforeEach(function () {
			source = fs.mkdtempSync(path.join(os.tmpdir(), "thelounge-emoji-src-"));
		});

		afterEach(function () {
			fs.rmSync(source, {recursive: true, force: true});
		});

		const images = {
			"1F600.png": "grinning",
			"emoji_u1f44d_1f3fb.png": "thumbs",
			"u2764.png": "heart",
			"2764-fe0f.png": "heart again",
			"logo.png": "not an emoji",
			"1f601.svg": "svg",
			"notes.txt": "text",
		};

		it("installs a folder of PNGs named by code points", async function () {
			fs.mkdirSync(path.join(source, "sub"));

			for (const [name, data] of Object.entries(images)) {
				fs.writeFileSync(path.join(source, name), data);
			}

			fs.writeFileSync(path.join(source, "sub", "1f602.png"), "nested");

			const result = await installEmojiSet(source, {id: "mine", name: "My emoji"});

			expect(files("mine")).to.deep.equal([
				"1f44d-1f3fb.png",
				"1f600.png",
				"1f602.png",
				"2764.png",
				"set.json",
			]);
			expect(read("mine", "2764.png")).to.match(/^heart/);
			expect(result.skipped).to.equal(1);
			expect(result.manifest).to.include({
				name: "My emoji",
				license: "unknown",
				recipe: "custom",
				images: 4,
			});
			expect(result.manifest.credit).to.be.undefined;
			expect(result.caveat).to.equal("no licence given; installed at your discretion");
			expect(availableEmojiSets().map((set) => set.id)).to.include("mine");
		});

		it("installs a zip from a URL, verifying --sha256", async function () {
			const data = zip(images);
			routes["/set.zip"] = data;

			await expect(
				installEmojiSet(`${base}/set.zip`, {id: "zipped", sha256: "0".repeat(64)})
			).rejects.toThrow(/Integrity check/);

			const result = await installEmojiSet(`${base}/set.zip`, {
				id: "zipped",
				license: "CC BY 4.0",
				credit: "Zipped emoji by Someone, CC BY 4.0",
				sha256: sha256(data),
			});

			expect(files("zipped")).to.deep.equal([
				"1f44d-1f3fb.png",
				"1f600.png",
				"2764.png",
				"set.json",
			]);
			expect(result.manifest).to.include({
				name: "zipped",
				license: "CC BY 4.0",
				credit: "Zipped emoji by Someone, CC BY 4.0",
			});
			expect(result.caveat).to.be.undefined;
			expect(result.manifest.source).to.equal(`${base}/set.zip`);
		});

		it("installs a tarball, gzipped or not", async function () {
			const entries = {"set/1f600.png": "grinning", "set/1F1E8_1F1ED.png": "flag"};
			fs.writeFileSync(path.join(source, "set.tgz"), tarball(entries));
			fs.writeFileSync(path.join(source, "set.tar"), tar(entries));

			await installEmojiSet(path.join(source, "set.tgz"), {id: "tgz"});
			await installEmojiSet(path.join(source, "set.tar"), {id: "tar"});

			for (const id of ["tgz", "tar"]) {
				expect(files(id)).to.deep.equal(["1f1e8-1f1ed.png", "1f600.png", "set.json"]);
			}
		});

		it("needs a valid id and some images", async function () {
			fs.writeFileSync(path.join(source, "logo.png"), "x");

			await expect(installEmojiSet(source)).rejects.toThrow(/--id/);
			await expect(installEmojiSet(source, {id: "google"})).rejects.toThrow(/Invalid/);
			await expect(installEmojiSet(source, {id: "../x"})).rejects.toThrow(/Invalid/);
			await expect(installEmojiSet(source, {id: "empty"})).rejects.toThrow(/No emoji images/);
			expect(() => removeEmojiSet("../users")).to.throw(/not an installed/);
			expect(fs.readdirSync(path.join(home, "emoji"))).to.deep.equal([]);
		});
	});
});
