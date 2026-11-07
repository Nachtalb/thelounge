// @vitest-environment jsdom
import {expect} from "vitest";

// client/js/socket.ts reads this on import
document.body.dataset.transports = '["polling"]';
const {store} = await import("../../../../client/js/store");
const {default: socket} = await import("../../../../client/js/socket");
await import("../../../../client/js/socket-events/msg_preview");

describe("msg:preview", function () {
	it("adds a preview the message did not have yet", function () {
		const message = {id: 5, previews: [] as any[]};
		store.state.networks = [{channels: [{id: 3, messages: [message]}]}] as any;
		const preview = {link: "https://example.com/", type: "loading"};

		(socket as any).listeners("msg:preview")[0]({id: 5, chan: 3, preview});

		expect(message.previews).to.deep.equal([preview]);
	});
});
