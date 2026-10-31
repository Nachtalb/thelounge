<template>
	<button
		type="button"
		class="sticker-item"
		:title="sticker?.emoji"
		:aria-label="sticker?.emoji ? `Sticker ${sticker.emoji}` : 'Sticker'"
		@click="onClick"
		@contextmenu.prevent="$emit('menu', item)"
		@touchstart.passive="onTouchStart"
		@touchmove.passive="cancelPress"
		@touchend="onTouchEnd"
		@touchcancel="cancelPress"
		@pointerdown="onPointerDown"
		@pointerup="cancelPress"
		@pointerleave="cancelPress"
	>
		<StickerMedia :sticker="sticker" :thumb="thumb" />
	</button>
</template>

<script lang="ts">
import {computed, defineComponent, onUnmounted, PropType} from "vue";
import {findSticker, proxyUrl} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import StickerMedia from "./StickerMedia.vue";

const LONG_PRESS_MS = 450;
const MOUSE_LONG_PRESS_MS = 500;

// One sticker of a grid; video stickers play while on screen.
// Click picks it, right-click or long-press (touch or mouse) opens its menu.
export default defineComponent({
	name: "StickerItem",
	components: {StickerMedia},
	props: {
		item: {type: Object as PropType<StickerRef>, required: true},
	},
	emits: ["pick", "menu"],
	setup(props, {emit}) {
		let pressTimer: ReturnType<typeof setTimeout> | null = null;
		let longPressed = false;

		const cancelPress = () => {
			if (pressTimer) {
				clearTimeout(pressTimer);
				pressTimer = null;
			}
		};

		const startPress = (ms: number) => {
			longPressed = false;
			cancelPress();
			pressTimer = setTimeout(() => {
				pressTimer = null;
				longPressed = true;
				emit("menu", props.item);
			}, ms);
		};

		const onTouchStart = () => startPress(LONG_PRESS_MS);

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType === "mouse" && e.button === 0) {
				startPress(MOUSE_LONG_PRESS_MS);
			}
		};

		const onTouchEnd = (e: TouchEvent) => {
			cancelPress();

			// No click (send) after the menu opened
			if (longPressed) {
				e.preventDefault();
			}
		};

		const onClick = () => {
			if (longPressed) {
				longPressed = false;
				return;
			}

			emit("pick", props.item);
		};

		onUnmounted(cancelPress);
		const data = computed(() => findSticker(props.item));
		const thumb = computed(
			() =>
				data.value?.thumb_url ||
				`${proxyUrl.value}/${props.item.pack}/${props.item.id}/thumb`
		);

		return {
			thumb,
			sticker: data,
			onClick,
			onTouchStart,
			onTouchEnd,
			onPointerDown,
			cancelPress,
		};
	},
});
</script>
