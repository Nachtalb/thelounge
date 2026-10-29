import {expect} from "chai";
import {EventEmitter} from "events";
import {vi} from "vitest";

import ctcpInput from "../../server/plugins/inputs/ctcp";
import ctcpEvents from "../../server/plugins/irc-events/ctcp";
import Network from "../../server/models/network";
import Msg from "../../server/models/msg";
import User from "../../server/models/user";
import {MessageType} from "../../shared/types/msg";

class FakeChan {
	pushed: Msg[] = [];

	pushMessage(_client: unknown, msg: Msg) {
		this.pushed.push(msg);
	}

	getUser(nick: string) {
		return new User({nick});
	}
}

function setup() {
	const sent: string[][] = [];
	const irc = new EventEmitter() as any;
	irc.user = {nick: "alice"};
	irc.ctcpRequest = (...args: string[]) => sent.push(args);

	const lobby = new FakeChan();
	const network = new Network({name: "test"}) as any;
	network.irc = irc;
	network.getLobby = () => lobby;
	network.getChannel = () => undefined;

	const client = {} as any;
	ctcpEvents.call(client, irc, network);

	const input = (cmd: string, args: string[]) =>
		ctcpInput.input.call(client, network, lobby as any, cmd, args);

	const reply = (nick: string, message: string) => {
		irc.emit("ctcp response", {
			nick,
			target: "alice",
			type: message.split(" ")[0],
			message,
			time: Date.now(),
		});
	};

	return {sent, lobby, input, reply};
}

describe("CTCP PING", function () {
	beforeEach(function () {
		vi.useFakeTimers();
		vi.setSystemTime(1000000);
	});

	afterEach(function () {
		vi.useRealTimers();
	});

	it("sends a CTCP PING with a timestamp", function () {
		const {sent, input} = setup();

		input("ping", ["bob"]);

		expect(sent).to.deep.equal([["bob", "PING", "1000000"]]);
	});

	it("shows usage without exactly one nick", function () {
		const {sent, lobby, input} = setup();

		input("ping", []);
		input("ping", ["bob", "carol"]);

		expect(sent).to.have.lengthOf(0);
		expect(lobby.pushed.map((m) => m.type)).to.deep.equal([
			MessageType.ERROR,
			MessageType.ERROR,
		]);
		expect(lobby.pushed[0].text).to.equal("Usage: /ping <nick>");
	});

	it("reports the round trip time of the reply", function () {
		const {lobby, input, reply} = setup();

		input("ping", ["Bob"]);
		vi.advanceTimersByTime(1234);
		reply("bob", "PING 1000000");

		const msg = lobby.pushed[lobby.pushed.length - 1];
		expect(msg.type).to.equal(MessageType.CTCP);
		expect(msg.from.nick).to.equal("bob");
		expect(msg.ctcpMessage).to.equal("PING reply in 1.234s");
	});

	it("only reports the first reply", function () {
		const {lobby, input, reply} = setup();

		input("ping", ["bob"]);
		reply("bob", "PING 1000000");
		reply("bob", "PING 1000000");

		const messages = lobby.pushed.map((m) => m.ctcpMessage).slice(1);
		expect(messages).to.deep.equal(["PING reply in 0.000s", "PING 1000000"]);
	});

	it("does not report unsolicited or spoofed replies", function () {
		const {lobby, input, reply} = setup();

		reply("bob", "PING 1000000");
		input("ping", ["bob"]);
		reply("mallory", "PING 1000000");
		reply("bob", "PING 999999");

		const messages = lobby.pushed.map((m) => m.ctcpMessage);
		expect(messages).to.deep.equal([
			"PING 1000000",
			'"PING" to bob',
			"PING 1000000",
			"PING 999999",
		]);
	});

	it("does not report replies to expired pings", function () {
		const {lobby, input, reply} = setup();

		input("ping", ["bob"]);
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		reply("bob", "PING 1000000");

		const msg = lobby.pushed[lobby.pushed.length - 1];
		expect(msg.ctcpMessage).to.equal("PING 1000000");
	});
});
