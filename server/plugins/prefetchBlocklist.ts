import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {domainToASCII} from "url";
import got from "got";

import log from "../log";
import Config from "../config";
import {getPrefetchAgents} from "./prefetchProxy";

// Adblock-style filter lists for link previews (`prefetchBlocklist`). Supports the
// network filter subset that makes sense for a bare url: `||domain^`, `|` anchors,
// `*` and `^` in patterns, `/regex/` and `@@` exceptions. Cosmetic rules and rules
// with `$options` are skipped.

export type Verdict = "block" | "allow" | null;

const separator = "(?:[^\\w.%-]|$)";
const domainAnchor = "^[a-z][a-z0-9+.-]*:\\/\\/(?:[^\\/?#]*\\.)?";
const refreshInterval = 24 * 60 * 60 * 1000;
const maxListSize = 16 * 1024 * 1024;

class RuleSet {
	domains = new Set<string>();
	patterns: string[] = [];
	regexes: RegExp[] = [];
	combined: RegExp[] = [];

	compile() {
		// A few big alternations instead of one regex per rule
		for (let i = 0; i < this.patterns.length; i += 1000) {
			this.combined.push(
				new RegExp(
					this.patterns
						.slice(i, i + 1000)
						.map((p) => `(?:${p})`)
						.join("|"),
					"i"
				)
			);
		}

		this.patterns = [];
	}

	matches(url: URL) {
		if (this.domains.size) {
			// Check the host and each parent domain
			let host = url.hostname.toLowerCase().replace(/\.+$/, "");

			for (;;) {
				if (this.domains.has(host)) {
					return true;
				}

				const dot = host.indexOf(".");

				if (dot < 0) {
					break;
				}

				host = host.slice(dot + 1);
			}
		}

		return (
			this.combined.some((re) => re.test(url.href)) ||
			this.regexes.some((re) => re.test(url.href))
		);
	}
}

export class Matcher {
	block = new RuleSet();
	allow = new RuleSet();
	rules = 0;
	skipped = 0;
	ignored = 0;

	add(line: string) {
		line = line.trim();

		// Empty lines, comments and the `[Adblock Plus 2.0]` header
		if (!line || line.startsWith("!") || line.startsWith("[")) {
			return;
		}

		const set = line.startsWith("@@") ? this.allow : this.block;

		if (set === this.allow) {
			line = line.slice(2);
		}

		const regex = /^\/(.+)\/(?:\$(.*))?$/.exec(line);

		if (regex) {
			if (regex[2] !== undefined) {
				this.skipped++;
				return;
			}

			try {
				set.regexes.push(new RegExp(regex[1], "i"));
				this.rules++;
			} catch {
				this.skipped++;
			}

			return;
		}

		// Cosmetic (element hiding, scriptlet) rules: ##, #@#, #?#, #$#, ...
		if (/#@?[?$%]?#/.test(line)) {
			this.ignored++;
			return;
		}

		// Request type, domain=... and other options don't apply to previews
		if (/\$~?[a-z]/i.test(line.slice(line.lastIndexOf("$")))) {
			this.skipped++;
			return;
		}

		const domain = /^\|\|([^/^*|:?#]+)\^\|?$/.exec(line);

		if (domain) {
			set.domains.add((domainToASCII(domain[1]) || domain[1]).toLowerCase());
			this.rules++;
			return;
		}

		const pattern = patternToRegex(line);

		if (pattern) {
			set.patterns.push(pattern);
			this.rules++;
		}
	}

	compile() {
		this.block.compile();
		this.allow.compile();
		return this;
	}

	// `allow` if an exception rule matches, `block` if a block rule matches
	match(url: URL): Verdict {
		if (this.allow.matches(url)) {
			return "allow";
		}

		return this.block.matches(url) ? "block" : null;
	}
}

function patternToRegex(pattern: string) {
	let prefix = "";
	let suffix = "";

	if (pattern.startsWith("||")) {
		prefix = domainAnchor;
		pattern = pattern.slice(2);
	} else if (pattern.startsWith("|")) {
		prefix = "^";
		pattern = pattern.slice(1);
	}

	if (pattern.endsWith("|")) {
		suffix = "$";
		pattern = pattern.slice(0, -1);
	}

	if (!pattern.replace(/\*/g, "")) {
		return null;
	}

	const body = pattern.replace(/[\\^$.*+?()[\]{}|/]/g, (char) =>
		char === "*" ? ".*" : char === "^" ? separator : `\\${char}`
	);

	return prefix + body + suffix;
}

export function compileFilters(text: string) {
	const matcher = new Matcher();

	for (const line of text.split(/\r?\n/)) {
		matcher.add(line);
	}

	return matcher.compile();
}

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
