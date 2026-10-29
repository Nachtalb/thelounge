import {expect} from "vitest";
import {
	dropInputPlaceholders,
	getInputLinks,
	isInputPreviewShown,
	resolveInputPreview,
	syncInputPreviews,
} from "../../../../client/js/helpers/inputPreviews";
import type {ClientLinkPreview} from "../../../../client/js/types";

const preview = (link: string, type = "link"): ClientLinkPreview => ({
	type,
	head: "",
	body: "",
	thumb: "",
	size: -1,
	link,
	shown: null,
});

describe("inputPreviews helper", function () {
	it("should find unique links with a schema, in order", function () {
		expect(
			getInputLinks(
				"see https://b.example/ and example.com, https://a.example/ https://b.example/"
			)
		).to.deep.equal(["https://b.example/", "https://a.example/"]);
	});

	it("should ignore IRC formatting around links in the draft", function () {
		expect(
			getInputLinks("\x02https://a.example/\x02 \x0304,01https://b.example/x\x03")
		).to.deep.equal(["https://a.example/", "https://b.example/x"]);
	});

	it("should only return as many links as the server prefetches", function () {
		const text = [1, 2, 3, 4, 5, 6].map((i) => `https://example.com/${i}`).join(" ");
		expect(getInputLinks(text)).to.have.lengthOf(5);
	});

	it("should follow the link preview settings, show placeholders and hide errors", function () {
		const all = {links: true, media: true};
		expect(isInputPreviewShown(preview("a"), all)).to.equal(true);
		expect(isInputPreviewShown(preview("a", "image"), all)).to.equal(true);
		expect(isInputPreviewShown(preview("a", "error"), all)).to.equal(false);
		expect(isInputPreviewShown(preview("a", "loading"), all)).to.equal(true);
		expect(isInputPreviewShown(preview("a"), {links: false, media: true})).to.equal(false);
		expect(isInputPreviewShown(preview("a", "video"), {links: true, media: false})).to.equal(
			false
		);
	});

	it("should add a placeholder per new link and drop removed links, in input order", function () {
		const a = preview("https://a.example/");
		const c = preview("https://c.example/");
		const links = ["https://b.example/", "https://a.example/"];
		const {previews, missing} = syncInputPreviews([c, a], links);

		expect(missing).to.deep.equal(["https://b.example/"]);
		expect(previews.map((p) => [p.link, p.type])).to.deep.equal([
			["https://b.example/", "loading"],
			["https://a.example/", "link"],
		]);
		expect(previews[1]).to.equal(a);
	});

	it("should replace the placeholder with the preview from the server", function () {
		const {previews} = syncInputPreviews([], ["https://a.example/", "https://b.example/"]);
		const resolved = resolveInputPreview(previews, preview("https://b.example/"));

		expect(resolved.map((p) => p.type)).to.deep.equal(["loading", "link"]);
	});

	it("should hide the placeholder when there is nothing to preview", function () {
		const {previews} = syncInputPreviews([], ["https://a.example/"]);
		const resolved = resolveInputPreview(previews, preview("https://a.example/"), true);

		expect(resolved).to.have.lengthOf(1);
		expect(isInputPreviewShown(resolved[0], {links: true, media: true})).to.equal(false);
	});

	it("should drop stale responses", function () {
		// e.g. the message was sent or the link deleted while the server was still fetching
		const previews = [preview("https://a.example/")];
		expect(resolveInputPreview([], preview("https://a.example/"))).to.deep.equal([]);
		expect(resolveInputPreview(previews, preview("https://b.example/"))).to.equal(previews);
		// a link that already has its preview is not replaced
		expect(resolveInputPreview(previews, preview("https://a.example/"))).to.equal(previews);
	});

	it("should drop placeholders whose response can not arrive anymore", function () {
		const a = preview("https://a.example/");
		const {previews} = syncInputPreviews([a], ["https://a.example/", "https://b.example/"]);
		expect(dropInputPlaceholders(previews)).to.deep.equal([a]);
	});
});
