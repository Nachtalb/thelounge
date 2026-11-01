import {expect} from "vitest";
import {NetworkConfig} from "../server/models/network";
import {ChanConfig} from "../server/models/chan";
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

	it("should load history back to a requested time, from the database if needed", function () {
		const store = new MessageStorage("testUser");
		store._enable(":memory:");
		const network = {uuid: "net"} as any;
		const chan = {id: 1, name: "#chan", messages: [] as Msg[]} as any;

		for (let i = 0; i < 300; i++) {
			const msg = new Msg({id: i + 1, time: new Date(1000 + i), text: `msg ${i}`});
			store.index(network, chan, msg);

			// only the newest 200 are in memory
			if (i >= 100) {
				chan.messages.push(msg);
			}
		}

		const fake = {find: () => ({network, chan}), messageProvider: store, idMsg: 1000};
		const more = (data: any) =>
			Client.prototype.more.call(fake as any, data)!.messages.map((m) => m.text);

		// target in memory: everything from 50 messages before it up to lastId
		let texts = more({target: 1, lastId: 291, untilTime: 1000 + 150});
		expect(texts[0]).to.equal("msg 100");
		expect(texts.at(-1)).to.equal("msg 289");

		// target only in the database: loaded into memory with 50 messages of context
		texts = more({target: 1, lastId: 101, untilTime: 1000 + 70});
		expect(texts[0]).to.equal("msg 20");
		expect(texts.at(-1)).to.equal("msg 99");
		expect(chan.messages).to.have.lengthOf(280);

		// scrolling up continues from the loaded messages
		texts = more({target: 1, lastId: chan.messages[0].id});
		expect(texts).to.have.lengthOf(0);

		store.close();
	});
});
