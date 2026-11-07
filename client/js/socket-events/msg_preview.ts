import socket from "../socket";
import {store} from "../store";

socket.on("msg:preview", function (data) {
	const netChan = store.getters.findChannel(data.chan);
	const message = netChan?.channel.messages.find((m) => m.id === data.id);

	if (!message || !message.previews) {
		return;
	}

	const previewIndex = message.previews.findIndex((m) => m.link === data.preview.link);

	if (previewIndex > -1) {
		message.previews[previewIndex] = data.preview;
	} else {
		// Previews fetched after the fact, e.g. for a sender whose previews were enabled again
		message.previews.push(data.preview);
	}
});
