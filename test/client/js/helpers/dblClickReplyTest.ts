// @vitest-environment jsdom
import {expect} from "vitest";
import {isReplyDblClick} from "../../../../client/js/helpers/dblClickReply";

describe("dblClickReply helper", function () {
	const row = document.createElement("div");
	row.innerHTML =
		'<span class="time">12:00</span><span class="from">nick</span>' +
		'<span class="content"><span class="text">hi</span><a href="#">link</a>' +
		'<div class="preview"><a class="toggle-thumbnail"><img></a><div class="body">desc</div></div></span>';
	const q = (s: string) => row.querySelector(s)!;

	it("should reply from the time and nick columns, even over their text", function () {
		expect(isReplyDblClick(q(".time"), true)).to.be.true;
		expect(isReplyDblClick(q(".from"), true)).to.be.true;
	});

	it("should reply from empty space in the message", function () {
		expect(isReplyDblClick(q(".content"), false)).to.be.true;
	});

	it("should keep word selection on message text", function () {
		expect(isReplyDblClick(q(".text"), true)).to.be.false;
		expect(isReplyDblClick(q(".content"), true)).to.be.false;
	});

	it("should ignore links", function () {
		expect(isReplyDblClick(q("a"), false)).to.be.false;
	});

	it("should reply from preview card space but not its text or thumbnail", function () {
		expect(isReplyDblClick(q(".preview"), false)).to.be.true;
		expect(isReplyDblClick(q(".preview .body"), true)).to.be.false;
		expect(isReplyDblClick(q(".preview img"), false)).to.be.false;
	});
});
