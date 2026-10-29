import {expect} from "vitest";
import {Doc, parse, plainText, serialize} from "../../../../client/js/richinput/model";
import {
	EditState,
	clearFormatting,
	insertText,
	setColour,
	toggleFormat,
	wordAt,
	wrapSelection,
} from "../../../../client/js/richinput/edit";

// Build a state from an IRC string where `|` marks the caret and `[` `]` the selection
function state(irc: string, pending: EditState["pending"] = null): EditState {
	const doc = parse(irc.replace(/[|[\]]/g, ""));
	const plain = plainText(parse(irc));
	let start: number, end: number;

	if (plain.includes("|")) {
		start = end = plain.indexOf("|");
	} else {
		start = plain.indexOf("[");
		end = plain.indexOf("]") - 1;
	}

	return {doc, start, end, pending};
}

const out = (s: EditState) => serialize(s.doc);

describe("rich input editing", () => {
	describe("wordAt", () => {
		it("finds the word only when the caret is inside it", () => {
			expect(wordAt("hello world", 2)).toEqual([0, 5]);
			expect(wordAt("hello world", 0)).toBeNull();
			expect(wordAt("hello world", 5)).toBeNull();
			expect(wordAt("hello world", 6)).toBeNull();
			expect(wordAt("grüße dir", 3)).toEqual([0, 5]);
		});
	});

	describe("toggleFormat", () => {
		it("toggles the selection", () => {
			const s = toggleFormat(state("say [hello] world"), "bold");
			expect(out(s)).toBe("say \x02hello\x02 world");
			expect([s.start, s.end]).toEqual([4, 9]);
			expect(out(toggleFormat(s, "bold"))).toBe("say hello world");
		});

		it("adds the format when only part of the selection has it", () => {
			const s = toggleFormat(state("[a \x02b\x02 c]"), "bold");
			expect(out(s)).toBe("\x02a b c\x02");
		});

		it("removes a format from part of a formatted span", () => {
			const s = toggleFormat(state("\x02a [b] c\x02"), "bold");
			expect(out(s)).toBe("\x02a \x02b\x02 c\x02");
		});

		it("toggles the word around the caret", () => {
			const s = toggleFormat(state("say he|llo world"), "italic");
			expect(out(s)).toBe("say \x1dhello\x1d world");
			expect([s.start, s.end, s.pending]).toEqual([6, 6, null]);
			expect(out(toggleFormat(s, "italic"))).toBe("say hello world");
		});

		it("changes the typing style between words", () => {
			const s = toggleFormat(state("say |"), "bold");
			expect(out(s)).toBe("say ");
			expect(s.pending).toEqual({bold: true});

			const typed = insertText(s, "hi");
			expect(out(typed)).toBe("say \x02hi\x02");
			expect(typed.pending).toBeNull();

			// At the end of the bold word the caret is not inside it, so a second
			// toggle switches bold off for what comes next
			const off = toggleFormat(typed, "bold");
			expect(off.pending).toEqual({});
			expect(out(insertText(off, " there"))).toBe("say \x02hi\x02 there");
		});

		it("keeps the other formats when toggling one", () => {
			const s = toggleFormat(state("\x02\x0304a [b] c"), "underline");
			expect(s.doc).toEqual(parse("\x02\x0304a \x1fb\x1f c"));
		});

		it("ignores newlines in the selection", () => {
			const s = toggleFormat(state("[a\nb]"), "bold");
			expect(out(s)).toBe("\x02a\x02\n\x02b\x02");
		});
	});

	describe("clearFormatting", () => {
		it("clears the selection, the word or the typing style", () => {
			expect(out(clearFormatting(state("\x02\x0304[ab] cd")))).toBe("ab\x0304\x02 cd\x0f");
			expect(out(clearFormatting(state("\x1da|b c")))).toBe("ab\x1d c\x1d");

			const pending = clearFormatting(state("\x02ab |"));
			expect(pending.pending).toEqual({});
		});
	});

	describe("setColour", () => {
		it("colours the selection and keeps or replaces the background", () => {
			const red = setColour(state("[ab] c"), {fg: 4});
			expect(out(red)).toBe("\x0304ab\x0f c");

			const onBlue = setColour(red, {fg: 4, bg: 2});
			expect(out(onBlue)).toBe("\x0304,02ab\x0f c");

			const green = setColour(onBlue, {fg: 3});
			expect(out(green)).toBe("\x0303,02ab\x0f c");

			const noBg = setColour(green, {fg: 3, bg: null});
			expect(out(noBg)).toBe("\x0303ab\x0f c");
		});

		it("removes colours with null", () => {
			expect(out(setColour(state("\x0304,02a|b\x0f c"), null))).toBe("ab c");
		});

		it("replaces hex colours", () => {
			expect(out(setColour(state("\x04FF0000a|b"), {fg: 4}))).toBe("\x0304ab\x0f");
		});

		it("sets the typing colour between words", () => {
			const s = setColour(state("a |"), {fg: 12, bg: 1});
			expect(s.pending).toEqual({fg: 12, bg: 1});
			expect(out(insertText(s, "x"))).toBe("a \x0312,01x\x0f");
		});
	});

	describe("insertText", () => {
		it("continues the style of the character before the caret", () => {
			expect(out(insertText(state("\x02ab|\x02 c"), "x"))).toBe("\x02abx\x02 c");
			expect(out(insertText(state("\x02a\x02\n|b"), "x"))).toBe("\x02a\x02\n\x02x\x02b");
			expect(out(insertText(state("|\x02a\x02"), "x"))).toBe("x\x02a\x02");
		});

		it("replaces a selection with its first character's style", () => {
			expect(out(insertText(state("a [\x02bc\x02] d"), "x"))).toBe("a \x02x\x02 d");
		});
	});

	describe("wrapSelection", () => {
		it("wraps and keeps the inner text selected", () => {
			const s = wrapSelection(state("a [\x02b\x02] c"), "(", ")");
			expect(out(s)).toBe("a \x02(b)\x02 c");
			expect([s.start, s.end]).toEqual([3, 4]);
		});
	});

	it("does not mutate the input document", () => {
		const s = state("say [hello] world");
		const before: Doc = JSON.parse(JSON.stringify(s.doc));
		toggleFormat(s, "bold");
		setColour(s, {fg: 4});
		insertText(s, "x");
		expect(s.doc).toEqual(before);
	});
});
