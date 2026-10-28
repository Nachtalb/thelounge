import socket from "./socket";
import {store} from "./store";
import {
	dropInputPlaceholders,
	getInputLinks,
	resolveInputPreview,
	syncInputPreviews,
} from "./helpers/inputPreviews";
import type {ClientChan} from "./types";

// Links of the last update per channel, to not resync on every keystroke
const lastLinks = new Map<number, string>();

// Every new link gets a loading placeholder that the server response replaces.
// Responses for links without a placeholder are dropped, so a slow prefetch can
// not bring back a preview after the message was sent or the link removed.
export function updateInputPreviews(channel: ClientChan) {
	const {settings, serverConfiguration} = store.state;
	const enabled = serverConfiguration?.prefetch && (settings.links || settings.media);
	const links = enabled ? getInputLinks(channel.pendingMessage) : [];
	const key = links.join("\n");

	if (lastLinks.get(channel.id) === key) {
		return;
	}

	lastLinks.set(channel.id, key);

	const {previews, missing} = syncInputPreviews(channel.inputPreviews, links);
	channel.inputPreviews = previews;

	if (missing.length > 0) {
		socket.emit("input:preview", {target: channel.id, links: missing});
	}
}

export function clearInputPreviews(channel: ClientChan) {
	lastLinks.delete(channel.id);
	channel.inputPreviews = [];
}

socket.on("input:preview", (data) => {
	const channel = store.getters.findChannel(data.target)?.channel;

	if (!channel) {
		return;
	}

	channel.inputPreviews = resolveInputPreview(channel.inputPreviews, data.preview, data.removed);
});

// Responses to requests of the previous connection will never arrive
socket.on("disconnect", () => {
	lastLinks.clear();

	for (const network of store.state.networks) {
		for (const channel of network.channels) {
			channel.inputPreviews = dropInputPlaceholders(channel.inputPreviews);
		}
	}
});
