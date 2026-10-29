// Emoji image sets (Settings > Appearance > Emoji style). Google and Twitter are
// bundled in public/img/emoji/<set>/ with emoji-datasource file names. Other
// sets are installed by the operator into ${THELOUNGE_HOME}/emoji/<id>/
// (`thelounge emoji install`, see emojiInstall.ts): every folder with a valid
// set.json is a set, found on each call so installs need no restart.
import fs from "fs";
import path from "path";
import type {Request, Response, NextFunction} from "express";
import Config from "../config";
import Utils from "../command-line/utils";

import type {EmojiSetInfo} from "../../shared/types/config";

// set.json of an installed set. `scheme: "codepoints"` = one file per emoji,
// named by emojiKey() (lowercase hex code points joined by "-", without
// U+FE0F/U+FE0E), in `format` (png or svg).
export type EmojiSetManifest = {
	name: string;
	license: string;
	source?: string;
	version?: string;
	scheme: "codepoints";
	format: "png" | "svg";
	recipe?: string;
	images?: number;
	credit?: string;
	creditUrl?: string;
};

export const bundledEmojiSets: EmojiSetInfo[] = [
	{
		id: "google",
		name: "Google (Noto Emoji)",
		license: "Apache-2.0",
		bundled: true,
		credit: "Noto Emoji by Google, Apache License 2.0",
		creditUrl: "https://github.com/googlefonts/noto-emoji",
	},
	{
		id: "twitter",
		name: "Twitter (Twemoji)",
		license: "CC-BY-4.0",
		bundled: true,
		credit: "Twemoji graphics by Twitter, Inc and other contributors, CC-BY 4.0",
		creditUrl: "https://github.com/jdecked/twemoji",
	},
];

const fluentCredit = {
	credit: "Fluent Emoji by Microsoft, © Microsoft Corporation, MIT License",
	creditUrl: "https://github.com/microsoft/fluentui-emoji",
};

// Attribution the licences of the installable sets (emojiInstall.ts) require,
// by recipe; also used for sets installed before set.json had a credit
export const emojiRecipeCredits: Record<string, {credit: string; creditUrl: string}> = {
	openmoji: {
		credit: "All emojis designed by OpenMoji, the open-source emoji and icon project. License: CC BY-SA 4.0",
		creditUrl: "https://openmoji.org/",
	},
	"fluent-3d": fluentCredit,
	"fluent-color": fluentCredit,
	"fluent-flat": fluentCredit,
	"fluent-high-contrast": fluentCredit,
};

const reservedIds = ["native", ...bundledEmojiSets.map((set) => set.id)];

export function isValidEmojiSetId(id: string) {
	return /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) && !reservedIds.includes(id);
}

export function getEmojiHomePath() {
	return path.join(Config.getHomePath(), "emoji");
}

export function getEmojiSetPath(id: string) {
	if (!isValidEmojiSetId(id)) {
		throw new Error(`Invalid emoji set id "${id}"`);
	}

	return path.join(getEmojiHomePath(), id);
}

// The parsed set.json of an installed set, or null if it is not a valid set
export function readEmojiSet(id: string): EmojiSetManifest | null {
	if (!isValidEmojiSetId(id)) {
		return null;
	}

	try {
		const data = JSON.parse(
			fs.readFileSync(path.join(getEmojiSetPath(id), "set.json"), "utf8")
		) as EmojiSetManifest;

		if (
			typeof data.name !== "string" ||
			!data.name ||
			typeof data.license !== "string" ||
			data.scheme !== "codepoints" ||
			!["png", "svg"].includes(data.format)
		) {
			return null;
		}

		return data;
	} catch {
		return null;
	}
}

export function installedEmojiSets(): Array<EmojiSetInfo & {manifest: EmojiSetManifest}> {
	let ids: string[];

	try {
		ids = fs.readdirSync(getEmojiHomePath()).sort();
	} catch {
		return [];
	}

	return ids.flatMap((id) => {
		const manifest = readEmojiSet(id);

		if (!manifest) {
			return [];
		}

		const set: EmojiSetInfo & {manifest: EmojiSetManifest} = {
			id,
			name: manifest.name,
			license: manifest.license,
			bundled: false,
			manifest,
		};

		if (manifest.source) {
			set.source = manifest.source;
		}

		if (manifest.version) {
			set.version = manifest.version;
		}

		const known = manifest.recipe ? emojiRecipeCredits[manifest.recipe] : undefined;

		if (typeof manifest.credit === "string" && manifest.credit) {
			set.credit = manifest.credit;

			if (typeof manifest.creditUrl === "string" && /^https:\/\//.test(manifest.creditUrl)) {
				set.creditUrl = manifest.creditUrl;
			}
		} else if (known) {
			Object.assign(set, known);
		}

		return [set];
	});
}

// Image sets clients may use
export function availableEmojiSets(): EmojiSetInfo[] {
	const installed = installedEmojiSets().map((set) => {
		const info: EmojiSetInfo & {manifest?: EmojiSetManifest} = {...set};
		delete info.manifest;
		return info;
	});

	return [...bundledEmojiSets, ...installed];
}

// Calls onChange with the sets and default style whenever a set is installed or
// removed while the server runs. Installs and removals rename or delete a set's
// folder, which changes the emoji folder's mtime; that is polled, as fs.watch is
// unreliable on network and container file systems. Returns a function that stops it.
export function watchEmojiSets(
	onChange: (sets: EmojiSetInfo[], defaultStyle: string) => void,
	interval = 2000
) {
	const dir = getEmojiHomePath();
	let last = JSON.stringify([availableEmojiSets(), defaultEmojiStyle()]);

	const check = () => {
		const sets = availableEmojiSets();
		const defaultStyle = defaultEmojiStyle();
		const current = JSON.stringify([sets, defaultStyle]);

		if (current !== last) {
			last = current;
			onChange(sets, defaultStyle);
		}
	};

	fs.watchFile(dir, {interval, persistent: false}, check);
	return () => fs.unwatchFile(dir, check);
}

// Configured emojiDefaultStyle, or google if that set is not available
export function defaultEmojiStyle() {
	const style = Config.values.emojiDefaultStyle;

	if (style === "native" || availableEmojiSets().some((set) => set.id === style)) {
		return style;
	}

	return "google";
}

// Bundled set an installed set falls back to for emoji it has no image for
export function fallbackEmojiSet() {
	const style = Config.values.emojiDefaultStyle;
	return bundledEmojiSets.some((set) => set.id === style) ? style : "google";
}

// Code points of an emoji image file name: hex code points separated by "-",
// "_" or " ", each optionally prefixed with "u" or "U+", and an optional
// "emoji_" prefix (Noto's emoji_u1f600_1f3fb.png). Null if it is not one.
export function emojiCodepoints(file: string): number[] | null {
	const name = path
		.basename(file)
		.replace(/\.(png|svg)$/i, "")
		.toLowerCase()
		.replace(/^emoji_/, "");

	if (!/^(u\+?)?[0-9a-f]{2,6}([-_ ](u\+?)?[0-9a-f]{2,6})*$/.test(name)) {
		return null;
	}

	const codepoints = name.split(/[-_ ]/).map((part) => parseInt(part.replace(/^u\+?/, ""), 16));

	if (codepoints.some((cp) => cp > 0x10ffff)) {
		return null;
	}

	return codepoints;
}

// Normalised file name (without extension) of an emoji in an installed set,
// so that the emoji-datasource names the client asks for (with or without
// U+FE0F, 4-digit padded) hit whatever the source used
export function emojiKey(file: string | number[]): string | null {
	const codepoints = typeof file === "string" ? emojiCodepoints(file) : file;

	if (!codepoints) {
		return null;
	}

	const key = codepoints
		.filter((cp) => cp !== 0xfe0f && cp !== 0xfe0e)
		.map((cp) => cp.toString(16).padStart(4, "0"))
		.join("-");

	return key || null;
}

const svgHeaders = {
	// SVGs opened directly must not run scripts on our origin
	"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
	"X-Content-Type-Options": "nosniff",
};

// GET /img/emoji/:set/:file for installed sets (bundled ones are served from
// public/ before this). The client asks for emoji-datasource names; an emoji the
// set has no image for gets the image of the fallback bundled set instead.
export function emojiSetRequest(req: Request, res: Response, next: NextFunction) {
	const {set, file} = req.params;
	const manifest = readEmojiSet(set);

	if (!manifest || !/^[0-9a-f-]+\.png$/.test(file)) {
		return next();
	}

	const options = {maxAge: 86400 * 1000};
	const key = emojiKey(file);
	const image = key && path.join(getEmojiSetPath(set), `${key}.${manifest.format}`);

	if (image && fs.existsSync(image)) {
		return res.sendFile(image, {
			...options,
			headers: manifest.format === "svg" ? svgHeaders : {},
		});
	}

	const fallback = Utils.getFileFromRelativeToRoot(
		"public",
		"img",
		"emoji",
		fallbackEmojiSet(),
		file
	);

	if (fs.existsSync(fallback)) {
		return res.sendFile(fallback, options);
	}

	return next();
}
