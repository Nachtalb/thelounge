import type {ObjectDirective} from "vue";

// Chat thumbnails start downloading before their message scrolls into view. Messages on screen
// load at once, top one first; messages within LOOKAHEAD above or below the screen share a few
// slots, nearest first. A message the list unmounts (scrolled well past) drops an unfinished
// download, so the thumbnails being looked at (and the image viewer) don't wait for it. The
// image stays hidden until it has loaded, so its message row is what gets observed.
const LOOKAHEAD = "100% 0px";
const SLOTS = 3;

const urls = new WeakMap<HTMLImageElement, string>();
const rows = new WeakMap<HTMLImageElement, Element>();
const rowImages = new Map<Element, Set<HTMLImageElement>>();
const visibleRows = new WeakSet<Element>();
const nearRows = new WeakSet<Element>();
const nearObservers = new WeakMap<Element, IntersectionObserver>();
let visibleObserver: IntersectionObserver | undefined;

const setSrc = (img: HTMLImageElement) => {
	const url = urls.get(img);

	if (url && img.getAttribute("src") !== url) {
		img.src = url;
	}
};

const dropSrc = (img: HTMLImageElement) => {
	if (!img.complete) {
		img.removeAttribute("src");
	}
};

const distance = (row: Element) => {
	const r = row.getBoundingClientRect();
	const view = row.closest(".chat")!.getBoundingClientRect();
	return Math.max(r.top - view.bottom, view.top - r.bottom);
};

const pump = () => {
	let loading = 0;
	const waiting: {img: HTMLImageElement; d: number}[] = [];

	for (const [row, images] of rowImages) {
		for (const img of images) {
			if (img.hasAttribute("src")) {
				loading += img.complete ? 0 : 1;
			} else if (urls.get(img) && nearRows.has(row)) {
				waiting.push({img, d: distance(row)});
			}
		}
	}

	waiting.sort((a, b) => a.d - b.d);

	for (const {img} of waiting.slice(0, Math.max(0, SLOTS - loading))) {
		setSrc(img);
	}
};

const onVisible = (entries: IntersectionObserverEntry[]) => {
	entries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

	for (const entry of entries) {
		if (entry.isIntersecting) {
			visibleRows.add(entry.target);
			rowImages.get(entry.target)?.forEach(setSrc);
		} else {
			visibleRows.delete(entry.target);
		}
	}
};

const onNear = (entries: IntersectionObserverEntry[]) => {
	for (const entry of entries) {
		if (entry.isIntersecting) {
			nearRows.add(entry.target);
		} else {
			nearRows.delete(entry.target);
		}
	}

	pump();
};

// rootMargin only widens the clip of an explicit root, so the zone is measured on the scroller.
const nearObserver = (row: Element) => {
	const root = row.closest(".chat");

	if (!root) {
		return undefined;
	}

	let observer = nearObservers.get(root);

	if (!observer) {
		observer = new IntersectionObserver(onNear, {root, rootMargin: LOOKAHEAD});
		nearObservers.set(root, observer);
	}

	return observer;
};

const loadInView: ObjectDirective<HTMLImageElement, string | undefined> = {
	mounted(el, {value}) {
		urls.set(el, value || "");
		const row = el.closest(".msg");

		if (!row || typeof IntersectionObserver === "undefined") {
			setSrc(el);
			return;
		}

		visibleObserver ||= new IntersectionObserver(onVisible);
		rows.set(el, row);
		el.addEventListener("load", pump);
		el.addEventListener("error", pump);

		if (!rowImages.has(row)) {
			rowImages.set(row, new Set());
			visibleObserver.observe(row);
			nearObserver(row)?.observe(row);
		}

		rowImages.get(row)!.add(el);

		if (visibleRows.has(row)) {
			setSrc(el);
		} else {
			pump();
		}
	},
	updated(el, {value}) {
		urls.set(el, value || "");

		if (!value) {
			el.removeAttribute("src");
		} else if (!rows.has(el) || visibleRows.has(rows.get(el)!)) {
			setSrc(el);
		} else if (el.getAttribute("src") !== value) {
			el.removeAttribute("src");
			pump();
		}
	},
	beforeUnmount(el) {
		dropSrc(el);
		el.removeEventListener("load", pump);
		el.removeEventListener("error", pump);
		const row = rows.get(el);
		const images = row && rowImages.get(row);

		if (!row || !images) {
			return;
		}

		images.delete(el);

		if (!images.size) {
			rowImages.delete(row);
			visibleObserver?.unobserve(row);
			nearObserver(row)?.unobserve(row);
		}

		pump();
	},
};

export default loadInView;
