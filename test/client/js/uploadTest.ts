// @vitest-environment jsdom
import {expect, vi} from "vitest";

// client/js/socket.ts reads this on import
document.body.dataset.transports = '["polling"]';
const {store} = await import("../../../client/js/store");
const {default: socket} = await import("../../../client/js/socket");
const {default: upload} = await import("../../../client/js/upload");

describe("upload while disconnected", function () {
	it("keeps the file and asks for a token once connected again", async function () {
		const emit = vi.spyOn(socket, "emit").mockImplementation(() => socket);
		upload.initialize();
		store.commit("isConnected", false);
		store.commit("currentUserVisibleError", null);

		upload.triggerUpload([new File(["x"], "a.png", {type: "image/png"})]);

		expect(store.state.currentUserVisibleError).to.equal(null);
		expect(emit).not.toHaveBeenCalled();

		store.commit("isConnected", true);
		await Promise.resolve();

		expect(emit).toHaveBeenCalledWith("upload:auth");
		emit.mockRestore();
		upload.abort();
	});
});
