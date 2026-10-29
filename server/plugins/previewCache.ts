import fs from "fs";
import path from "path";
import crypto from "crypto";

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

	getPath(hash: string, extension: "json" | "img") {
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
		return (await this.read(this.hash(url)))?.preview || null;
	}

	setPreview(url: string, preview: LinkPreview) {
		const {link, shown, ...cached} = preview;
		return this.update(url, {preview: cached});
	}

	// Stores image data for a thumbnail url, allowing the image route to serve it, and returns its hash
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
		await Promise.all(writes.values());
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
