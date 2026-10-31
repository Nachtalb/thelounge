// Where a sticker is relative to the screen: `near` (within half a box of its scroller's edges,
// time to load it) and `visible` (on screen: play it). Chat stickers have no scroller of their own:
// for them near = visible, like the chat's link previews. One observer pair per scroller.
type Callback = (near: boolean, visible: boolean) => void;
type Observers = {near: IntersectionObserver; visible: IntersectionObserver};
type Item = {callback: Callback; near: boolean; visible: boolean};

const SCROLLERS =
	".sticker-picker-scroll, .sticker-picker-tabs, .sticker-pack-body, .sticker-suggest";
const items = new WeakMap<Element, Item>();
const byScroller = new WeakMap<Element, Observers>();
let viewport: Observers | undefined;

function observers(root: Element | null): Observers {
	const existing = root ? byScroller.get(root) : viewport;

	if (existing) {
		return existing;
	}

	const make = (key: "near" | "visible", rootMargin: string) =>
		new IntersectionObserver(
			(entries) => {
				// Top (left) first, so the first ones on screen are asked for first
				entries.sort(
					(a, b) =>
						a.boundingClientRect.top - b.boundingClientRect.top ||
						a.boundingClientRect.left - b.boundingClientRect.left
				);

				for (const entry of entries) {
					const item = items.get(entry.target);

					if (item && item[key] !== entry.isIntersecting) {
						item[key] = entry.isIntersecting;
						item.callback(item.near || item.visible, item.visible);
					}
				}
			},
			{root, rootMargin}
		);

	const pair = {near: make("near", root ? "50%" : "0px"), visible: make("visible", "0px")};

	if (root) {
		byScroller.set(root, pair);
	} else {
		viewport = pair;
	}

	return pair;
}

export function watchInView(el: Element, callback: Callback): () => void {
	if (typeof IntersectionObserver === "undefined") {
		callback(true, true);
		return () => undefined;
	}

	const pair = observers(el.closest(SCROLLERS));
	items.set(el, {callback, near: false, visible: false});
	pair.near.observe(el);
	pair.visible.observe(el);

	return () => {
		pair.near.unobserve(el);
		pair.visible.unobserve(el);
		items.delete(el);
	};
}
