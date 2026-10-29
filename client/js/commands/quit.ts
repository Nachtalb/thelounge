import {store} from "../store";
import useCloseChannel from "../hooks/use-close-channel";

export function input(args: string[]): boolean {
	const lobby = store.state.activeChannel?.network.channels[0];

	if (!lobby) {
		return false;
	}

	// Ask for confirmation before the server removes the network
	useCloseChannel(lobby, args.join(" ").trim())();

	return true;
}
