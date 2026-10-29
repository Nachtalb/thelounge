// WYSIWYG chat input: a contenteditable element showing IRC formatting inline.
// The document model is the source of truth; the element is re-rendered from it
// and `getValue()` returns the IRC string with control codes.
import {Doc, Style, ToggleAttr, parse, plainText, serialize} from "./model";
import {
	EditState,
	Colour,
	clearFormatting,
	deleteRange,
	insertDoc,
	insertText,
	setColour,
	sliceDoc,
	toggleFormat,
	wrapSelection,
	replaceRange,
	styleAt,
} from "./edit";
import {
	Offsets,
	getOffsets,
	getSelectionOffsets,
	readDoc,
	render,
	setSelectionOffsets,
} from "./dom";

export type ChangeSource =
	| "type"
	| "native"
	| "delete"
	| "format"
	| "paste"
	| "undo"
	| "set"
	| "autocomplete"
	| "colour"
	| "colour-end";

type Listener = (source: ChangeSource) => void;

type Snapshot = {doc: Doc; start: number; end: number};

type ColourMode = {
	// Text typed after the shortcut: colour number(s) or a name to filter by
	buffer: string;
	// A foreground was picked; a following "," continues with the background
	picked: boolean;
};

export type RichInputOptions = {
	// Characters that wrap a selection instead of replacing it, e.g. `(` -> `)`
	wraps?: Record<string, string>;
	// Whether the autocompletion menu is open (it then owns Enter and arrows)
	isMenuOpen?: () => boolean;
	// Enter that reached the editor (mobile keyboards send no keypress)
	onEnter?: () => void;
};

const IRC_MIME = "application/x-thelounge-irc";
const UNDO_LIMIT = 100;
const TYPING_MERGE_MS = 1000;
const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const shortcuts: Record<string, ToggleAttr> = {
	b: "bold",
	i: "italic",
	u: "underline",
	s: "strikethrough",
	m: "monospace",
};

const instances = new WeakMap<Element, object>();

export class RichInput {
	readonly el: HTMLElement;
	private doc: Doc = [];
	private sel: Offsets = {start: 0, end: 0};
	private pending: Style | null = null;
	private composing = false;
	private colour: ColourMode | null = null;
	private undoStack: Snapshot[] = [];
	private redoStack: Snapshot[] = [];
	private lastEdit = {kind: "", time: 0};
	private pointerDown = false;
	private listeners: Listener[] = [];
	private options: RichInputOptions;

	constructor(el: HTMLElement, options: RichInputOptions = {}) {
		this.el = el;
		this.options = options;
		instances.set(el, this);

		el.addEventListener("beforeinput", this.onBeforeInput);
		el.addEventListener("input", this.onInput);
		el.addEventListener("keydown", this.onKeydown);
		el.addEventListener("compositionstart", this.onCompositionStart);
		el.addEventListener("compositionend", this.onCompositionEnd);
		el.addEventListener("paste", this.onPaste);
		el.addEventListener("copy", this.onCopy);
		el.addEventListener("cut", this.onCut);
		el.addEventListener("drop", this.onDrop);
		el.addEventListener("focus", this.onFocus);
		el.addEventListener("mousedown", this.onPointerDown);
		el.addEventListener("touchstart", this.onPointerDown, {passive: true});
		el.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
	}

	destroy() {
		const el = this.el;
		el.removeEventListener("beforeinput", this.onBeforeInput);
		el.removeEventListener("input", this.onInput);
		el.removeEventListener("keydown", this.onKeydown);
		el.removeEventListener("compositionstart", this.onCompositionStart);
		el.removeEventListener("compositionend", this.onCompositionEnd);
		el.removeEventListener("paste", this.onPaste);
		el.removeEventListener("copy", this.onCopy);
		el.removeEventListener("cut", this.onCut);
		el.removeEventListener("drop", this.onDrop);
		el.removeEventListener("focus", this.onFocus);
		el.removeEventListener("mousedown", this.onPointerDown);
		el.removeEventListener("touchstart", this.onPointerDown);
		el.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
		instances.delete(el);
		this.listeners = [];
	}

	// ---- Public API ----

	onChange(listener: Listener) {
		this.listeners.push(listener);

		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	// The message as an IRC string with formatting control codes
	getValue() {
		return serialize(this.doc);
	}

	getText() {
		return plainText(this.doc);
	}

	// Replace the content with an IRC string (draft, history entry) and put
	// the caret at the end. Undo history is kept unless `resetUndo` is set.
	setValue(irc: string, resetUndo = false) {
		if (resetUndo) {
			this.undoStack = [];
			this.redoStack = [];
		} else if (irc !== this.getValue()) {
			this.pushUndo("set");
		}

		this.exitColour(false);
		const doc = parse(irc);
		const end = plainText(doc).length;
		this.apply({doc, start: end, end, pending: null});
	}

	getSelection(): Offsets {
		return this.isFocused() ? getSelectionOffsets(this.el) ?? this.sel : this.sel;
	}

	setSelection(start: number, end = start) {
		this.sel = {start, end};
		this.pending = null;

		if (this.isFocused()) {
			setSelectionOffsets(this.el, start, end);
		}
	}

	focus() {
		if (!this.isFocused()) {
			this.el.focus();
		}

		setSelectionOffsets(this.el, this.sel.start, this.sel.end);
	}

	// Replace a plain text range, e.g. for nick completion or upload links.
	// The text takes the style of the replaced text (or the one before it).
	replaceRange(start: number, end: number, text: string, source: ChangeSource, style?: Style) {
		this.pushUndo(source);
		const insertStyle = style ?? styleAt(this.doc, start === end ? start : start + 1);
		this.commit(
			insertText({doc: this.doc, start, end, pending: null}, text, insertStyle),
			source
		);
	}

	toggle(attr: ToggleAttr) {
		this.pushUndo("format");
		this.commit(toggleFormat(this.state(), attr), "format");
	}

	clearFormatting() {
		this.pushUndo("format");
		this.commit(clearFormatting(this.state()), "format");
	}

	setColour(colour: Colour | null) {
		this.pushUndo("format");
		this.commit(setColour(this.state(), colour), "format");
	}

	undo() {
		this.historyStep(this.undoStack, this.redoStack);
	}

	redo() {
		this.historyStep(this.redoStack, this.undoStack);
	}

	// ---- Colour picker ----
	// mod+k starts colour mode. Typed digits or a colour name go into a buffer
	// (not the text) that the autocompletion menu filters by, exactly like the
	// `\x03` it used to insert.

	startColour() {
		this.colour = {buffer: "", picked: false};
		this.emit("colour");
	}

	isPickingColour() {
		return this.colour !== null;
	}

	// Text before the caret for the autocompletion strategies
	getBeforeCursor(): string | null {
		if (this.colour) {
			return "\x03" + this.colour.buffer;
		}

		const {start, end} = this.getSelection();

		if (start !== end) {
			return null;
		}

		return this.getText().slice(0, start);
	}

	getAfterCursor() {
		return this.colour ? "" : this.getText().slice(this.getSelection().end);
	}

	// Apply an autocompletion result: `before` was replaced by `newBefore`
	applyCompletion(before: string, newBefore: string) {
		if (this.colour) {
			const match = /\x03(\d{1,2})(?:,(\d{1,2}))?$/.exec(newBefore);

			if (match) {
				this.applyColourCodes(match[1], match[2]);
			}

			return;
		}

		let common = 0;

		while (
			common < before.length &&
			common < newBefore.length &&
			before[common] === newBefore[common]
		) {
			common++;
		}

		this.replaceRange(common, before.length, newBefore.slice(common), "autocomplete");
	}

	// ---- Internals ----

	private isFocused() {
		return this.el.ownerDocument.activeElement === this.el;
	}

	private state(): EditState {
		const {start, end} = this.getSelection();
		return {doc: this.doc, start, end, pending: this.pending};
	}

	private emit(source: ChangeSource) {
		for (const listener of this.listeners) {
			listener(source);
		}

		// Other listeners (e.g. tab completion) learn about changes we made
		// ourselves through a synthetic input event
		if (source !== "native" && source !== "colour" && source !== "colour-end") {
			this.el.dispatchEvent(new CustomEvent("input", {detail: source}));
		}
	}

	private apply(state: EditState) {
		this.doc = state.doc;
		this.pending = state.pending;
		this.sel = {start: state.start, end: state.end};
		render(this.el, this.doc);

		if (this.isFocused()) {
			setSelectionOffsets(this.el, state.start, state.end);
		}
	}

	private commit(state: EditState, source: ChangeSource) {
		const changed = serialize(state.doc) !== serialize(this.doc);
		this.apply(state);

		if (changed || source !== "format") {
			this.emit(source);
		}
	}

	private snapshot(): Snapshot {
		const {start, end} = this.getSelection();
		return {doc: this.doc, start, end};
	}

	private pushUndo(kind: string) {
		const now = Date.now();
		const merge =
			kind === "type" &&
			this.lastEdit.kind === "type" &&
			now - this.lastEdit.time < TYPING_MERGE_MS;
		this.lastEdit = {kind, time: now};

		if (merge) {
			return;
		}

		this.undoStack.push(this.snapshot());

		if (this.undoStack.length > UNDO_LIMIT) {
			this.undoStack.shift();
		}

		this.redoStack = [];
	}

	private historyStep(from: Snapshot[], to: Snapshot[]) {
		const snap = from.pop();

		if (!snap) {
			return;
		}

		to.push(this.snapshot());
		this.lastEdit = {kind: "", time: 0};
		this.apply({...snap, pending: null});
		this.emit("undo");
	}

	private insert(text: string, source: ChangeSource = "type") {
		const state = this.state();
		const wrap = this.options.wraps?.[text];

		if (wrap && state.start !== state.end) {
			this.pushUndo("format");
			this.commit(wrapSelection(state, text, wrap), source);
			return;
		}

		this.pushUndo(source);
		this.commit(insertText(state, text), source);
	}

	private insertIrc(irc: string, source: ChangeSource) {
		const normalized = irc.replace(/\r\n?/g, "\n");
		this.pushUndo(source);
		this.commit(insertDoc(this.state(), parse(normalized)), source);
	}

	private deleteOffsets(start: number, end: number) {
		this.pushUndo("delete");
		this.commit(
			deleteRange(this.state(), Math.min(start, end), Math.max(start, end)),
			"delete"
		);
	}

	private exitColour(notify = true) {
		if (!this.colour) {
			return;
		}

		this.colour = null;

		if (notify) {
			this.emit("colour-end");
		}
	}

	private applyColourCodes(fg: string, bg?: string) {
		const fgNum = Number(fg);
		let colour: Colour | null = null;

		if (fgNum !== 99) {
			colour = {fg: fgNum};

			if (bg !== undefined) {
				colour.bg = Number(bg) === 99 ? null : Number(bg);
			}
		}

		this.setColour(colour);

		if (bg !== undefined || !colour) {
			this.exitColour();
		} else if (this.colour) {
			this.colour = {buffer: fg, picked: true};
		}
	}

	// Commit a typed numeric colour (e.g. "4" or "4,12") when there is no menu
	private commitColourBuffer() {
		const match = this.colour && /^(\d{1,2})(?:,(\d{1,2}))?$/.exec(this.colour.buffer);

		if (match && !this.colour?.picked) {
			this.applyColourCodes(match[1], match[2]);
		}

		this.exitColour();
	}

	// Returns true when the text was consumed by the colour picker
	private colourInput(text: string) {
		const colour = this.colour!;

		if (colour.picked) {
			if (text === ",") {
				this.colour = {buffer: colour.buffer + ",", picked: false};
				this.emit("colour");
				return true;
			}

			this.exitColour();
			return false;
		}

		const previous = colour.buffer;
		const next = previous + text;

		if (/^\d{0,2}(,\d{0,2})?$/.test(next)) {
			colour.buffer = next;
			this.emit("colour");
			return true;
		}

		// Colour names only filter the menu; without a matching menu entry the
		// text is ordinary input again
		if (/^(\d{1,2},)?[A-Za-z ]{1,10}$/.test(next)) {
			colour.buffer = next;
			this.emit("colour");

			if (this.options.isMenuOpen?.()) {
				return true;
			}

			colour.buffer = previous;
			this.exitColour();
			return false;
		}

		this.commitColourBuffer();
		return false;
	}

	private onBeforeInput = (e: InputEvent) => {
		if (e.isComposing || e.inputType === "insertCompositionText") {
			return;
		}

		const type = e.inputType;

		if (type === "insertText" || type === "insertReplacementText") {
			const text = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";

			if (type === "insertText" && this.colour && this.colourInput(text)) {
				e.preventDefault();
				return;
			}

			const ranges = type === "insertReplacementText" ? e.getTargetRanges() : [];

			if (ranges.length) {
				const offsets = getOffsets(this.el, ranges[0]);

				if (offsets) {
					e.preventDefault();
					this.replaceRange(offsets.start, offsets.end, text, "type");
				}

				return;
			}

			e.preventDefault();
			this.insert(text);
			return;
		}

		if (type === "insertLineBreak" || type === "insertParagraph") {
			e.preventDefault();
			this.exitColour();

			if (type === "insertParagraph" && this.options.onEnter) {
				this.options.onEnter();
				return;
			}

			this.insert("\n", "type");
			return;
		}

		// Pastes and drops are handled by their own events
		if (type.startsWith("insertFrom") || type.startsWith("format")) {
			e.preventDefault();
			return;
		}

		if (type === "historyUndo" || type === "historyRedo") {
			e.preventDefault();

			if (type === "historyUndo") {
				this.undo();
			} else {
				this.redo();
			}

			return;
		}

		if (type.startsWith("delete")) {
			if (this.colour) {
				e.preventDefault();

				if (type === "deleteContentBackward" && this.colour.buffer && !this.colour.picked) {
					this.colour.buffer = this.colour.buffer.slice(0, -1);
					this.emit("colour");
				} else {
					this.exitColour();
				}

				return;
			}

			const ranges = e.getTargetRanges();
			const offsets = ranges.length ? getOffsets(this.el, ranges[0]) : null;

			if (offsets) {
				e.preventDefault();

				if (offsets.start !== offsets.end) {
					this.deleteOffsets(offsets.start, offsets.end);
				}

				return;
			}
		}

		// Anything else is left to the browser and read back in onInput
		this.pushUndo("native");
	};

	// Changes the browser made itself (composition, unknown input types)
	private onInput = (e: Event) => {
		if (e instanceof CustomEvent) {
			return;
		}

		const sel = getSelectionOffsets(this.el) ?? this.sel;
		this.doc = readDoc(this.el);
		this.sel = sel;

		// Rendering during a composition would cancel it; tidy up at its end
		if (!this.composing) {
			render(this.el, this.doc);
			setSelectionOffsets(this.el, sel.start, sel.end);
		}

		this.emit("native");
	};

	private onCompositionStart = () => {
		this.exitColour();
		this.pushUndo("native");
		this.composing = true;
	};

	private onCompositionEnd = (e: CompositionEvent) => {
		this.composing = false;
		this.doc = readDoc(this.el);
		const sel = getSelectionOffsets(this.el) ?? this.sel;
		let state: EditState = {doc: this.doc, start: sel.start, end: sel.end, pending: null};

		// Composed text gets the typing style picked before the composition
		if (this.pending && e.data && sel.start === sel.end && sel.start >= e.data.length) {
			const from = sel.start - e.data.length;
			state = {
				...state,
				doc: replaceRange(this.doc, from, sel.start, [
					{text: plainText(sliceDoc(this.doc, from, sel.start)), style: this.pending},
				]),
			};
		}

		this.apply(state);
		this.emit("native");
	};

	private onKeydown = (e: KeyboardEvent) => {
		if (e.isComposing) {
			return;
		}

		const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
		const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

		if (mod && !e.altKey) {
			if (!e.shiftKey && shortcuts[key]) {
				e.preventDefault();
				this.exitColour();
				this.toggle(shortcuts[key]);
				return;
			}

			if (!e.shiftKey && key === "o") {
				e.preventDefault();
				this.exitColour();
				this.clearFormatting();
				return;
			}

			if (!e.shiftKey && key === "k") {
				e.preventDefault();
				this.startColour();
				return;
			}

			if (key === "z" || (!isMac && !e.shiftKey && key === "y")) {
				e.preventDefault();

				if (e.shiftKey || key === "y") {
					this.redo();
				} else {
					this.undo();
				}

				return;
			}
		}

		if (!this.colour) {
			return;
		}

		if (key === "Escape") {
			this.exitColour();
		} else if (key === "Enter" && !this.options.isMenuOpen?.()) {
			// Type a colour number, then Enter applies it without sending
			e.preventDefault();
			e.stopImmediatePropagation();
			this.commitColourBuffer();
		}
	};

	private onPaste = (e: ClipboardEvent) => {
		const data = e.clipboardData;

		// Files are handled by the upload code listening on the document
		if (!data || Array.from(data.items || []).some((item) => item.kind === "file")) {
			return;
		}

		e.preventDefault();
		this.exitColour();
		const irc = data.getData(IRC_MIME);

		if (irc) {
			this.insertIrc(irc, "paste");
			return;
		}

		// Plain text only; IRC control codes in it become formatting
		this.insertIrc(data.getData("text/plain"), "paste");
	};

	private onCopy = (e: ClipboardEvent) => {
		const {start, end} = this.getSelection();

		if (start === end || !e.clipboardData) {
			return;
		}

		const slice = sliceDoc(this.doc, Math.min(start, end), Math.max(start, end));
		e.preventDefault();
		e.clipboardData.setData("text/plain", plainText(slice));
		e.clipboardData.setData(IRC_MIME, serialize(slice));
	};

	private onCut = (e: ClipboardEvent) => {
		const {start, end} = this.getSelection();
		this.onCopy(e);

		if (start !== end && e.defaultPrevented) {
			this.deleteOffsets(start, end);
		}
	};

	private onDrop = (e: DragEvent) => {
		const data = e.dataTransfer;

		if (!data || data.types.includes("Files")) {
			return;
		}

		e.preventDefault();
		const doc = this.el.ownerDocument as Document & {
			caretPositionFromPoint?: (x: number, y: number) => {offsetNode: Node; offset: number};
		};
		let offset: number | null = null;

		if (doc.caretPositionFromPoint) {
			const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);

			if (pos) {
				offset =
					getOffsets(this.el, {
						startContainer: pos.offsetNode,
						startOffset: pos.offset,
						endContainer: pos.offsetNode,
						endOffset: pos.offset,
					})?.start ?? null;
			}
		} else if (doc.caretRangeFromPoint) {
			const range = doc.caretRangeFromPoint(e.clientX, e.clientY);
			offset = range ? getOffsets(this.el, range)?.start ?? null : null;
		}

		this.focus();

		if (offset !== null) {
			this.setSelection(offset);
		}

		this.insertIrc(data.getData(IRC_MIME) || data.getData("text/plain"), "paste");
	};

	private onPointerDown = () => {
		this.pointerDown = true;
		setTimeout(() => (this.pointerDown = false), 0);
	};

	// Focusing a contenteditable puts the caret at its start; put it back where
	// it was, like a textarea does (unless the user clicked somewhere)
	private onFocus = () => {
		if (!this.pointerDown) {
			setSelectionOffsets(this.el, this.sel.start, this.sel.end);
		}
	};

	private onSelectionChange = () => {
		if (!this.isFocused() || this.composing) {
			return;
		}

		const sel = getSelectionOffsets(this.el);

		if (!sel || (sel.start === this.sel.start && sel.end === this.sel.end)) {
			return;
		}

		// The caret moved: forget the typing style and leave the colour picker
		this.sel = sel;
		this.pending = null;
		this.exitColour();
	};
}

// The editor attached to an element, e.g. `richInputFor(document.getElementById("input"))`
export function richInputFor(el: Element | null | undefined) {
	return el ? (instances.get(el) as RichInput | undefined) : undefined;
}
