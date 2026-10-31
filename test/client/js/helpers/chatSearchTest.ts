// @vitest-environment jsdom
import {expect, vi} from "vitest";
import {counterText, stepPos} from "../../../../client/js/helpers/chatSearch";
import {findMessage} from "../../../../client/js/helpers/jumpToMessage";

vi.mock("../../../../client/js/socket", () => ({default: {on() {}, off() {}, emit() {}}}));

describe("in-channel search navigation", () => {
	it("steps through matches newest first and stops at the ends", () => {
		expect(stepPos(-1, 1, 3, false)).to.equal(0);
		expect(stepPos(0, 1, 3, false)).to.equal(1);
		expect(stepPos(2, 1, 3, false)).to.equal(2);
		expect(stepPos(1, -1, 3, false)).to.equal(0);
		expect(stepPos(0, -1, 3, false)).to.equal(0);
	});

	it("asks for older results past the last loaded one", () => {
		expect(stepPos(99, 1, 100, true)).to.equal("load");
		expect(stepPos(98, 1, 100, true)).to.equal(99);
	});

	it("shows the current match, no results or nothing without a query", () => {
		expect(counterText("", -1, 0, false, false)).to.equal("");
		expect(counterText("x", -1, 0, false, true)).to.equal("Searching…");
		expect(counterText("x", -1, 0, false, false)).to.equal("No results");
		expect(counterText("x", 0, 27, false, false)).to.equal("1 of 27");
		expect(counterText("x", 4, 100, true, false)).to.equal("5 of 100+");
	});

	it("finds the loaded message by time and text", () => {
		const messages = [
			{id: 1, time: 1000, text: "a"},
			{id: 2, time: 2000, text: "b"},
			{id: 3, time: 2000, text: "c"},
		];
		expect(findMessage(messages, {time: 2000, text: "c"})!.id).to.equal(3);
		expect(findMessage(messages, {time: new Date(1500), text: "x"})!.id).to.equal(2);
		expect(findMessage(messages, {time: 3000, text: "x"})).to.equal(undefined);
	});
});
