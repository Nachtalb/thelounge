<template>
	<button
		type="button"
		class="sticker-item"
		:data-sticker="item.pack + '/' + item.id"
		:title="media ? label : sticker?.emoji"
		:aria-label="media ? label : sticker?.emoji ? `Sticker ${sticker.emoji}` : 'Sticker'"
		@click="$emit('pick', item)"
		@contextmenu.prevent="$emit('menu', item)"
	>
		<StickerMedia :media="shown" />
	</button>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import {findSticker, proxyUrl, stickerMedia, type Media} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import StickerMedia from "./StickerMedia.vue";

// One sticker of a grid (or, given `media`, any other picture keyed by `item`); videos play while
// on screen.
// Click picks it, right-click opens its menu; long presses peek (see helpers/stickerPeek).
export default defineComponent({
	name: "StickerItem",
	components: {StickerMedia},
	props: {
		item: {type: Object as PropType<StickerRef>, required: true},
		media: {type: Object as PropType<Media | null>, default: null},
		label: {type: String, default: ""},
	},
	emits: ["pick", "menu"],
	setup(props) {
		const data = computed(() => findSticker(props.item));
		const shown = computed(
			() =>
				props.media ||
				stickerMedia(
					data.value,
					data.value?.thumb_url ||
						`${proxyUrl.value}/${props.item.pack}/${props.item.id}/thumb`,
					false
				)
		);

		return {
			shown,
			sticker: data,
		};
	},
});
</script>
