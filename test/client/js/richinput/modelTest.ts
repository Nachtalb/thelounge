import {expect} from "vitest";
import {Doc, parse, serialize, normalize, plainText} from "../../../../client/js/richinput/model";

const roundTrip = (doc: Doc) => parse(serialize(doc));

describe("rich input model", () => {
	describe("serialize", () => {
		it("leaves plain text alone", () => {
			expect(serialize([{text: "hello world", style: {}}])).toBe("hello world");
			expect(serialize([])).toBe("");
		});

		it("wraps every toggle format in its control code", () => {
			const cases: [string, string][] = [
				["bold", "\x02"],
				["italic", "\x1d"],
				["underline", "\x1f"],
				["strikethrough", "\x1e"],
				["monospace", "\x11"],
			];

			for (const [attr, code] of cases) {
				expect(
					serialize([
						{text: "a ", style: {}},
						{text: "b", style: {[attr]: true}},
						{text: " c", style: {}},
					])
				).toBe(`a ${code}b${code} c`);
			}
		});

		it("closes formatting at the end of the message", () => {
			expect(serialize([{text: "hi", style: {bold: true}}])).toBe("\x02hi\x02");
			expect(serialize([{text: "hi", style: {bold: true, italic: true}}])).toBe(
				"\x02\x1dhi\x0f"
			);
		});

		it("nests formats with the fewest codes", () => {
			expect(
				serialize([
					{text: "a", style: {bold: true}},
					{text: "b", style: {bold: true, italic: true}},
					{text: "c", style: {italic: true}},
				])
			).toBe("\x02a\x1db\x02c\x1d");
		});

		it("writes colours with two digits and an optional background", () => {
			expect(serialize([{text: "red", style: {fg: 4}}])).toBe("\x0304red\x0f");
			expect(serialize([{text: "x", style: {fg: 4, bg: 12}}])).toBe("\x0304,12x\x0f");
			expect(
				serialize([
					{text: "a", style: {fg: 4, bg: 1}},
					{text: "b", style: {fg: 5, bg: 1}},
					{text: "c", style: {fg: 5}},
					{text: "d", style: {}},
				])
			).toBe("\x0304,01a\x0305b\x03\x0305c\x0fd");
		});

		it("writes a background without a foreground using the default colour", () => {
			expect(serialize([{text: "x", style: {bg: 3}}])).toBe("\x0399,03x\x0f");
		});

		it("removes a colour but keeps other formats", () => {
			expect(
				serialize([
					{text: "a", style: {fg: 4, bold: true}},
					{text: "b", style: {bold: true}},
				])
			).toBe("\x0304\x02a\x03b\x02");
		});

		it("keeps digits after colour codes out of the colour", () => {
			const doc: Doc = [
				{text: "a", style: {fg: 4}},
				{text: "5 apples", style: {}},
				{text: ",1", style: {fg: 3}},
			];
			expect(roundTrip(doc)).toEqual(normalize(doc));

			const bare: Doc = [
				{text: "a", style: {fg: 4, bold: true}},
				{text: "12", style: {bold: true}},
			];
			expect(roundTrip(bare)).toEqual(normalize(bare));
		});

		it("writes hex colours", () => {
			expect(serialize([{text: "x", style: {hexFg: "ff0000", hexBg: "00ff00"}}])).toBe(
				"\x04FF0000,00FF00x\x0f"
			);

			const doc: Doc = [
				{text: "a", style: {hexFg: "FF0000"}},
				{text: "abcdef", style: {}},
			];
			expect(roundTrip(doc)).toEqual(normalize(doc));
		});

		it("formats every line on its own", () => {
			expect(
				serialize([
					{text: "one\ntwo", style: {bold: true}},
					{text: "\nthree", style: {}},
				])
			).toBe("\x02one\x02\n\x02two\x02\nthree");
		});
	});

	describe("parse", () => {
		it("parses control codes into runs", () => {
			expect(parse("a \x02bold\x02 \x0304,12red")).toEqual([
				{text: "a ", style: {}},
				{text: "bold", style: {bold: true}},
				{text: " ", style: {}},
				{text: "red", style: {fg: 4, bg: 12}},
			]);
		});

		it("handles reset, reverse and the default colour", () => {
			expect(parse("\x02\x1dab\x0fc")).toEqual([
				{text: "ab", style: {bold: true, italic: true}},
				{text: "c", style: {}},
			]);
			expect(parse("\x0399,04x")).toEqual([{text: "x", style: {bg: 4}}]);
			expect(parse("\x0304\x16x")).toEqual([{text: "x", style: {bg: 4}}]);
		});

		it("drops empty spans and merges identical neighbours", () => {
			expect(parse("\x02\x02a\x02\x02b")).toEqual([{text: "ab", style: {}}]);
			expect(parse("\x02a\x02\x02b\x02")).toEqual([{text: "ab", style: {bold: true}}]);
		});

		it("starts every line unformatted", () => {
			expect(parse("\x02a\nb")).toEqual([
				{text: "a", style: {bold: true}},
				{text: "\nb", style: {}},
			]);
			expect(parse("a\r\nb")).toEqual([{text: "a\nb", style: {}}]);
		});

		it("turns other control characters into spaces", () => {
			expect(plainText(parse("a\x01b\x07c"))).toBe("a b c");
		});
	});

	describe("round trip", () => {
		const strings = [
			"",
			"plain",
			"\x02bold\x02 \x1ditalic\x1d \x1funder\x1f \x1estrike\x1e \x11mono\x11",
			"\x02\x1d\x1f\x1e\x11all\x0f none",
			"\x0304red \x0303,08green on yellow\x03 none",
			"\x034,5short codes",
			"\x04ff00aahex\x04 \x04112233,445566both",
			"\x02a\nb\x02\n\nc",
			"\x0312,01\x02x\x0fy",
			"\x0304a\x02\x02,12",
		];

		it("parse(serialize(parse(s))) equals parse(s)", () => {
			for (const s of strings) {
				const doc = parse(s);
				expect(parse(serialize(doc)), JSON.stringify(s)).toEqual(doc);
			}
		});

		it("serialize is stable once normalized", () => {
			for (const s of strings) {
				const once = serialize(parse(s));
				expect(serialize(parse(once))).toBe(once);
			}
		});
	});
});
