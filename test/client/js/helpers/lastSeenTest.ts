import {expect} from "vitest";
import lastSeen from "../../../../client/js/helpers/lastSeen";

describe("lastSeen helper", () => {
	const now = new Date(2026, 9, 31, 18, 30).getTime();
	const at = (...args: [number, number, number, number, number]) => new Date(...args).getTime();

	it("uses relative minutes within the hour", () => {
		expect(lastSeen(now - 20000, now)).to.equal("last seen just now");
		expect(lastSeen(now - 60000, now)).to.equal("last seen 1 minute ago");
		expect(lastSeen(now - 5 * 60000, now)).to.equal("last seen 5 minutes ago");
	});

	it("uses the clock time for older messages", () => {
		expect(lastSeen(at(2026, 9, 31, 14, 2), now)).to.equal("last seen today at 14:02");
		expect(lastSeen(at(2026, 9, 30, 14, 2), now)).to.equal("last seen yesterday at 14:02");
		expect(lastSeen(at(2026, 9, 30, 14, 2), now, true)).to.equal(
			"last seen yesterday at 2:02 PM"
		);
		expect(lastSeen(at(2026, 2, 3, 9, 5), now)).to.equal("last seen 3 Mar at 09:05");
		expect(lastSeen(at(2025, 2, 3, 9, 5), now)).to.equal("last seen 3 Mar 2025 at 09:05");
	});
});
