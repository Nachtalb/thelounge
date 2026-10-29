// Emoji detection based on emoji-js (iamcal/js-emoji) and its emoji-datasource
// data, and the self-hosted emoji images copied to public/img/emoji/ at build time.
import EmojiConvertor from "emoji-js";
import {ref} from "vue";

// Image sets shipped with The Lounge. Only sets whose images may be
// redistributed: Apple's and Facebook's are not freely licensed.
// `credit` is the attribution their licences require, shown in Help.
export const emojiImageSets = [
	{
		name: "google",
		label: "Google (Noto Emoji)",
		credit: "Noto Emoji by Google, Apache License 2.0",
		creditUrl: "https://github.com/googlefonts/noto-emoji",
	},
	{
		name: "twitter",
		label: "Twitter (Twemoji)",
		credit: "Twemoji graphics by Twitter, Inc and other contributors, CC-BY 4.0",
		creditUrl: "https://github.com/jdecked/twemoji",
	},
] as const;

export type EmojiStyle = "native" | typeof emojiImageSets[number]["name"];

// Current Settings > Appearance > Emoji style; a ref so renders depending on it update
export const emojiStyle = ref<EmojiStyle>("google");

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

// Same-origin image URL for an emoji in the given style, or null to render it natively
export function emojiImageUrl(image: string | null, style: EmojiStyle = emojiStyle.value) {
	if (!image || !emojiImageSets.some((set) => set.name === style)) {
		return null;
	}

	return `img/emoji/${style}/${image}.png`;
}

// Image for a single emoji string (e.g. an autocomplete result)
export function emojiImageFor(emoji: string, style: EmojiStyle = emojiStyle.value) {
	const [match] = findEmojiMatches(emoji);

	if (!match || match.start !== 0 || match.end !== emoji.length) {
		return null;
	}

	return emojiImageUrl(match.image, style);
}
