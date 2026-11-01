import {expect} from "vitest";
import {NetworkConfig} from "../server/models/network";
import Chan, {ChanConfig} from "../server/models/chan";
import {ChanType} from "../shared/types/chan";
import ClientManager from "../server/clientManager";
import Client from "../server/client";
import log from "../server/log";
import Msg from "../server/models/msg";
import MessageStorage from "../server/plugins/messageStorage/sqlite";

import sinon from "ts-sinon";

describe("Client", function () {
	const commonNetworkConfig: NetworkConfig = {
		uuid: "67363f03-d903-498b-8e52-031ebb912791",
		awayMessage: "",
		name: "Super Nice Network",
		nick: "thelounge0001",
		host: "example.org",
		port: 6667,
		tls: false,
		userDisconnected: false,
		rejectUnauthorized: true,
		password: "",
		username: "thelounge",
		realname: "thelounge26",
		leaveMessage: "",
		sasl: "",
		saslAccount: "",
		saslPassword: "",
		commands: [],
		ignoreList: [],
		proxyHost: "",
		proxyPort: 1080,
		proxyUsername: "",
		proxyEnabled: false,
		proxyPassword: "",
		channels: [],
	};
	let logWarnStub: sinon.SinonStub<string[], void>;

	beforeAll(function () {
		logWarnStub = sinon.stub(log, "warn");
	});

	afterAll(function () {
		logWarnStub.restore();
	});

	it("should parse channel configuration", function () {
		const manager = new ClientManager();
		const channel: ChanConfig = {name: "AAAA!", type: "query"};
		const networkConfig: NetworkConfig = {
			...commonNetworkConfig,
			channels: [{name: "AAAA!", type: "query"}, {name: "#thelounge"}, {name: "&foobar"}],
		};
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [networkConfig],
		});

		// The client would normally do it as part of client.connect();
		// but this avoids the need to mock the irc-framework connection
		const network = client.networkFromConfig(networkConfig);

		sinon.assert.notCalled(logWarnStub);

		expect(network.channels[0].name).to.equal("Super Nice Network");
		expect(network.channels[0].type).to.equal(ChanType.LOBBY);
		expect(network.channels[1].name).to.equal("AAAA!");
		expect(network.channels[1].type).to.equal(ChanType.QUERY);
		expect(network.channels[2].name).to.equal("#thelounge");
		expect(network.channels[2].type).to.equal(ChanType.CHANNEL);
		expect(network.channels[3].name).to.equal("&foobar");
		expect(network.channels[3].type).to.equal(ChanType.CHANNEL);
	});

	it("should load the media preview blocklist", function () {
		const manager = new ClientManager();
		const networkConfig: NetworkConfig = {
			...commonNetworkConfig,
			mediaPreviewBlocklist: ["#nsfw", "SpamBot", 42 as any],
		};
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [networkConfig],
		});

		const network = client.networkFromConfig(networkConfig);

		expect(network.mediaPreviewBlocklist).to.deep.equal(["#nsfw", "SpamBot"]);
		expect(network.export().mediaPreviewBlocklist).to.deep.equal(["#nsfw", "SpamBot"]);
	});

	it("should ignore invalid channel types", function () {
		const manager = new ClientManager();
		const channel: ChanConfig = {name: "AAAA!", type: "query"};
		const networkConfig: NetworkConfig = {
			...commonNetworkConfig,
			channels: [
				{name: "AAAA!", type: "query"},
				{name: "#thelounge", type: "wrongtype"},
				{name: "&foobar"},
			],
		};
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [networkConfig],
		});

		// The client would normally do it as part of client.connect();
		// but this avoids the need to mock the irc-framework connection
		const network = client.networkFromConfig(networkConfig);

		sinon.assert.calledOnce(logWarnStub);

		expect(network.channels[0].name).to.equal("Super Nice Network");
		expect(network.channels[0].type).to.equal(ChanType.LOBBY);
		expect(network.channels[1].name).to.equal("AAAA!");
		expect(network.channels[1].type).to.equal(ChanType.QUERY);
		expect(network.channels[2].name).to.equal("&foobar");
		expect(network.channels[2].type).to.equal(ChanType.CHANNEL);
	});

	it("should read older history from the database, merged with what is in memory", function () {
		const store = new MessageStorage("testUser");
		store._enable(":memory:");
		const network = {uuid: "net"} as any;
		const chan = new Chan({id: 1, name: "#chan"});

		for (let i = 0; i < 300; i++) {
			const msg = new Msg({id: i + 1, time: new Date(1000 + i), text: `msg ${i}`});

			// one message that is never stored, like an error
			if (i !== 250) {
				store.index(network, chan, msg);
			}

			// only the newest 100 are in memory
			if (i >= 200) {
				chan.messages.push(msg);
			}
		}

		const fake = {find: () => ({network, chan}), messageProvider: store};
		const more = (data: any) => Client.prototype.more.call(fake as any, data)!;

		// back to a requested time, plus 50 messages of context
		let res = more({target: 1, lastId: 291, untilTime: 1000 + 150});
		expect(res.messages[0].text).to.equal("msg 100");
		expect(res.messages.at(-1)!.text).to.equal("msg 289");
		expect(res.messages).to.have.lengthOf(190);
		expect(res.messages).to.include(chan.messages[50]); // msg 250, only in memory
		expect(res.moreHistoryAvailable).to.be.true;

		// scrolling up continues before the oldest loaded message, to the very start
		res = more({target: 1, lastId: res.messages[0].id});
		expect(res.messages.map((m) => m.text)).to.deep.equal(
			Array.from({length: 100}, (_, i) => `msg ${i}`)
		);
		expect(res.moreHistoryAvailable).to.be.false;

		store.close();
	});
});
