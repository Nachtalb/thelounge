<template>
	<div class="sticker-suggest" role="listbox" aria-label="Sticker suggestions">
		<StickerItem
			v-for="(item, i) in items"
			:key="item.pack + '/' + item.id"
			:item="item"
			role="option"
			:aria-selected="i === selected"
			:class="{selected: i === selected}"
			@pick="$emit('pick', item)"
			@pointerdown.prevent
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, nextTick, PropType, watch} from "vue";
import StickerItem from "./StickerItem.vue";
import type {StickerRef} from "../../shared/stickers";

// Telegram's quick select: the user's stickers for the emoji alone in the input
export default defineComponent({
	name: "StickerSuggest",
	components: {StickerItem},
	props: {
		items: {type: Array as PropType<StickerRef[]>, required: true},
		selected: {type: Number, default: -1},
	},
	emits: ["pick"],
	setup(props) {
		watch(
			() => props.selected,
			async () => {
				await nextTick();
				document
					.querySelector(".sticker-suggest .selected")
					?.scrollIntoView({block: "nearest", inline: "nearest"});
			}
		);
	},
});
</script>
