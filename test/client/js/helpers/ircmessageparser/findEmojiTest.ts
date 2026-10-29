import {expect} from "vitest";
import findEmoji from "../../../../../client/js/helpers/ircmessageparser/findEmoji";
import findNames from "../../../../../client/js/helpers/ircmessageparser/findNames";
import merge from "../../../../../client/js/helpers/ircmessageparser/merge";

describe("findEmoji", () => {
	it("should find default emoji presentation character", () => {
		const input = "test \u{231A} test";
		const expected = [
			{
				start: 5,
				end: 6,
				emoji: "\u{231A}",
				image: "231a",
			},
		];

		const actual = findEmoji(input);

		expect(actual).to.deep.equal(expected);
	});

	it("should find default text presentation character rendered as emoji", () => {
		const input = "test \u{2194}\u{FE0F} test";
		const expected = [
			{
				start: 5,
				end: 7,
				emoji: "\u{2194}\u{FE0F}",
				image: "2194-fe0f",
			},
		];

		const actual = findEmoji(input);

		expect(actual).to.deep.equal(expected);
	});

	it("should find emoji modifier base", () => {
		const input = "test\u{1F469}test";
		const expected = [
			{
				start: 4,
				end: 6,
				emoji: "\u{1F469}",
				image: "1f469",
			},
		];

		const actual = findEmoji(input);

		expect(actual).to.deep.equal(expected);
	});

	it("should find emoji modifier base followed by a modifier", () => {
		const input = "test\u{1F469}\u{1F3FF}test";
		const expected = [
			{
				start: 4,
				end: 8,
				emoji: "\u{1F469}\u{1F3FF}",
				image: "1f469-1f3ff",
			},
		];

		const actual = findEmoji(input);

		expect(actual).to.deep.equal(expected);
	});

	const images = (text: string) => findEmoji(text).map((part) => [part.emoji, part.image]);

	it("should find flags, including subdivision flags", () => {
		expect(
			images("🇨🇭 🇯🇵 🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}")
		).to.deep.equal([
			["🇨🇭", "1f1e8-1f1ed"],
			["🇯🇵", "1f1ef-1f1f5"],
			[
				"🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
				"1f3f4-e0067-e0062-e0073-e0063-e0074-e007f",
			],
		]);
	});

	it("should find ZWJ sequences and skin tones as one emoji", () => {
		expect(images("👨\u200D👩\u200D👧\u200D👦 👍🏽 🧑🏻\u200D🤝\u200D🧑🏿 🏳️\u200D🌈")).to.deep.equal(
			[
				["👨\u200D👩\u200D👧\u200D👦", "1f468-200d-1f469-200d-1f467-200d-1f466"],
				["👍🏽", "1f44d-1f3fd"],
				["🧑🏻\u200D🤝\u200D🧑🏿", "1f9d1-1f3fb-200d-1f91d-200d-1f9d1-1f3ff"],
				["🏳️\u200D🌈", "1f3f3-fe0f-200d-1f308"],
			]
		);
	});

	it("should split a skin tone after an emoji without skin tones", () => {
		expect(images("🐶🏽")).to.deep.equal([
			["🐶", "1f436"],
			["🏽", "1f3fd"],
		]);
	});

	it("should find Emoji 16 emoji", () => {
		expect(images("🫩🇨🇶")).to.deep.equal([
			["🫩", "1fae9"],
			["🇨🇶", "1f1e8-1f1f6"],
		]);
	});

	it("should find keycaps only with the emoji variation selector", () => {
		expect(images("1\uFE0F\u20E3 #\uFE0F\u20E3 1\u20E3 1 #")).to.deep.equal([
			["1\uFE0F\u20E3", "0031-fe0f-20e3"],
			["#\uFE0F\u20E3", "0023-fe0f-20e3"],
		]);
	});

	it("should leave text presentation characters as text", () => {
		expect(images("© ™ ↔ \u2764 \u2695\uFE0E 👍\uFE0E")).to.deep.equal([]);
		expect(images("©\uFE0F \u2764\uFE0F")).to.deep.equal([
			["©\uFE0F", "00a9-fe0f"],
			["\u2764\uFE0F", "2764-fe0f"],
		]);
	});

	it("should keep a nick next to an emoji a separate part", () => {
		const text = "MaxLeiter👍";
		const parts = merge(
			[...findNames(text, ["MaxLeiter"]), ...findEmoji(text)],
			[{start: 0, end: text.length, text}],
			text
		);

		const found = parts as unknown as {nick?: string; emoji?: string}[];
		expect(found.map((p) => [p.nick, p.emoji])).to.deep.equal([
			["MaxLeiter", undefined],
			[undefined, "👍"],
		]);
	});
});
