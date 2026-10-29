import {router} from "../router";

export function input(): boolean {
	router.push({name: "Connect"}).catch((e: Error) => {
		// eslint-disable-next-line no-console
		console.error(`Failed to push Connect route: ${e.message}`);
	});

	return true;
}
