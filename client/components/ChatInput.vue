<template>
	<form id="form" method="post" action="" @submit.prevent="onSubmit">
		<span id="upload-progressbar" />
		<span id="nick">{{ network.nick }}</span>
		<textarea
			id="input"
			ref="input"
			dir="auto"
			class="mousetrap"
			enterkeyhint="send"
			:value="channel.pendingMessage"
			:placeholder="getInputPlaceholder(channel)"
			:aria-label="getInputPlaceholder(channel)"
			@input="setPendingMessage"
			@keypress.enter.exact.prevent="onSubmit"
		/>
		<span
			v-if="$store.state.serverConfiguration.fileUpload"
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
				:disabled="!$store.state.isConnected"
			/>
		</span>
		<span
			id="submit-tooltip"
			class="tooltipped tooltipped-w tooltipped-no-touch"
			aria-label="Send message"
		>
			<button
				id="submit"
				type="submit"
				aria-label="Send message"
				:disabled="!$store.state.isConnected"
			/>
		</span>
	</form>
</template>

<script>
import Mousetrap from "mousetrap";
import {wrapCursor} from "undate";
import autocompletion from "../js/autocompletion";
import commands from "../js/commands/index";
import socket from "../js/socket";
import upload from "../js/upload";
import eventbus from "../js/eventbus";

const formattingHotkeys = {
	"mod+k": "\x03",
	"mod+b": "\x02",
	"mod+u": "\x1F",
	"mod+i": "\x1D",
	"mod+o": "\x0F",
	"mod+s": "\x1e",
	"mod+m": "\x11",
};

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

let autocompletionRef = null;

export default {
	name: "ChatInput",
	props: {
		network: Object,
		channel: Object,
	},
	watch: {
		"channel.id"() {
			if (autocompletionRef) {
				autocompletionRef.hide();
			}
		},
		"channel.pendingMessage"() {
			this.setInputSize();
		},
	},
	mounted() {
		eventbus.on("escapekey", this.blurInput);

		if (this.$store.state.settings.autocomplete) {
			autocompletionRef = autocompletion(this.$refs.input);
		}

		const inputTrap = Mousetrap(this.$refs.input);

		inputTrap.bind(Object.keys(formattingHotkeys), function (e, key) {
			const modifier = formattingHotkeys[key];

			wrapCursor(
				e.target,
				modifier,
				e.target.selectionStart === e.target.selectionEnd ? "" : modifier
			);

			// Fix autocomplete position
			const start = e.target.selectionStart;
			const end = e.target.selectionEnd;
			e.target.setSelectionRange(start, start);
			e.target.dispatchEvent(new Event("input"));
			e.target.setSelectionRange(start, end);

			return false;
		});

		inputTrap.bind(Object.keys(bracketWraps), function (e, key) {
			if (e.target.selectionStart !== e.target.selectionEnd) {
				wrapCursor(e.target, key, bracketWraps[key]);

				return false;
			}
		});

		inputTrap.bind(["up", "down"], (e, key) => {
			if (
				this.$store.state.isAutoCompleting ||
				e.target.selectionStart !== e.target.selectionEnd
			) {
				return;
			}

			const onRow = (
				this.$refs.input.value.slice(null, this.$refs.input.selectionStart).match(/\n/g) ||
				[]
			).length;
			const totalRows = (this.$refs.input.value.match(/\n/g) || []).length;

			const {channel} = this;

			if (channel.inputHistoryPosition === 0) {
				channel.inputHistory[channel.inputHistoryPosition] = channel.pendingMessage;
			}

			if (key === "up" && onRow === 0) {
				if (channel.inputHistoryPosition < channel.inputHistory.length - 1) {
					channel.inputHistoryPosition++;
				} else {
					return;
				}
			} else if (key === "down" && channel.inputHistoryPosition > 0 && onRow === totalRows) {
				channel.inputHistoryPosition--;
			} else {
				return;
			}

			channel.pendingMessage = channel.inputHistory[channel.inputHistoryPosition];
			this.$refs.input.value = channel.pendingMessage;
			this.setInputSize();

			return false;
		});

		if (this.$store.state.serverConfiguration.fileUpload) {
			upload.mounted();
		}
	},
	destroyed() {
		eventbus.off("escapekey", this.blurInput);

		if (autocompletionRef) {
			autocompletionRef.destroy();
			autocompletionRef = null;
		}

		upload.abort();
	},
	methods: {
		setPendingMessage(e) {
			this.channel.pendingMessage = e.target.value;
			this.channel.inputHistoryPosition = 0;
			this.setInputSize();
		},
		setInputSize() {
			this.$nextTick(() => {
				if (!this.$refs.input) {
					return;
				}

				const style = window.getComputedStyle(this.$refs.input);
				const lineHeight = parseFloat(style.lineHeight, 10) || 1;

				// Start by resetting height before computing as scrollHeight does not
				// decrease when deleting characters
				this.$refs.input.style.height = "";

				// Use scrollHeight to calculate how many lines there are in input, and ceil the value
				// because some browsers tend to incorrently round the values when using high density
				// displays or using page zoom feature
				this.$refs.input.style.height =
					Math.ceil(this.$refs.input.scrollHeight / lineHeight) * lineHeight + "px";
			});
		},
		getInputPlaceholder(channel) {
			if (channel.type === "channel" || channel.type === "query") {
				return `Write to ${channel.name}`;
			}

			return "";
		},
		onSubmit() {
			// Triggering click event opens the virtual keyboard on mobile
			// This can only be called from another interactive event (e.g. button click)
			this.$refs.input.click();
			this.$refs.input.focus();

			if (!this.$store.state.isConnected) {
				return false;
			}

			const target = this.channel.id;
			const text = this.channel.pendingMessage;

			if (text.length === 0) {
				return false;
			}

			if (autocompletionRef) {
				autocompletionRef.hide();
			}

			this.channel.inputHistoryPosition = 0;
			this.channel.pendingMessage = "";
			this.$refs.input.value = "";
			this.setInputSize();

			// Store new message in history if last message isn't already equal
			if (this.channel.inputHistory[1] !== text) {
				this.channel.inputHistory.splice(1, 0, text);
			}

			// Limit input history to a 100 entries
			if (this.channel.inputHistory.length > 100) {
				this.channel.inputHistory.pop();
			}

			if (text[0] === "/") {
				const args = text.substr(1).split(" ");
				const cmd = args.shift().toLowerCase();

				if (
					Object.prototype.hasOwnProperty.call(commands, cmd) &&
					commands[cmd].input(args)
				) {
					return false;
				}
			}

			socket.emit("input", {target, text});
		},
		onUploadInputChange() {
			const files = Array.from(this.$refs.uploadInput.files);
			upload.triggerUpload(files);
			this.$refs.uploadInput.value = ""; // Reset <input> element so you can upload the same file
		},
		openFileUpload() {
			this.$refs.uploadInput.click();
		},
		blurInput() {
			this.$refs.input.blur();
		},
	},
};
</script>
