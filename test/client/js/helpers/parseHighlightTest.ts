// @vitest-environment jsdom
import {expect, vi} from "vitest";
import {h} from "vue";
import {mount} from "@vue/test-utils";
import ParsedMessage from "../../../../client/components/ParsedMessage.vue";

vi.mock("../../../../client/js/socket", () => ({default: {on() {}, emit() {}}}));

function render(text: string, highlight?: string) {
	return mount({render: () => h("div", [h(ParsedMessage, {text, highlight})])})
		.element as HTMLElement;
}

const marks = (el: HTMLElement) => [...el.querySelectorAll("mark")].map((m) => m.textContent);

describe("search query highlight", () => {
	it("marks case-insensitive matches", () => {
		const el = render("Foo bar foo", "foo");
		expect(marks(el)).to.deep.equal(["Foo", "foo"]);
		expect(el.textContent).to.equal("Foo bar foo");
	});

	it("does nothing without a query", () => {
		expect(marks(render("foo", ""))).to.deep.equal([]);
		expect(marks(render("foo"))).to.deep.equal([]);
	});

	it("escapes regex characters", () => {
		expect(marks(render("a.b axb (c)", "a.b"))).to.deep.equal(["a.b"]);
		expect(marks(render("a.b axb (c)", "(c)"))).to.deep.equal(["(c)"]);
	});

	it("marks across IRC formatting and keeps colours", () => {
		const el = render("ab\x0304cd\x03ef", "bcd");
		expect(marks(el)).to.deep.equal(["b", "cd"]);
		expect(el.querySelector("mark .irc-fg4")!.textContent).to.equal("cd");
	});

	it("marks across a link boundary without breaking the link", () => {
		const el = render("see google.com foo bar", "com foo");
		const a = el.querySelector("a")!;
		expect(a.getAttribute("href")).to.equal("http://google.com");
		expect(a.textContent).to.equal("google.com");
		expect(a.querySelector("mark")!.textContent).to.equal("com");
		expect(marks(el)).to.deep.equal(["com", " foo"]);
	});

	it("does not treat the query as HTML", () => {
		const el = render("x <b>y</b>", "<b>");
		expect(marks(el)).to.deep.equal(["<b>"]);
		expect(el.querySelector("b")).to.equal(null);
	});
});
