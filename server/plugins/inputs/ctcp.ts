import Msg from "../../models/msg";
import {PluginInputHandler} from "./index";
import {MessageType} from "../../../shared/types/msg";

const commands = ["ctcp", "ping"];

const input: PluginInputHandler = function (network, chan, cmd, args) {
	const {irc} = network;

	if (cmd === "ping") {
		if (args.length !== 1) {
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.ERROR,
					text: "Usage: /ping <nick>",
				})
			);
			return;
		}

		args = [args[0], "PING", network.addPendingPing(args[0])];
	} else if (args.length < 2) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "Usage: /ctcp <nick> <ctcp_type>",
			})
		);
		return;
	}

	const target = args.shift()!;
	const type = args.shift()!;

	chan.pushMessage(
		this,
		new Msg({
			type: MessageType.CTCP_REQUEST,
			ctcpMessage: `"${type}" to ${target}`,
			from: chan.getUser(irc.user.nick),
		})
	);

	irc.ctcpRequest(target, type, ...args);
};

export default {
	commands,
	input,
};
