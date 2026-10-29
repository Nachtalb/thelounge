// Emoji detection based on emoji-js (iamcal/js-emoji) and its emoji-datasource
// data, and the self-hosted emoji images copied to public/img/emoji/ at build time.
import EmojiConvertor from "emoji-js";
import {computed, ref} from "vue";
import type {EmojiSetInfo} from "../../../shared/types/config";

// Image sets of the server (serverConfiguration.emojiSets): Google and Twitter
// are bundled, others were installed by its operator (`thelounge emoji install`)
// and are served from the same img/emoji/<id>/ path. The server falls back to a
// bundled image for emoji an installed set has no image for.
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

// "native" or the id of an image set
export type EmojiStyle = string;

// Image sets and default style of the server
export const emojiServer = ref<{sets: EmojiSetInfo[]; defaultStyle: string}>({
	sets: bundledEmojiSets,
	defaultStyle: "google",
});

export const availableEmojiSets = computed(() => emojiServer.value.sets);

function isAvailable(style: string) {
	return style === "native" || emojiServer.value.sets.some((set) => set.id === style);
}

// Settings > Appearance > Emoji style, "" for the server default
export const emojiSetting = ref<string>("");

// Style in use: the setting if this server has it, else the server default.
// Computed, so renders depending on it update.
export const emojiStyle = computed<EmojiStyle>({
	get() {
		for (const style of [emojiSetting.value, emojiServer.value.defaultStyle]) {
			if (isAvailable(style)) {
				return style;
			}
		}

		return "google";
	},
	set(style) {
		emojiSetting.value = style;
	},
});

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
	if (!image || style === "native" || !isAvailable(style)) {
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
