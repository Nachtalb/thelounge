import {expect} from "vitest";
import {viewerSwipe} from "../../../../client/js/helpers/viewerSwipe";

describe("viewerSwipe", function () {
	const swipe = (dx: number, dy: number, movedX = 0, movedY = 0, fingers = 1, zoomed = false) =>
		viewerSwipe({dx, dy, movedX, movedY, fingers, zoomed});

	it("flips images left/right and closes on a swipe down", function () {
		expect(swipe(-100, 10)).to.equal("next");
		expect(swipe(100, -10)).to.equal("previous");
		expect(swipe(5, 120)).to.equal("close");
	});

	it("ignores short, diagonal, upward and multi-finger gestures", function () {
		expect(swipe(-30, 0)).to.equal(null);
		expect(swipe(-80, 70)).to.equal(null);
		expect(swipe(0, -120)).to.equal(null);
		expect(swipe(-100, 0, 0, 0, 2)).to.equal(null);
	});

	it("does nothing when the gesture panned a zoomed image along that axis", function () {
		expect(swipe(-100, 0, 40, 0)).to.equal(null);
		expect(swipe(0, 120, 0, 25)).to.equal(null);
		// a vertical pan doesn't block a horizontal swipe at the image's edge
		expect(swipe(-100, 10, 0, 10)).to.equal("next");
	});

	it("never closes a zoomed-in image by swiping down", function () {
		expect(swipe(0, 120, 0, 0, 1, true)).to.equal(null);
	});
});
