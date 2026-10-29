import {expect, vi} from "vitest";

const {afterEach: routeHooks} = vi.hoisted(() => ({
	afterEach: [] as ((to: any, from: any, failure?: any) => void)[],
}));

vi.mock("../../../client/js/router", () => ({
	router: {
		afterEach: (hook: (to: any, from: any, failure?: any) => void) => routeHooks.push(hook),
	},
}));

import {pageFocusTarget, focusPage} from "../../../client/js/focusWindow";

type Fake = HTMLElement & {focus: ReturnType<typeof vi.fn>};

function element(tagName: string, extra: Record<string, unknown> = {}): Fake {
	const el = {tagName, isContentEditable: false, getClientRects: () => [{}], ...extra} as Fake;
	el.focus = vi.fn(() => {
		(document as {activeElement: unknown}).activeElement = el;
	});
	return el;
}

describe("focusWindow", function () {
	let elements: Record<string, Fake | undefined>;
	let frames: (() => void)[];

	beforeEach(function () {
		vi.useFakeTimers();
		elements = {};
		frames = [];
		vi.stubGlobal("document", {
			activeElement: null,
			getElementById: (id: string) => elements[id] ?? null,
		});
		vi.stubGlobal("navigator", {maxTouchPoints: 0});
		vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
	});

	afterEach(function () {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("should target the network name, the theme select and the help page", function () {
		elements["connect:name"] = element("INPUT", {type: "text"});
		elements["theme-select"] = element("SELECT");

		expect(pageFocusTarget("Connect", "RoutedChat")!()).to.equal(elements["connect:name"]);
		expect(pageFocusTarget("Appearance", undefined)!()).to.equal(elements["theme-select"]);
		expect(pageFocusTarget("Help", "RoutedChat")).to.be.a("function");
		expect(pageFocusTarget("RoutedChat", "Help")).to.be.undefined;
		expect(pageFocusTarget("General", "Appearance")).to.be.undefined;
	});

	it("should not move focus when switching back to the Appearance tab", function () {
		expect(pageFocusTarget("Appearance", "General")).to.be.undefined;
		expect(pageFocusTarget("Appearance", "Help")).to.be.a("function");
	});

	it("should focus the first help control, or the page when there is none", function () {
		const link = element("A");
		const hidden = element("BUTTON", {getClientRects: () => []});
		const container = {querySelectorAll: (): Fake[] => [hidden, link]};
		elements.help = {querySelector: () => container} as unknown as Fake;

		expect(pageFocusTarget("Help", undefined)!()).to.equal(link);

		container.querySelectorAll = () => [];
		expect(pageFocusTarget("Help", undefined)!()).to.equal(elements.help);
		expect(elements.help!.tabIndex).to.equal(-1);
	});

	it("should retry until the page has rendered", function () {
		let target: Fake | null = null;
		focusPage(() => target);
		vi.runAllTimers();
		expect(frames).to.have.length(1);

		target = element("SELECT");
		frames.shift()!();
		expect(target!.focus).toHaveBeenCalledOnce();
		expect(frames).to.have.length(0);
	});

	it("should run on route changes, but not failed ones", function () {
		elements["theme-select"] = element("SELECT");
		routeHooks[0]({name: "Appearance"}, {name: "Help"}, new Error("aborted"));
		vi.runAllTimers();
		expect(elements["theme-select"]!.focus).not.toHaveBeenCalled();

		routeHooks[0]({name: "Appearance"}, {name: "RoutedChat"});
		vi.runAllTimers();
		expect(elements["theme-select"]!.focus).toHaveBeenCalledOnce();
	});

	it("should not focus text fields on touch devices", function () {
		vi.stubGlobal("navigator", {maxTouchPoints: 5});
		const input = element("INPUT", {type: "text"});
		const select = element("SELECT");

		focusPage(() => input);
		focusPage(() => select);
		vi.runAllTimers();

		expect(input.focus).not.toHaveBeenCalled();
		expect(select.focus).toHaveBeenCalledOnce();
		expect(frames).to.have.length(0);
	});
});
