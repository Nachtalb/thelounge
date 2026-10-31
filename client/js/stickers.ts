import {computed, reactive} from "vue";
import socket from "./socket";
import eventbus from "./eventbus";
import {store} from "./store";
import type {ClientChan} from "./types";
import {stickerMatches} from "./helpers/stickerSearch";
import {cachedJson} from "./helpers/stickerFiles";
import {
	normalizeEmoji,
	parsePackList,
	parseStickerKey,
	parseStickerList,
	pushRecent,
	stickerKey,
	stickerShareUrl,
	toggleInList,
	type StickerRef,
} from "../../shared/stickers";

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

	const toState = (pack: StickerPack | number): PackState => {
		if (pack === 404) {
			return {status: "error", error: "Sticker pack not found"};
		}

		if (typeof pack === "number") {
			throw new Error(String(pack));
		}

		if (pack.format === "tgs") {
			return {status: "error", error: TGS_UNSUPPORTED};
		}

		return pack;
	};

	// The cached copy shows at once; a changed pack replaces it when the network copy arrives
	const request = cachedJson<StickerPack>(`${proxyUrl.value}/${name}.json`, (fresh) => {
		packs[name] = toState(fresh);
	})
		.then(toState)
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

// The user's packs, favorites and recent stickers live in synced settings
export const addedPacks = computed(() => parsePackList(store.state.settings.stickerPacks));
export const favorites = computed(() => parseStickerList(store.state.settings.stickerFavorites));
export const recent = computed(() => parseStickerList(store.state.settings.stickerRecent));

function save(name: "stickerPacks" | "stickerFavorites" | "stickerRecent", list: string[]) {
	void store.dispatch("settings/update", {name, value: list.join(" "), sync: true});
}

export function togglePack(name: string) {
	save("stickerPacks", toggleInList(addedPacks.value, name));
}

export function toggleFavorite(ref: StickerRef) {
	save("stickerFavorites", toggleInList(favorites.value, stickerKey(ref)));
}

export function removeRecent(ref: StickerRef) {
	save(
		"stickerRecent",
		recent.value.filter((key) => key !== stickerKey(ref))
	);
}

export function isFavorite(ref: StickerRef) {
	return favorites.value.includes(stickerKey(ref));
}

export function refsOf(keys: string[]): StickerRef[] {
	return keys.map(parseStickerKey).filter((ref): ref is StickerRef => ref !== null);
}

export function sendSticker(channel: ClientChan, ref: StickerRef) {
	if (!store.state.isConnected) {
		return;
	}

	const replyTo = channel.replyingTo?.msgid;
	channel.replyingTo = null;

	socket.emit("input", {
		target: channel.id,
		text: stickerShareUrl(proxyUrl.value, ref),
		...(replyTo && {replyTo}),
	});
	save("stickerRecent", pushRecent(recent.value, stickerKey(ref)));
}

export function openPack(name: string) {
	eventbus.emit("stickers:pack", name);
}

// Load the user's packs and the packs of favorites/recents not added (any more)
export function loadUserPacks() {
	const names = [
		...addedPacks.value,
		...[...favorites.value, ...recent.value].map((k) => k.split("/")[0]),
	];

	for (const name of new Set(names)) {
		if (!packs[name]) {
			void loadPack(name);
		}
	}
}

// Quick select: the user's stickers for one emoji, favorites and recents first
export function stickersForEmoji(emoji: string): StickerRef[] {
	const wanted = [normalizeEmoji(emoji)];
	const found = new Map<string, StickerRef>();

	const add = (ref: StickerRef) => {
		if (stickerMatches(findSticker(ref)?.emoji, wanted)) {
			found.set(stickerKey(ref), ref);
		}
	};

	refsOf([...favorites.value, ...recent.value]).forEach(add);

	for (const name of addedPacks.value) {
		for (const sticker of loadedPack(name)?.stickers || []) {
			add({pack: name, id: sticker.id});
		}
	}

	return [...found.values()];
}
