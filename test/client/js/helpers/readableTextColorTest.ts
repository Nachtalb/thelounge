import {expect} from "vitest";
import readableTextColor from "../../../../client/js/helpers/readableTextColor";

describe("readableTextColor helper", function () {
	it("should pick black on light colours", function () {
		expect(readableTextColor("#fff")).to.equal("black");
		expect(readableTextColor("#ffdc00")).to.equal("black");
		expect(readableTextColor("rgb(255, 220, 0)")).to.equal("black");
		expect(readableTextColor("rgb(170 170 170)")).to.equal("black");
		expect(readableTextColor("#2ecc40")).to.equal("black");
	});

	it("should pick white on dark colours", function () {
		expect(readableTextColor("#000")).to.equal("white");
		expect(readableTextColor("#001f3f")).to.equal("white");
		expect(readableTextColor("rgb(133, 20, 75)")).to.equal("white");
		expect(readableTextColor("rgba(0, 116, 217, 1)")).to.equal("white");
	});

	it("should pick the higher contrast around the midpoint", function () {
		// Luminance ~0.18 is where black and white contrast are equal
		expect(readableTextColor("#707070")).to.equal("white");
		expect(readableTextColor("#777")).to.equal("black");
	});

	it("should fall back to black on unparsable input", function () {
		expect(readableTextColor("")).to.equal("black");
		expect(readableTextColor("transparent")).to.equal("black");
	});
});
