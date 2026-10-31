import emojiMap from "./simplemap.json";
import {normalizeEmoji} from "../../../shared/stickers";

// Emoji a sticker search means: the emoji typed itself, or every emoji with a word of its
// shortcode starting with the query (`s` → 😄 😏 …, `cat` → 🐱 😹 …, `:joy:` → 😂 😹)
export function emojiForQuery(query: string): string[] {
	const q = query.trim().replace(/^:|:$/g, "").toLowerCase();

	if (/[^\x20-\x7e]/.test(q)) {
		return [normalizeEmoji(q)];
	}

	if (!q) {
		return [];
	}

	return [
		...new Set(
			Object.entries(emojiMap as Record<string, string>)
				.filter(([name]) => name.startsWith(q) || name.includes("_" + q))
				.map(([, emoji]) => normalizeEmoji(emoji))
		),
	];
}

export function stickerMatches(stickerEmoji: string | undefined, wanted: string[]) {
	const emoji = normalizeEmoji(stickerEmoji || "");
	return emoji !== "" && wanted.some((w) => emoji.includes(w));
}
