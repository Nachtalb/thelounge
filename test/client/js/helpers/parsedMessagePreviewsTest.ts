// @vitest-environment jsdom
import {expect} from "vitest";
import {mount} from "@vue/test-utils";

// client/js/socket.ts reads this on import
document.body.dataset.transports = '["polling"]';
const {default: ParsedMessage} = await import("../../../../client/components/ParsedMessage.vue");

describe("ParsedMessage preview toggles", function () {
	const link = "https://example.com/a.png";
	const message = {text: link, previews: [{link, type: "image", size: -1}]};
	const html = (previews?: any[]) => mount(ParsedMessage, {props: {message, previews}}).html();

	it("only shows a toggle for previews the message still shows", function () {
		expect(html()).to.contain("toggle-preview");
		expect(html([])).not.to.contain("toggle-preview");
	});
});
