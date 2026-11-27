// @vitest-environment jsdom
import {expect, vi} from "vitest";

// client/js/socket.ts reads this on import
document.body.dataset.transports = '["polling"]';
const {store} = await import("../../../client/js/store");
const {default: socket} = await import("../../../client/js/socket");
const {default: upload, pastedJpegName} = await import("../../../client/js/upload");

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

describe("pasted images", function () {
	it("uploads PNGs as JPEG and leaves other types alone", function () {
		expect(pastedJpegName(new File(["x"], "image.png", {type: "image/png"}))).to.equal(
			"image.jpg"
		);
		expect(pastedJpegName(new File(["x"], "a.jpg", {type: "image/jpeg"}))).to.equal(null);
	});
});
