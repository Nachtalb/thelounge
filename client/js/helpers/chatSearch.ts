import {computed, reactive, toRaw, watch} from "vue";
import socket from "../socket";
import {store} from "../store";
import jumpToMessage, {jumpTarget} from "./jumpToMessage";
import type {ClientChan, ClientNetwork} from "../types";
import type {SearchQuery} from "../../../shared/types/storage";
import {parseSearchQuery} from "../../../shared/searchQuery";

const pageSize = 100; // results per "search" request on the server

// In-channel search: the bar is open in channel `chanId` (-1 = closed)
export const chatSearch = reactive({
	chanId: -1,
	query: "",
	pos: -1, // current match, 0 = newest
	more: false, // older results may exist on the server
	listOpen: false,
});

// Loaded results, newest first (the store keeps them oldest first)
export const searchResults = computed(() =>
	[...(store.state.messageSearchResults?.results || [])].reverse()
);

// Text to mark in matches (none for a user-only "@nick" search)
export const searchHighlight = computed(() => parseSearchQuery(chatSearch.query).text);

// Next match going older (+1) or newer (-1), "load" if older results must be fetched first
export function stepPos(pos: number, dir: 1 | -1, loaded: number, more: boolean): number | "load" {
	const next = pos + dir;

	if (next < 0) {
		return pos;
	}

	if (next >= loaded) {
		return more ? "load" : pos;
	}

	return next;
}

// "3 of 27" for the current match, empty while there's no query
export function counterText(
	query: string,
	pos: number,
	total: number,
	more: boolean,
	pending: boolean
) {
	if (!query) {
		return "";
	}

	if (!total) {
		return pending ? "Searching…" : "No results";
	}

	return `${Math.max(pos, 0) + 1} of ${total}${more ? "+" : ""}`;
}

// Times of all matches, newest first, as sent with the first page
export const matchTimes = computed(() => store.state.messageSearchResults?.times || []);
export const total = computed(() => Math.max(searchResults.value.length, matchTimes.value.length));

// Local day of a timestamp ("2026-10-31")
export function dayKey(time: number | Date) {
	const d = new Date(time);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Day => position of the oldest match on that day
export function matchDays(times: number[]) {
	const days = new Map<string, number>();
	times.forEach((time, pos) => days.set(dayKey(time), pos));
	return days;
}

// Nearest key after (dir 1) or before (dir -1) `key` in sorted `keys` ("2026", "2026-10", "2026-10-31")
export function neighbour(keys: string[], key: string, dir: 1 | -1) {
	return dir > 0 ? keys.find((k) => k > key) : keys.findLast((k) => k < key);
}

function found() {
	return store.getters.findChannel(chatSearch.chanId);
}

function fetchResults(network: ClientNetwork, channel: ClientChan, offset: number) {
	const query: SearchQuery = {
		networkUuid: network.uuid,
		channelName: channel.name,
		searchTerm: chatSearch.query,
		offset,
	};

	store.commit("messageSearchPendingQuery", query);
	socket.emit("search", query);

	return new Promise<void>((resolve) => {
		const stop = watch(
			() => store.state.messageSearchPendingQuery,
			(pending) => {
				if (toRaw(pending) !== query) {
					stop();
					resolve();
				}
			}
		);
	});
}

export function openSearch(channel: ClientChan) {
	if (chatSearch.chanId !== channel.id) {
		closeSearch();
		chatSearch.chanId = channel.id;
	}
}

export function focusSearch() {
	const field = document.querySelector<HTMLInputElement>("#chat .message-search input");
	field?.focus();
	field?.select();
}

export function closeSearch() {
	Object.assign(chatSearch, {chanId: -1, query: "", pos: -1, more: false, listOpen: false});
	jumpTarget.value = -1;
	store.commit("messageSearchPendingQuery", null);
	store.commit("messageSearchResults", null);
}

export async function search(network: ClientNetwork, channel: ClientChan, query: string) {
	closeSearch();
	Object.assign(chatSearch, {chanId: channel.id, query});

	if (!query) {
		return;
	}

	await fetchResults(network, channel, 0);

	if (chatSearch.chanId === channel.id && chatSearch.query === query) {
		chatSearch.more = searchResults.value.length === pageSize;
		await goTo(0);
	}
}

export async function loadMore() {
	const target = found();

	if (!target || !chatSearch.more || store.state.messageSearchPendingQuery) {
		return;
	}

	const before = searchResults.value.length;
	await fetchResults(target.network, target.channel, before);
	chatSearch.more = searchResults.value.length - before === pageSize;
}

export async function goTo(pos: number) {
	const target = found();
	const message = searchResults.value[pos];

	if (target && message) {
		chatSearch.pos = pos;
		await jumpToMessage(target.channel, message);
	}
}

export async function step(dir: 1 | -1) {
	let next = stepPos(chatSearch.pos, dir, searchResults.value.length, chatSearch.more);

	if (next === "load") {
		await loadMore();
		next = stepPos(chatSearch.pos, dir, searchResults.value.length, false);
	}

	if (next !== "load" && next !== chatSearch.pos) {
		await goTo(next);
	}
}
