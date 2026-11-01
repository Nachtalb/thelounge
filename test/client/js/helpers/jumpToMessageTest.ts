// @vitest-environment jsdom
import {expect, vi} from "vitest";
import eventbus from "../../../../client/js/eventbus";
import {store} from "../../../../client/js/store";
import jumpToMessage, {
	findMessage,
	jumpTarget,
	topicTarget,
} from "../../../../client/js/helpers/jumpToMessage";
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

	it("finds where the topic was set: last change, else the join info time, else nothing", () => {
		const change = {type: "topic", from: {nick: "a"}, time: 5, text: "t"};
		const join = {type: "topic", text: "t"};
		const setBy = {type: "topic_set_by", when: "2026-01-01T00:00:00Z"};
		const msg = {type: "message"};

		expect(topicTarget([setBy, change, msg])).to.equal(change);
		expect(topicTarget([change, join, setBy, msg])).to.deep.equal({time: setBy.when});
		expect(topicTarget([join, msg])).to.equal(undefined);
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

		// History is in arrival order: a replayed message can be older than the first one
		channel.messages.push({id: 3, time: 900, text: "replayed"} as never);
		expect(await jumpToMessage(channel, {time: 900, text: "replayed"})).to.equal(true);
		expect(scrolled).to.deep.equal([1, 2, 3]);

		eventbus.off("scroll-to-message", onScroll);
	});
});
