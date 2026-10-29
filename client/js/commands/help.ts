import {router} from "../router";

export function input(args: string[]): boolean {
	// "/help topic" is the IRC HELP command, let the server send it to the network
	if (args.length > 0) {
		return false;
	}

	router.push({name: "Help"}).catch((e: Error) => {
		// eslint-disable-next-line no-console
		console.error(`Failed to push Help route: ${e.message}`);
	});

	return true;
}
