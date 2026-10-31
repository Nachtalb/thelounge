import socket from "../socket";
import {store} from "../store";
import {MessageType} from "../../../shared/types/msg";
import {ChanType} from "../../../shared/types/chan";

const seenTypes = [MessageType.MESSAGE, MessageType.ACTION, MessageType.NOTICE];

socket.on("last-seen", function (data) {
	const netChan = store.getters.findChannel(data.chan);

	if (netChan) {
		netChan.channel.lastSeen = data.time;
	}
});

socket.on("msg", function (data) {
	const nick = data.msg.from?.nick?.toLowerCase();

	if (!nick || !data.msg.type || !seenTypes.includes(data.msg.type)) {
		return;
	}

	const query = store.getters
		.findChannel(data.chan)
		?.network.channels.find((c) => c.type === ChanType.QUERY && c.name.toLowerCase() === nick);

	if (query) {
		query.lastSeen = new Date(data.msg.time).getTime();
	}
});
