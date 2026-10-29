// @vitest-environment jsdom
import {expect} from "vitest";
import {parse, serialize} from "../../../../client/js/richinput/model";
import {
	domPoint,
	getOffsets,
	readDoc,
	render,
	setSelectionOffsets,
	getSelectionOffsets,
} from "../../../../client/js/richinput/dom";
import {RichInput, richInputFor} from "../../../../client/js/richinput/RichInput";

function editable() {
	const el = document.createElement("div");
	el.contentEditable = "true";
	document.body.appendChild(el);
	return el;
}

describe("rich input DOM", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("renders with the message classes and reads back the same document", () => {
		const el = editable();
		const doc = parse(
			"a \x02b\x1dc\x0f \x0304,12red\x03 \x04FF0000hex\x04 \x11m\x11 \x1eS\x1e \x1fU"
		);
		render(el, doc);

		expect(el.innerHTML).toBe(
			'a <span data-irc="" class="irc-bold">b</span>' +
				'<span data-irc="" class="irc-bold irc-italic">c</span> ' +
				'<span data-irc="" class="irc-fg4 irc-bg12">red</span> ' +
				'<span data-irc="" data-hex="FF0000" style="color: rgb(255, 0, 0);">hex</span> ' +
				'<span data-irc="" class="irc-monospace">m</span> ' +
				'<span data-irc="" class="irc-strikethrough">S</span> ' +
				'<span data-irc="" class="irc-underline">U</span>'
		);
		expect(readDoc(el)).toEqual(doc);
	});

	it("never shows control characters", () => {
		const el = editable();
		render(el, parse("\x02\x03\x0304,05x\x1d\x1f\x1e\x11\x0f"));
		expect(el.textContent).toBe("x");
	});

	it("keeps a trailing newline visible and ignores the placeholder <br>", () => {
		const el = editable();
		const doc = parse("a\n");
		render(el, doc);
		expect(el.lastChild?.nodeName).toBe("BR");
		expect(readDoc(el)).toEqual(doc);

		el.innerHTML = "<br>";
		expect(readDoc(el)).toEqual([]);
	});

	it("reads browser-made markup as plain text and line breaks", () => {
		const el = editable();
		el.innerHTML = 'a<b>b</b><div>c<br>d</div><span data-irc="" class="irc-bold">e</span>';
		expect(serialize(readDoc(el))).toBe("ab\nc\nd\x02e\x02");
	});

	it("updates text in place instead of replacing nodes", () => {
		const el = editable();
		render(el, parse("a \x02bold\x02"));
		const span = el.childNodes[1];
		const text = span.firstChild;
		render(el, parse("a \x02bolder\x02"));
		expect(el.childNodes[1]).toBe(span);
		expect(span.firstChild).toBe(text);
		expect(el.textContent).toBe("a bolder");
	});

	it("maps selections to plain text offsets and back", () => {
		const el = editable();
		render(el, parse("ab\x02cd\x02\nef"));

		for (let offset = 0; offset <= 7; offset++) {
			const [node, off] = domPoint(el, offset);
			expect(
				getOffsets(el, {
					startContainer: node,
					startOffset: off,
					endContainer: node,
					endOffset: off,
				})
			).toEqual({start: offset, end: offset});
		}

		// Positions between children count everything before them
		expect(
			getOffsets(el, {startContainer: el, startOffset: 1, endContainer: el, endOffset: 3})
		).toEqual({start: 2, end: 7});

		setSelectionOffsets(el, 1, 5);
		expect(getSelectionOffsets(el)).toEqual({start: 1, end: 5});
	});

	it("prefers the end of the previous run at a boundary", () => {
		const el = editable();
		render(el, parse("\x02ab\x02cd"));
		const [node, offset] = domPoint(el, 2);
		expect(node.parentElement?.className).toBe("irc-bold");
		expect(offset).toBe(2);
	});
});

describe("RichInput", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("round-trips values and applies shortcuts to the selection", () => {
		const el = editable();
		const input = new RichInput(el);
		expect(richInputFor(el)).toBe(input);

		const changes: string[] = [];
		input.onChange((source) => changes.push(source));

		input.setValue("hello \x02world\x02");
		expect(input.getValue()).toBe("hello \x02world\x02");
		expect(input.getText()).toBe("hello world");

		input.setSelection(0, 5);
		input.toggle("italic");
		expect(input.getValue()).toBe("\x1dhello\x1d \x02world\x02");

		input.setSelection(8);
		input.toggle("bold");
		expect(input.getValue()).toBe("\x1dhello\x1d world");

		input.undo();
		expect(input.getValue()).toBe("\x1dhello\x1d \x02world\x02");
		input.redo();
		expect(input.getValue()).toBe("\x1dhello\x1d world");

		expect(changes).toContain("format");
		input.destroy();
		expect(richInputFor(el)).toBeUndefined();
	});

	it("applies completions without touching the formatting before them", () => {
		const el = editable();
		const input = new RichInput(el);
		input.setValue("\x02hi\x02 @ni");
		input.setSelection(6);
		input.applyCompletion("hi @ni", "hi @nick ");
		expect(input.getValue()).toBe("\x02hi\x02 @nick ");
		expect(input.getSelection()).toEqual({start: 9, end: 9});
	});

	it("picks colours through the colour mode", () => {
		const el = editable();
		const input = new RichInput(el);
		input.setValue("say hello");
		input.setSelection(4, 9);

		input.startColour();
		expect(input.getBeforeCursor()).toBe("\x03");
		input.applyCompletion("\x03", "\x0304");
		expect(input.getValue()).toBe("say \x0304hello\x0f");
		expect(input.isPickingColour()).toBe(true);

		input.startColour();
		input.applyCompletion("\x0304,", "\x0304,02");
		expect(input.getValue()).toBe("say \x0304,02hello\x0f");
		expect(input.isPickingColour()).toBe(false);

		input.startColour();
		input.applyCompletion("\x03", "\x0399");
		expect(input.getValue()).toBe("say hello");
	});
});
