import {expect} from "vitest";
import Config from "../../server/config";

describe("Config.getLeaveMessage", function () {
	const oldDefault = "The Lounge - https://thelounge.chat";
	const newDefault =
		"The Lounge, maintained out of spite - https://github.com/Nachtalb/thelounge";
	let saved: string;

	beforeEach(function () {
		saved = Config.values.leaveMessage;
	});

	afterEach(function () {
		Config.values.leaveMessage = saved;
	});

	it("replaces the old upstream default in config.js with the new default", function () {
		Config.values.leaveMessage = oldDefault;
		expect(Config.getLeaveMessage("")).to.equal(newDefault);
	});

	it("uses the new default when config.js leaves it empty", function () {
		Config.values.leaveMessage = "";
		expect(Config.getLeaveMessage("")).to.equal(newDefault);
	});

	it("keeps a custom config.js message", function () {
		Config.values.leaveMessage = "bye";
		expect(Config.getLeaveMessage("")).to.equal("bye");
	});

	it("treats a network saved with the old default as empty", function () {
		Config.values.leaveMessage = "bye";
		expect(Config.getLeaveMessage(oldDefault)).to.equal("bye");
	});

	it("keeps a custom network message", function () {
		Config.values.leaveMessage = oldDefault;
		expect(Config.getLeaveMessage("cya")).to.equal("cya");
	});
});
