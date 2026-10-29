import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import got from "got";

import log from "../log";
import Config from "../config";
import {getPrefetchAgents} from "./prefetchProxy";

// Adblock-style filter lists for link previews (`prefetchBlocklist`); the rule
// parser and matcher live in shared/previewFilters.ts (also used for per-user rules).

export {Matcher, compileFilters} from "../../shared/previewFilters";
export type {Verdict} from "../../shared/previewFilters";
import {Matcher, compileFilters} from "../../shared/previewFilters";

const refreshInterval = 24 * 60 * 60 * 1000;
const maxListSize = 16 * 1024 * 1024;

// A source is an http(s) url of a list, a file path (absolute, also C:\ or \\ on
// Windows, or starting with ./, ../ or ~/, relative to THELOUNGE_HOME) or else an inline rule
export function sourceKind(source: string): "url" | "file" | "rule" {
	if (/^https?:\/\//i.test(source)) {
		return "url";
	}

	if (
		/^(\/|\.\.?[\\/]|~[\\/]|[a-z]:[\\/]|\\\\)/i.test(source) &&
		!/^\/.+\/(\$.*)?$/.test(source)
	) {
		return "file";
	}

	return "rule";
}

function sources() {
	const value = Config.values.prefetchBlocklist;
	return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

function filePath(source: string) {
	if (/^~[\\/]/.test(source)) {
		return path.join(os.homedir(), source.slice(2));
	}

	return path.resolve(Config.getHomePath(), source);
}

function cachePath(url: string) {
	const hash = crypto.createHash("sha256").update(url).digest("hex");
	return path.join(Config.getHomePath(), "cache", "blocklists", `${hash}.txt`);
}

// Last good copy of each remote list
const remoteLists = new Map<string, string>();
let version = 0;
let compiled: {key: string; matcher: Matcher} | undefined;
let timer: NodeJS.Timeout | undefined;

function readRemote(url: string) {
	if (!remoteLists.has(url)) {
		try {
			remoteLists.set(url, fs.readFileSync(cachePath(url), "utf-8"));
		} catch {
			// Not downloaded yet
			return "";
		}
	}

	return remoteLists.get(url)!;
}

export function getMatcher() {
	const list = sources();
	const key = JSON.stringify([list, version]);

	if (compiled?.key === key) {
		return compiled.matcher;
	}

	const texts = list.map((source) => {
		switch (sourceKind(source)) {
			case "url":
				return readRemote(source);

			case "file":
				try {
					return fs.readFileSync(filePath(source), "utf-8");
				} catch (e: any) {
					log.warn(`prefetchBlocklist: could not read ${source}: ${String(e.message)}`);
					return "";
				}

			default:
				return source;
		}
	});

	const matcher = compileFilters(texts.join("\n"));
	log.debug(
		`prefetchBlocklist: ${matcher.rules} rules, ${matcher.skipped} skipped (unsupported options or invalid), ${matcher.ignored} cosmetic ignored`
	);
	compiled = {key, matcher};
	return matcher;
}

// Downloads a list through the preview proxy, if any
function download(url: string) {
	return new Promise<string>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const stream = got.stream(url, {
			retry: 0,
			timeout: Math.max(Config.values.prefetchTimeout || 5000, 30000),
			headers: {"User-Agent": "Mozilla/5.0 (compatible; The Lounge IRC Client)"},
			localAddress: Config.values.bind,
			agent: getPrefetchAgents(),
		});

		stream
			.on("data", (chunk: Buffer) => {
				size += chunk.length;

				if (size > maxListSize) {
					stream.destroy(new Error(`list is larger than ${maxListSize} bytes`));
					return;
				}

				chunks.push(chunk);
			})
			.on("error", reject)
			.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
	});
}

// Fetches all remote lists again, keeping the last good copy of the ones that fail
export async function refresh() {
	const urls = sources().filter((source) => sourceKind(source) === "url");

	await Promise.all(
		urls.map(async (url) => {
			try {
				const text = await download(url);
				remoteLists.set(url, text);

				const file = cachePath(url);
				await fs.promises.mkdir(path.dirname(file), {recursive: true});
				await fs.promises.writeFile(`${file}.tmp`, text);
				await fs.promises.rename(`${file}.tmp`, file);
			} catch (e: any) {
				log.warn(
					`prefetchBlocklist: could not update ${url}, keeping the last copy: ${String(
						e.message
					)}`
				);
			}
		})
	);

	// Recompile, which also re-reads local files
	version++;
	getMatcher();
}

export function start() {
	stop();
	void refresh();
	timer = setInterval(() => void refresh(), refreshInterval).unref();
}

export function stop() {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
}

// For tests
export function reset() {
	stop();
	remoteLists.clear();
	compiled = undefined;
	version++;
}
