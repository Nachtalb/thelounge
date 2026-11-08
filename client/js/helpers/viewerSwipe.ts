export type ViewerSwipe = "next" | "previous" | "close";

type Gesture = {
	// finger travel from touch start to touch end
	dx: number;
	dy: number;
	// how far the gesture actually panned the (zoomed) image along each axis
	movedX: number;
	movedY: number;
	// most fingers on the screen during the gesture
	fingers: number;
	// image is larger than its fit-to-screen size
	zoomed: boolean;
};

const MIN_DISTANCE = 60;
// the image moving more than this means the finger was panning it, not swiping
const PAN_TOLERANCE = 8;

export function viewerSwipe({
	dx,
	dy,
	movedX,
	movedY,
	fingers,
	zoomed,
}: Gesture): ViewerSwipe | null {
	if (fingers !== 1) {
		return null;
	}

	const absX = Math.abs(dx);
	const absY = Math.abs(dy);

	if (absX >= MIN_DISTANCE && absX > absY * 2) {
		if (movedX > PAN_TOLERANCE) {
			return null;
		}

		return dx < 0 ? "next" : "previous";
	}

	if (dy >= MIN_DISTANCE && dy > absX * 2) {
		// Closing would throw away the zoom, even when the image is already at its top edge
		if (zoomed || movedY > PAN_TOLERANCE) {
			return null;
		}

		return "close";
	}

	return null;
}
