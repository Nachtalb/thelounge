import {nextTick, ref, watch} from "vue";
import eventbus from "../eventbus";
import {store} from "../store";
import requestOlderMessages from "./requestOlderMessages";
import type {ClientChan} from "../types";

// A message by time (+ text), or by IRCv3 msgid (only if loaded, e.g. a reply's parent)
type Target = {time?: Date | string | number; text?: string; msgid?: string};

const timeOf = (m: {time?: Date | string | number}) => new Date(m.time || 0).getTime();

// Id of the message the last jump landed on, highlighted by the message list
export const jumpTarget = ref(-1);

export function findMessage<T extends Target>(messages: T[], target: Target) {
	if (target.msgid) {
		const message = messages.find((m) => m.msgid === target.msgid);

		if (message || !target.time) {
			return message;
		}
	}

	const time = timeOf(target);
	return (
		messages.find((m) => timeOf(m) === time && m.text === target.text) ||
		messages.find((m) => timeOf(m) >= time)
	);
}

// Set while a jump loads older history, so the message list doesn't prefetch in between
export const loadingBack = ref(false);

// Load history (from the database too) until the channel reaches back to `time`
async function loadBackTo(channel: ClientChan, time: number) {
	loadingBack.value = true;

	for (
		let asked = false;
		!(channel.messages.length > 0 && timeOf(channel.messages[0]) <= time) &&
		!(asked && !channel.moreHistoryAvailable);

	) {
		if (!channel.historyLoading) {
			if (!requestOlderMessages(channel, time)) {
				break;
			}

			asked = true;
		}

		// Also wakes up on a disconnect, which drops the request
		await new Promise<void>((resolve) => {
			const stop = watch(
				() => [channel.historyLoading, store.state.isConnected],
				() => {
					stop();
					resolve();
				}
			);
		});
	}

	loadingBack.value = false;
}

// Open the channel, load history back to the message if needed, scroll to it and highlight it.
// Every jump to a message goes through here. Resolves false if the message isn't available
export default async function jumpToMessage(channel: ClientChan, target: Target) {
	// A msgid alone (a reply's parent) is only looked up in the loaded history
	if (!target.time) {
		const message = findMessage(channel.messages, target);

		if (!message) {
			return false;
		}

		target = message;
	}

	if (store.state.activeChannel?.channel !== channel) {
		// Imported here: the router imports the message list, which imports this file
		const {navigate} = await import("../router");
		await navigate("RoutedChat", {id: channel.id});
		await nextTick();
	}

	const scrolledToBottom = channel.scrolledToBottom;
	channel.scrolledToBottom = false;
	await loadBackTo(channel, timeOf(target));
	await nextTick();

	// History doesn't reach back that far (older than the database or buffer)
	const message =
		channel.messages.length > 0 && timeOf(channel.messages[0]) <= timeOf(target)
			? findMessage(channel.messages, target)
			: undefined;

	if (!message) {
		channel.scrolledToBottom = scrolledToBottom;
		return false;
	}

	// Highlight right away (the row gets it as soon as it renders), re-adding the class so
	// the animation restarts
	jumpTarget.value = -1;
	await nextTick();
	jumpTarget.value = message.id;
	eventbus.emit("scroll-to-message", message.id);
	return true;
}
