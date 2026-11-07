import {expect} from "vitest";
import {isSenderPreviewBlocked} from "../../../../client/js/helpers/previewFilters";

describe("isSenderPreviewBlocked", function () {
	const network = {mediaPreviewBlocklist: ["Spammer", "#memes"]};

	it("matches the sender or the channel, ignoring case", function () {
		expect(isSenderPreviewBlocked(network, "#chat", "spammer")).to.equal(true);
		expect(isSenderPreviewBlocked(network, "#MEMES", "friend")).to.equal(true);
		expect(isSenderPreviewBlocked(network, "#chat", "friend")).to.equal(false);
	});

	it("handles a missing sender, channel or network", function () {
		expect(isSenderPreviewBlocked(network, undefined, undefined)).to.equal(false);
		expect(isSenderPreviewBlocked(undefined, "#memes", "spammer")).to.equal(false);
	});
});
