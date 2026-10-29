<template>
	<div id="confirm-dialog-overlay" :class="{opened: !!data}" @click.self="close(false)">
		<div v-if="data !== null" id="confirm-dialog">
			<div class="confirm-text">
				<div class="confirm-text-title">{{ data?.title }}</div>
				<p>{{ data?.text }}</p>
			</div>
			<div class="confirm-buttons" @keydown.tab.prevent="toggleFocus">
				<button ref="cancelButton" class="btn btn-cancel" @click="close(false)">
					Cancel
				</button>
				<button ref="confirmButton" class="btn btn-danger" @click="close(true)">
					{{ data?.button }}
				</button>
			</div>
		</div>
	</div>
</template>

<style>
#confirm-dialog {
	background: var(--body-bg-color);
	color: #fff;
	margin: 10px;
	border-radius: 5px;
	max-width: 500px;
}

#confirm-dialog .confirm-text {
	padding: 15px;
	user-select: text;
}

#confirm-dialog .confirm-text-title {
	font-size: 20px;
	font-weight: 700;
	margin-bottom: 10px;
}

#confirm-dialog .confirm-buttons {
	display: flex;
	justify-content: flex-end;
	padding: 15px;
	background: rgba(0, 0, 0, 0.3);
}

#confirm-dialog .confirm-buttons .btn {
	margin-bottom: 0;
	margin-left: 10px;
}

#confirm-dialog .confirm-buttons .btn-cancel {
	border-color: transparent;
}
</style>

<script lang="ts">
import eventbus from "../js/eventbus";
import {defineComponent, nextTick, onMounted, onUnmounted, ref} from "vue";

type ConfirmDialogData = {
	title: string;
	text: string;
	button: string;
};

type ConfirmDialogCallback = {
	(confirmed: boolean): void;
};

export default defineComponent({
	name: "ConfirmDialog",
	setup() {
		const data = ref<ConfirmDialogData>();
		const callback = ref<ConfirmDialogCallback>();
		const cancelButton = ref<HTMLButtonElement>();
		const confirmButton = ref<HTMLButtonElement>();

		const open = (incoming: ConfirmDialogData, cb: ConfirmDialogCallback) => {
			data.value = incoming;
			callback.value = cb;
			// Focus a button so the dialog can be answered with Tab and Space/Enter.
			// The overlay fades in from visibility: hidden, which refuses focus,
			// so retry for a few frames until the button actually holds it.
			let tries = 0;

			const focusCancel = () => {
				cancelButton.value?.focus();

				if (document.activeElement !== cancelButton.value && data.value && tries++ < 30) {
					requestAnimationFrame(focusCancel);
				}
			};

			void nextTick(focusCancel);
		};

		// Keep Tab inside the dialog, cycling between its two buttons
		const toggleFocus = () => {
			const next =
				document.activeElement === cancelButton.value
					? confirmButton.value
					: cancelButton.value;
			next?.focus();
		};

		const close = (result: boolean) => {
			if (!data.value) {
				return;
			}

			data.value = undefined;
			// Hand focus back to the chat input so typing can continue. Deferred because
			// Escape also reaches ChatInput's own handler, which blurs the input.
			setTimeout(() => document.getElementById("input")?.focus());

			if (callback.value) {
				callback.value(!!result);
			}
		};

		onMounted(() => {
			eventbus.on("escapekey", close);
			eventbus.on("confirm-dialog", open);
		});

		onUnmounted(() => {
			eventbus.off("escapekey", close);
			eventbus.off("confirm-dialog", open);
		});

		return {
			data,
			cancelButton,
			confirmButton,
			toggleFocus,
			close,
		};
	},
});
</script>
