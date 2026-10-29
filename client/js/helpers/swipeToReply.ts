// Distance in px a touch has to travel before we decide whether it is a
// horizontal swipe or a vertical scroll.
export const SWIPE_LOCK_DISTANCE = 10;
// Horizontal distance in px a swipe has to reach to trigger a reply.
export const SWIPE_REPLY_THRESHOLD = 60;
// Touches starting this close to the left screen edge belong to the sidebar.
export const SWIPE_EDGE_GUARD = 30;
// The message never follows the finger further than this.
export const SWIPE_MAX_OFFSET = 80;

export type SwipeAxis = "pending" | "horizontal" | "vertical";

export function canStartSwipe(opts: {
	startX: number;
	canReply: boolean;
	sidebarOverlayOpen: boolean;
}): boolean {
	return opts.canReply && !opts.sidebarOverlayOpen && opts.startX > SWIPE_EDGE_GUARD;
}

// Only right-to-left movement where the horizontal component clearly dominates
// counts as a swipe; everything else is left to the browser (scrolling) or
// the sidebar gesture (left-to-right).
export function detectSwipeAxis(dx: number, dy: number): SwipeAxis {
	if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK_DISTANCE) {
		return "pending";
	}

	if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5) {
		return "horizontal";
	}

	return "vertical";
}

// Translation to apply to the message: never to the right, capped on the left.
export function swipeOffset(dx: number): number {
	return Math.max(-SWIPE_MAX_OFFSET, Math.min(0, dx));
}

export function isSwipeReply(dx: number): boolean {
	return dx <= -SWIPE_REPLY_THRESHOLD;
}
