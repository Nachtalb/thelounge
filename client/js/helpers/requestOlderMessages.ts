import socket from "../socket";
import {store} from "../store";
import {ClientChan} from "../types";

// Ask the server for the messages before the oldest loaded one (back to untilTime if given),
// returns false if no request was sent
export default function requestOlderMessages(channel: ClientChan, untilTime?: number) {
	if (!store.state.isConnected || channel.historyLoading) {
		return false;
	}

	let lastMessage = -1;

	// Find the id of first message that isn't showInActive
	// If showInActive is set, this message is actually in another channel
	for (const message of channel.messages) {
		if (!message.showInActive) {
			lastMessage = message.id;
			break;
		}
	}

	channel.historyLoading = true;

	socket.emit("more", {
		target: channel.id,
		lastId: lastMessage,
		condensed: store.state.settings.statusMessages !== "shown",
		untilTime,
	});

	return true;
}
