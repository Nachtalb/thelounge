// TODO: type
// @ts-nocheck

import {h as createElement, VNode} from "vue";
import escapeRegExp from "lodash/escapeRegExp";
import parseStyle from "./ircmessageparser/parseStyle";
import findChannels from "./ircmessageparser/findChannels";
import {findLinks} from "../../../shared/linkify";
import findEmoji from "./ircmessageparser/findEmoji";
import {emojiImageUrl} from "./emoji";
import findNames from "./ircmessageparser/findNames";
import merge, {MergedParts} from "./ircmessageparser/merge";
import emojiMap from "./fullnamemap.json";
import LinkPreviewToggle from "../../components/LinkPreviewToggle.vue";
import LinkPreviewFileSize from "../../components/LinkPreviewFileSize.vue";
import InlineChannel from "../../components/InlineChannel.vue";
import Username from "../../components/Username.vue";
import {ClientMessage, ClientNetwork} from "../types";

const emojiModifiersRegex = /[\u{1f3fb}-\u{1f3ff}]|\u{fe0f}/gu;

type Fragment = {
	class?: string[];
	text?: string;
};

type StyledFragment = Fragment & {
	textColor?: string;
	bgColor?: string;
	hexColor?: string;
	hexBgColor?: string;

	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	monospace?: boolean;
	strikethrough?: boolean;
	mark?: boolean;
};

// Create an HTML `span` with styling information for a given fragment
function createFragment(fragment: StyledFragment): VNode | string | undefined {
	const classes: string[] = [];

	if (fragment.bold) {
		classes.push("irc-bold");
	}

	if (fragment.textColor !== undefined) {
		classes.push("irc-fg" + fragment.textColor);
	}

	if (fragment.bgColor !== undefined) {
		classes.push("irc-bg" + fragment.bgColor);
	}

	if (fragment.italic) {
		classes.push("irc-italic");
	}

	if (fragment.underline) {
		classes.push("irc-underline");
	}

	if (fragment.strikethrough) {
		classes.push("irc-strikethrough");
	}

	if (fragment.monospace) {
		classes.push("irc-monospace");
	}

	const data: {
		class?: string[];
		style?: Record<string, string>;
	} = {
		class: undefined,
		style: undefined,
	};

	let hasData = false;

	if (classes.length > 0) {
		hasData = true;
		data.class = classes;
	}

	if (fragment.hexColor) {
		hasData = true;
		data.style = {
			color: `#${fragment.hexColor}`,
		};

		if (fragment.hexBgColor) {
			data.style["background-color"] = `#${fragment.hexBgColor}`;
		}
	}

	const el = hasData ? createElement("span", data, fragment.text) : fragment.text;
	return fragment.mark ? createElement("mark", [el]) : el;
}

// Split style fragments at case-insensitive matches of `query` and flag the matched pieces
function markQuery<T extends {start: number; end: number; text: string}>(
	fragments: T[],
	cleanText: string,
	query: string
): (T & {mark?: boolean})[] {
	const matches = [...cleanText.matchAll(new RegExp(escapeRegExp(query), "gi"))]
		.map((m) => [m.index, m.index + m[0].length])
		.filter(([s, e]) => e > s);

	return fragments.flatMap((f) => {
		const cuts = matches.flat().filter((c) => c > f.start && c < f.end);
		const points = [...new Set([f.start, ...cuts, f.end])].sort((a, b) => a - b);

		if (points.length < 2) {
			return [f];
		}

		return points.slice(1).map((end, i) => {
			const start = points[i];
			return {
				...f,
				start,
				end,
				text: f.text.slice(start - f.start, end - f.start),
				mark: matches.some(([s, e]) => start >= s && end <= e),
			};
		});
	});
}

// Transform an IRC message potentially filled with styling control codes, URLs,
// nicknames, and channels into a string of HTML elements to display on the client.
function parse(text: string, message?: ClientMessage, network?: ClientNetwork, highlight?: string) {
	// Each line of a draft/multiline message is its own PRIVMSG on the wire, so
	// parse them separately and join them with a <br>, which keeps per-line
	// styling and lets the text wrap as usual.
	if (text && text.includes("\n")) {
		return text
			.split("\n")
			.flatMap((line, i) =>
				i === 0
					? parseLine(line, message, network, highlight)
					: [createElement("br"), ...parseLine(line, message, network, highlight)]
			);
	}

	return parseLine(text, message, network, highlight);
}

function parseLine(
	text: string,
	message?: ClientMessage,
	network?: ClientNetwork,
	highlight?: string
) {
	// Extract the styling information and get the plain text version from it
	let styleFragments = parseStyle(text);
	const cleanText = styleFragments.map((fragment) => fragment.text).join("");

	if (highlight) {
		styleFragments = markQuery(styleFragments, cleanText, highlight);
	}

	// On the plain text, find channels and URLs, returned as "parts". Parts are
	// arrays of objects containing start and end markers, as well as metadata
	// depending on what was found (channel or link).
	const channelPrefixes = network ? network.serverOptions.CHANTYPES : ["#", "&"];
	const userModes = network
		? network.serverOptions.PREFIX?.prefix?.map((pref) => pref.symbol)
		: ["!", "@", "%", "+"];
	const channelParts = findChannels(cleanText, channelPrefixes, userModes);
	const linkParts = findLinks(cleanText);
	const emojiParts = findEmoji(cleanText);
	const nameParts = findNames(cleanText, message ? message.users || [] : []);

	const parts = (channelParts as MergedParts)
		.concat(linkParts)
		.concat(emojiParts)
		.concat(nameParts);

	// Merge the styling information with the channels / URLs / nicks / text objects and
	// generate HTML strings with the resulting fragments
	return merge(parts, styleFragments, cleanText).map((textPart) => {
		const fragments = textPart.fragments.map((fragment) => createFragment(fragment));

		// Wrap these potentially styled fragments with links and channel buttons
		if (textPart.link) {
			const preview =
				message &&
				message.previews &&
				message.previews.find((p) => p.link === textPart.link);
			const link = createElement(
				"a",
				{
					href: textPart.link,
					dir: preview ? null : "auto",
					target: "_blank",
					rel: "noopener",
				},
				fragments
			);

			if (!preview) {
				return link;
			}

			const linkEls = [link];

			if (preview.size > 0) {
				linkEls.push(
					createElement(LinkPreviewFileSize, {
						size: preview.size,
					})
				);
			}

			linkEls.push(
				createElement(LinkPreviewToggle, {
					link: preview,
					message: message,
				})
			);

			// We wrap the link, size, and the toggle button into <span dir="auto">
			// to correctly keep the left-to-right order of these elements
			return createElement(
				"span",
				{
					dir: "auto",
				},
				linkEls
			);
		} else if (textPart.channel) {
			return createElement(
				InlineChannel,
				{
					channel: textPart.channel,
				},
				{
					default: () => fragments,
				}
			);
		} else if (textPart.emoji) {
			const emojiWithoutModifiers = textPart.emoji.replace(emojiModifiersRegex, "");
			const title = emojiMap[emojiWithoutModifiers]
				? `Emoji: ${emojiMap[emojiWithoutModifiers]}`
				: null;

			const image = emojiImageUrl(textPart.image);

			// The emoji stays in the DOM as (invisible) text over the image, so
			// selecting and copying the message copies the emoji itself
			return createElement(
				"span",
				{
					class: image ? ["emoji", "emoji-img"] : ["emoji"],
					style: image ? {backgroundImage: `url("${image}")`} : undefined,
					role: "img",
					"aria-label": title,
					title: title,
				},
				fragments
			);
		} else if (textPart.nick) {
			return createElement(
				Username,
				{
					user: {
						nick: textPart.nick,
					},
					dir: "auto",
				},
				{
					default: () => fragments,
				}
			);
		}

		return fragments;
	});
}

export default parse;
