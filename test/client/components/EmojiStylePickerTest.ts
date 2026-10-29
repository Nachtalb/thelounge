// @vitest-environment jsdom
import {expect} from "vitest";
import {mount} from "@vue/test-utils";
import EmojiStylePicker from "../../../client/components/Settings/EmojiStylePicker.vue";

const options = [
	{id: "google", name: "Google (Noto Emoji)"},
	{id: "twitter", name: "Twitter (Twemoji)"},
	{id: "native", name: "Native (system font)"},
];

function picker(modelValue = "google") {
	const wrapper = mount(EmojiStylePicker, {
		props: {options, modelValue, labelledby: "title"},
		attachTo: document.body,
	});
	const combobox = wrapper.get("[role=combobox]");
	const key = (k: string) => combobox.trigger("keydown", {key: k});
	return {wrapper, combobox, key};
}

describe("EmojiStylePicker", () => {
	// jsdom has no layout
	Element.prototype.scrollIntoView = () => undefined;

	it("shows each style's own smiley before its name", () => {
		const {wrapper, combobox} = picker("twitter");
		const items = wrapper.findAll("[role=option]");

		expect(items.map((li) => li.text())).to.deep.equal([
			"Google (Noto Emoji)",
			"Twitter (Twemoji)",
			"🙂Native (system font)",
		]);
		expect(
			items.map((li) => li.element.querySelector("img")?.getAttribute("src") ?? null)
		).to.deep.equal(["img/emoji/google/1f642.png", "img/emoji/twitter/1f642.png", null]);
		expect(combobox.find("img").attributes("src")).to.equal("img/emoji/twitter/1f642.png");
		expect(combobox.text()).to.equal("Twitter (Twemoji)");
		expect(items[1].attributes("aria-selected")).to.equal("true");
		expect(items[0].attributes("aria-selected")).to.equal("false");
		wrapper.unmount();
	});

	it("opens, moves and picks with the keyboard", async () => {
		const {wrapper, combobox, key} = picker();

		expect(combobox.attributes("aria-expanded")).to.equal("false");
		await key("ArrowDown");
		expect(combobox.attributes("aria-expanded")).to.equal("true");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-google");

		await key("ArrowDown");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-twitter");
		await key("End");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-native");
		await key("Home");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-google");
		await key("ArrowUp");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-google");

		await key("ArrowDown");
		await key("Enter");
		expect(combobox.attributes("aria-expanded")).to.equal("false");
		expect(wrapper.emitted("update:modelValue")).to.deep.equal([["twitter"]]);
		wrapper.unmount();
	});

	it("closes on Escape without picking, and picks with Space", async () => {
		const {wrapper, combobox, key} = picker();

		await key(" ");
		await key("End");
		await key("Escape");
		expect(combobox.attributes("aria-expanded")).to.equal("false");
		expect(wrapper.emitted("update:modelValue")).to.equal(undefined);

		await key("End");
		await key(" ");
		expect(wrapper.emitted("update:modelValue")).to.deep.equal([["native"]]);
		wrapper.unmount();
	});

	it("jumps to the option starting with the typed letters", async () => {
		const {wrapper, combobox, key} = picker();

		await key("n");
		expect(combobox.attributes("aria-expanded")).to.equal("true");
		expect(combobox.attributes("aria-activedescendant")).to.equal("emoji-style-option-native");
		await key("t");
		await key("Enter");
		expect(wrapper.emitted("update:modelValue")).to.deep.equal([["native"]]);
		wrapper.unmount();
	});

	it("picks an option on click", async () => {
		const {wrapper, combobox} = picker();

		await combobox.trigger("click");
		await wrapper.findAll("[role=option]")[2].trigger("click");
		expect(wrapper.emitted("update:modelValue")).to.deep.equal([["native"]]);
		expect(combobox.attributes("aria-expanded")).to.equal("false");
		wrapper.unmount();
	});
});
