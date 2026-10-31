<template>
	<span
		class="sticker-message"
		role="button"
		tabindex="0"
		:title="data?.emoji"
		:aria-label="data?.emoji ? `Sticker ${data.emoji}` : 'Sticker'"
		@click="openPack(sticker.pack)"
		@keydown.enter.prevent="openPack(sticker.pack)"
	>
		<StickerMedia :sticker="data" :thumb="thumb" :src="data?.url" :style="size" />
		<span class="only-copy">{{ text }}</span>
	</span>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, PropType} from "vue";
import {findSticker, loadPack, openPack, packs, proxyUrl} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import StickerMedia from "./StickerMedia.vue";

const MAX = 160;

// A message that is only a sticker link, shown like Telegram: the sticker, no bubble.
// Clicking opens its pack.
export default defineComponent({
	name: "StickerMessage",
	components: {StickerMedia},
	props: {
		sticker: {type: Object as PropType<StickerRef>, required: true},
		text: {type: String, required: true},
	},
	setup(props) {
		const data = computed(() => findSticker(props.sticker));
		const thumb = computed(
			() => `${proxyUrl.value}/${props.sticker.pack}/${props.sticker.id}/thumb`
		);

		// Fit the pack's size into the box, so nothing jumps once the file loads
		const size = computed(() => {
			const s = data.value;

			if (!s?.width || !s.height) {
				return {width: MAX + "px", height: MAX + "px"};
			}

			const scale = Math.min(MAX / s.width, MAX / s.height, 1);
			return {
				width: Math.round(s.width * scale) + "px",
				height: Math.round(s.height * scale) + "px",
			};
		});

		onMounted(() => {
			if (!packs[props.sticker.pack]) {
				void loadPack(props.sticker.pack);
			}
		});

		return {data, thumb, size, openPack};
	},
});
</script>
