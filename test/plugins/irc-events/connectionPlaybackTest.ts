import {expect} from "vitest";
import {EventEmitter} from "events";

import connection from "../../../server/plugins/irc-events/connection";
import Chan from "../../../server/models/chan";
import Msg from "../../../server/models/msg";
import {ChanType} from "../../../shared/types/chan";

function setup(caps: string[], channels: Chan[]) {
	const raw: string[][] = [];
	const irc = new EventEmitter() as any;
	irc.network = {cap: {enabled: caps, isEnabled: (c: string) => caps.includes(c)}};
	irc.raw = (...args: string[]) => raw.push(args);

	irc.join = () => {};

	const lobby = new Chan({name: "ZNC", type: ChanType.LOBBY});

	lobby.pushMessage = () => {};

	const network = {
		host: "znc",
		port: 6697,
		irc,
		channels: [lobby, ...channels],
		getLobby: () => lobby,
		serverOptions: {MONITOR: null},
		monitorBatch() {},
	} as any;

	connection.call({attachedClients: {}} as any, irc, network);
	return {irc, playback: () => raw.filter((r) => r[0] === "ZNC")};
}

describe("connection plugin: ZNC playback", function () {
	// Channels are restored from storage before the IRC connection is up, when the
	// playback cap isn't known yet, so the buffered lines were never requested
	it("asks ZNC for what it buffered, per channel, once registered", function () {
		const last = new Date("2026-11-08T22:00:00.250Z");
		const chan = new Chan({name: "#chan", type: ChanType.CHANNEL});
		chan.messages = [new Msg({time: new Date(0)}), new Msg({time: last})];
		const query = new Chan({name: "friend", type: ChanType.QUERY});

		const {irc, playback} = setup(["znc.in/playback"], [chan, query]);
		irc.emit("registered");

		expect(playback()).to.deep.equal([
			["ZNC", "*playback", "PLAY", "#chan", String(last.getTime() / 1000)],
			["ZNC", "*playback", "PLAY", "friend", "0"],
		]);
	});

	it("does nothing without the playback cap", function () {
		const {irc, playback} = setup([], [new Chan({name: "#chan", type: ChanType.CHANNEL})]);
		irc.emit("registered");

		expect(playback()).to.deep.equal([]);
	});
});
