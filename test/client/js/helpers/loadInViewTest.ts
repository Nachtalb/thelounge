import {expect, vi} from "vitest";
import loadInView from "../../../../client/js/helpers/loadInView";

describe("loadInView directive", function () {
	let onIntersect: (entries: unknown[]) => void;

	beforeAll(function () {
		vi.stubGlobal(
			"IntersectionObserver",
			class {
				constructor(cb: (entries: unknown[]) => void) {
					onIntersect = cb;
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

	const image = (row: object) => {
		const attrs: Record<string, string> = {};
		const img = {
			complete: false,
			closest: () => row,
			getAttribute: (name: string) => attrs[name] ?? null,
			hasAttribute: (name: string) => name in attrs,
			removeAttribute: (name: string) => delete attrs[name],
			set src(url: string) {
				attrs.src = url;
				started.push(url);
			},
		};
		return img;
	};

	const mount = (img: object, value: string) =>
		loadInView.mounted?.(img as never, {value} as never, {} as never, null);

	const show = (row: object, isIntersecting: boolean) =>
		onIntersect([{target: row, isIntersecting, boundingClientRect: {top: 0}}]);

	it("should only load an image once its message is on screen", function () {
		const row = {};
		const img = image(row);
		mount(img, "a.avif");

		expect(img.getAttribute("src")).to.equal(null);
		show(row, true);
		expect(img.getAttribute("src")).to.equal("a.avif");
	});

	it("should drop an unfinished download when its message leaves the screen", function () {
		const row = {};
		const img = image(row);
		mount(img, "b.avif");
		show(row, true);
		show(row, false);

		expect(img.hasAttribute("src")).to.equal(false);
	});

	it("should keep a loaded image when its message leaves the screen", function () {
		const row = {};
		const img = image(row);
		mount(img, "c.avif");
		show(row, true);
		img.complete = true;
		show(row, false);

		expect(img.getAttribute("src")).to.equal("c.avif");
	});

	it("should start the topmost image first", function () {
		const rows = [{}, {}];
		rows.forEach((row, i) => mount(image(row), `${i}.avif`));
		started.length = 0;
		onIntersect([
			{target: rows[0], isIntersecting: true, boundingClientRect: {top: 500}},
			{target: rows[1], isIntersecting: true, boundingClientRect: {top: 10}},
		]);

		expect(started).to.deep.equal(["1.avif", "0.avif"]);
	});
});
