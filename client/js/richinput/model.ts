// Document model of the rich chat input: a list of styled text runs that
// converts to and from IRC formatting control codes. The editor only ever
// shows the model; the IRC string is what gets stored and sent.
import parseStyle from "../helpers/ircmessageparser/parseStyle";

export type Style = {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	monospace?: boolean;
	fg?: number;
	bg?: number;
	hexFg?: string;
	hexBg?: string;
};

export type Run = {text: string; style: Style};
export type Doc = Run[];

export const TOGGLES = {
	bold: "\x02",
	italic: "\x1d",
	underline: "\x1f",
	strikethrough: "\x1e",
	monospace: "\x11",
} as const;

export type ToggleAttr = keyof typeof TOGGLES;

export const TOGGLE_ATTRS = Object.keys(TOGGLES) as ToggleAttr[];

// IRC colour 99 means "default colour", which is the same as no colour
const DEFAULT_COLOUR = 99;

// Control codes never end up in the document text, they become formatting
const controlCodesRx = /[\u0000-\u0009\u000B-\u001F]/g;

export function cleanStyle(style: Style): Style {
	const out: Style = {};

	for (const attr of TOGGLE_ATTRS) {
		if (style[attr]) {
			out[attr] = true;
		}
	}

	if (style.fg !== undefined && style.fg !== DEFAULT_COLOUR) {
		out.fg = style.fg;
	}

	if (style.bg !== undefined && style.bg !== DEFAULT_COLOUR) {
		out.bg = style.bg;
	}

	if (style.hexFg) {
		out.hexFg = style.hexFg.toUpperCase();

		// IRC can not express a hex background without a hex foreground
		if (style.hexBg) {
			out.hexBg = style.hexBg.toUpperCase();
		}
	}

	return out;
}

export function stylesEqual(a: Style, b: Style) {
	return (
		TOGGLE_ATTRS.every((attr) => !!a[attr] === !!b[attr]) &&
		a.fg === b.fg &&
		a.bg === b.bg &&
		a.hexFg === b.hexFg &&
		a.hexBg === b.hexBg
	);
}

export function isPlain(style: Style) {
	return stylesEqual(style, {});
}

// Split newlines into their own unstyled runs (every line is a separate
// message on the wire, so formatting never spans lines), drop empty runs and
// merge neighbours with identical styles.
export function normalize(doc: Doc): Doc {
	const out: Doc = [];

	const push = (text: string, style: Style) => {
		if (!text) {
			return;
		}

		const last = out[out.length - 1];

		if (last && stylesEqual(last.style, style)) {
			last.text += text;
		} else {
			out.push({text, style});
		}
	};

	for (const run of doc) {
		const style = cleanStyle(run.style);
		const text = run.text.replace(/\r\n?/g, "\n").replace(controlCodesRx, " ");
		const lines = text.split("\n");

		lines.forEach((line, i) => {
			if (i > 0) {
				push("\n", {});
			}

			push(line, style);
		});
	}

	return out;
}

export function plainText(doc: Doc) {
	return doc.map((run) => run.text).join("");
}

export function docLength(doc: Doc) {
	return doc.reduce((len, run) => len + run.text.length, 0);
}

function colourNumber(value: unknown) {
	if (value === undefined || value === null || value === "") {
		return undefined;
	}

	return Number(value);
}

// IRC string -> document, using the same parser that renders messages
export function parse(irc: string): Doc {
	const doc: Doc = [];

	irc.replace(/\r\n?/g, "\n")
		.split("\n")
		.forEach((line, i) => {
			if (i > 0) {
				doc.push({text: "\n", style: {}});
			}

			for (const fragment of parseStyle(line)) {
				doc.push({
					text: fragment.text,
					style: {
						bold: fragment.bold,
						italic: fragment.italic,
						underline: fragment.underline,
						strikethrough: fragment.strikethrough,
						monospace: fragment.monospace,
						fg: colourNumber(fragment.textColor),
						bg: colourNumber(fragment.bgColor),
						hexFg: fragment.hexColor,
						hexBg: fragment.hexBgColor,
					},
				});
			}
		});

	return normalize(doc);
}

const pad = (n: number) => (n < 10 ? "0" + String(n) : String(n));

// Control codes that move from one style to the next. `next` is the text that
// follows, used to keep digits in the text from being read as a colour code.
function transition(from: Style, to: Style, next: string) {
	if (stylesEqual(from, to)) {
		return "";
	}

	if (isPlain(to)) {
		const toggles = TOGGLE_ATTRS.filter((attr) => from[attr]);

		if (
			toggles.length === 1 &&
			from.fg === undefined &&
			from.bg === undefined &&
			from.hexFg === undefined
		) {
			return TOGGLES[toggles[0]];
		}

		return "\x0f";
	}

	let out = "";
	// Kind of colour code that was emitted last, if nothing came after it
	let tail: "bare" | "fg" | "hexBare" | "hexFg" | null = null;

	if (from.fg !== to.fg || from.bg !== to.bg) {
		if (to.fg === undefined && to.bg === undefined) {
			out += "\x03";
			tail = "bare";
		} else {
			let bg = from.bg;

			if (from.bg !== undefined && to.bg === undefined) {
				// A bare colour code clears both colours
				out += "\x03";
				bg = undefined;
			}

			out += "\x03" + pad(to.fg ?? DEFAULT_COLOUR);
			tail = "fg";

			if (to.bg !== undefined && to.bg !== bg) {
				out += "," + pad(to.bg);
				tail = null;
			}
		}
	}

	if (from.hexFg !== to.hexFg || from.hexBg !== to.hexBg) {
		if (to.hexFg === undefined) {
			out += "\x04";
			tail = "hexBare";
		} else {
			let hexBg = from.hexBg;

			if (from.hexBg !== undefined && to.hexBg === undefined) {
				out += "\x04";
				hexBg = undefined;
			}

			out += "\x04" + to.hexFg;
			tail = "hexFg";

			if (to.hexBg !== undefined && to.hexBg !== hexBg) {
				out += "," + to.hexBg;
				tail = null;
			}
		}
	}

	for (const attr of TOGGLE_ATTRS) {
		if (!!from[attr] !== !!to[attr]) {
			out += TOGGLES[attr];
			tail = null;
		}
	}

	// Text right after a colour code would be read as part of it, so separate
	// them with an empty bold toggle pair
	if (
		(tail === "bare" && /^\d/.test(next)) ||
		(tail === "fg" && /^,\d/.test(next)) ||
		(tail === "hexBare" && /^[0-9a-f]{6}/i.test(next)) ||
		(tail === "hexFg" && /^,[0-9a-f]{6}/i.test(next))
	) {
		out += TOGGLES.bold + TOGGLES.bold;
	}

	return out;
}

// Document -> IRC string. Every line opens its own formatting and closes it
// again at its end, because each line is sent as a separate message.
export function serialize(doc: Doc): string {
	const lines: string[] = [];
	let line = "";
	let current: Style = {};

	const endLine = () => {
		line += transition(current, {}, "");
		lines.push(line);
		line = "";
		current = {};
	};

	for (const run of normalize(doc)) {
		run.text.split("\n").forEach((text, i) => {
			if (i > 0) {
				endLine();
			}

			if (text) {
				line += transition(current, run.style, text) + text;
				current = run.style;
			}
		});
	}

	endLine();

	return lines.join("\n");
}
