import {expect} from "vitest";
import {emojiForQuery, stickerMatches} from "../../../../client/js/helpers/stickerSearch";

describe("sticker search", () => {
	it("takes a typed emoji as is, without variation selectors", () => {
		expect(emojiForQuery(" ☺️ ")).to.deep.equal(["☺"]);
	});

	it("maps shortcodes to emoji", () => {
		expect(emojiForQuery(":joy:")).to.include("😂");
		expect(emojiForQuery("cat")).to.include.members(["🐱", "😹"]);
		expect(emojiForQuery("")).to.deep.equal([]);
	});

	it("matches shortcode words by prefix, from one character on", () => {
		expect(emojiForQuery("S")).to.include.members(["😏", "😄"]);
		expect(emojiForQuery("smi")).to.include.members(["😏", "😄", "😅"]);
		expect(emojiForQuery("smirk")).to.have.members(["😏", "😼"]);
		expect(emojiForQuery("irk")).to.deep.equal([]);
	});

	it("matches stickers by their emoji", () => {
		expect(stickerMatches("☺️", emojiForQuery("☺"))).to.be.true;
		expect(stickerMatches("🐶", emojiForQuery("dog"))).to.be.true;
		expect(stickerMatches("🐶", emojiForQuery("cat"))).to.be.false;
		expect(stickerMatches("", ["🐶"])).to.be.false;
	});
});
