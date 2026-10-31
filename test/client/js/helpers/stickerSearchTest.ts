import {expect} from "vitest";
import {emojiForQuery, stickerMatches} from "../../../../client/js/helpers/stickerSearch";

describe("sticker search", () => {
	it("takes a typed emoji as is, without variation selectors", () => {
		expect(emojiForQuery(" ☺️ ")).to.deep.equal(["☺"]);
	});

	it("maps shortcodes to emoji", () => {
		expect(emojiForQuery(":joy:")).to.include("😂");
		expect(emojiForQuery("cat")).to.include.members(["🐱", "😹"]);
		expect(emojiForQuery("c")).to.deep.equal([]);
		expect(emojiForQuery("")).to.deep.equal([]);
	});

	it("matches stickers by their emoji", () => {
		expect(stickerMatches("☺️", emojiForQuery("☺"))).to.be.true;
		expect(stickerMatches("🐶", emojiForQuery("dog"))).to.be.true;
		expect(stickerMatches("🐶", emojiForQuery("cat"))).to.be.false;
		expect(stickerMatches("", ["🐶"])).to.be.false;
	});
});
