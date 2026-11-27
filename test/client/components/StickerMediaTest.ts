// @vitest-environment jsdom
import {expect} from "vitest";
import {nextTick} from "vue";
import {mount} from "@vue/test-utils";
import StickerMedia from "../../../client/components/StickerMedia.vue";

describe("StickerMedia", () => {
	it("plays an animated picture over its thumb while on screen", async () => {
		const media = mount(StickerMedia, {
			props: {media: {thumb: "t.webp", src: "a.webp", kind: "animated", direct: true}},
		});
		await nextTick();
		expect(media.findAll("img").map((img) => img.attributes("src"))).toEqual([
			"t.webp",
			"a.webp",
		]);
		media.unmount();
	});
});
