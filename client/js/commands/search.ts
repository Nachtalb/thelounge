import {store} from "../store";
import {search} from "../helpers/chatSearch";

export function input(args: string[]): boolean {
	const active = store.state.activeChannel;

	if (!store.state.settings.searchEnabled || !active) {
		return false;
	}

	void search(active.network, active.channel, args.join(" ").trim());
	return true;
}
