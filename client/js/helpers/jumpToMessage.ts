import {nextTick, ref, watch} from "vue";
import eventbus from "../eventbus";
import {store} from "../store";
import requestOlderMessages from "./requestOlderMessages";
import type {ClientChan} from "../types";

type Target = {time: Date | string | number; text?: string};

const timeOf = (m: {time: Date | string | number}) => new Date(m.time).getTime();

// Id of the message the last jump landed on, highlighted by the message list
export const jumpTarget = ref(-1);

export function findMessage<T extends Target>(messages: T[], target: Target) {
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

// Open the channel, load history back to the message if needed and scroll to it
export default async function jumpToMessage(channel: ClientChan, target: Target) {
	if (store.state.activeChannel?.channel !== channel) {
		// Imported here: the router imports the message list, which imports this file
		const {navigate} = await import("../router");
		await navigate("RoutedChat", {id: channel.id});
		await nextTick();
	}

	channel.scrolledToBottom = false;
	await loadBackTo(channel, timeOf(target));
	await nextTick();

	const message = findMessage(channel.messages, target);

	if (!message) {
		return;
	}

	// Highlight right away (the row gets it as soon as it renders), re-adding the class so
	// the animation restarts
	jumpTarget.value = -1;
	await nextTick();
	jumpTarget.value = message.id;
	eventbus.emit("scroll-to-message", message.id);
}
