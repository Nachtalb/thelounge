// Emoji detection based on emoji-js (iamcal/js-emoji) and its emoji-datasource data
import EmojiConvertor from "emoji-js";

const convertor = new EmojiConvertor();
convertor.init_unified();

const skinTones = ["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"];

// First code point defaults to text presentation (©, ™, ↔, digits, …)
const textDefault = /^(?=\p{Emoji})\P{Emoji_Presentation}/u;
const emojiHints = /\uFE0F|\u200D|\p{Emoji_Modifier}/u;

export type EmojiMatch = {
	start: number;
	end: number;
	emoji: string;
	// emoji-data code points, the image file name without .png
	image: string;
};

// All emoji in text. Characters that render as text by default only count
// with U+FE0F (or as part of a ZWJ/skin tone sequence), and U+FE0E keeps
// even emoji-default characters as text.
export function findEmojiMatches(text: string): EmojiMatch[] {
	const result: EmojiMatch[] = [];
	const regExp = convertor.rx_unified;
	let match: RegExpExecArray | null;

	regExp.lastIndex = 0;

	while ((match = regExp.exec(text))) {
		let [emoji] = match;
		const [, base, tone] = match;
		let idx: string | undefined = convertor.map.unified[base];
		let variation: string | null = null;

		if (idx && tone) {
			variation = skinTones[tone.codePointAt(0)! - 0x1f3fb];

			// A skin tone after an emoji that has none is a separate emoji
			if (!convertor.variations_data[idx]?.[variation]) {
				emoji = base;
				variation = null;
				regExp.lastIndex = match.index + base.length;
			}
		} else if (!idx) {
			const vars = convertor.map.unified_vars[base];

			if (!vars) {
				continue;
			}

			[idx, variation] = vars;
		}

		const end = match.index + emoji.length;

		if (text[end] === "\uFE0E" || (textDefault.test(emoji) && !emojiHints.test(emoji))) {
			continue;
		}

		const image = variation ? convertor.variations_data[idx][variation][0] : idx;
		result.push({start: match.index, end, emoji, image});
	}

	return result;
}
