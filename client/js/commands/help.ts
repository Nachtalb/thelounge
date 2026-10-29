import {nextTick} from "vue";
import {router, navigate} from "../router";
import {store} from "../store";

export function input(args: string[]): boolean {
	// "/help topic" is the IRC HELP command, let the server send it to the network
	if (args.length > 0) {
		showLobby();
		return false;
	}

	router.push({name: "Help"}).catch((e: Error) => {
		// eslint-disable-next-line no-console
		console.error(`Failed to push Help route: ${e.message}`);
	});

	return true;
}

// The server puts the HELP reply into the network lobby, so switch there and stick to the
// bottom of it: otherwise the answer lands out of sight and it looks like nothing happened.
function showLobby() {
	const lobby = store.state.activeChannel?.network.channels[0];

	if (!lobby) {
		return;
	}

	lobby.scrolledToBottom = true;

	const scrollToBottom = () => {
		const list = document.querySelector<HTMLElement>(`#chan-${lobby.id} .chat`);

		if (list) {
			list.scrollTop = list.scrollHeight;
		}
	};

	if (store.state.activeChannel?.channel === lobby) {
		scrollToBottom();
		return;
	}

	navigate("RoutedChat", {id: lobby.id})
		.then(() => nextTick())
		.then(scrollToBottom)
		.catch((e: Error) => {
			// eslint-disable-next-line no-console
			console.error(`Failed to switch to the lobby: ${e.message}`);
		});
}
