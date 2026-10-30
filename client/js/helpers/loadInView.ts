import type {ObjectDirective} from "vue";

// Chat thumbnails only download while their message is on screen, top one first. Messages
// scrolled past drop an unfinished download, so the thumbnails being looked at don't wait for
// them. The image stays hidden until it has loaded, so its message row is what gets observed.
const urls = new WeakMap<HTMLImageElement, string>();
const rows = new WeakMap<HTMLImageElement, Element>();
const rowImages = new Map<Element, Set<HTMLImageElement>>();
const visibleRows = new WeakSet<Element>();
let observer: IntersectionObserver | undefined;

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

const onIntersect = (entries: IntersectionObserverEntry[]) => {
	entries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

	for (const entry of entries) {
		if (entry.isIntersecting) {
			visibleRows.add(entry.target);
		} else {
			visibleRows.delete(entry.target);
		}

		for (const img of rowImages.get(entry.target) || []) {
			if (entry.isIntersecting) {
				setSrc(img);
			} else {
				dropSrc(img);
			}
		}
	}
};

const loadInView: ObjectDirective<HTMLImageElement, string | undefined> = {
	mounted(el, {value}) {
		urls.set(el, value || "");
		const row = el.closest(".msg");

		if (!row || typeof IntersectionObserver === "undefined") {
			setSrc(el);
			return;
		}

		observer ||= new IntersectionObserver(onIntersect);
		rows.set(el, row);

		if (!rowImages.has(row)) {
			rowImages.set(row, new Set());
			observer.observe(row);
		}

		rowImages.get(row)!.add(el);

		if (visibleRows.has(row)) {
			setSrc(el);
		}
	},
	updated(el, {value}) {
		urls.set(el, value || "");

		if (!value) {
			el.removeAttribute("src");
		} else if (!rows.has(el) || visibleRows.has(rows.get(el)!)) {
			setSrc(el);
		}
	},
	beforeUnmount(el) {
		dropSrc(el);
		const row = rows.get(el);
		const images = row && rowImages.get(row);

		if (!row || !images) {
			return;
		}

		images.delete(el);

		if (!images.size) {
			rowImages.delete(row);
			observer?.unobserve(row);
		}
	},
};

export default loadInView;
