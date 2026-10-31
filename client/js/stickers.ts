import {computed, reactive} from "vue";
import {store} from "./store";
import type {StickerRef} from "../../shared/stickers";

export type Sticker = {
	id: string;
	emoji: string;
	width: number;
	height: number;
	url: string;
	thumb_url: string;
	format: string;
};

export type StickerPack = {
	name: string;
	title: string;
	format: string;
	link: string;
	thumbnail: string | null;
	stickers: Sticker[];
};

export type KnownPack = {
	name: string;
	title: string;
	format: string;
	thumb_url: string | null;
	count: number;
};

type PackState = {status: "loading"} | {status: "error"; error: string} | StickerPack;

export const packs = reactive<Record<string, PackState>>({});
const requests = new Map<string, Promise<PackState>>();

export const proxyUrl = computed(() => store.state.serverConfiguration?.stickerProxyUrl || "");

export const TGS_UNSUPPORTED = "Animated TGS packs aren't supported";

export function loadedPack(name: string): StickerPack | null {
	const pack = packs[name];
	return pack && "stickers" in pack ? pack : null;
}

export function loadPack(name: string): Promise<PackState> {
	const pending = requests.get(name);

	if (pending) {
		return pending;
	}

	packs[name] = {status: "loading"};

	const request = fetch(`${proxyUrl.value}/${name}.json`)
		.then(async (res) => {
			if (res.status === 404) {
				return {status: "error", error: "Sticker pack not found"} as PackState;
			}

			if (!res.ok) {
				throw new Error(String(res.status));
			}

			const pack = (await res.json()) as StickerPack;

			if (pack.format === "tgs") {
				return {status: "error", error: TGS_UNSUPPORTED} as PackState;
			}

			return pack;
		})
		.catch(() => {
			// Allow trying again later
			requests.delete(name);
			return {status: "error", error: "Couldn't load the sticker pack"} as PackState;
		})
		.then((state) => {
			packs[name] = state;
			return state;
		});

	requests.set(name, request);
	return request;
}

let knownRequest: Promise<KnownPack[]> | null = null;

export function loadKnownPacks(): Promise<KnownPack[]> {
	knownRequest ||= fetch(`${proxyUrl.value}/packs.json`)
		.then((res) => (res.ok ? (res.json() as Promise<KnownPack[]>) : []))
		.then((list) => list.filter((pack) => pack.format !== "tgs"))
		.catch(() => {
			knownRequest = null;
			return [];
		});
	return knownRequest;
}

export function findSticker(ref: StickerRef): Sticker | null {
	return loadedPack(ref.pack)?.stickers.find((s) => s.id === ref.id) || null;
}
