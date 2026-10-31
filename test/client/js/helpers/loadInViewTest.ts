import {expect, vi} from "vitest";
import loadInView from "../../../../client/js/helpers/loadInView";

describe("loadInView directive", function () {
	let onVisible: (entries: unknown[]) => void;
	let onNear: (entries: unknown[]) => void;

	beforeAll(function () {
		vi.stubGlobal(
			"IntersectionObserver",
			class {
				constructor(cb: (entries: unknown[]) => void, options?: {root?: unknown}) {
					if (options?.root) {
						onNear = cb;
					} else {
						onVisible = cb;
					}
				}
				observe() {}
				unobserve() {}
			}
		);
	});

	afterAll(function () {
		vi.unstubAllGlobals();
	});

	const started: string[] = [];
	const mounted: object[] = [];
	const chat = {getBoundingClientRect: () => ({top: 0, bottom: 1000})};

	afterEach(function () {
		mounted
			.splice(0)
			.forEach((img) =>
				loadInView.beforeUnmount?.(img as never, {} as never, {} as never, null)
			);
		started.length = 0;
	});

	const row = (top = 0) => ({
		closest: () => chat,
		getBoundingClientRect: () => ({top, bottom: top + 20}),
	});

	const image = (msg: object) => {
		const attrs: Record<string, string> = {};
		const listeners: Record<string, () => void> = {};
		const img = {
			complete: false,
			closest: () => msg,
			getAttribute: (name: string) => attrs[name] ?? null,
			hasAttribute: (name: string) => name in attrs,
			removeAttribute: (name: string) => delete attrs[name],
			addEventListener: (name: string, cb: () => void) => (listeners[name] = cb),
			removeEventListener() {},
			finish() {
				img.complete = true;
				listeners.load();
			},
			set src(url: string) {
				attrs.src = url;
				started.push(url);
			},
		};
		return img;
	};

	const mount = (msg: object, value: string) => {
		const img = image(msg);
		mounted.push(img);
		loadInView.mounted?.(img as never, {value} as never, {} as never, null);
		return img;
	};

	const show = (msg: object, isIntersecting: boolean) =>
		onVisible([{target: msg, isIntersecting, boundingClientRect: {top: 0}}]);
	const near = (msg: object, isIntersecting: boolean) => onNear([{target: msg, isIntersecting}]);

	it("should load an image once its message is on screen", function () {
		const msg = row();
		const img = mount(msg, "a.avif");

		expect(img.getAttribute("src")).to.equal(null);
		show(msg, true);
		expect(img.getAttribute("src")).to.equal("a.avif");
	});

	it("should load an image before its message scrolls into view", function () {
		const msg = row(1500);
		const img = mount(msg, "b.avif");
		near(msg, true);

		expect(img.getAttribute("src")).to.equal("b.avif");
	});

	it("should preload a few nearby images at a time, nearest first", function () {
		const msgs = [row(-1200), row(1100), row(-300), row(1800)];
		const imgs = msgs.map((msg, i) => mount(msg, `${i}.avif`));
		onNear(msgs.map((target) => ({target, isIntersecting: true})));

		expect(started).to.deep.equal(["1.avif", "2.avif", "3.avif"]);
		imgs[1].finish();
		expect(started.at(-1)).to.equal("0.avif");
	});

	it("should keep downloading after leaving the zone and drop it on unmount", function () {
		const msg = row();
		const img = mount(msg, "c.avif");
		show(msg, true);
		show(msg, false);
		near(msg, false);
		expect(img.getAttribute("src")).to.equal("c.avif");

		loadInView.beforeUnmount?.(img as never, {} as never, {} as never, null);
		expect(img.hasAttribute("src")).to.equal(false);
	});

	it("should keep a loaded image on unmount", function () {
		const msg = row();
		const img = mount(msg, "d.avif");
		show(msg, true);
		img.complete = true;
		loadInView.beforeUnmount?.(img as never, {} as never, {} as never, null);

		expect(img.getAttribute("src")).to.equal("d.avif");
	});

	it("should start the topmost image on screen first", function () {
		const msgs = [row(), row()];
		msgs.forEach((msg, i) => mount(msg, `${i}.avif`));
		onVisible([
			{target: msgs[0], isIntersecting: true, boundingClientRect: {top: 500}},
			{target: msgs[1], isIntersecting: true, boundingClientRect: {top: 10}},
		]);

		expect(started).to.deep.equal(["1.avif", "0.avif"]);
	});
});
