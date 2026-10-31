import {expect} from "vitest";
import {
	normalizeProxyUrl,
	parsePackInput,
	parsePackList,
	parseStickerKey,
	parseStickerList,
	parseStickerUrl,
	pushRecent,
	stickerShareUrl,
	toggleInList,
} from "../../shared/stickers";

const proxy = "https://s.naa.gg/";

describe("stickers", () => {
	it("recognises share pages and files of the configured proxy only", () => {
		expect(parseStickerUrl("https://s.naa.gg/Animals/AgAD3gAD9HsZAAE", proxy)).to.deep.equal({
			pack: "Animals",
			id: "AgAD3gAD9HsZAAE",
		});
		expect(
			parseStickerUrl(" https://s.naa.gg/vidcats/AgAD-Ro_AhaV.webm ", proxy)
		).to.deep.equal({pack: "vidcats", id: "AgAD-Ro_AhaV"});
		expect(parseStickerUrl("https://S.NAA.GG/Animals/x.webp", proxy)?.id).to.equal("x");
		expect(parseStickerUrl("https://s.naa.gg/Animals/thumb", proxy)).to.be.null;
		expect(parseStickerUrl("https://s.naa.gg/Animals/x.tgs", proxy)).to.be.null;
		expect(parseStickerUrl("https://s.naa.gg/Animals/x/thumb", proxy)).to.be.null;
		expect(parseStickerUrl("https://s.naa.gg/Animals.json", proxy)).to.be.null;
		expect(parseStickerUrl("look https://s.naa.gg/Animals/x", proxy)).to.be.null;
		expect(parseStickerUrl("https://s.naa.gg.evil.com/Animals/x", proxy)).to.be.null;
		expect(parseStickerUrl("https://example.com/Animals/x", proxy)).to.be.null;
		expect(parseStickerUrl("https://s.naa.gg/Animals/x", "")).to.be.null;
	});

	it("builds share urls and normalises the proxy url", () => {
		expect(stickerShareUrl(proxy, {pack: "Animals", id: "x"})).to.equal(
			"https://s.naa.gg/Animals/x"
		);
		expect(normalizeProxyUrl("  https://s.naa.gg//  ")).to.equal("https://s.naa.gg");
		expect(normalizeProxyUrl("s.naa.gg")).to.equal("");
		expect(normalizeProxyUrl(undefined)).to.equal("");
	});

	it("reads pack names from links and names", () => {
		expect(parsePackInput("https://t.me/addstickers/Animals")).to.equal("Animals");
		expect(parsePackInput("t.me/addstickers/vid_cats?foo=1")).to.equal("vid_cats");
		expect(parsePackInput("tg://addstickers?set=HotCherry")).to.equal("HotCherry");
		expect(parsePackInput(" Animals ")).to.equal("Animals");
		expect(parsePackInput("https://t.me/addemoji/x-y")).to.be.null;
		expect(parsePackInput("not a pack")).to.be.null;
		expect(parsePackInput("")).to.be.null;
	});

	it("shapes the synced lists", () => {
		expect(parsePackList("Animals  vidcats Animals bad-name")).to.deep.equal([
			"Animals",
			"vidcats",
		]);
		expect(parseStickerList("Animals/a b vidcats/c-d Animals/a")).to.deep.equal([
			"Animals/a",
			"vidcats/c-d",
		]);
		expect(parseStickerList(42)).to.deep.equal([]);
		expect(parseStickerKey("vidcats/c-d")).to.deep.equal({pack: "vidcats", id: "c-d"});
		expect(parseStickerKey("vidcats")).to.be.null;
		expect(toggleInList(["a", "b"], "a")).to.deep.equal(["b"]);
		expect(toggleInList(["b"], "a")).to.deep.equal(["b", "a"]);
		expect(pushRecent(["a", "b", "c"], "c")).to.deep.equal(["c", "a", "b"]);
		expect(pushRecent(["a", "b"], "c", 2)).to.deep.equal(["c", "a"]);
	});
});
