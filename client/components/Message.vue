<template>
	<div
		:id="'msg-' + message.id"
		ref="msgEl"
		:class="[
			'msg',
			{
				self: message.self,
				highlight: message.highlight || focused,
				'previous-source': isPreviousSource,
				swiping: swiping,
			},
		]"
		:data-type="message.type"
		:data-command="message.command"
		:data-from="message.from && message.from.nick"
		:data-msgid="message.msgid"
		@touchstart.passive="onTouchStart"
		@touchend="onTouchEnd"
		@touchmove.passive="onTouchMove"
		@touchcancel="onTouchCancel"
		@dblclick="onDblClick"
	>
		<span
			aria-hidden="true"
			:aria-label="messageTimeLocale"
			class="time tooltipped tooltipped-e"
			>{{ `${messageTime}&#32;` }}
		</span>
		<template v-if="message.type === 'unhandled'">
			<span class="from">[{{ message.command }}]</span>
			<span class="content">
				<span v-for="(param, id) in message.params" :key="id">{{
					`&#32;${param}&#32;`
				}}</span>
			</span>
		</template>
		<template v-else-if="isAction()">
			<span class="from"><span class="only-copy" aria-hidden="true">***&nbsp;</span></span>
			<component :is="messageComponent" :network="network" :message="message" />
		</template>
		<template v-else-if="message.type === 'action'">
			<span class="from"><span class="only-copy">*&nbsp;</span></span>
			<span class="content" dir="auto">
				<ReplyContext
					v-if="message.replyTo"
					:message="message"
					:parent-in-history="parentInHistory"
					:media="parentMedia"
					@scroll-to-parent="scrollToParent"
				/>
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<Username
					:user="message.from"
					:network="network"
					:channel="channel"
					dir="auto"
				/>&#32;<ParsedMessage :message="message" />
				<LinkPreview
					v-for="preview in previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
		<template v-else>
			<span v-if="message.type === 'message'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">&lt;</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">&gt;&nbsp;</span>
				</template>
			</span>
			<span v-else-if="message.type === 'plugin'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">[</span>
					{{ message.from.nick }}
					<span class="only-copy" aria-hidden="true">]&nbsp;</span>
				</template>
			</span>
			<span v-else class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">-</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">-&nbsp;</span>
				</template>
			</span>
			<span class="content" dir="auto">
				<ReplyContext
					v-if="message.replyTo"
					:message="message"
					:parent-in-history="parentInHistory"
					:media="parentMedia"
					@scroll-to-parent="scrollToParent"
				/>
				<span
					v-if="message.showInActive"
					aria-label="This message was shown in your active channel"
					class="msg-shown-in-active tooltipped tooltipped-e"
					><span></span
				></span>
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<StickerMessage v-if="sticker" :sticker="sticker" :text="message.text" />
				<template v-else>
					<ParsedMessage :network="network" :message="message" :highlight="highlight" />
					<LinkPreview
						v-for="preview in previews"
						:key="preview.link"
						:keep-scroll-position="keepScrollPosition"
						:link="preview"
						:channel="channel"
					/>
				</template>
			</span>
		</template>
		<span v-if="swiping" class="msg-swipe-reply" aria-hidden="true" />
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, onBeforeUnmount, PropType, ref} from "vue";
import dayjs from "dayjs";

import constants from "../js/constants";
import localetime from "../js/helpers/localetime";
import eventbus from "../js/eventbus";
import {
	canStartSwipe,
	detectSwipeAxis,
	isSwipeReply,
	swipeOffset,
	SwipeAxis,
	SWIPE_REPLY_THRESHOLD,
} from "../js/helpers/swipeToReply";
import {isOverText, isReplyDblClick} from "../js/helpers/dblClickReply";
import Username from "./Username.vue";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import ReplyContext from "./ReplyContext.vue";
import jumpToMessage from "../js/helpers/jumpToMessage";
import {replyMedia} from "../js/helpers/replyMedia";
import MessageTypes from "./MessageTypes";
import StatusmsgMarker from "./StatusmsgMarker.vue";
import StickerMessage from "./StickerMessage.vue";
import {proxyUrl} from "../js/stickers";
import {parseStickerUrl} from "../../shared/stickers";
import {cleanIrcMessage} from "../../shared/irc";

import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {MessageType} from "../../shared/types/msg";
import {useStore} from "../js/store";
import {isPreviewFiltered} from "../js/helpers/previewFilters";

MessageTypes.ParsedMessage = ParsedMessage;
MessageTypes.LinkPreview = LinkPreview;
MessageTypes.Username = Username;

export default defineComponent({
	name: "Message",
	components: {
		...MessageTypes,
		ReplyContext,
		StatusmsgMarker,
		StickerMessage,
	},
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
		keepScrollPosition: Function as PropType<() => void>,
		isPreviousSource: Boolean,
		focused: Boolean,
		highlight: String,
	},
	setup(props) {
		const store = useStore();
		let longPressTimer: ReturnType<typeof setTimeout> | null = null;
		const msgEl = ref<HTMLElement | null>(null);
		const swiping = ref(false);
		let swipeStart: {x: number; y: number} | null = null;
		let swipeAxis: SwipeAxis = "pending";
		let swipeDx = 0;

		const previews = computed(() =>
			props.message.previews.filter(
				(preview) => !isPreviewFiltered(store.state.settings.previewFilters, preview.link)
			)
		);

		const sticker = computed(() =>
			props.message.type === MessageType.MESSAGE && proxyUrl.value
				? parseStickerUrl(cleanIrcMessage(props.message.text), proxyUrl.value)
				: null
		);

		const timeFormat = computed(() => {
			let format: keyof typeof constants.timeFormats;

			if (store.state.settings.use12hClock) {
				format = store.state.settings.showSeconds ? "msg12hWithSeconds" : "msg12h";
			} else {
				format = store.state.settings.showSeconds ? "msgWithSeconds" : "msgDefault";
			}

			return constants.timeFormats[format];
		});

		const messageTime = computed(() => {
			return dayjs(props.message.time).format(timeFormat.value);
		});

		const messageTimeLocale = computed(() => {
			return localetime(props.message.time);
		});

		const messageComponent = computed(() => {
			return "message-" + (props.message.type || "invalid"); // TODO: force existence of type in sharedmsg
		});

		const canReply = computed(() => {
			if (!props.network.serverOptions.supportsReply) {
				return false;
			}

			const t = props.message.type;
			return (
				t === MessageType.MESSAGE || t === MessageType.ACTION || t === MessageType.NOTICE
			);
		});

		const parentInHistory = computed(() => {
			if (!props.message.replyTo || !props.channel) {
				return false;
			}

			return props.channel.messages.some((m) => m.msgid === props.message.replyTo);
		});

		const parentMedia = computed(() => {
			const replyTo = props.message.replyTo;
			return replyMedia(
				replyTo ? props.channel?.messages.find((m) => m.msgid === replyTo) : undefined
			);
		});

		const isAction = () => {
			if (!props.message.type) {
				return false;
			}

			return typeof MessageTypes["message-" + props.message.type] !== "undefined";
		};

		const startReply = () => {
			eventbus.emit("reply:start", {
				msgid: props.message.msgid,
				nick: props.message.from?.nick,
				text: props.message.text,
			});
		};

		const onDblClick = (e: MouseEvent) => {
			if (
				props.message.msgid &&
				canReply.value &&
				isReplyDblClick(e.target as Element, isOverText(e.clientX, e.clientY))
			) {
				window.getSelection()?.removeAllRanges();
				startReply();
			}
		};

		const scrollToParent = () => {
			if (props.channel) {
				void jumpToMessage(props.channel, {msgid: props.message.replyTo});
			}
		};

		const resetSwipe = () => {
			swipeStart = null;
			swipeAxis = "pending";
			swipeDx = 0;
			swiping.value = false;

			if (msgEl.value) {
				msgEl.value.style.transform = "";
				msgEl.value.style.removeProperty("--swipe-offset");
				msgEl.value.style.removeProperty("--swipe-progress");
			}
		};

		const onTouchStart = (e: TouchEvent) => {
			const replyable = !!props.message.msgid && canReply.value;
			resetSwipe();

			if (replyable) {
				longPressTimer = setTimeout(() => {
					longPressTimer = null;
					startReply();
				}, 500);
			}

			const touch = e.touches.item(0);

			if (
				e.touches.length === 1 &&
				touch &&
				canStartSwipe({
					startX: touch.clientX,
					canReply: replyable,
					// On mobile the sidebar overlays the chat, swiping left closes it
					sidebarOverlayOpen:
						store.state.sidebarDragging ||
						(store.state.sidebarOpen &&
							window.innerWidth <= constants.mobileViewportPixels),
				})
			) {
				swipeStart = {x: touch.clientX, y: touch.clientY};
			}
		};

		const clearLongPress = () => {
			if (longPressTimer !== null) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		};

		const onTouchMove = (e: TouchEvent) => {
			clearLongPress();

			const touch = e.touches.item(0);

			if (!swipeStart || !touch || e.touches.length !== 1 || swipeAxis === "vertical") {
				return;
			}

			const dx = touch.clientX - swipeStart.x;

			if (swipeAxis === "pending") {
				swipeAxis = detectSwipeAxis(dx, touch.clientY - swipeStart.y);

				if (swipeAxis !== "horizontal") {
					return;
				}

				swiping.value = true;
			}

			swipeDx = dx;

			if (msgEl.value) {
				const offset = swipeOffset(dx);
				msgEl.value.style.transform = `translateX(${offset}px)`;
				msgEl.value.style.setProperty("--swipe-offset", `${-offset}px`);
				msgEl.value.style.setProperty(
					"--swipe-progress",
					`${Math.min(1, -offset / SWIPE_REPLY_THRESHOLD)}`
				);
			}
		};

		const onTouchEnd = (e: TouchEvent) => {
			if (longPressTimer === null && props.message.msgid && canReply.value) {
				e.preventDefault();
			}

			clearLongPress();

			if (swipeAxis === "horizontal" && isSwipeReply(swipeDx)) {
				startReply();
			}

			resetSwipe();
		};

		const onTouchCancel = () => {
			clearLongPress();
			resetSwipe();
		};

		onBeforeUnmount(() => {
			clearLongPress();
		});

		return {
			sticker,
			previews,
			timeFormat,
			messageTime,
			messageTimeLocale,
			messageComponent,
			canReply,
			parentInHistory,
			parentMedia,
			isAction,
			startReply,
			onDblClick,
			scrollToParent,
			msgEl,
			swiping,
			onTouchStart,
			onTouchMove,
			onTouchEnd,
			onTouchCancel,
		};
	},
});
</script>
