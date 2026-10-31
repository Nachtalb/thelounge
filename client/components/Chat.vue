<template>
	<div id="chat-container" class="window" :data-current-channel="channel.name" lang="">
		<div
			id="chat"
			:class="{
				'hide-motd': !store.state.settings.motd,
				'time-seconds': store.state.settings.showSeconds,
				'time-12h': store.state.settings.use12hClock,
				'colored-nicks': true, // TODO temporarily fixes themes, to be removed in next major version
			}"
		>
			<div
				:id="'chan-' + channel.id"
				class="chat-view"
				:data-type="channel.type"
				:aria-label="channel.name"
				role="tabpanel"
			>
				<div class="header">
					<SidebarToggle />
					<span class="title" :aria-label="'Currently open ' + channel.type">{{
						channel.name
					}}</span>
					<MessageSearchForm
						v-if="
							store.state.settings.searchEnabled &&
							['channel', 'query'].includes(channel.type)
						"
						:network="network"
						:channel="channel"
					/>
					<button
						class="mentions"
						aria-label="Open your mentions"
						@click="openMentions"
					/>
					<button
						class="menu"
						aria-label="Open the context menu"
						@click="openContextMenu"
					/>
					<span
						v-if="channel.type === 'channel'"
						class="rt-tooltip tooltipped tooltipped-w"
						aria-label="Toggle user list"
					>
						<button
							class="rt"
							aria-label="Toggle user list"
							@click="store.commit('toggleUserlist')"
						/>
					</span>
				</div>
				<div
					v-if="channel.editTopic || channel.topic"
					ref="topicBar"
					:class="['topic-bar', {expanded: topicExpanded}]"
				>
					<div v-if="channel.editTopic" class="topic-container">
						<input
							ref="topicInput"
							:value="channel.topic"
							class="topic-input"
							placeholder="Set channel topic"
							enterkeyhint="done"
							@keyup.enter="saveTopic"
							@keydown.esc.stop="channel.editTopic = false"
						/>
						<span
							aria-label="Cancel"
							class="cancel-topic"
							@click="channel.editTopic = false"
						>
							<span type="button" aria-label="Cancel"></span>
						</span>
						<span aria-label="Save topic" class="save-topic" @click="saveTopic">
							<span type="button" aria-label="Save topic"></span>
						</span>
					</div>
					<template v-else>
						<div
							ref="topicScroller"
							:class="['topic', {overflowing: topicShift > 0, manual: topicManual}]"
							:style="topicStyle"
							@dblclick="editTopic"
							@pointerenter="holdTopic"
							@pointerleave="releaseTopic"
						>
							<span ref="topicText" class="topic-text"
								><ParsedMessage :network="network" :text="channel.topic"
							/></span>
						</div>
						<button
							v-if="topicShift > 0 || topicExpanded"
							class="topic-expand"
							type="button"
							:aria-label="topicExpanded ? 'Collapse topic' : 'Expand topic'"
							@click="topicExpanded = !topicExpanded"
						/>
						<button
							v-if="channel.type === 'channel'"
							class="topic-edit"
							type="button"
							aria-label="Edit topic"
							@click="editTopic"
						/>
					</template>
				</div>
				<div v-if="channel.type === 'special'" class="chat-content">
					<div class="chat">
						<div class="messages">
							<div class="msg">
								<component
									:is="specialComponent"
									:network="network"
									:channel="channel"
								/>
							</div>
						</div>
					</div>
				</div>
				<div v-else class="chat-content">
					<button
						:class="[
							'scroll-down tooltipped tooltipped-w tooltipped-no-touch',
							{'scroll-down-shown': !channel.scrolledToBottom},
						]"
						aria-label="Jump to recent messages"
						@click="messageList?.jumpToBottom()"
					>
						<div class="scroll-down-arrow" />
					</button>
					<ChatUserList v-if="channel.type === 'channel'" :channel="channel" />
					<MessageList
						ref="messageList"
						:network="network"
						:channel="channel"
						:focused="focused"
					/>
				</div>
			</div>
		</div>
		<div
			v-if="store.state.currentUserVisibleError"
			id="user-visible-error"
			@click="hideUserVisibleError"
		>
			{{ store.state.currentUserVisibleError }}
		</div>
		<ChatInput :network="network" :channel="channel" />
		<TypingIndicator :channel="channel" />
	</div>
</template>

<script lang="ts">
import socket from "../js/socket";
import eventbus from "../js/eventbus";
import ParsedMessage from "./ParsedMessage.vue";
import MessageList from "./MessageList.vue";
import ChatInput from "./ChatInput.vue";
import ChatUserList from "./ChatUserList.vue";
import TypingIndicator from "./TypingIndicator.vue";
import SidebarToggle from "./SidebarToggle.vue";
import MessageSearchForm from "./MessageSearchForm.vue";
import ListBans from "./Special/ListBans.vue";
import ListInvites from "./Special/ListInvites.vue";
import ListChannels from "./Special/ListChannels.vue";
import ListIgnored from "./Special/ListIgnored.vue";
import {
	defineComponent,
	PropType,
	ref,
	computed,
	watch,
	nextTick,
	onMounted,
	onBeforeUnmount,
	Component,
} from "vue";
import type {ClientNetwork, ClientChan} from "../js/types";
import {useStore} from "../js/store";
import {SpecialChanType, ChanType} from "../../shared/types/chan";
import {chatSearch} from "../js/helpers/chatSearch";

export default defineComponent({
	name: "Chat",
	components: {
		ParsedMessage,
		MessageList,
		ChatInput,
		ChatUserList,
		TypingIndicator,
		SidebarToggle,
		MessageSearchForm,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
		focused: Number,
	},
	emits: ["channel-changed"],
	setup(props, {emit}) {
		const store = useStore();

		const messageList = ref<typeof MessageList>();
		const topicInput = ref<HTMLInputElement | null>(null);

		const topicBar = ref<HTMLElement | null>(null);
		const topicScroller = ref<HTMLElement | null>(null);
		const topicText = ref<HTMLElement | null>(null);
		const topicExpanded = ref(false);
		const topicManual = ref(false);
		const topicShift = ref(0); // px the topic overflows the bar
		const topicDelay = ref(1); // s, start offset of the ping-pong animation
		const topicTravel = computed(() => topicShift.value / 30); // 30 px/s

		const topicStyle = computed(() => ({
			"--topic-shift": `${topicShift.value}px`,
			"--topic-travel": topicTravel.value,
			"--topic-cycle": topicTravel.value * 2 + 4, // 2 s pause at each end
			"--topic-delay": topicDelay.value,
		}));

		const measureTopic = () => {
			const el = topicScroller.value;
			const width = topicText.value?.offsetWidth ?? 0;
			topicShift.value = el ? Math.max(0, width - el.clientWidth) : 0;
			eventbus.emit("resize");
		};

		const topicObserver = new ResizeObserver(measureTopic);

		watch(
			[topicBar, topicText],
			(els, oldEls) => {
				oldEls.forEach((el) => el && topicObserver.unobserve(el));
				els.forEach((el) => el && topicObserver.observe(el));
			},
			{flush: "post"}
		);

		onBeforeUnmount(() => topicObserver.disconnect());

		// The topic element is replaced, so no pointerleave will end a hover
		const resetTopic = () => {
			topicExpanded.value = false;
			topicManual.value = false;
			topicDelay.value = 1;
		};

		watch(() => props.channel.id, resetTopic);

		// Hovering/touching stops the marquee where it is and allows scrolling by hand
		const holdTopic = () => {
			const scroller = topicScroller.value;
			const text = topicText.value;

			if (!scroller || !text || !topicShift.value || topicManual.value) {
				return;
			}

			const x = -new DOMMatrix(getComputedStyle(text).transform).m41;
			topicManual.value = true;
			void nextTick(() => (scroller.scrollLeft = x));
		};

		// Resume the marquee from where the user left it
		const releaseTopic = () => {
			const scroller = topicScroller.value;

			if (!scroller || !topicManual.value) {
				return;
			}

			const progress = topicShift.value ? scroller.scrollLeft / topicShift.value : 0;
			topicDelay.value = -(1 + progress * topicTravel.value);
			topicManual.value = false;
			scroller.scrollLeft = 0;
		};

		// Esc outside the topic input (the input handles its own), like the search bar.
		// Registered before the search bar's listener, so an open search closes first
		const onEscape = () => {
			if (chatSearch.chanId === props.channel.id) {
				return;
			}

			if (props.channel.editTopic) {
				props.channel.editTopic = false;
			} else {
				topicExpanded.value = false;
			}
		};

		eventbus.on("escapekey", onEscape);
		onBeforeUnmount(() => {
			eventbus.off("escapekey", onEscape);
		});

		const specialComponent = computed(() => {
			switch (props.channel.special) {
				case SpecialChanType.BANLIST:
					return ListBans as Component;
				case SpecialChanType.INVITELIST:
					return ListInvites as Component;
				case SpecialChanType.CHANNELLIST:
					return ListChannels as Component;
				case SpecialChanType.IGNORELIST:
					return ListIgnored as Component;
			}

			return undefined;
		});

		const channelChanged = () => {
			// Triggered when active channel is set or changed
			emit("channel-changed", props.channel);

			socket.emit("open", props.channel.id);

			if (props.channel.usersOutdated) {
				props.channel.usersOutdated = false;

				socket.emit("names", {
					target: props.channel.id,
				});
			}
		};

		const hideUserVisibleError = () => {
			store.commit("currentUserVisibleError", null);
		};

		const editTopic = () => {
			if (props.channel.type === ChanType.CHANNEL) {
				props.channel.editTopic = true;
			}
		};

		const saveTopic = () => {
			props.channel.editTopic = false;

			if (!topicInput.value) {
				return;
			}

			const newTopic = topicInput.value.value;

			if (props.channel.topic !== newTopic) {
				const target = props.channel.id;
				const text = `/topic ${newTopic}`;
				socket.emit("input", {target, text});
			}
		};

		const openContextMenu = (event: any) => {
			eventbus.emit("contextmenu:channel", {
				event: event,
				channel: props.channel,
				network: props.network,
			});
		};

		const openMentions = (event: any) => {
			eventbus.emit("mentions:toggle", {
				event: event,
			});
		};

		watch(
			() => props.channel,
			() => {
				channelChanged();
			}
		);

		watch(
			() => props.channel.editTopic,
			(newTopic) => {
				resetTopic();

				if (newTopic) {
					void nextTick(() => {
						topicInput.value?.focus();
					});
				}
			}
		);

		onMounted(() => {
			channelChanged();

			if (props.channel.editTopic) {
				void nextTick(() => {
					topicInput.value?.focus();
				});
			}
		});

		return {
			store,
			messageList,
			topicInput,
			topicBar,
			topicScroller,
			topicText,
			topicExpanded,
			topicManual,
			topicShift,
			topicStyle,
			holdTopic,
			releaseTopic,
			specialComponent,
			hideUserVisibleError,
			editTopic,
			saveTopic,
			openContextMenu,
			openMentions,
		};
	},
});
</script>
