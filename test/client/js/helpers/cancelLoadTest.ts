import {expect, vi} from "vitest";
import cancelLoad from "../../../../client/js/helpers/cancelLoad";

describe("cancelLoad directive", function () {
	const unmount = (complete: boolean) => {
		const el = {complete, removeAttribute: vi.fn()};
		cancelLoad.beforeUnmount?.(
			el as unknown as HTMLImageElement,
			{} as never,
			{} as never,
			null
		);
		return el.removeAttribute;
	};

	it("should drop the src of an image that is still loading", function () {
		expect(unmount(false)).toHaveBeenCalledWith("src");
	});

	it("should leave loaded images alone", function () {
		expect(unmount(true)).not.toHaveBeenCalled();
	});
});
