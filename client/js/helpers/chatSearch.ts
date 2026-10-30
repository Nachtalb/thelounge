import {computed, reactive, toRaw, watch} from "vue";
import socket from "../socket";
import {store} from "../store";
import jumpToMessage, {jumpTarget} from "./jumpToMessage";
import type {ClientChan, ClientNetwork} from "../types";
import type {SearchQuery} from "../../../shared/types/storage";

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
