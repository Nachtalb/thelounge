import {expect} from "vitest";
import {
	canStartSwipe,
	detectSwipeAxis,
	isSwipeReply,
	swipeOffset,
	SWIPE_MAX_OFFSET,
} from "../../../../client/js/helpers/swipeToReply";

describe("swipeToReply helper", function () {
	describe("canStartSwipe", function () {
		it("should allow replyable messages away from the left edge", function () {
			expect(canStartSwipe({startX: 200, canReply: true, sidebarOverlayOpen: false})).to.be
				.true;
		});

		it("should ignore non-replyable messages", function () {
			expect(canStartSwipe({startX: 200, canReply: false, sidebarOverlayOpen: false})).to.be
				.false;
		});

		it("should ignore touches starting at the left edge", function () {
			expect(canStartSwipe({startX: 10, canReply: true, sidebarOverlayOpen: false})).to.be
				.false;
		});

		it("should ignore touches while the sidebar overlays the chat", function () {
			expect(canStartSwipe({startX: 200, canReply: true, sidebarOverlayOpen: true})).to.be
				.false;
		});
	});

	describe("detectSwipeAxis", function () {
		it("should wait until the touch moved far enough", function () {
			expect(detectSwipeAxis(-5, 2)).to.equal("pending");
			expect(detectSwipeAxis(0, 0)).to.equal("pending");
		});

		it("should lock horizontally for a dominant right-to-left move", function () {
			expect(detectSwipeAxis(-20, 5)).to.equal("horizontal");
			expect(detectSwipeAxis(-16, -10)).to.equal("horizontal");
		});

		it("should not engage for diagonal or vertical moves", function () {
			expect(detectSwipeAxis(-15, 10)).to.equal("vertical");
			expect(detectSwipeAxis(-3, 30)).to.equal("vertical");
			expect(detectSwipeAxis(0, -12)).to.equal("vertical");
		});

		it("should leave left-to-right moves to the sidebar", function () {
			expect(detectSwipeAxis(30, 0)).to.equal("vertical");
		});
	});

	describe("swipeOffset", function () {
		it("should follow the finger to the left and never to the right", function () {
			expect(swipeOffset(-30)).to.equal(-30);
			expect(swipeOffset(25)).to.equal(0);
		});

		it("should be capped", function () {
			expect(swipeOffset(-500)).to.equal(-SWIPE_MAX_OFFSET);
		});
	});

	describe("isSwipeReply", function () {
		it("should trigger past the threshold only", function () {
			expect(isSwipeReply(-59)).to.be.false;
			expect(isSwipeReply(-60)).to.be.true;
			expect(isSwipeReply(-200)).to.be.true;
			expect(isSwipeReply(60)).to.be.false;
		});
	});
});
