import {expect, vi, beforeEach, afterEach, describe, it} from "vitest";

const {emit, state} = vi.hoisted(() => ({
	emit: vi.fn(),
	state: {activeChannel: undefined as any},
}));

vi.mock("../../../../client/js/socket", () => ({default: {emit}}));
vi.mock("../../../../client/js/store", () => ({store: {state}}));

import eventbus from "../../../../client/js/eventbus";
import {input as quit} from "../../../../client/js/commands/quit";

describe("/quit client command", function () {
	const lobby = {id: 1, name: "Libera.Chat", type: "lobby", closed: false};
	const channel = {id: 2, name: "#thelounge", type: "channel", closed: false};
	let dialog: ((confirmed: boolean) => void) | undefined;

	const onDialog = (_data: unknown, cb: (confirmed: boolean) => void) => {
		dialog = cb;
	};

	beforeEach(function () {
		emit.mockClear();
		lobby.closed = false;
		dialog = undefined;
		state.activeChannel = {channel, network: {channels: [lobby, channel]}};
		eventbus.on("confirm-dialog", onDialog);
	});

	afterEach(function () {
		eventbus.off("confirm-dialog", onDialog);
	});

	it("asks for confirmation instead of sending /quit", function () {
		expect(quit([])).to.equal(true);
		expect(dialog).to.be.a("function");
		expect(emit).not.toHaveBeenCalled();
	});

	it("keeps the network when cancelled", function () {
		quit(["bye"]);
		dialog!(false);
		expect(emit).not.toHaveBeenCalled();
		expect(lobby.closed).to.equal(false);
	});

	it("sends /quit to the lobby when confirmed", function () {
		quit([]);
		dialog!(true);
		expect(emit).toHaveBeenCalledWith("input", {target: 1, text: "/quit"});
		expect(lobby.closed).to.equal(true);
	});

	it("keeps the quit message when confirmed", function () {
		quit(["see", "you", "later"]);
		dialog!(true);
		expect(emit).toHaveBeenCalledWith("input", {target: 1, text: "/quit see you later"});
	});

	it("does nothing without an active channel", function () {
		state.activeChannel = undefined;
		expect(quit([])).to.equal(false);
		expect(dialog).to.equal(undefined);
	});
});
