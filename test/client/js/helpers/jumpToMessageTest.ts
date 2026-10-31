// @vitest-environment jsdom
import {expect, vi} from "vitest";
import eventbus from "../../../../client/js/eventbus";
import {store} from "../../../../client/js/store";
import jumpToMessage, {findMessage, jumpTarget} from "../../../../client/js/helpers/jumpToMessage";
import type {ClientChan} from "../../../../client/js/types";

vi.mock("../../../../client/js/socket", () => ({default: {on() {}, off() {}, emit() {}}}));

describe("jumpToMessage", () => {
	const messages = [
		{id: 1, time: 1000, text: "a", msgid: "x1"},
		{id: 2, time: 2000, text: "b", msgid: "x2"},
	];
	const raw = {id: 9, messages, moreHistoryAvailable: false} as unknown as ClientChan;

	it("finds a loaded message by msgid, and nothing for an unknown msgid", () => {
		expect(findMessage(messages, {msgid: "x2"})!.id).to.equal(2);
		expect(findMessage(messages, {msgid: "nope"})).to.equal(undefined);
		expect(findMessage(messages, {msgid: "nope", time: 1500})!.id).to.equal(2);
	});

	it("scrolls to and highlights a reply's parent, and ignores unknown parents", async () => {
		store.state.activeChannel = {channel: raw} as never;
		const channel = store.state.activeChannel!.channel;
		const scrolled: number[] = [];
		const onScroll = (id: number) => scrolled.push(id);
		eventbus.on("scroll-to-message", onScroll);

		await jumpToMessage(channel, {msgid: "nope"});
		expect(scrolled).to.deep.equal([]);

		await jumpToMessage(channel, {msgid: "x1"});
		expect(scrolled).to.deep.equal([1]);
		expect(jumpTarget.value).to.equal(1);

		// Older than the history reaches: not found instead of the oldest message
		expect(await jumpToMessage(channel, {time: 500})).to.equal(false);
		expect(await jumpToMessage(channel, {time: 1500})).to.equal(true);
		expect(scrolled).to.deep.equal([1, 2]);

		eventbus.off("scroll-to-message", onScroll);
	});
});
