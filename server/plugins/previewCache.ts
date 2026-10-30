import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

import log from "../log";
import Config from "../config";
import {LinkPreview} from "../../shared/types/msg";

// A cached preview is a LinkPreview without the per-message fields
export type CachedPreview = Omit<LinkPreview, "link" | "shown">;

type Entry = {
	url: string;
	// Preview metadata as produced by the link plugin, if this url was posted as a link
	preview?: CachedPreview;
	// Content type of the cached image, if this url is used as a preview thumbnail.
	// Only urls with this field set are served by the thumbnail route.
	image?: string;
};

const hashRegex = /^[0-9a-f]{64}$/;
const writes = new Map<string, Promise<unknown>>();
const thumbs = new Map<string, Promise<unknown>>();
const thumbSize = 640;

// Small inline preview of a cached image: animated formats become an animated webp, the rest avif
export function thumbFormat(type: string) {
	if (type === "image/svg+xml") {
		return null;
	}

	return type === "image/gif" || type === "image/webp" ? "webp" : "avif";
}

export async function makeThumb(data: Buffer, type: string) {
	const format = thumbFormat(type);

	if (!format) {
		return null;
	}

	const thumb = await sharp(data, {animated: format === "webp"})
		.rotate()
		.resize(thumbSize, thumbSize, {fit: "inside", withoutEnlargement: true})
		.toFormat(format)
		.toBuffer();

	return thumb.length < data.length ? thumb : null;
}

// Display size of an image (EXIF rotation applied, first frame of an animation) and a tiny
// copy the viewer shows blurred until the thumbnail is loaded
export async function imageInfo(data: Buffer | string) {
	const image = sharp(data).rotate();
	const {width, height} = (await image.metadata()).autoOrient;
	const tiny = await image.resize(10, 10, {fit: "inside"}).webp().toBuffer();
	return {width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`};
}

let salt = "";

class PreviewCache {
	isEnabled() {
		return Config.values.prefetch && Config.values.prefetchCache;
	}

	getSalt() {
		if (salt) {
			return salt;
		}

		const file = path.join(Config.getPreviewCachePath(), "salt");

		try {
			salt = fs.readFileSync(file, "utf-8").trim();
		} catch {
			// Generated below
		}

		if (!salt) {
			salt = crypto.randomBytes(32).toString("hex");
			fs.mkdirSync(path.dirname(file), {recursive: true});
			fs.writeFileSync(file, salt, {mode: 0o600});
		}

		return salt;
	}

	hash(url: string) {
		return crypto
			.createHash("sha256")
			.update(this.getSalt() + url)
			.digest("hex");
	}

	isValidHash(hash: string) {
		return hashRegex.test(hash);
	}

	getPath(hash: string, extension: "json" | "img" | "avif" | "webp") {
		return path.join(
			Config.getPreviewCachePath(),
			hash.substring(0, 2),
			hash.substring(2, 4),
			`${hash}.${extension}`
		);
	}

	async read(hash: string): Promise<Entry | null> {
		// Wait for pending writes of this entry
		await writes.get(hash);
		return this.readFile(hash);
	}

	async readFile(hash: string): Promise<Entry | null> {
		try {
			return JSON.parse(
				await fs.promises.readFile(this.getPath(hash, "json"), "utf-8")
			) as Entry;
		} catch {
			return null;
		}
	}

	async getPreview(url: string) {
		const preview = (await this.read(this.hash(url)))?.preview || null;

		// Cached before the full image size and placeholder were recorded: made once
		if (preview?.full && !preview.placeholder) {
			const file = this.getPath(preview.full.split("/")[1], "img");
			const info = await imageInfo(file).catch(() => null);

			if (info?.width) {
				Object.assign(preview, info);
				void this.update(url, {preview});
			}
		}

		return preview;
	}

	setPreview(url: string, preview: LinkPreview) {
		const {link, shown, ...cached} = preview;
		return this.update(url, {preview: cached});
	}

	// Waits for the thumbnail of this entry, if it is still being made
	async waitForThumb(hash: string) {
		await thumbs.get(hash);
	}

	// Stores image data for a thumbnail url, allowing the image route to serve it, and returns its
	// hash. A small thumbnail is made in the background; until then the original is served.
	async setImage(url: string, type: string, data: Buffer) {
		const hash = this.hash(url);
		const file = this.getPath(hash, "img");

		try {
			await fs.promises.mkdir(path.dirname(file), {recursive: true});
			await fs.promises.writeFile(file, data);
		} catch (e: any) {
			// The image route fetches it from the source again
			log.error("Failed to write preview cache image", e.message);
		}

		const format = thumbFormat(type);

		if (format) {
			const thumb = makeThumb(data, type)
				.then(
					(buffer) => buffer && fs.promises.writeFile(this.getPath(hash, format), buffer)
				)
				.catch((e: Error) => log.error("Failed to make preview thumbnail", e.message))
				.finally(() => thumbs.get(hash) === thumb && thumbs.delete(hash));
			thumbs.set(hash, thumb);
		}

		await this.update(url, {image: type});
		return hash;
	}

	// Writes to the same entry are serialized so concurrent updates don't drop fields
	update(url: string, data: Partial<Entry>) {
		const hash = this.hash(url);
		const file = this.getPath(hash, "json");
		const write = (writes.get(hash) || Promise.resolve())
			.then(async () => {
				const entry = {...(await this.readFile(hash)), ...data, url};
				await fs.promises.mkdir(path.dirname(file), {recursive: true});
				await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(entry));
				await fs.promises.rename(`${file}.tmp`, file);
			})
			.catch((e: Error) => log.error("Failed to write preview cache", e.message));

		writes.set(hash, write);
		void write.then(() => writes.get(hash) === write && writes.delete(hash));
		return write;
	}

	// Waits for all pending writes
	async flush() {
		await Promise.all([...writes.values(), ...thumbs.values()]);
	}

	// Deletes cache files older than prefetchCacheMaxAge days
	async cleanup() {
		const maxAge = Config.values.prefetchCacheMaxAge;

		if (!maxAge || maxAge <= 0) {
			return;
		}

		const dir = Config.getPreviewCachePath();
		const threshold = Date.now() - maxAge * 24 * 60 * 60 * 1000;
		const files = await fs.promises
			.readdir(dir, {recursive: true, withFileTypes: true})
			.catch(() => []);

		for (const file of files) {
			if (!file.isFile() || file.name === "salt") {
				continue;
			}

			const filePath = path.join(file.parentPath, file.name);

			try {
				if ((await fs.promises.stat(filePath)).mtimeMs < threshold) {
					await fs.promises.unlink(filePath);
				}
			} catch {
				// File was removed in the meantime
			}
		}
	}
}

export default new PreviewCache();
