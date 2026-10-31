<template>
	<button
		type="button"
		class="sticker-item"
		:data-sticker="item.pack + '/' + item.id"
		:title="sticker?.emoji"
		:aria-label="sticker?.emoji ? `Sticker ${sticker.emoji}` : 'Sticker'"
		@click="$emit('pick', item)"
		@contextmenu.prevent="$emit('menu', item)"
	>
		<StickerMedia :sticker="sticker" :thumb="thumb" />
	</button>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import {findSticker, proxyUrl} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import StickerMedia from "./StickerMedia.vue";

// One sticker of a grid; video stickers play while on screen.
// Click picks it, right-click opens its menu; long presses peek (see helpers/stickerPeek).
export default defineComponent({
	name: "StickerItem",
	components: {StickerMedia},
	props: {
		item: {type: Object as PropType<StickerRef>, required: true},
	},
	emits: ["pick", "menu"],
	setup(props) {
		const data = computed(() => findSticker(props.item));
		const thumb = computed(
			() =>
				data.value?.thumb_url ||
				`${proxyUrl.value}/${props.item.pack}/${props.item.id}/thumb`
		);

		return {
			thumb,
			sticker: data,
		};
	},
});
</script>
