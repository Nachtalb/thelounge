// @vitest-environment jsdom
import {expect, vi} from "vitest";
import {nextTick} from "vue";
import {mount} from "@vue/test-utils";
import StickerMenu from "../../../client/components/StickerMenu.vue";

vi.mock("../../../client/js/socket", () => ({default: {on() {}, emit() {}}}));

describe("StickerMenu", () => {
	const open = () =>
		mount(StickerMenu, {props: {item: {pack: "p", id: "1"}}, attachTo: document.body});

	it("ignores the release of the long press that opened it", () => {
		const menu = open();
		const backdrop = menu.element as HTMLElement;
		backdrop.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
		backdrop.dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 1}));
		menu.find(".sticker-menu-send").element.dispatchEvent(
			new MouseEvent("click", {bubbles: true, detail: 1})
		);
		expect(menu.emitted("close")).toBeUndefined();
		expect(menu.emitted("send")).toBeUndefined();
		menu.unmount();
	});

	it("opens its URL in a new tab", () => {
		const windowOpen = vi.spyOn(window, "open").mockReturnValue(null);
		const menu = mount(StickerMenu, {
			props: {item: {pack: "p", id: "1"}, openUrl: "https://s.example/p/1"},
		});
		menu.find(".sticker-menu-open").element.dispatchEvent(
			new MouseEvent("click", {bubbles: true, detail: 0})
		);
		expect(windowOpen).toHaveBeenCalledWith("https://s.example/p/1", "_blank", "noopener");
		expect(menu.emitted("close")).toHaveLength(1);
		menu.unmount();
	});

	it("closes on a press that starts after it opened", () => {
		const menu = open();
		const backdrop = menu.element as HTMLElement;
		backdrop.dispatchEvent(new Event("pointerdown", {bubbles: true}));
		backdrop.dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 1}));
		expect(menu.emitted("close")).toHaveLength(1);
		menu.unmount();
	});

	it("still takes keyboard clicks right away", () => {
		const menu = open();
		menu.find(".sticker-menu-send").element.dispatchEvent(
			new MouseEvent("click", {bubbles: true, detail: 0})
		);
		expect(menu.emitted("send")).toHaveLength(1);
		menu.unmount();
	});

	it("leaves the focus alone when a peek turns into it with keepFocus", async () => {
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		const menu = mount(StickerMenu, {
			props: {item: {pack: "p", id: "1"}, peek: true, keepFocus: true},
			attachTo: document.body,
		});
		await menu.setProps({peek: false});
		await nextTick();
		expect(document.activeElement).toBe(input);
		menu.unmount();
		input.remove();
	});
});
