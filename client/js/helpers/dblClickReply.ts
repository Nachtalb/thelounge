// Double-clicking message text selects a word, so only the time, nick and
// empty row space (incl. link preview cards) start a reply. Links, media and
// buttons keep their clicks.
export function isReplyDblClick(target: Element, overText: boolean): boolean {
	if (target.closest("a, button, img, video, audio, .reply-context")) {
		return false;
	}

	return !overText || !target.closest(".content");
}

export function isOverText(x: number, y: number): boolean {
	const node = document.caretPositionFromPoint?.(x, y)?.offsetNode;

	if (node?.nodeType !== Node.TEXT_NODE) {
		return false;
	}

	const range = document.createRange();
	range.selectNodeContents(node);
	return Array.from(range.getClientRects()).some(
		(r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
	);
}
