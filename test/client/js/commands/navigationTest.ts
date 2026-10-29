import {expect, vi} from "vitest";

const {push, navigate, state} = vi.hoisted(() => ({
	push: vi.fn(() => Promise.resolve()),
	navigate: vi.fn(() => Promise.resolve()),
	state: {activeChannel: undefined as any},
}));
vi.mock("../../../../client/js/router", () => ({router: {push}, navigate}));
vi.mock("../../../../client/js/store", () => ({store: {state}}));

import {input as help} from "../../../../client/js/commands/help";
import {input as settings} from "../../../../client/js/commands/settings";
import {input as network} from "../../../../client/js/commands/network";

describe("navigation commands", function () {
	const lobby = {id: 1, name: "Libera.Chat", scrolledToBottom: false};
	const channel = {id: 2, name: "#thelounge", scrolledToBottom: false};
	const list = {scrollTop: 0, scrollHeight: 500};
	const querySelector = vi.fn(() => list);

	beforeEach(function () {
		push.mockClear();
		navigate.mockClear();
		querySelector.mockClear();
		lobby.scrolledToBottom = false;
		list.scrollTop = 0;
		state.activeChannel = {channel, network: {channels: [lobby, channel]}};
		vi.stubGlobal("document", {querySelector});
	});

	afterEach(function () {
		vi.unstubAllGlobals();
	});

	const cases: [string, (args: string[]) => boolean, string][] = [
		["/help", help, "Help"],
		["/settings", settings, "Appearance"],
		["/network", network, "Connect"],
	];

	for (const [command, input, route] of cases) {
		it(`${command} should open the ${route} window without hitting the server`, function () {
			expect(input([])).to.be.true;
			expect(push).toHaveBeenCalledOnce();
			expect(push).toHaveBeenCalledWith({name: route});
		});
	}

	it("/help with a topic should be sent to the IRC server", function () {
		expect(help(["nick"])).to.be.false;
		expect(push).not.toHaveBeenCalled();
	});

	it("/help with a topic should switch to the lobby where the reply lands", async function () {
		help(["nick"]);

		expect(navigate).toHaveBeenCalledWith("RoutedChat", {id: lobby.id});
		expect(lobby.scrolledToBottom).to.be.true;

		await vi.waitFor(() => expect(list.scrollTop).to.equal(500));
		expect(querySelector).toHaveBeenCalledWith("#chan-1 .chat");
	});

	it("/help with a topic in the lobby should only scroll it to the bottom", function () {
		state.activeChannel = {channel: lobby, network: {channels: [lobby, channel]}};

		help(["nick"]);

		expect(navigate).not.toHaveBeenCalled();
		expect(lobby.scrolledToBottom).to.be.true;
		expect(list.scrollTop).to.equal(500);
	});

	it("/help with a topic outside of a network should still be sent", function () {
		state.activeChannel = undefined;

		expect(help(["nick"])).to.be.false;
		expect(navigate).not.toHaveBeenCalled();
	});
});
