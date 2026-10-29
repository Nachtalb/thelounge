// Pure editing operations on the rich input document. Offsets are positions
// in the plain text of the document (see `plainText`).
import {Doc, Run, Style, ToggleAttr, cleanStyle, normalize, plainText} from "./model";

export type EditState = {
	doc: Doc;
	start: number;
	end: number;
	// Style the next typed text gets, set by a shortcut with a bare caret
	pending: Style | null;
};

export type Colour = {
	fg: number;
	// undefined keeps the current background, null removes it
	bg?: number | null;
};

const wordCharRx = /[\p{L}\p{M}\p{N}_]/u;

// Copy of the document where `offset` is guaranteed to be a run boundary
function splitAt(doc: Doc, offset: number): Doc {
	const out: Doc = [];
	let pos = 0;

	for (const run of doc) {
		const end = pos + run.text.length;

		if (offset > pos && offset < end) {
			out.push({text: run.text.slice(0, offset - pos), style: run.style});
			out.push({text: run.text.slice(offset - pos), style: run.style});
		} else {
			out.push({text: run.text, style: run.style});
		}

		pos = end;
	}

	return out;
}

// Runs fully inside [start, end), with the document split at both ends
function withRange(doc: Doc, start: number, end: number, fn: (run: Run) => Run): Doc {
	const split = splitAt(splitAt(doc, start), end);
	let pos = 0;

	return normalize(
		split.map((run) => {
			const runStart = pos;
			pos += run.text.length;

			if (runStart >= start && pos <= end && run.text !== "\n") {
				return fn(run);
			}

			return run;
		})
	);
}

function runsIn(doc: Doc, start: number, end: number): Run[] {
	const runs: Run[] = [];
	let pos = 0;

	for (const run of doc) {
		const s = Math.max(pos, start);
		const e = Math.min(pos + run.text.length, end);

		if (s < e) {
			runs.push({text: run.text.slice(s - pos, e - pos), style: run.style});
		}

		pos += run.text.length;
	}

	return runs;
}

export function sliceDoc(doc: Doc, start: number, end: number): Doc {
	return normalize(runsIn(doc, start, end));
}

export function replaceRange(doc: Doc, start: number, end: number, insert: Doc): Doc {
	const length = plainText(doc).length;
	return normalize([...runsIn(doc, 0, start), ...insert, ...runsIn(doc, end, length)]);
}

export function mapStyle(doc: Doc, start: number, end: number, fn: (style: Style) => Style): Doc {
	return withRange(doc, start, end, (run) => ({
		text: run.text,
		style: cleanStyle(fn(run.style)),
	}));
}

// True when every visible character in the range matches
export function rangeEvery(doc: Doc, start: number, end: number, fn: (style: Style) => boolean) {
	const runs = runsIn(doc, start, end).filter((run) => run.text.replace(/\n/g, "") !== "");
	return runs.length > 0 && runs.every((run) => fn(run.style));
}

// Style that text typed at `offset` gets: that of the closest character
// before it, looking past line breaks (each line is re-opened when sent)
export function styleAt(doc: Doc, offset: number): Style {
	let pos = 0;
	let style: Style = {};

	for (const run of doc) {
		if (pos >= offset) {
			break;
		}

		const text = run.text.slice(0, offset - pos);

		if (text.replace(/\n/g, "") !== "") {
			style = run.style;
		}

		pos += run.text.length;
	}

	return {...style};
}

// The word the caret is strictly inside of (word characters on both sides)
export function wordAt(text: string, offset: number): [number, number] | null {
	const isWord = (ch: string | undefined) => ch !== undefined && wordCharRx.test(ch);

	if (!isWord(text[offset - 1]) || !isWord(text[offset])) {
		return null;
	}

	let start = offset;
	let end = offset;

	while (isWord(text[start - 1])) {
		start--;
	}

	while (isWord(text[end])) {
		end++;
	}

	return [start, end];
}

// Range a formatting command applies to: the selection, else the word around
// the caret, else nothing (the command then changes the typing style)
export function targetRange(state: EditState): [number, number] | null {
	if (state.start !== state.end) {
		return [Math.min(state.start, state.end), Math.max(state.start, state.end)];
	}

	return wordAt(plainText(state.doc), state.start);
}

export function typingStyle(state: EditState): Style {
	return state.pending ?? styleAt(state.doc, state.start);
}

function update(state: EditState, fn: (style: Style) => Style): EditState {
	const range = targetRange(state);

	if (!range) {
		return {...state, pending: cleanStyle(fn(typingStyle(state)))};
	}

	return {...state, doc: mapStyle(state.doc, range[0], range[1], fn), pending: null};
}

// Toggle a format: off if the whole target already has it, on otherwise
export function toggleFormat(state: EditState, attr: ToggleAttr): EditState {
	const range = targetRange(state);
	const on = range
		? !rangeEvery(state.doc, range[0], range[1], (style) => !!style[attr])
		: !typingStyle(state)[attr];

	return update(state, (style) => ({...style, [attr]: on}));
}

export function clearFormatting(state: EditState): EditState {
	return update(state, () => ({}));
}

// Apply a palette colour, or remove all colours with `null`
export function setColour(state: EditState, colour: Colour | null): EditState {
	return update(state, (style) => {
		const out: Style = {...style, hexFg: undefined, hexBg: undefined};

		if (!colour) {
			out.fg = undefined;
			out.bg = undefined;
			return out;
		}

		out.fg = colour.fg;

		if (colour.bg !== undefined) {
			out.bg = colour.bg ?? undefined;
		}

		return out;
	});
}

// Replace the selection with text in the typing style (or of the first
// selected character when replacing a selection)
export function insertText(state: EditState, text: string, style?: Style): EditState {
	const start = Math.min(state.start, state.end);
	const end = Math.max(state.start, state.end);
	let insertStyle = style ?? state.pending;

	if (!insertStyle) {
		insertStyle = start === end ? styleAt(state.doc, start) : styleAt(state.doc, start + 1);
	}

	const doc = replaceRange(state.doc, start, end, [{text, style: insertStyle}]);
	const caret = start + text.length;

	return {doc, start: caret, end: caret, pending: null};
}

export function insertDoc(state: EditState, insert: Doc): EditState {
	const start = Math.min(state.start, state.end);
	const end = Math.max(state.start, state.end);
	const doc = replaceRange(state.doc, start, end, insert);
	const caret = start + plainText(insert).length;

	return {doc, start: caret, end: caret, pending: null};
}

export function deleteRange(state: EditState, start: number, end: number): EditState {
	return {
		doc: replaceRange(state.doc, start, end, []),
		start,
		end: start,
		pending: null,
	};
}

// Surround the selection with `open` and `close`, keeping the inner text
// selected (e.g. select a word and type `(`)
export function wrapSelection(state: EditState, open: string, close: string): EditState {
	const start = Math.min(state.start, state.end);
	const end = Math.max(state.start, state.end);
	const doc = replaceRange(
		replaceRange(state.doc, end, end, [{text: close, style: styleAt(state.doc, end)}]),
		start,
		start,
		[{text: open, style: styleAt(state.doc, start + 1)}]
	);

	return {doc, start: start + open.length, end: end + open.length, pending: null};
}
