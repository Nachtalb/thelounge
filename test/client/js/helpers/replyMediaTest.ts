import {expect} from "vitest";
import {replyMedia} from "../../../../client/js/helpers/replyMedia";
import type {LinkPreview} from "../../../../shared/types/msg";

const img = (link: string, type = "image") =>
	({type, link, thumb: "preview-cache/" + link.length + ".avif"} as LinkPreview);

describe("replyMedia", function () {
	it("returns null without a thumbnail", function () {
		expect(replyMedia({text: "hi"})).to.equal(null);
		expect(replyMedia({text: "x", previews: [{...img("x"), thumb: ""}]})).to.equal(null);
	});

	it("strips image links to get the caption", function () {
		const m = replyMedia({
			text: "look https://a.b/c.png nice",
			previews: [img("https://a.b/c.png")],
		});
		expect(m).to.deep.equal({
			thumb: "preview-cache/17.avif",
			caption: "look nice",
			kind: "Photo",
		});
	});

	it("names the media kind when only a link was sent", function () {
		expect(
			replyMedia({text: "https://a.b/c.gif", previews: [img("https://a.b/c.gif")]})?.kind
		).to.equal("GIF");
		expect(
			replyMedia({text: "https://a.b/v", previews: [img("https://a.b/v", "video")]})?.kind
		).to.equal("Video");
	});
});
