import constants from "./constants";

import Mousetrap from "mousetrap";
import {Textcomplete, StrategyProps} from "@textcomplete/core";
import {RichInput} from "./richinput/RichInput";
import {RichInputEditor} from "./richinput/textcompleteEditor";

import fuzzy from "fuzzy";

import emojiMap from "./helpers/simplemap.json";
import {emojiImageFor} from "./helpers/emoji";
import readableTextColor from "./helpers/readableTextColor";
import {store} from "./store";
import {ChanType} from "../../shared/types/chan";

export default enableAutocomplete;

const emojiSearchTerms = Object.keys(emojiMap);
const emojiStrategy: StrategyProps = {
	id: "emoji",
	match: /(^|\s):([-+\w:?]{2,}):?$/,
	search(term: string, callback: (matches) => void) {
		// Trim colon from the matched term,
		// as we are unable to get a clean string from match regex
		term = term.replace(/:$/, "");
		callback(fuzzyGrep(term, emojiSearchTerms));
	},
	template([string, original]: [string, string]) {
		return `${emojiHtml(String(emojiMap[original]))} ${string}`;
	},
	replace([, original]: [string, string]) {
		return "$1" + String(emojiMap[original]);
	},
	index: 2,
};

const nicksStrategy: StrategyProps = {
	id: "nicks",
	match: /(^|\s)(@([a-zA-Z_[\]\\^{}|`@][a-zA-Z0-9_[\]\\^{}|`-]*)?)$/,
	search(term: string, callback: (matches: string[] | string[][]) => void) {
		term = term.slice(1);

		if (term[0] === "@") {
			// TODO: type
			callback(completeNicks(term.slice(1), true).map((val) => ["@" + val[0], "@" + val[1]]));
		} else {
			callback(completeNicks(term, true));
		}
	},
	template([string]: [string, string]) {
		return string;
	},
	replace([, original]: [string, string]) {
		return "$1" + replaceNick(original);
	},
	index: 2,
};

const chanStrategy: StrategyProps = {
	id: "chans",
	match: /(^|\s)((?:#|\+|&|![A-Z0-9]{5})(?:[^\s]+)?)$/,
	search(term: string, callback: (matches: string[][]) => void) {
		callback(completeChans(term));
	},
	template([string]: [string, string]) {
		return string;
	},
	replace([, original]: [string, string]) {
		return "$1" + original;
	},
	index: 2,
};

const commandStrategy: StrategyProps = {
	id: "commands",
	match: /^\/(\w*)$/,
	search(term: string, callback: (matches: string[][]) => void) {
		callback(completeCommands("/" + term));
	},
	template([string]: [string, string]) {
		return string;
	},
	replace([, original]: [string, string]) {
		return original;
	},
	index: 1,
};

// "None" (the IRC default colour 99) removes the colour again
const colorChoices = [["99", "None"], ...constants.colorCodeMap];

// Emoji completions show the emoji in the chosen emoji style
function emojiHtml(emoji: string) {
	const image = emojiImageFor(emoji);

	if (!image) {
		return `<span class="emoji">${emoji}</span>`;
	}

	return `<span class="emoji emoji-img" style="background-image: url('${image}')">${emoji}</span>`;
}

// Colour completions are swatches: the colour as background, with black or white
// text, whichever is more readable on it. Themes recolour 0-15 (and foreground and
// background separately), so read the colour the current theme actually renders
function colorSwatch(code: string, label: string, type: "fg" | "bg") {
	if (code === "99") {
		return label;
	}

	const probe = document.createElement("span");
	probe.className = `irc-${type}${parseInt(code, 10)}`;
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const color = type === "fg" ? style.color : style.backgroundColor;
	probe.remove();

	return `<span class="color-swatch color-swatch-${readableTextColor(
		color
	)}" style="background-color: ${color}">${label}</span>`;
}

const foregroundColorStrategy: StrategyProps = {
	id: "foreground-colors",
	match: /\x03(\d{0,2}|[A-Za-z ]{0,10})$/,
	search(term: string, callback: (matches: string[][]) => void) {
		term = term.toLowerCase();

		const matchingColorCodes = colorChoices
			.filter((i) => fuzzy.test(term, i[0]) || fuzzy.test(term, i[1]))
			.map((i) => {
				if (fuzzy.test(term, i[1])) {
					return [
						i[0],
						fuzzy.match(term, i[1], {
							pre: "<b>",
							post: "</b>",
						}).rendered,
					];
				}

				return i;
			});

		callback(matchingColorCodes);
	},
	template(value: string[]) {
		return colorSwatch(value[0], value[1], "fg");
	},
	replace(value: string) {
		return "\x03" + value[0];
	},
	index: 1,
};

const backgroundColorStrategy: StrategyProps = {
	id: "background-colors",
	match: /\x03(\d{2}),(\d{0,2}|[A-Za-z ]{0,10})$/,
	search(term: string, callback: (matchingColorCodes: string[][]) => void) {
		term = term.toLowerCase();
		const matchingColorCodes = colorChoices
			.filter((i) => fuzzy.test(term, i[0]) || fuzzy.test(term, i[1]))
			.map((pair) => {
				if (fuzzy.test(term, pair[1])) {
					return [
						pair[0],
						fuzzy.match(term, pair[1], {
							pre: "<b>",
							post: "</b>",
						}).rendered,
					];
				}

				return pair;
			});

		callback(matchingColorCodes);
	},
	template(value: string[]) {
		return colorSwatch(value[0], value[1], "bg");
	},
	replace(value: string[]) {
		return "\x03$1," + value[0];
	},
	index: 2,
};

function enableAutocomplete(richInput: RichInput) {
	const input = richInput.el;

	let tabCount = 0;
	let lastMatch = "";
	let currentMatches: string[] | string[][] = [];

	input.addEventListener("input", (e) => {
		if ((e as unknown as CustomEvent).detail === "autocomplete") {
			return;
		}

		tabCount = 0;
		currentMatches = [];
		lastMatch = "";
	});

	Mousetrap(input).bind(
		"tab",
		(e) => {
			if (store.state.isAutoCompleting) {
				return;
			}

			e.preventDefault();

			const text = richInput.getText();
			const caret = richInput.getSelection().end;

			if (tabCount === 0) {
				lastMatch = text.substring(0, caret).split(/\s/).pop() || "";

				if (lastMatch.length === 0) {
					return;
				}

				currentMatches = completeNicks(lastMatch, false);

				if (currentMatches.length === 0) {
					return;
				}
			}

			const position = caret - lastMatch.length;
			const newMatch = replaceNick(
				// TODO: type this properly
				String(currentMatches[tabCount % currentMatches.length]),
				position
			);

			// Fires an "input" event with detail "autocomplete"
			richInput.replaceRange(position, caret, newMatch, "autocomplete");

			lastMatch = newMatch;
			tabCount++;
		},
		"keydown"
	);

	const strategies = [
		emojiStrategy,
		nicksStrategy,
		chanStrategy,
		commandStrategy,
		foregroundColorStrategy,
		backgroundColorStrategy,
	];

	const editor = new RichInputEditor(richInput);
	const textcomplete = new Textcomplete(editor, strategies, {
		dropdown: {
			className: "textcomplete-menu",
			placement: "top",
		},
	});

	textcomplete.on("show", () => {
		store.commit("isAutoCompleting", true);
	});

	textcomplete.on("hidden", () => {
		store.commit("isAutoCompleting", false);
	});

	return {
		hide() {
			textcomplete.hide();
		},
		destroy() {
			textcomplete.destroy();
			store.commit("isAutoCompleting", false);
		},
	};
}

function replaceNick(original: string, position = 1) {
	// If no postfix specified, return autocompleted nick as-is
	if (!store.state.settings.nickPostfix) {
		return original;
	}

	// If there is whitespace in the input already, append space to nick
	if (position > 0 && /\s/.test(store.state.activeChannel?.channel.pendingMessage || "")) {
		return original + " ";
	}

	// If nick is first in the input, append specified postfix
	return original + store.state.settings.nickPostfix;
}

function fuzzyGrep<T>(term: string, array: Array<T>) {
	const results = fuzzy.filter(term, array, {
		pre: "<b>",
		post: "</b>",
	});
	return results.map((el) => [el.string, el.original]);
}

function rawNicks() {
	if (!store.state.activeChannel) {
		return [];
	}

	if (store.state.activeChannel.channel.users.length > 0) {
		const users = store.state.activeChannel.channel.users.slice();

		return users.sort((a, b) => b.lastMessage - a.lastMessage).map((u) => u.nick);
	}

	const me = store.state.activeChannel.network.nick;
	const otherUser = store.state.activeChannel.channel.name;

	// If this is a query, add their name to autocomplete
	if (me !== otherUser && store.state.activeChannel.channel.type === ChanType.QUERY) {
		return [otherUser, me];
	}

	// Return our own name by default for anything that isn't a channel or query
	return [me];
}

function completeNicks(word: string, isFuzzy: boolean) {
	const users = rawNicks();
	word = word.toLowerCase();

	if (isFuzzy) {
		return fuzzyGrep(word, users);
	}

	return users.filter((w) => !w.toLowerCase().indexOf(word));
}

function getCommands() {
	let cmds = constants.commands.slice();

	if (!store.state.settings.searchEnabled) {
		cmds = cmds.filter((c) => c !== "/search");
	}

	return cmds;
}

function completeCommands(word: string) {
	const commands = getCommands();
	return fuzzyGrep(word, commands);
}

function completeChans(word: string) {
	const words: string[] = [];

	if (store.state.activeChannel) {
		for (const channel of store.state.activeChannel.network.channels) {
			// Push all channels that start with the same CHANTYPE
			if (channel.type === ChanType.CHANNEL && channel.name[0] === word[0]) {
				words.push(channel.name);
			}
		}
	}

	return fuzzyGrep(word, words);
}
