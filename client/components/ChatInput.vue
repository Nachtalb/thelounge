<template>
	<form id="form" method="post" action="" @submit.prevent="onSubmit">
		<div v-if="inputPreviews.length > 0" id="input-previews">
			<template v-for="preview in inputPreviews" :key="preview.link">
				<div v-if="preview.type === 'loading'" class="preview" dir="ltr">
					<div class="toggle-content toggle-type-loading">
						<div class="toggle-text">
							<div class="body">Getting preview…</div>
							<div class="body overflowable">{{ preview.link }}</div>
						</div>
					</div>
				</div>
				<LinkPreview
					v-else
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</template>
		</div>
		<div v-if="channel.replyingTo" class="reply-bar" @click="jumpToReply">
			<img v-if="replyMedia" class="reply-bar-thumb" :src="replyMedia.thumb" alt="" />
			<span class="reply-bar-text">
				<span class="reply-bar-nick">Reply to {{ channel.replyingTo.nick }}</span>
				<span v-if="replyMedia && !replyMedia.caption" class="reply-bar-msg">{{
					replyMedia.kind
				}}</span>
				<span v-else class="reply-bar-msg"
					><ParsedMessage
						:text="replyMedia ? replyMedia.caption : channel.replyingTo.text"
						:network="network"
				/></span>
			</span>
			<button
				class="reply-bar-close"
				type="button"
				aria-label="Cancel reply"
				@click.stop="cancelReply"
			>
				&times;
			</button>
		</div>
		<StickerSuggest
			v-if="suggestions.length"
			:items="suggestions"
			:selected="suggestIndex"
			@pick="pickSuggestion"
		/>
		<span id="upload-progressbar" />
		<span id="nick">{{ network.nick }}</span>
		<span id="input-label" class="sr-only">Message input</span>
		<div
			id="input"
			ref="input"
			dir="auto"
			class="mousetrap"
			contenteditable="true"
			role="textbox"
			aria-multiline="true"
			aria-labelledby="input-label"
			enterkeyhint="send"
			:data-placeholder="getInputPlaceholder(channel)"
			@keypress.enter.exact.prevent="onSubmit"
			@keydown.left.exact="moveSuggestion($event, -1)"
			@keydown.right.exact="moveSuggestion($event, 1)"
			@focus="onInputFocus"
			@blur="onBlur"
		/>
		<span
			v-if="stickerProxyUrl"
			id="sticker-tooltip"
			class="tooltipped tooltipped-w tooltipped-no-touch"
			aria-label="Stickers"
		>
			<button
				id="sticker"
				ref="stickerButton"
				type="button"
				aria-label="Stickers"
				:aria-expanded="stickerPickerOpen"
				:class="{active: stickerPickerOpen}"
				@click="toggleStickerPicker"
			/>
		</span>
		<Transition
			name="sticker-slide"
			:css="stickerPickerAnimated"
			@after-enter="stopKeepingChat"
			@after-leave="stopKeepingChat"
		>
			<StickerPicker
				v-if="stickerPickerOpen"
				ref="stickerPicker"
				:channel="channel"
				:anchor-right="stickerAnchorRight"
				@close="closeStickerPicker(true)"
			/>
		</Transition>
		<span
			v-if="store.state.serverConfiguration?.fileUpload"
			id="upload-tooltip"
			class="tooltipped tooltipped-w tooltipped-no-touch"
			aria-label="Upload file"
			@click="openFileUpload"
		>
			<input
				id="upload-input"
				ref="uploadInput"
				type="file"
				aria-labelledby="upload"
				multiple
				@change="onUploadInputChange"
			/>
			<button
				id="upload"
				type="button"
				aria-label="Upload file"
				:disabled="!store.state.isConnected"
			/>
		</span>
		<span
			id="submit-tooltip"
			class="tooltipped tooltipped-w tooltipped-no-touch"
			data-tooltip="Send message"
		>
			<button
				id="submit"
				type="submit"
				aria-label="Send message"
				:disabled="!store.state.isConnected"
			/>
		</span>
	</form>
</template>

<script lang="ts">
import Mousetrap from "mousetrap";
import autocompletion from "../js/autocompletion";
import {RichInput, ChangeSource} from "../js/richinput/RichInput";
import {commands} from "../js/commands/index";
import socket from "../js/socket";
import upload from "../js/upload";
import eventbus from "../js/eventbus";
import {clearInputPreviews, updateInputPreviews} from "../js/inputPreviews";
import {isInputPreviewShown} from "../js/helpers/inputPreviews";
import {isPreviewFiltered} from "../js/helpers/previewFilters";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import jumpToMessage from "../js/helpers/jumpToMessage";
import StickerPicker from "./StickerPicker.vue";
import StickerSuggest from "./StickerSuggest.vue";
import {findEmojiMatches} from "../js/helpers/emoji";
import {
	loadUserPacks,
	proxyUrl as stickerProxyUrl,
	sendSticker,
	stickersForEmoji,
} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import {replyMedia as getReplyMedia} from "../js/helpers/replyMedia";
import {computed, watch, defineComponent, onMounted, PropType, ref, onUnmounted} from "vue";
import type {ClientNetwork, ClientChan} from "../js/types";
import {useStore} from "../js/store";
import {ChanType} from "../../shared/types/chan";
import type {TypingStatus} from "../../shared/types/typing";

const TYPING_THROTTLE_MS = 3000;
const INPUT_PREVIEW_DEBOUNCE_MS = 500;

// Autocomplete bracket and quote characters like in a modern IDE
// For example, select `text`, press `[` key, and it becomes `[text]`
const bracketWraps = {
	'"': '"',
	"'": "'",
	"(": ")",
	"<": ">",
	"[": "]",
	"{": "}",
	"*": "*",
	"`": "`",
	"~": "~",
	_: "_",
};

export default defineComponent({
	name: "ChatInput",
	components: {
		LinkPreview,
		ParsedMessage,
		StickerPicker,
		StickerSuggest,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const store = useStore();
		const input = ref<HTMLDivElement>();
		const uploadInput = ref<HTMLInputElement>();
		const autocompletionRef = ref<ReturnType<typeof autocompletion>>();
		// Formatting shortcuts (mod+b/i/u/s/m/o/k) live in the rich input
		let richInput: RichInput | null = null;
		let lastTypingSent = 0;
		let typingPauseTimeout: ReturnType<typeof setTimeout> | null = null;

		const clearTypingPauseTimeout = () => {
			if (typingPauseTimeout !== null) {
				clearTimeout(typingPauseTimeout);
				typingPauseTimeout = null;
			}
		};

		let inputPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

		const clearInputPreviewTimeout = () => {
			if (inputPreviewTimeout !== null) {
				clearTimeout(inputPreviewTimeout);
				inputPreviewTimeout = null;
			}
		};

		const inputPreviews = computed(() =>
			props.channel.inputPreviews.filter(
				(preview) =>
					isInputPreviewShown(preview, store.state.settings) &&
					!isPreviewFiltered(store.state.settings.previewFilters, preview.link)
			)
		);

		// Previews above the input do not affect the message list scroll position
		const keepScrollPosition = () => undefined;

		onUnmounted(() => {
			clearTypingPauseTimeout();
			clearInputPreviewTimeout();
		});

		const sendTypingStatus = (status: TypingStatus) => {
			if (store.state.settings.typing !== "on" || !store.state.isConnected) {
				return;
			}

			if (props.channel.type !== ChanType.CHANNEL && props.channel.type !== ChanType.QUERY) {
				return;
			}

			const now = Date.now();

			if (status === "active" && now - lastTypingSent < TYPING_THROTTLE_MS) {
				return;
			}

			if (status === "active") {
				lastTypingSent = now;
			}

			socket.emit("typing", {target: props.channel.id, status});
		};

		const setPendingMessage = (source: ChangeSource) => {
			// Values we put in ourselves (drafts, history) are not edits
			if (!richInput || source === "set" || source === "colour" || source === "colour-end") {
				return;
			}

			const text = richInput.getValue();
			props.channel.pendingMessage = text;
			props.channel.inputHistoryPosition = 0;

			// No need to send typing indicators for / commands
			if (text.length > 0 && text[0] !== "/") {
				sendTypingStatus("active");

				if (typingPauseTimeout) {
					clearTimeout(typingPauseTimeout);
				}

				typingPauseTimeout = setTimeout(() => {
					typingPauseTimeout = null;
					sendTypingStatus("paused");
				}, TYPING_THROTTLE_MS);
			} else if (text.length === 0) {
				if (typingPauseTimeout) {
					clearTimeout(typingPauseTimeout);
					typingPauseTimeout = null;
				}

				sendTypingStatus("done");
			}
		};

		const getInputPlaceholder = (channel: ClientChan) => {
			if (channel.type === ChanType.CHANNEL || channel.type === ChanType.QUERY) {
				return `Write to ${channel.name}`;
			}

			return "";
		};

		// Quick select: one emoji alone in the input suggests the user's stickers for it
		const suggestEmoji = computed(() => {
			const text = props.channel.pendingMessage.trim();
			const [match, more] = stickerProxyUrl.value ? findEmojiMatches(text) : [];
			return match && !more && match.start === 0 && match.end === text.length ? text : "";
		});
		const suggestDismissed = ref("");
		const suggestIndex = ref(-1);

		watch(suggestEmoji, (emoji) => {
			suggestIndex.value = -1;
			suggestDismissed.value = "";

			if (emoji) {
				loadUserPacks();
			}
		});

		const suggestions = computed<StickerRef[]>(() =>
			suggestEmoji.value && suggestDismissed.value !== suggestEmoji.value
				? stickersForEmoji(suggestEmoji.value)
				: []
		);

		const pickSuggestion = (item: StickerRef) => {
			sendSticker(props.channel, item);
			props.channel.pendingMessage = "";
			richInput?.setValue("", true);
		};

		const moveSuggestion = (e: KeyboardEvent, step: number) => {
			const count = suggestions.value.length;

			if (!count) {
				return;
			}

			e.preventDefault();
			suggestIndex.value = Math.min(Math.max(suggestIndex.value + step, -1), count - 1);
		};

		const onSubmit = () => {
			if (!input.value) {
				return;
			}

			// Triggering click event opens the virtual keyboard on mobile
			// This can only be called from another interactive event (e.g. button click)
			input.value.click();
			input.value.focus();

			if (!store.state.isConnected) {
				return false;
			}

			const picked = suggestions.value[suggestIndex.value];

			if (picked) {
				pickSuggestion(picked);
				return;
			}

			const target = props.channel.id;
			const text = props.channel.pendingMessage;

			if (text.length === 0) {
				return false;
			}

			if (autocompletionRef.value) {
				autocompletionRef.value.hide();
			}

			props.channel.inputHistoryPosition = 0;
			props.channel.pendingMessage = "";
			richInput?.setValue("", true);
			clearInputPreviewTimeout();
			clearInputPreviews(props.channel);

			// Store new message in history if last message isn't already equal
			if (props.channel.inputHistory[1] !== text) {
				props.channel.inputHistory.splice(1, 0, text);
			}

			// Limit input history to a 100 entries
			if (props.channel.inputHistory.length > 100) {
				props.channel.inputHistory.pop();
			}

			const replyTo = props.channel.replyingTo?.msgid;
			props.channel.replyingTo = null;

			if (text[0] === "/") {
				const args = text.substring(1).split(" ");
				const cmd = args.shift()?.toLowerCase();

				if (!cmd) {
					return false;
				}

				if (Object.prototype.hasOwnProperty.call(commands, cmd) && commands[cmd](args)) {
					return false;
				}
			}

			socket.emit("input", {target, text, ...(replyTo && {replyTo})});

			if (typingPauseTimeout) {
				clearTimeout(typingPauseTimeout);
				typingPauseTimeout = null;
			}

			sendTypingStatus("done");
			lastTypingSent = 0;
		};

		const onUploadInputChange = () => {
			if (!uploadInput.value || !uploadInput.value.files) {
				return;
			}

			const files = Array.from(uploadInput.value.files);
			upload.triggerUpload(files);
			uploadInput.value.value = ""; // Reset <input> element so you can upload the same file
		};

		const openFileUpload = () => {
			uploadInput.value?.click();
		};

		const cancelReply = () => {
			props.channel.replyingTo = null;
		};

		const replyMedia = computed(() => {
			const msgid = props.channel.replyingTo?.msgid;
			return getReplyMedia(
				props.channel.messages.find((m) => m.msgid === msgid),
				stickerProxyUrl.value
			);
		});

		const jumpToReply = () => {
			void jumpToMessage(props.channel, {msgid: props.channel.replyingTo?.msgid});
		};

		const onReplyStart = (data: {msgid: string; nick: string; text: string}) => {
			if (!data.msgid) {
				return;
			}

			props.channel.replyingTo = {
				msgid: data.msgid,
				nick: data.nick || "Unknown",
				text: data.text || "",
			};

			// Pre-fill with "nick: " so clients without +reply support
			// can still see who the reply is directed at
			if (!props.channel.pendingMessage && data.nick && richInput) {
				props.channel.pendingMessage = data.nick + ": ";
				richInput.setValue(props.channel.pendingMessage);
			}

			richInput?.focus();
		};

		const blurInput = () => {
			input.value?.blur();
		};

		const stickerButton = ref<HTMLButtonElement>();
		const stickerPicker = ref<{$el: HTMLElement}>();
		const stickerPickerOpen = ref(false);
		// Slides (mobile) unless the on-screen keyboard takes its place at once
		const stickerPickerAnimated = ref(true);
		const stickerAnchorRight = ref(6);

		function closeStickerPicker(focusInput = false) {
			stickerPickerOpen.value = false;
			document.removeEventListener("pointerdown", onDocumentPointerDown, true);

			if (focusInput && navigator.maxTouchPoints === 0) {
				richInput?.focus();
			}
		}

		function onDocumentPointerDown(e: PointerEvent) {
			const target = e.target as Element;

			// A tap on the input closes it once focused (onInputFocus): closing now moves the input
			// down before the tap lands, so the keyboard wouldn't open
			if (navigator.maxTouchPoints > 0 && input.value?.contains(target)) {
				return;
			}

			// The pack view and the picker's own menu are on top of it
			if (
				!stickerPicker.value?.$el.contains(target) &&
				!stickerButton.value?.contains(target) &&
				!target.closest?.("#sticker-pack-overlay")
			) {
				closeStickerPicker();
			}
		}

		// The keyboard takes the panel's place again
		const onInputFocus = () => {
			if (stickerPickerOpen.value && navigator.maxTouchPoints > 0) {
				stickerPickerAnimated.value = false;
				closeStickerPicker();
			}
		};

		const toggleStickerPicker = () => {
			if (stickerPickerOpen.value) {
				closeStickerPicker(true);
				return;
			}

			const form = input.value?.closest("form")?.getBoundingClientRect();
			const button = stickerButton.value?.getBoundingClientRect();
			stickerAnchorRight.value = form && button ? Math.max(6, form.right - button.right) : 6;
			stickerPickerAnimated.value = true;
			stickerPickerOpen.value = true;
			document.addEventListener("pointerdown", onDocumentPointerDown, true);

			// The panel takes the on-screen keyboard's place; tapping the input brings it back
			if (navigator.maxTouchPoints > 0) {
				blurInput();
			}
		};

		watch(
			() => props.channel.id,
			() => {
				stickerPickerAnimated.value = false;
				closeStickerPicker();
			}
		);

		// On mobile the panel sits below the input and shrinks the chat, like the on-screen
		// keyboard: keep what was at the chat's bottom edge in place on every frame of its slide.
		// The observer runs after layout and before paint, so the chat moves with the panel.
		let chatObserver: ResizeObserver | null = null;
		let chatObserverTimer: ReturnType<typeof setTimeout> | undefined;

		const stopKeepingChat = () => {
			chatObserver?.disconnect();
			chatObserver = null;
			clearTimeout(chatObserverTimer);
		};

		watch(stickerPickerOpen, () => {
			const chat = input.value?.closest(".window")?.querySelector<HTMLElement>("#chat .chat");
			stopKeepingChat();

			if (!chat) {
				return;
			}

			const gap = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
			chatObserver = new ResizeObserver(() => {
				chat.scrollTop = chat.scrollHeight - chat.clientHeight - gap;
			});
			chatObserver.observe(chat);
			// In case the slide is cut short and no after-enter/leave comes
			chatObserverTimer = setTimeout(stopKeepingChat, 1000);
		});

		const onEscape = () => {
			if (stickerPickerOpen.value) {
				closeStickerPicker(true);
				return;
			}

			if (suggestions.value.length) {
				suggestDismissed.value = suggestEmoji.value;
				return;
			}

			cancelReply();
			blurInput();
		};

		const onBlur = () => {
			if (autocompletionRef.value) {
				autocompletionRef.value.hide();
			}
		};

		watch(
			() => props.channel.id,
			() => {
				if (autocompletionRef.value) {
					autocompletionRef.value.hide();
				}

				clearInputPreviewTimeout();
				updateInputPreviews(props.channel);
			}
		);

		// Show the draft of the channel we switched to, or a message set elsewhere
		watch(
			() => [props.channel.id, props.channel.pendingMessage] as const,
			([id], [oldId]) => {
				if (!richInput) {
					return;
				}

				if (id !== oldId) {
					richInput.setValue(props.channel.pendingMessage, true);
				} else if (props.channel.pendingMessage !== richInput.getValue()) {
					richInput.setValue(props.channel.pendingMessage);
				}
			}
		);

		// Links are read from the serialized IRC text of the draft, not from the editor DOM
		watch(
			() => props.channel.pendingMessage,
			() => {
				clearInputPreviewTimeout();
				inputPreviewTimeout = setTimeout(() => {
					inputPreviewTimeout = null;
					updateInputPreviews(props.channel);
				}, INPUT_PREVIEW_DEBOUNCE_MS);
			}
		);

		onMounted(() => {
			eventbus.on("escapekey", onEscape);
			eventbus.on("reply:start", onReplyStart);

			if (!input.value) {
				throw new Error("ChatInput: input element is not available");
			}

			const editor = new RichInput(input.value, {
				wraps: bracketWraps,
				isMenuOpen: () => store.state.isAutoCompleting,
				onEnter: () => void onSubmit(),
			});
			richInput = editor;
			editor.setValue(props.channel.pendingMessage, true);
			editor.onChange(setPendingMessage);

			if (store.state.settings.autocomplete) {
				autocompletionRef.value = autocompletion(editor);
			}

			const inputTrap = Mousetrap(input.value);

			inputTrap.bind(["up", "down"], (e, key) => {
				const {start, end} = editor.getSelection();

				if (store.state.isAutoCompleting || start !== end) {
					return;
				}

				const text = editor.getText();
				const onRow = (text.slice(undefined, start).match(/\n/g) || []).length;
				const totalRows = (text.match(/\n/g) || []).length;

				const {channel} = props;

				if (channel.inputHistoryPosition === 0) {
					channel.inputHistory[channel.inputHistoryPosition] = channel.pendingMessage;
				}

				if (key === "up" && onRow === 0) {
					if (channel.inputHistoryPosition < channel.inputHistory.length - 1) {
						channel.inputHistoryPosition++;
					} else {
						return;
					}
				} else if (
					key === "down" &&
					channel.inputHistoryPosition > 0 &&
					onRow === totalRows
				) {
					channel.inputHistoryPosition--;
				} else {
					return;
				}

				channel.pendingMessage = channel.inputHistory[channel.inputHistoryPosition];
				editor.setValue(channel.pendingMessage);

				return false;
			});

			if (store.state.serverConfiguration?.fileUpload) {
				upload.mounted();
			}
		});

		onUnmounted(() => {
			eventbus.off("escapekey", onEscape);
			eventbus.off("reply:start", onReplyStart);

			if (autocompletionRef.value) {
				autocompletionRef.value.destroy();
				autocompletionRef.value = undefined;
			}

			richInput?.destroy();
			richInput = null;
			closeStickerPicker();
			stopKeepingChat();

			upload.unmounted();
			upload.abort();
		});

		return {
			store,
			input,
			inputPreviews,
			keepScrollPosition,
			uploadInput,
			onUploadInputChange,
			openFileUpload,
			blurInput,
			onBlur,
			upload,
			getInputPlaceholder,
			onSubmit,
			cancelReply,
			jumpToReply,
			replyMedia,
			stickerProxyUrl,
			stickerButton,
			stickerPicker,
			stickerPickerOpen,
			stickerPickerAnimated,
			stickerAnchorRight,
			stopKeepingChat,
			toggleStickerPicker,
			onInputFocus,
			closeStickerPicker,
			suggestions,
			suggestIndex,
			pickSuggestion,
			moveSuggestion,
		};
	},
});
</script>
