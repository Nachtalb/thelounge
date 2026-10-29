import {findLinksWithSchema} from "../../../shared/linkify";
import {cleanIrcMessage} from "../../../shared/irc";
import type {ClientLinkPreview} from "../types";

// The server prefetches at most this many links per message
const MAX_LINKS = 5;

// Unique links of a message that is being typed, in the order they appear.
// `text` is the serialized IRC draft; formatting is stripped like the server does for messages.
export function getInputLinks(text: string): string[] {
	const links: string[] = [];

	for (const {link} of findLinksWithSchema(cleanIrcMessage(text))) {
		if (!links.includes(link)) {
			links.push(link);
		}

		if (links.length === MAX_LINKS) {
			break;
		}
	}

	return links;
}

// Same defaults as LinkPreview.vue, errors are never shown above the input.
// Loading placeholders are shown until the server answers.
export function isInputPreviewShown(
	preview: ClientLinkPreview,
	settings: {links: boolean; media: boolean}
) {
	switch (preview.type) {
		case "error":
			return false;
		case "loading":
			return true;
		case "link":
			return settings.links;
		default:
			return settings.media;
	}
}

// Drops previews of links that are no longer in the input and adds a loading
// placeholder for every new link, in the order of the links in the input.
// `missing` are the new links that have to be requested from the server.
export function syncInputPreviews(previews: ClientLinkPreview[], links: string[]) {
	const missing = links.filter((link) => !previews.some((p) => p.link === link));
	const placeholders = missing.map(
		(link): ClientLinkPreview => ({
			type: "loading",
			head: "",
			body: "",
			thumb: "",
			size: -1,
			link,
			shown: null,
		})
	);

	return {
		previews: [...previews, ...placeholders]
			.filter((p) => links.includes(p.link))
			.sort((a, b) => links.indexOf(a.link) - links.indexOf(b.link)),
		missing,
	};
}

// Replaces the loading placeholder of a link with the preview sent by the server.
// Without a placeholder the response is stale (message sent, link removed) and dropped.
// If the server found nothing to preview, the placeholder becomes a hidden error,
// so the link is not requested again while it stays in the input.
export function resolveInputPreview(
	previews: ClientLinkPreview[],
	preview: ClientLinkPreview,
	removed = false
): ClientLinkPreview[] {
	if (!previews.some((p) => p.link === preview.link && p.type === "loading")) {
		return previews;
	}

	return previews.map((p) => {
		if (p.link !== preview.link) {
			return p;
		}

		return removed ? {...p, type: "error"} : preview;
	});
}

// Placeholders whose response can no longer arrive, e.g. after a disconnect
export function dropInputPlaceholders(previews: ClientLinkPreview[]) {
	return previews.filter((p) => p.type !== "loading");
}
