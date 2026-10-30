<template>
	<div ref="chat" class="chat" tabindex="-1">
		<div v-show="channel.moreHistoryAvailable" class="show-more">
			<button
				ref="loadMoreButton"
				:disabled="channel.historyLoading || !store.state.isConnected"
				class="btn"
				@click="onShowMoreClick"
			>
				<span v-if="channel.historyLoading">Loading…</span>
				<span v-else>Show older messages</span>
			</button>
		</div>
		<div
			class="messages"
			role="log"
			aria-live="polite"
			aria-relevant="additions"
			@copy="onCopy"
		>
			<Virtualizer
				v-if="chat"
				:key="channel.id"
				ref="virtualizer"
				:data="condensedMessages"
				:scroll-ref="chat"
				:start-margin="startMargin"
				:shift="shift"
				:buffer-size="1000"
				@resize="onResize"
			>
				<template v-slot:default="{item: message, index: id}">
					<div :key="rowKey(message)">
						<DateMarker
							v-if="shouldDisplayDateMarker(message, id)"
							:message="message as any"
							:focused="message.id === focused"
						/>
						<div v-if="id === unreadMarkerIndex" class="unread-marker">
							<span class="unread-marker-text" />
						</div>

						<MessageCondensed
							v-if="message.type === 'condensed'"
							:network="network"
							:keep-scroll-position="keepScrollPosition"
							:messages="message.messages"
							:focused="message.id === focused"
						/>
						<Message
							v-else
							:channel="channel"
							:network="network"
							:message="message"
							:keep-scroll-position="keepScrollPosition"
							:is-previous-source="isPreviousSource(message, id)"
							:focused="message.id === focused"
							:highlight="
								channel.id === chatSearch.chanId ? searchHighlight : undefined
							"
							:class="{'jump-target': message.id === jumpTarget}"
							@toggle-link-preview="onLinkPreviewToggle"
						/>
					</div>
				</template>
			</Virtualizer>
		</div>
	</div>
</template>

<script lang="ts">
import {condensedTypes} from "../../shared/irc";
import {ChanType} from "../../shared/types/chan";
import {MessageType, SharedMsg} from "../../shared/types/msg";
import eventbus from "../js/eventbus";
import clipboard from "../js/clipboard";
import requestOlderMessages from "../js/helpers/requestOlderMessages";
import {jumpTarget, loadingBack} from "../js/helpers/jumpToMessage";
import {chatSearch, searchHighlight} from "../js/helpers/chatSearch";
import socket from "../js/socket";
import Message from "./Message.vue";
import MessageCondensed from "./MessageCondensed.vue";
import DateMarker from "./DateMarker.vue";
import {Virtualizer} from "virtua/vue";
import {
	computed,
	defineComponent,
	nextTick,
	onBeforeUnmount,
	onMounted,
	onUnmounted,
	PropType,
	ref,
	watch,
} from "vue";
import {useStore} from "../js/store";
import {ClientChan, ClientMessage, ClientNetwork, ClientLinkPreview} from "../js/types";

type CondensedMessageContainer = {
	type: "condensed";
	time: Date;
	messages: ClientMessage[];
	id?: number;
};

export default defineComponent({
	name: "MessageList",
	components: {
		Message,
		MessageCondensed,
		DateMarker,
		Virtualizer,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
		focused: Number,
	},
	setup(props) {
		const store = useStore();

		const chat = ref<HTMLDivElement | null>(null);
		const loadMoreButton = ref<HTMLButtonElement | null>(null);
		const historyObserver = ref<IntersectionObserver | null>(null);
		const virtualizer = ref<InstanceType<typeof Virtualizer> | null>(null);
		const startMargin = ref(0);
		const shift = ref(false);

		const isWaitingForNextTick = ref(false);

		const jumpToBottom = () => {
			props.channel.scrolledToBottom = true;

			const el = chat.value;

			if (el) {
				el.scrollTop = el.scrollHeight;
			}
		};

		const onShowMoreClick = () => {
			requestOlderMessages(props.channel);
		};

		const onLoadButtonObserved = (entries: IntersectionObserverEntry[]) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) {
					return;
				}

				onShowMoreClick();
			});
		};

		nextTick(() => {
			if (!chat.value) {
				return;
			}

			if (window.IntersectionObserver) {
				historyObserver.value = new window.IntersectionObserver(onLoadButtonObserved, {
					root: chat.value,
				});
			}

			jumpToBottom();
		}).catch((e) => {
			// eslint-disable-next-line no-console
			console.error("Error in new IntersectionObserver", e);
		});

		const condensedMessages = computed(() => {
			if (props.channel.type !== ChanType.CHANNEL && props.channel.type !== ChanType.QUERY) {
				return props.channel.messages;
			}

			// If actions are hidden, just return a message list with them excluded
			if (store.state.settings.statusMessages === "hidden") {
				return props.channel.messages.filter(
					(message) => !condensedTypes.has(message.type || "")
				);
			}

			// If actions are not condensed, just return raw message list
			if (store.state.settings.statusMessages !== "condensed") {
				return props.channel.messages;
			}

			let lastCondensedContainer: CondensedMessageContainer | null = null;

			const condensed: (ClientMessage | CondensedMessageContainer)[] = [];

			for (const message of props.channel.messages) {
				// If this message is not condensable, or its an action affecting our user,
				// then just append the message to container and be done with it
				if (message.self || message.highlight || !condensedTypes.has(message.type || "")) {
					lastCondensedContainer = null;

					condensed.push(message);

					continue;
				}

				if (!lastCondensedContainer) {
					lastCondensedContainer = {
						time: message.time,
						type: "condensed",
						messages: [],
					};

					condensed.push(lastCondensedContainer);
				}

				lastCondensedContainer!.messages.push(message);

				// Set id of the condensed container to last message id,
				// which is required for the unread marker to work correctly
				lastCondensedContainer!.id = message.id;

				// If this message is the unread boundary, create a split condensed container
				if (message.id === props.channel.firstUnread) {
					lastCondensedContainer = null;
				}
			}

			return condensed.map((message) => {
				// Skip condensing single messages, it doesn't save any
				// space but makes useful information harder to see
				if (message.type === "condensed" && message.messages.length === 1) {
					return message.messages[0];
				}

				return message;
			});
		});

		const shouldDisplayDateMarker = (
			message: SharedMsg | CondensedMessageContainer,
			id: number
		) => {
			const previousMessage = condensedMessages.value[id - 1];

			if (!previousMessage) {
				return true;
			}

			const oldDate = new Date(previousMessage.time);
			const newDate = new Date(message.time);

			return (
				oldDate.getDate() !== newDate.getDate() ||
				oldDate.getMonth() !== newDate.getMonth() ||
				oldDate.getFullYear() !== newDate.getFullYear()
			);
		};

		const unreadMarkerIndex = computed(() =>
			condensedMessages.value.findIndex((m) => Number(m.id) > props.channel.firstUnread)
		);

		const rowKey = (message: ClientMessage | CondensedMessageContainer) =>
			message.type === "condensed" ? message.messages[0].id : message.id;

		// Tell the virtualizer when older messages were prepended so it keeps the position
		watch(
			() => {
				const m = condensedMessages.value;
				return m.length ? [rowKey(m[0]), rowKey(m[m.length - 1])] : [];
			},
			(keys, old) => {
				shift.value = !!old.length && keys[0] !== old[0] && keys[1] === old[1];
			},
			{flush: "pre"}
		);

		const isPreviousSource = (currentMessage: ClientMessage, id: number) => {
			const previousMessage = condensedMessages.value[id - 1];
			return (
				previousMessage &&
				currentMessage.type === MessageType.MESSAGE &&
				previousMessage.type === MessageType.MESSAGE &&
				currentMessage.from &&
				previousMessage.from &&
				currentMessage.from.nick === previousMessage.from.nick
			);
		};

		const onCopy = () => {
			if (chat.value) {
				clipboard(chat.value);
			}
		};

		const keepScrollPosition = async () => {
			// If we are already waiting for the next tick to force scroll position,
			// we have no reason to perform more checks and set it again in the next tick
			if (isWaitingForNextTick.value) {
				return;
			}

			const el = chat.value;

			if (!el) {
				return;
			}

			// Older messages are kept in place by the virtualizer (shift)
			if (!props.channel.scrolledToBottom) {
				return;
			}

			isWaitingForNextTick.value = true;
			await nextTick();
			isWaitingForNextTick.value = false;

			jumpToBottom();
		};

		const onLinkPreviewToggle = async (preview: ClientLinkPreview, message: ClientMessage) => {
			await keepScrollPosition();

			// Tell the server we're toggling so it remembers at page reload
			socket.emit("msg:preview:toggle", {
				target: props.channel.id,
				msgId: message.id,
				link: preview.link,
				shown: preview.shown,
			});
		};

		let lastScrollTop = 0;
		let jumping = 0; // id of the running scrollToMessage, 0 = none

		// Ask for older messages well before the top is reached (slow connections),
		// one request at a time and again as soon as one lands
		const loadOlderIfNear = () => {
			const el = chat.value;

			if (
				el &&
				!jumping &&
				!loadingBack.value &&
				!props.channel.scrolledToBottom &&
				props.channel.moreHistoryAvailable &&
				!props.channel.historyLoading &&
				el.scrollTop < el.clientHeight * 3
			) {
				requestOlderMessages(props.channel);
			}
		};

		watch(
			() => props.channel.historyLoading,
			(loading) => !loading && loadOlderIfNear()
		);

		const handleScroll = () => {
			const el = chat.value;

			if (!el) {
				return;
			}

			// The virtualizer scrolls down when rows above the view grow (e.g. narrower window),
			// only scrolling up leaves the bottom
			const scrolledUp = el.scrollTop < lastScrollTop;
			lastScrollTop = el.scrollTop;

			if (props.channel.scrolledToBottom && !scrolledUp) {
				jumpToBottom();
				return;
			}

			props.channel.scrolledToBottom = el.scrollHeight - el.scrollTop - el.offsetHeight <= 30;
			loadOlderIfNear();
		};

		const handleResize = () => {
			// Keep message list scrolled to bottom on resize
			if (props.channel.scrolledToBottom) {
				jumpToBottom();
			}
		};

		// Rows are measured once rendered (images, previews), so stick to the bottom again
		const onResize = () => {
			const list = virtualizer.value?.$el as HTMLElement | undefined;

			if (list && chat.value) {
				startMargin.value =
					list.getBoundingClientRect().top -
					chat.value.getBoundingClientRect().top +
					chat.value.scrollTop;
			}

			void keepScrollPosition();
		};

		// Resolves once the list stopped scrolling
		const settled = () =>
			new Promise<void>((resolve) => {
				const el = chat.value;
				let timer = 0;

				const onScroll = () => {
					clearTimeout(timer);
					timer = window.setTimeout(() => {
						el?.removeEventListener("scroll", onScroll);
						resolve();
					}, 150);
				};

				el?.addEventListener("scroll", onScroll, {passive: true});
				onScroll();
			});

		// Only rows near the viewport are rendered, so let the virtualizer scroll to the row.
		// Eases the last bit (all of it within two screens, else half a screen) relative to
		// the row, so rows loading or resizing on the way can't throw it off; instant with
		// reduced motion. Returns the element once landed (e.g. to highlight it)
		const scrollToMessage = async (id: number) => {
			const index = condensedMessages.value.findIndex(
				(m) =>
					m.id === id || (m.type === "condensed" && m.messages.some((c) => c.id === id))
			);
			const v = virtualizer.value;

			if (index < 0 || !v) {
				return null;
			}

			const jump = ++jumping;
			const stop = () => (jumping = 0);
			props.channel.scrolledToBottom = false;
			chat.value?.addEventListener("wheel", stop, {passive: true, once: true});
			chat.value?.addEventListener("touchstart", stop, {passive: true, once: true});

			const viewport = v.viewportSize;
			const centre =
				startMargin.value + v.getItemOffset(index) + (v.getItemSize(index) - viewport) / 2;
			const distance = v.scrollOffset - centre;
			const from = window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? 0
				: Math.abs(distance) > 2 * viewport
				? (Math.sign(distance) * viewport) / 2
				: distance;
			const start = performance.now();

			for (let t = from ? 0 : 1; jump === jumping; ) {
				v.scrollToIndex(index, {align: "center", offset: from * (1 - t) ** 3});

				if (t === 1) {
					break;
				}

				await new Promise(requestAnimationFrame);
				t = Math.min(1, (performance.now() - start) / 300);
			}

			await settled();
			chat.value?.removeEventListener("wheel", stop);
			chat.value?.removeEventListener("touchstart", stop);

			if (jump !== jumping) {
				return null;
			}

			jumping = 0;
			loadOlderIfNear();
			return document.getElementById(`msg-${id}`);
		};

		const onScrollToMessage = (id: number, done?: (el: HTMLElement) => void) => {
			void scrollToMessage(id).then((el) => el && done?.(el));
		};

		onMounted(() => {
			chat.value?.addEventListener("scroll", handleScroll, {passive: true});

			eventbus.on("resize", handleResize);
			eventbus.on("scroll-to-message", onScrollToMessage);

			void nextTick(() => {
				if (historyObserver.value && loadMoreButton.value) {
					historyObserver.value.observe(loadMoreButton.value);
				}
			});
		});

		watch(
			() => props.channel.id,
			() => {
				props.channel.scrolledToBottom = true;

				// Re-add the intersection observer to trigger the check again on channel switch
				// Otherwise if last channel had the button visible, switching to a new channel won't trigger the history
				if (historyObserver.value && loadMoreButton.value) {
					historyObserver.value.unobserve(loadMoreButton.value);
					historyObserver.value.observe(loadMoreButton.value);
				}
			}
		);

		watch(
			() => props.channel.messages.length,
			async () => {
				await keepScrollPosition();
			}
		);

		watch(
			() => props.channel.pendingMessage,
			async () => {
				// Keep the scroll stuck when input gets resized while typing
				await keepScrollPosition();
			}
		);

		onBeforeUnmount(() => {
			eventbus.off("resize", handleResize);
			eventbus.off("scroll-to-message", onScrollToMessage);
			chat.value?.removeEventListener("scroll", handleScroll);
		});

		onUnmounted(() => {
			if (historyObserver.value) {
				historyObserver.value.disconnect();
			}
		});

		return {
			chat,
			store,
			chatSearch,
			searchHighlight,
			jumpTarget,
			onShowMoreClick,
			loadMoreButton,
			onCopy,
			condensedMessages,
			shouldDisplayDateMarker,
			unreadMarkerIndex,
			rowKey,
			virtualizer,
			startMargin,
			shift,
			onResize,
			scrollToMessage,
			keepScrollPosition,
			isPreviousSource,
			jumpToBottom,
			onLinkPreviewToggle,
		};
	},
});
</script>
