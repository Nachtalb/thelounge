import {expect, vi} from "vitest";

const {push} = vi.hoisted(() => ({push: vi.fn(() => Promise.resolve())}));
vi.mock("../../../../client/js/router", () => ({router: {push}}));

import {input as help} from "../../../../client/js/commands/help";
import {input as settings} from "../../../../client/js/commands/settings";
import {input as network} from "../../../../client/js/commands/network";

describe("navigation commands", function () {
	beforeEach(function () {
		push.mockClear();
	});

	const cases: [string, (args: string[]) => boolean, string][] = [
		["/help", help, "Help"],
		["/settings", settings, "Appearance"],
		["/network", network, "Connect"],
	];

	for (const [command, input, route] of cases) {
		it(`${command} should open the ${route} window without hitting the server`, function () {
			expect(input([])).to.be.true;
			expect(push).toHaveBeenCalledOnce();
			expect(push).toHaveBeenCalledWith({name: route});
		});
	}

	it("/help with a topic should be sent to the IRC server", function () {
		expect(help(["nick"])).to.be.false;
		expect(push).not.toHaveBeenCalled();
	});
});
