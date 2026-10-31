// Telegram stickers served by a tg-sticker-proxy worker (config `stickers.proxyUrl`)

export type StickerRef = {pack: string; id: string};

const PACK = "[A-Za-z0-9_]{1,64}";
const ID = "[A-Za-z0-9_-]{1,64}";
const packRe = new RegExp(`^${PACK}$`);
const keyRe = new RegExp(`^(${PACK})/(${ID})$`);

export const MAX_RECENT_STICKERS = 20;

export function normalizeProxyUrl(url: unknown): string {
	if (typeof url !== "string" || !/^https?:\/\/[^/\s]+/i.test(url.trim())) {
		return "";
	}

	return url.trim().replace(/\/+$/, "");
}

// A message that is nothing but a sticker share page (`<proxy>/<pack>/<id>`) or
// file (`<proxy>/<pack>/<id>.webp|webm`) of the configured proxy
export function parseStickerUrl(text: string, proxyUrl: string): StickerRef | null {
	const base = normalizeProxyUrl(proxyUrl);
	const value = text.trim();

	if (!base || value.slice(0, base.length + 1).toLowerCase() !== base.toLowerCase() + "/") {
		return null;
	}

	const match = new RegExp(`^(${PACK})/(${ID})(?:\\.(?:webp|webm))?$`).exec(
		value.slice(base.length + 1)
	);

	// `<pack>/thumb` is the pack thumbnail, not a sticker
	if (!match || match[2] === "thumb") {
		return null;
	}

	return {pack: match[1], id: match[2]};
}

export function stickerShareUrl(proxyUrl: string, sticker: StickerRef) {
	return `${normalizeProxyUrl(proxyUrl)}/${sticker.pack}/${sticker.id}`;
}

// A pack name from `https://t.me/addstickers/<name>`, `tg://addstickers?set=<name>` or a bare name
export function parsePackInput(input: string): string | null {
	const value = input.trim();
	const match =
		/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/addstickers\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(
			value
		) || /^tg:\/\/addstickers\?(?:.*&)?set=([^&#\s]+)/i.exec(value);
	const name = match ? match[1] : value;

	return packRe.test(name) ? name : null;
}

// Synced settings hold space separated lists: pack names, or `<pack>/<id>` sticker keys
export function stickerKey(sticker: StickerRef) {
	return `${sticker.pack}/${sticker.id}`;
}

export function parseStickerKey(key: string): StickerRef | null {
	const match = keyRe.exec(key);
	return match ? {pack: match[1], id: match[2]} : null;
}

export function parseList(value: unknown, valid: (item: string) => boolean): string[] {
	if (typeof value !== "string") {
		return [];
	}

	return [...new Set(value.split(/\s+/).filter((item) => item && valid(item)))];
}

export const parsePackList = (value: unknown) => parseList(value, (item) => packRe.test(item));
export const parseStickerList = (value: unknown) => parseList(value, (item) => keyRe.test(item));

export function toggleInList(list: string[], item: string): string[] {
	return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

// Newest first, without duplicates
export function pushRecent(list: string[], item: string, max = MAX_RECENT_STICKERS): string[] {
	return [item, ...list.filter((i) => i !== item)].slice(0, max);
}

// Variation selectors don't change which emoji a sticker stands for
export function normalizeEmoji(text: string) {
	return text.replace(/[\uFE0E\uFE0F]/g, "");
}
