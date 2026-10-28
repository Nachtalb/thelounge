import fs from "fs";
import {expect} from "vitest";
import sinon from "ts-sinon";

import themes from "../../../server/plugins/packages/themes";

describe("themes", function () {
	afterEach(function () {
		sinon.restore();
	});

	describe(".loadLocalThemes", function () {
		it("should derive display names from hyphenated file names", function () {
			sinon
				.stub(fs, "readdirSync")
				.returns(["gruvbox-dark.css", "one-dark.css", "morning.css", "README.md"] as any);

			themes.loadLocalThemes();

			expect(themes.getByName("gruvbox-dark")?.displayName).to.equal("Gruvbox Dark");
			expect(themes.getByName("one-dark")?.displayName).to.equal("One Dark");
			expect(themes.getByName("morning")?.displayName).to.equal("Morning");
			expect(themes.getByName("README")).to.be.undefined;
		});
	});
});
