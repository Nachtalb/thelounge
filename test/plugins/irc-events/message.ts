import {expect} from "chai";
import {EventEmitter} from "events";

import message from "../../../server/plugins/irc-events/message";
import Network from "../../../server/models/network";
import Chan from "../../../server/models/chan";
import Config from "../../../server/config";
import Msg from "../../../server/models/msg";
import MessageStorage from "../../../server/plugins/messageStorage/sqlite";

function setup(mediaPreviewBlocklist: string[], messageProvider?: MessageStorage) {
	const irc = new EventEmitter() as any;
	irc.user = {nick: "me"};

	const channel = new Chan({name: "#thelounge"});
	const network = new Network({
		host: "example.com",
		channels: [channel],
		mediaPreviewBlocklist,
	});

	const emitted: any[] = [];
	const client = {
		idMsg: 1,
		attachedClients: {},
		messageStorage: [],
		messageProvider,
		config: {browser: {}},
		emit(name: string, data: any) {
			if (name === "msg") {
				emitted.push(data.msg);
			}
		},
	} as any;

	message.call(client, irc, network as any);

	return {irc, emitted, network, channel};
}

function say(irc: EventEmitter, nick: string) {
	irc.emit("privmsg", {
		nick,
		hostname: "example.com",
		ident: "user",
		target: "#thelounge",
		message: "look at http://127.0.0.1:1/cat.png",
	});
}

describe("message plugin link previews", function () {
	const originalPrefetch = Config.values.prefetch;

	beforeAll(function () {
		Config.values.prefetch = true;
	});

	afterAll(function () {
		Config.values.prefetch = originalPrefetch;
	});

	it("should prefetch links from senders and channels that are not blocked", function () {
		const {irc, emitted} = setup(["SpamBot"]);
		say(irc, "someone");

		expect(emitted).to.have.lengthOf(1);
		expect(emitted[0].previews).to.have.lengthOf(1);
	});

	it("should not prefetch links from a blocked sender", function () {
		const {irc, emitted} = setup(["spambot"]);
		say(irc, "SpamBot");

		expect(emitted).to.have.lengthOf(1);
		expect(emitted[0].previews).to.be.empty;
	});

	it("should not prefetch links in a blocked channel", function () {
		const {irc, emitted} = setup(["#TheLounge"]);
		say(irc, "someone");

		expect(emitted).to.have.lengthOf(1);
		expect(emitted[0].previews).to.be.empty;
	});
});

describe("message plugin replies", function () {
	it("should quote a parent that is only in the message storage", function () {
		const store = new MessageStorage("testUser");
		store._enable(":memory:");
		const {irc, emitted, network, channel} = setup([], store);
		store.index(
			network,
			channel,
			new Msg({from: {nick: "alice"} as any, text: "old \x02news\x02", msgid: "parent-1"})
		);

		irc.emit("privmsg", {
			nick: "bob",
			hostname: "example.com",
			ident: "user",
			target: "#thelounge",
			message: "indeed",
			tags: {"+reply": "parent-1"},
		});

		expect(emitted[0].replyToNick).to.equal("alice");
		expect(emitted[0].replyToText).to.equal("old news");
		store.close();
	});
});
