// `thelounge emoji install`: downloads an emoji image set into
// ${THELOUNGE_HOME}/emoji/<id>/ (see emoji.ts for how sets are served). Every
// download is verified before anything is extracted (npm sha512 integrity, or a
// pinned sha256 of a GitHub release asset or commit tarball) and uses plain
// fetch, never the preview proxy. Files are stored under their emojiKey(), so
// the source's naming (case, padding, U+FE0F, separators) doesn't matter.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import {once} from "events";
import {Readable} from "stream";
import {pipeline} from "stream/promises";
import pkg from "../../package.json";
import {
	EmojiSetManifest,
	emojiKey,
	emojiRecipeCredits,
	getEmojiHomePath,
	getEmojiSetPath,
	isValidEmojiSetId,
} from "./emoji";

// Same emoji-datasource release as the bundled sets, so the image names match
export const emojiDatasourceVersion: string = pkg.devDependencies["emoji-datasource-google"];

export type InstallOptions = {
	// Download locations, overridable for tests
	registry?: string;
	github?: string;
	codeload?: string;
	// Expected sha256 (hex) of a custom download; for recipes it replaces the
	// pinned digest (tests only)
	sha256?: string;
	// Custom sets
	id?: string;
	name?: string;
	license?: string;
	credit?: string;
	log?: (message: string) => void;
};

type Context = Required<Pick<InstallOptions, "registry" | "github" | "codeload">> &
	InstallOptions & {log: (message: string) => void; work: string};

// Collects the images of a set being installed into its temp folder
class SetWriter {
	count = 0;
	skipped = 0;

	dir: string;
	format: "png" | "svg";

	constructor(dir: string, format: "png" | "svg") {
		this.dir = dir;
		this.format = format;
	}

	add(file: string | number[], data: Buffer) {
		if (typeof file === "string" && path.extname(file).toLowerCase() !== `.${this.format}`) {
			return false;
		}

		const key = emojiKey(file);

		if (!key) {
			this.skipped++;
			return false;
		}

		const dest = path.join(this.dir, `${key}.${this.format}`);

		// Same emoji with and without U+FE0F: keep the first
		if (fs.existsSync(dest)) {
			return false;
		}

		fs.writeFileSync(dest, data);
		this.count++;
		return true;
	}
}

type Recipe = {
	name: string;
	// Short licence, shown by `thelounge emoji list`
	license: string;
	// Attribution the licence requires, shown in Help > About
	credit?: string;
	creditUrl?: string;
	// Appended to the install message of sets that are not openly licensed
	caveat?: string;
	source: string;
	version: string;
	format: "png" | "svg";
	fill(writer: SetWriter, ctx: Context): Promise<void>;
};

const openmojiVersion = "17.0.0";
// Digest GitHub shows for the release asset openmoji-72x72-color.zip
const openmojiSha256 = "fee0c272d0105f5b37e63dcc60c3759bda5a90c5ba2b160f64eaa768149eb5e9";
const fluentCommit = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc";
const fluentSha256 = "5fc28b1d47e1b60c70b0b1213bca37850a7702f157bc2492e80178de00840701";

function datasourceRecipe(set: string, name: string, license: string): Recipe {
	return {
		name,
		license,
		caveat: `${license}; installed at your discretion`,
		source: `https://www.npmjs.com/package/emoji-datasource-${set}/v/${emojiDatasourceVersion}`,
		version: emojiDatasourceVersion,
		format: "png",
		async fill(writer, ctx) {
			const pkgName = `emoji-datasource-${set}`;
			const metaUrl = `${ctx.registry}/${pkgName}/${emojiDatasourceVersion}`;
			const metaRes = await fetch(metaUrl);

			if (!metaRes.ok) {
				throw new Error(`Could not get ${metaUrl}: HTTP ${metaRes.status}`);
			}

			const meta = (await metaRes.json()) as {dist?: {tarball?: string; integrity?: string}};
			const tarball = meta.dist?.tarball;
			const integrity = /^sha512-(.+)$/.exec(meta.dist?.integrity || "");

			if (!tarball || !integrity) {
				throw new Error(
					`The registry metadata of ${pkgName} has no tarball or sha512 integrity`
				);
			}

			const file = await download(tarball, ctx, {sha512: integrity[1]});
			const prefix = `package/img/${set}/64/`;

			await extractTarFile(
				file,
				(entry) => entry.startsWith(prefix) && !entry.slice(prefix.length).includes("/"),
				(entry, data) => writer.add(entry, data)
			);
		},
	};
}

function fluentRecipe(id: string, variant: string, format: "png" | "svg"): Recipe {
	return {
		name: `Microsoft Fluent Emoji (${variant})`,
		license: "MIT",
		...emojiRecipeCredits[id],
		source: `https://github.com/microsoft/fluentui-emoji/tree/${fluentCommit}`,
		version: fluentCommit.slice(0, 7),
		format,
		async fill(writer, ctx) {
			const url = `${ctx.codeload}/microsoft/fluentui-emoji/tar.gz/${fluentCommit}`;
			const file = await download(url, ctx, {sha256: ctx.sha256 || fluentSha256});
			await extractFluent(file, variant, writer);
		},
	};
}

export const emojiRecipes: Record<string, Recipe> = {
	apple: datasourceRecipe("apple", "Apple", "© Apple Inc., not openly licensed"),
	facebook: datasourceRecipe("facebook", "Facebook", "© Meta Platforms, no clear licence"),
	openmoji: {
		name: "OpenMoji",
		license: "CC BY-SA 4.0",
		...emojiRecipeCredits.openmoji,
		source: `https://github.com/hfg-gmuend/openmoji/releases/tag/${openmojiVersion}`,
		version: openmojiVersion,
		format: "png",
		async fill(writer, ctx) {
			const url = `${ctx.github}/hfg-gmuend/openmoji/releases/download/${openmojiVersion}/openmoji-72x72-color.zip`;
			const file = await download(url, ctx, {sha256: ctx.sha256 || openmojiSha256});

			for (const [entry, data] of readZip(fs.readFileSync(file))) {
				if (!entry.includes("/")) {
					writer.add(entry, data());
				}
			}
		},
	},
	"fluent-3d": fluentRecipe("fluent-3d", "3D", "png"),
	"fluent-color": fluentRecipe("fluent-color", "Color", "svg"),
	"fluent-flat": fluentRecipe("fluent-flat", "Flat", "svg"),
	"fluent-high-contrast": fluentRecipe("fluent-high-contrast", "High Contrast", "svg"),
};

export type InstallResult = {
	id: string;
	manifest: EmojiSetManifest;
	// Short remark for the install message, for sets that are not openly licensed
	caveat?: string;
	skipped: number;
};

// Installs a recipe (emojiRecipes) or a custom set (URL or path of a zip,
// tarball or folder of PNGs named by code points, needs options.id)
export async function installEmojiSet(
	source: string,
	options: InstallOptions = {}
): Promise<InstallResult> {
	const log = options.log || (() => undefined);
	let id: string;
	let recipe: Recipe;

	if (emojiRecipes[source] && !options.id) {
		id = source;
		recipe = emojiRecipes[source];
	} else if (/^https?:\/\//.test(source) || fs.existsSync(source)) {
		if (!options.id) {
			throw new Error("A custom emoji set needs an --id");
		}

		id = options.id;
		recipe = customRecipe(source, options);
	} else {
		throw new Error(
			`Unknown emoji set "${source}": use one of ${Object.keys(emojiRecipes).join(
				", "
			)}, or the URL or path of a zip, tarball or folder of PNGs with --id`
		);
	}

	if (!isValidEmojiSetId(id)) {
		throw new Error(
			`Invalid emoji set id "${id}": use lowercase letters, digits and "-", not google, twitter or native`
		);
	}

	const dest = getEmojiSetPath(id);
	const tmp = `${dest}.tmp-${process.pid}`;
	const work = `${dest}.dl-${process.pid}`;

	fs.mkdirSync(getEmojiHomePath(), {recursive: true});

	for (const dir of [tmp, work]) {
		fs.rmSync(dir, {recursive: true, force: true});
		fs.mkdirSync(dir);
	}

	try {
		const writer = new SetWriter(tmp, recipe.format);
		await recipe.fill(writer, {
			...options,
			registry: (options.registry || "https://registry.npmjs.org").replace(/\/$/, ""),
			github: (options.github || "https://github.com").replace(/\/$/, ""),
			codeload: (options.codeload || "https://codeload.github.com").replace(/\/$/, ""),
			log,
			work,
		});

		if (writer.count === 0) {
			throw new Error(`No emoji images found for ${id}, nothing was installed`);
		}

		const manifest: EmojiSetManifest = {
			name: recipe.name,
			license: recipe.license,
			source: recipe.source,
			version: recipe.version,
			scheme: "codepoints",
			format: recipe.format,
			recipe: emojiRecipes[source] === recipe ? source : "custom",
			images: writer.count,
		};

		if (recipe.credit) {
			manifest.credit = recipe.credit;
		}

		if (recipe.creditUrl) {
			manifest.creditUrl = recipe.creditUrl;
		}

		// set.json makes the folder a set, so it is written last, and the finished
		// folder replaces the old one in one rename
		fs.writeFileSync(path.join(tmp, "set.json"), JSON.stringify(manifest, null, "\t") + "\n");
		fs.rmSync(dest, {recursive: true, force: true});
		fs.renameSync(tmp, dest);

		return {id, manifest, caveat: recipe.caveat, skipped: writer.skipped};
	} finally {
		fs.rmSync(tmp, {recursive: true, force: true});
		fs.rmSync(work, {recursive: true, force: true});
	}
}

export function removeEmojiSet(id: string) {
	if (!isValidEmojiSetId(id)) {
		throw new Error(`"${id}" is not an installed emoji set`);
	}

	const dest = getEmojiSetPath(id);
	const existed = fs.existsSync(dest);
	fs.rmSync(dest, {recursive: true, force: true});
	return existed;
}

function customRecipe(source: string, options: InstallOptions): Recipe {
	return {
		name: options.name || options.id!,
		license: options.license || "unknown",
		credit: options.credit,
		caveat: options.license ? undefined : "no licence given; installed at your discretion",
		source: /^https?:\/\//.test(source) ? source : "local files",
		version: "",
		format: "png",
		async fill(writer, ctx) {
			let file = source;

			if (/^https?:\/\//.test(source)) {
				if (!ctx.sha256) {
					ctx.log("No --sha256 given, the download is not verified.");
				}

				file = await download(source, ctx, {sha256: ctx.sha256});
			} else if (fs.statSync(source).isDirectory()) {
				for (const entry of fs.readdirSync(source, {recursive: true}) as string[]) {
					const full = path.join(source, entry);

					if (/\.png$/i.test(entry) && fs.statSync(full).isFile()) {
						writer.add(entry, fs.readFileSync(full));
					}
				}

				return;
			}

			const head = Buffer.alloc(512);
			const fd = fs.openSync(file, "r");
			fs.readSync(fd, head, 0, 512, 0);
			fs.closeSync(fd);

			const add = (entry: string, data: Buffer) => {
				if (/\.png$/i.test(entry)) {
					writer.add(path.posix.basename(entry), data);
				}
			};

			if (head.readUInt32LE(0) === 0x04034b50) {
				for (const [entry, data] of readZip(fs.readFileSync(file))) {
					if (/\.png$/i.test(entry)) {
						add(entry, data());
					}
				}
			} else if (head[0] === 0x1f && head[1] === 0x8b) {
				await extractTarFile(file, (entry) => /\.png$/i.test(entry), add);
			} else if (head.toString("latin1", 257, 262) === "ustar") {
				await extractTarFile(file, (entry) => /\.png$/i.test(entry), add, false);
			} else {
				throw new Error(`${source} is not a zip, tarball or folder`);
			}

			if (writer.skipped) {
				ctx.log(`Skipped ${writer.skipped} PNGs not named by code points.`);
			}
		},
	};
}

// Downloads into the work folder, verifying the digest before returning
async function download(
	url: string,
	ctx: Context,
	expected: {sha256?: string; sha512?: string}
): Promise<string> {
	ctx.log(`Downloading ${url}`);
	const res = await fetch(url);

	if (!res.ok || !res.body) {
		throw new Error(`Could not download ${url}: HTTP ${res.status}`);
	}

	const file = path.join(ctx.work, "download");
	const sha256 = crypto.createHash("sha256");
	const sha512 = crypto.createHash("sha512");
	const body = Readable.fromWeb(res.body as unknown as import("stream/web").ReadableStream);
	body.on("data", (chunk: Buffer) => {
		sha256.update(chunk);
		sha512.update(chunk);
	});
	await pipeline(body, fs.createWriteStream(file));

	if (
		(expected.sha256 && sha256.digest("hex") !== expected.sha256.toLowerCase()) ||
		(expected.sha512 && sha512.digest("base64") !== expected.sha512)
	) {
		throw new Error(`Integrity check of ${url} failed, nothing was installed`);
	}

	if (expected.sha256 || expected.sha512) {
		ctx.log("Integrity check passed.");
	}

	return file;
}

// Fluent Emoji: assets/<Name>/[<Skin tone>/]<Variant>/<name>_<variant>[_<tone>].<ext>
// with the code points in assets/<Name>/metadata.json (after the images in git
// order, so a folder's images wait for it)
async function extractFluent(file: string, variant: string, writer: SetWriter) {
	const tones = ["Default", "Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];
	type Meta = {unicode: string; unicodeSkintones?: string[]};
	const metas = new Map<string, Meta>();
	const pending = new Map<string, Array<{tone: number; data: Buffer}>>();

	const parse = (entry: string) => {
		// <root>/assets/<Name>/...
		const parts = entry.split("/").slice(1);

		if (parts[0] !== "assets" || parts.length < 3) {
			return null;
		}

		const [, folder, ...rest] = parts;

		if (rest.length === 1 && rest[0] === "metadata.json") {
			return {folder, meta: true, tone: 0};
		}

		if (rest.length === 2 && rest[0] === variant) {
			return {folder, meta: false, tone: 0};
		}

		if (rest.length === 3 && rest[1] === variant && tones.includes(rest[0])) {
			return {folder, meta: false, tone: tones.indexOf(rest[0])};
		}

		return null;
	};

	const add = (meta: Meta, tone: number, data: Buffer) => {
		const sequences = meta.unicodeSkintones || [meta.unicode];
		const toHex = (seq: string) => seq.split(/\s+/).map((cp) => parseInt(cp, 16));

		if (!sequences[tone]) {
			return;
		}

		writer.add(toHex(sequences[tone]), data);

		// High Contrast is monochrome, so only Default exists: use it for all tones
		if (tone === 0 && variant === "High Contrast") {
			sequences.slice(1).forEach((seq) => writer.add(toHex(seq), data));
		}
	};

	const {comment} = await extractTarFile(
		file,
		(entry) => parse(entry) !== null,
		(entry, data) => {
			const {folder, meta, tone} = parse(entry)!;

			if (meta) {
				const parsed = JSON.parse(data.toString("utf8")) as Meta;
				metas.set(folder, parsed);
				(pending.get(folder) || []).forEach((image) => add(parsed, image.tone, image.data));
				pending.delete(folder);
			} else if (metas.has(folder)) {
				add(metas.get(folder)!, tone, data);
			} else {
				pending.set(folder, [...(pending.get(folder) || []), {tone, data}]);
			}
		}
	);

	if (comment !== fluentCommit) {
		throw new Error(`The Fluent Emoji tarball is not commit ${fluentCommit}`);
	}
}

// Entries of a zip archive (stored or deflated, no zip64): [name, read()]
function* readZip(zip: Buffer): Generator<[string, () => Buffer]> {
	let eocd = -1;

	for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
		if (zip.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}

	if (eocd < 0) {
		throw new Error("Not a zip file");
	}

	const total = zip.readUInt16LE(eocd + 10);
	let pos = zip.readUInt32LE(eocd + 16);

	for (let n = 0; n < total; n++) {
		if (zip.readUInt32LE(pos) !== 0x02014b50) {
			throw new Error("Broken zip central directory");
		}

		const method = zip.readUInt16LE(pos + 10);
		const compressed = zip.readUInt32LE(pos + 20);
		const nameLength = zip.readUInt16LE(pos + 28);
		const extraLength = zip.readUInt16LE(pos + 30);
		const commentLength = zip.readUInt16LE(pos + 32);
		const local = zip.readUInt32LE(pos + 42);
		const name = zip.toString("utf8", pos + 46, pos + 46 + nameLength);
		pos += 46 + nameLength + extraLength + commentLength;

		if (name.endsWith("/")) {
			continue;
		}

		yield [
			name,
			() => {
				const start =
					local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
				const data = zip.subarray(start, start + compressed);

				if (method === 0) {
					return data;
				}

				if (method === 8) {
					return zlib.inflateRawSync(data);
				}

				throw new Error(`Unsupported zip compression in ${name}`);
			},
		];
	}
}

async function extractTarFile(
	file: string,
	wanted: (entry: string) => boolean,
	onFile: (entry: string, data: Buffer) => void,
	gzip = true
) {
	// Closed before the caller removes the file (Windows can't delete open files)
	const input = fs.createReadStream(file);

	try {
		return await extractTar(gzip ? input.pipe(zlib.createGunzip()) : input, wanted, onFile);
	} finally {
		if (!input.closed) {
			input.destroy();
			await once(input, "close");
		}
	}
}

// Minimal streaming tar reader (ustar with pax/GNU long names): calls onFile
// with the path and contents of every regular file that is wanted, other
// contents are skipped without buffering them. Returns the pax global
// comment (the commit id in `git archive` tarballs).
async function extractTar(
	stream: AsyncIterable<Buffer>,
	wanted: (entry: string) => boolean,
	onFile: (entry: string, data: Buffer) => void
) {
	type Entry = {name: string; type: string; keep: boolean; size: number; padded: number};
	let buffer: Buffer = Buffer.alloc(0);
	let entry: Entry | null = null;
	let chunks: Buffer[] = [];
	let received = 0;
	let longName: string | null = null;
	let comment: string | null = null;
	const pax = (data: Buffer, key: string) =>
		new RegExp(`(?:^|\\n)\\d+ ${key}=([^\\n]*)\\n`).exec(data.toString("utf8"))?.[1] ?? null;

	const finishEntry = () => {
		if (!entry) {
			return;
		}

		const data = Buffer.concat(chunks);
		chunks = [];

		if (entry.type === "g") {
			comment = pax(data, "comment") ?? comment;
		} else if (entry.type === "x") {
			longName = pax(data, "path") ?? longName;
		} else if (entry.type === "L") {
			longName = data.toString("utf8").replace(/\0.*$/s, "");
		} else {
			if (entry.keep) {
				onFile(entry.name, data);
			}

			longName = null;
		}

		entry = null;
	};

	for await (const chunk of stream) {
		buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;

		while (buffer.length) {
			if (entry) {
				const take = Math.min(entry.padded - received, buffer.length);
				const dataEnd = Math.max(0, Math.min(take, entry.size - received));

				if (entry.keep && dataEnd > 0) {
					chunks.push(buffer.subarray(0, dataEnd));
				}

				received += take;
				buffer = buffer.subarray(take);

				if (received === entry.padded) {
					finishEntry();
				}

				continue;
			}

			if (buffer.length < 512) {
				break;
			}

			const header = buffer.subarray(0, 512);
			buffer = buffer.subarray(512);

			if (header.every((b) => b === 0)) {
				continue;
			}

			const field = (start: number, length: number) =>
				header
					.subarray(start, start + length)
					.toString("utf8")
					.replace(/\0.*$/s, "");
			const size = parseInt(field(124, 12).trim() || "0", 8);
			const type = String.fromCharCode(header[156]);
			const prefix = field(345, 155);
			const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
			const isFile = type === "0" || type === "\0";

			entry = {
				name,
				type,
				keep: ["g", "x", "L"].includes(type) || (isFile && wanted(name)),
				size,
				padded: Math.ceil(size / 512) * 512,
			};
			received = 0;

			if (entry.padded === 0) {
				finishEntry();
			}
		}
	}

	if (entry) {
		throw new Error("Truncated tarball");
	}

	return {comment: comment as string | null};
}
