import {router} from "../router";

export function input(): boolean {
	router.push({name: "Appearance"}).catch((e: Error) => {
		// eslint-disable-next-line no-console
		console.error(`Failed to push Appearance route: ${e.message}`);
	});

	return true;
}
