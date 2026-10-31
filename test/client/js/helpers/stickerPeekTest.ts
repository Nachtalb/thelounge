import {expect} from "vitest";
import {
	idlePeek,
	PEEK_MENU_MS,
	PEEK_MOUSE_MS,
	PEEK_SLOP,
	PEEK_TOUCH_MS,
	stepPeek,
	type PeekEvent,
	type PeekPointer,
	type PeekState,
} from "../../../../client/js/helpers/stickerPeek";

const run = (events: PeekEvent[], state: PeekState = idlePeek) =>
	events.reduce((s, e) => stepPeek(s, e).state, state);

const down = (pointer: PeekPointer, item = "pack/a"): PeekEvent => ({
	type: "down",
	pointer,
	item,
	x: 100,
	y: 100,
});

describe("stickerPeek gesture", function () {
	it("arms the long-press timer on press", function () {
		expect(stepPeek(idlePeek, down("touch")).timer).to.equal(PEEK_TOUCH_MS);
		expect(stepPeek(idlePeek, down("mouse")).timer).to.equal(PEEK_MOUSE_MS);
	});

	it("is a tap when released before the timer", function () {
		const step = stepPeek(run([down("touch")]), {type: "up"});
		expect(step.state.phase).to.equal("idle");
		expect(step.timer).to.equal(null);
	});

	it("is a scroll when the press moves before the timer", function () {
		const pressing = run([down("touch")]);
		const small = stepPeek(pressing, {type: "move", x: 104, y: 105, item: null});
		expect(small.state.phase).to.equal("pressing");

		const far = stepPeek(pressing, {type: "move", x: 100, y: 101 + PEEK_SLOP, item: null});
		expect(far.state.phase).to.equal("idle");
		expect(far.timer).to.equal(null);
	});

	it("opens the preview when the timer runs out", function () {
		const step = stepPeek(run([down("touch")]), {type: "timer"});
		expect(step.state.phase).to.equal("peek");
		expect(step.state.item).to.equal("pack/a");
		expect(step.timer).to.equal(PEEK_MENU_MS);
	});

	it("switches the preview to the sticker under the pointer", function () {
		const peek = run([down("touch"), {type: "timer"}]);
		const step = stepPeek(peek, {type: "move", x: 300, y: 100, item: "pack/b"});
		expect(step.state.phase).to.equal("peek");
		expect(step.state.item).to.equal("pack/b");
		// Holding still on the new sticker counts from the switch
		expect(step.timer).to.equal(PEEK_MENU_MS);
	});

	it("keeps the preview and its menu timer while sliding within one sticker", function () {
		const peek = run([down("touch"), {type: "timer"}]);
		const same = stepPeek(peek, {type: "move", x: 120, y: 100, item: "pack/a"});
		expect(same.state.item).to.equal("pack/a");
		expect(same.timer).to.equal(undefined);
	});

	it("keeps the preview but no menu while off the stickers", function () {
		const peek = run([down("touch"), {type: "timer"}]);
		const off = stepPeek(peek, {type: "move", x: 300, y: 500, item: null});
		expect(off.state.phase).to.equal("peek");
		expect(off.state.item).to.equal("pack/a");
		expect(off.timer).to.equal(null);

		// Back on the same sticker: holding still counts again
		const back = stepPeek(off.state, {type: "move", x: 100, y: 100, item: "pack/a"});
		expect(back.state.away).to.equal(false);
		expect(back.timer).to.equal(PEEK_MENU_MS);
	});

	it("closes the preview on release", function () {
		const state = run([down("mouse"), {type: "timer"}, {type: "up"}]);
		expect(state.phase).to.equal("idle");
	});

	it("opens the menu when a touch holds still on the previewed sticker", function () {
		const step = stepPeek(run([down("touch"), {type: "timer"}]), {type: "timer"});
		expect(step.state.phase).to.equal("menu");
		expect(step.timer).to.equal(null);
	});

	it("never opens the menu from a mouse hold", function () {
		const peek = stepPeek(run([down("mouse")]), {type: "timer"});
		expect(peek.state.phase).to.equal("peek");
		expect(peek.timer).to.equal(null);

		const moved = stepPeek(peek.state, {type: "move", x: 300, y: 100, item: "pack/b"});
		expect(moved.timer).to.equal(null);
	});

	it("does not switch stickers once the menu is open", function () {
		const menu = run([down("touch"), {type: "timer"}, {type: "timer"}]);
		const step = stepPeek(menu, {type: "move", x: 300, y: 100, item: "pack/b"});
		expect(step.state.phase).to.equal("menu");
		expect(step.state.item).to.equal("pack/a");
	});
});
