import {expect, vi} from "vitest";

const {
	router,
	afterEach: routeHooks,
	switchToChannel,
	state,
} = vi.hoisted(() => {
	const hooks: ((to: any, from: any, failure?: any) => void)[] = [];

	return {
		afterEach: hooks,
		switchToChannel: vi.fn(),
		state: {networks: [] as any[]},
		router: {
			currentRoute: {value: {name: "Connect" as string}},
			push: vi.fn(() => Promise.resolve(undefined as any)),
			afterEach: (hook: (to: any, from: any, failure?: any) => void) => hooks.push(hook),
		},
	};
});

vi.mock("../../../client/js/router", () => ({router, switchToChannel}));
vi.mock("../../../client/js/store", () => ({store: {state}}));
vi.mock("vue", () => ({onMounted: (fn: () => void) => fn(), onUnmounted: vi.fn()}));

const {richInput} = vi.hoisted(() => ({
	richInput: {
		el: {id: "input"},
		getText: () => "draft",
		setSelection: vi.fn(),
		focus: vi.fn(),
	},
}));
vi.mock("../../../client/js/richinput/RichInput", () => ({
	richInputFor: (el: unknown) => (el === richInput.el ? richInput : undefined),
}));

import eventbus from "../../../client/js/eventbus";
import {closeWindowOnEscape, focusInput} from "../../../client/js/closeWindow";
import useUnsavedChanges from "../../../client/js/hooks/use-unsaved-changes";

describe("closeWindowOnEscape", function () {
	const escape = () => ({key: "Escape", defaultPrevented: false} as KeyboardEvent);
	const focused = {blur: vi.fn(), focus: vi.fn()};
	const lobby = {id: 1};
	let openOverlay: unknown = null;
	let dirty = false;
	let dialog: ((discard: boolean) => void) | undefined;

	const onDialog = (_data: unknown, cb: (discard: boolean) => void) => {
		dialog = cb;
	};

	const visit = (name: string, fullPath: string) => {
		for (const hook of routeHooks) {
			hook({name, fullPath}, {});
		}
	};

	useUnsavedChanges(() => dirty);

	beforeEach(function () {
		vi.useFakeTimers();
		router.push.mockClear();
		router.push.mockImplementation(() => Promise.resolve(undefined));
		switchToChannel.mockClear();
		focused.blur.mockClear();
		focused.focus.mockClear();
		openOverlay = null;
		dirty = false;
		dialog = undefined;
		state.networks = [{channels: [lobby]}];
		router.currentRoute.value.name = "Connect";
		vi.stubGlobal("document", {
			activeElement: focused,
			querySelector: () => openOverlay,
			getElementById: () => null,
		});
		vi.stubGlobal("requestAnimationFrame", () => 0);
		eventbus.on("confirm-dialog", onDialog);
	});

	afterEach(function () {
		eventbus.off("confirm-dialog", onDialog);
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("should ignore other keys and pages", function () {
		expect(closeWindowOnEscape({key: "a"} as KeyboardEvent)).to.be.false;

		router.currentRoute.value.name = "RoutedChat";
		expect(closeWindowOnEscape(escape())).to.be.false;
		expect(router.push).not.toHaveBeenCalled();
	});

	it("should leave the Escape to an open dialog or menu", function () {
		openOverlay = {};
		expect(closeWindowOnEscape(escape())).to.be.false;
		expect(router.push).not.toHaveBeenCalled();
	});

	it("should go back to the last chat when the form is untouched", async function () {
		visit("RoutedChat", "/chan-2");
		visit("Connect", "/connect");

		expect(closeWindowOnEscape(escape())).to.be.true;
		await vi.runAllTimersAsync();

		expect(router.push).toHaveBeenCalledWith("/chan-2");
		expect(dialog).to.be.undefined;
	});

	it("should go back from every settings tab and save the focused field first", async function () {
		visit("RoutedChat", "/chan-3");
		visit("Appearance", "/settings");
		visit("General", "/settings/general");
		router.currentRoute.value.name = "General";

		expect(closeWindowOnEscape(escape())).to.be.true;
		await vi.runAllTimersAsync();

		expect(focused.blur).toHaveBeenCalled();
		expect(router.push).toHaveBeenCalledWith("/chan-3");
	});

	it("should fall back to the first lobby when the last chat is gone", async function () {
		visit("RoutedChat", "/chan-4");
		router.push.mockImplementation(() => Promise.resolve({type: 4}));

		closeWindowOnEscape(escape());
		await vi.runAllTimersAsync();

		expect(switchToChannel).toHaveBeenCalledWith(lobby);
	});

	it("should ask before discarding edits and stay when cancelled", async function () {
		visit("RoutedChat", "/chan-2");
		dirty = true;

		expect(closeWindowOnEscape(escape())).to.be.true;
		await vi.runAllTimersAsync();
		expect(dialog).to.be.a("function");
		expect(router.push).not.toHaveBeenCalled();

		dialog!(false);
		await vi.runAllTimersAsync();
		expect(router.push).not.toHaveBeenCalled();
		expect(focused.focus).toHaveBeenCalled();
	});

	it("should go back when the edits are discarded", async function () {
		visit("RoutedChat", "/chan-2");
		dirty = true;

		closeWindowOnEscape(escape());
		await vi.runAllTimersAsync();
		dialog!(true);
		await vi.runAllTimersAsync();

		expect(router.push).toHaveBeenCalledWith("/chan-2");
	});

	it("should focus the chat input with the caret after the draft", async function () {
		vi.stubGlobal("document", {activeElement: null, getElementById: () => richInput.el});
		richInput.focus.mockImplementation(() => {
			(document as any).activeElement = richInput.el;
		});

		focusInput();
		await vi.runAllTimersAsync();

		expect(richInput.setSelection).toHaveBeenCalledWith(5);
		expect(richInput.focus).toHaveBeenCalledOnce();
	});
});
