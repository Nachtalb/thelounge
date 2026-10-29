// @textcomplete editor for the rich input. The upstream contenteditable
// editor edits the DOM itself, which the rich input would undo again, so
// completions go through the editor's model instead.
import {CursorOffset, Editor, SearchResult} from "@textcomplete/core";
import {RichInput} from "./RichInput";

export class RichInputEditor extends Editor {
	private input: RichInput;
	private unsubscribe: () => void;

	constructor(input: RichInput) {
		super();
		this.input = input;
		this.unsubscribe = input.onChange((source) => {
			if (source === "colour-end") {
				this.emitEscEvent();
			} else if (source !== "format") {
				this.emitChangeEvent();
			}
		});
		input.el.addEventListener("keydown", this.onKeydown);
	}

	destroy() {
		super.destroy();
		this.unsubscribe();
		this.input.el.removeEventListener("keydown", this.onKeydown);
		return this;
	}

	applySearchResult(searchResult: SearchResult) {
		const before = this.getBeforeCursor();

		if (before === null) {
			return;
		}

		const replace = searchResult.replace(before, this.input.getAfterCursor());

		// Clicking a dropdown item moves focus away from the input
		this.input.focus();

		if (Array.isArray(replace)) {
			this.input.applyCompletion(before, replace[0]);
		}
	}

	getCursorOffset(): CursorOffset {
		const el = this.input.el;
		const elRect = el.getBoundingClientRect();
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || elRect.height;
		const selection = el.ownerDocument.getSelection();
		let rect: DOMRect | undefined;

		if (selection && selection.rangeCount && el.contains(selection.focusNode)) {
			const range = selection.getRangeAt(0).cloneRange();
			range.collapse(false);
			rect = range.getClientRects()[0];
		}

		const top = (rect ? rect.top : elRect.top) + window.scrollY + lineHeight;
		const left = (rect ? rect.left : elRect.left) + window.scrollX;

		if (el.dir === "rtl" || getComputedStyle(el).direction === "rtl") {
			return {top, right: document.documentElement.clientWidth - left, lineHeight};
		}

		return {top, left, lineHeight, clientTop: elRect.top};
	}

	getBeforeCursor() {
		return this.input.getBeforeCursor();
	}

	private onKeydown = (e: KeyboardEvent) => {
		const code = this.getCode(e);
		let event: CustomEvent | undefined;

		if (code === "UP" || code === "DOWN") {
			event = this.emitMoveEvent(code);
		} else if (code === "ENTER") {
			event = this.emitEnterEvent();
		} else if (code === "ESC") {
			event = this.emitEscEvent();
		}

		if (event && event.defaultPrevented) {
			e.preventDefault();
		}
	};
}
