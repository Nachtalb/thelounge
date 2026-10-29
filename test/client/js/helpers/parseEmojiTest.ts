// @vitest-environment jsdom
import {expect, vi} from "vitest";
import {h} from "vue";
import {mount} from "@vue/test-utils";
import ParsedMessage from "../../../../client/components/ParsedMessage.vue";
import {
	bundledEmojiSets,
	emojiServer,
	emojiSetting,
	emojiStyle,
} from "../../../../client/js/helpers/emoji";

const installed = (id: string) => ({id, name: id, license: "x", bundled: false});

// The nick and channel components pull in the store and its socket
vi.mock("../../../../client/js/socket", () => ({default: {on() {}, emit() {}}}));

function render(text: string, message?: any) {
	return mount({render: () => h("div", [h(ParsedMessage, {text, message})])})
		.element as HTMLElement;
}

describe("emoji images in messages", () => {
	afterEach(() => {
		emojiStyle.value = "google";
		emojiServer.value = {sets: bundledEmojiSets, defaultStyle: "google"};
	});

	it("renders emoji as same-origin images and keeps the emoji as text", () => {
		const el = render("hi 🇨🇭 🇯🇵 👍🏽!");
		const spans = [...el.querySelectorAll(".emoji-img")] as HTMLElement[];

		expect(spans.map((s) => s.style.backgroundImage)).to.deep.equal([
			'url("img/emoji/google/1f1e8-1f1ed.png")',
			'url("img/emoji/google/1f1ef-1f1f5.png")',
			'url("img/emoji/google/1f44d-1f3fd.png")',
		]);
		expect(spans[0].getAttribute("title")).to.equal("Emoji: flag: Switzerland");
		expect(el.textContent).to.equal("hi 🇨🇭 🇯🇵 👍🏽!");
	});

	it("uses the chosen image set", () => {
		emojiStyle.value = "twitter";
		const span = render("🇨🇭").querySelector(".emoji-img") as HTMLElement;

		expect(span.style.backgroundImage).to.equal('url("img/emoji/twitter/1f1e8-1f1ed.png")');
	});

	it("uses an installed set only when the server has it", () => {
		const image = () =>
			(render("🇨🇭").querySelector(".emoji-img") as HTMLElement).style.backgroundImage;

		emojiStyle.value = "apple";
		expect(image()).to.equal('url("img/emoji/google/1f1e8-1f1ed.png")');

		emojiServer.value = {sets: bundledEmojiSets, defaultStyle: "twitter"};
		expect(image()).to.equal('url("img/emoji/twitter/1f1e8-1f1ed.png")');

		emojiServer.value = {
			sets: [...bundledEmojiSets, installed("apple")],
			defaultStyle: "google",
		};
		expect(image()).to.equal('url("img/emoji/apple/1f1e8-1f1ed.png")');

		emojiStyle.value = "fluent-3d";
		emojiServer.value = {
			sets: [...bundledEmojiSets, installed("fluent-3d")],
			defaultStyle: "google",
		};
		expect(image()).to.equal('url("img/emoji/fluent-3d/1f1e8-1f1ed.png")');
	});

	it("uses the server default style until one is picked", () => {
		emojiSetting.value = "";
		emojiServer.value = {
			sets: [...bundledEmojiSets, installed("openmoji")],
			defaultStyle: "openmoji",
		};
		expect(emojiStyle.value).to.equal("openmoji");

		emojiServer.value = {sets: bundledEmojiSets, defaultStyle: "native"};
		expect(emojiStyle.value).to.equal("native");
	});

	it("renders native emoji with the native style", () => {
		emojiStyle.value = "native";
		const el = render("🇨🇭");

		expect(el.querySelector(".emoji-img")).to.be.null;
		expect(el.querySelector(".emoji")!.textContent).to.equal("🇨🇭");
	});

	it("keeps IRC formatting inside emoji", () => {
		const span = render("\x034💚 green").querySelector(".emoji-img")!;

		expect(span.innerHTML).to.equal('<span class="irc-fg4">💚</span>');
	});

	it("leaves text presentation characters alone", () => {
		expect(render("© 2024 ™").querySelector(".emoji")).to.be.null;
	});

	it("does not touch emoji inside links and channels", () => {
		const el = render("https://i.❤️.thelounge.chat #i❤️thelounge");

		expect(el.querySelector("a")!.textContent).to.equal("https://i.❤️.thelounge.chat");
		expect(el.querySelector(".inline-channel")!.textContent).to.equal("#i❤️thelounge");
		expect(el.querySelector(".emoji")).to.be.null;
	});
});
