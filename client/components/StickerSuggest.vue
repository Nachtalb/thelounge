<template>
	<div ref="root" class="sticker-suggest" role="listbox" aria-label="Sticker suggestions">
		<StickerItem
			v-for="(item, i) in items"
			:key="item.pack + '/' + item.id"
			:item="item"
			role="option"
			:aria-selected="i === selected"
			:class="{selected: i === selected}"
			@pick="$emit('pick', item)"
			@menu="openMenu"
			@pointerdown.prevent
		/>
		<StickerMenu
			v-if="menuFor"
			:item="menuFor"
			:peek="peeking"
			:keep-focus="keepFocus"
			@send="$emit('pick', $event)"
			@close="closeMenu"
			@pointerdown.prevent
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, nextTick, PropType, ref, watch} from "vue";
import StickerItem from "./StickerItem.vue";
import StickerMenu from "./StickerMenu.vue";
import {tileSticker, useStickerPeek} from "../js/helpers/stickerPeek";
import type {StickerRef} from "../../shared/stickers";

// Telegram's quick select: the user's stickers for the emoji alone in the input
export default defineComponent({
	name: "StickerSuggest",
	components: {StickerItem, StickerMenu},
	props: {
		items: {type: Array as PropType<StickerRef[]>, required: true},
		selected: {type: Number, default: -1},
	},
	emits: ["pick"],
	setup(props) {
		const root = ref<HTMLElement>();
		const menuFor = ref<StickerRef | null>(null);
		const peeking = ref(false);
		// A long tap's menu leaves the focus (and the keyboard) on the input
		const keepFocus = ref(false);

		const cancelPeek = useStickerPeek(root, {
			peek(tile) {
				menuFor.value = tileSticker(tile);
				peeking.value = true;
				keepFocus.value = true;
			},
			menu: () => (peeking.value = false),
			close() {
				menuFor.value = null;
				peeking.value = false;
			},
		});

		const openMenu = (item: StickerRef) => {
			menuFor.value = item;
			peeking.value = false;
			keepFocus.value = false;
		};

		const closeMenu = () => {
			cancelPeek();
			menuFor.value = null;
			peeking.value = false;

			if (!keepFocus.value) {
				document.getElementById("input")?.focus();
			}
		};

		watch(
			() => props.selected,
			async () => {
				await nextTick();
				document
					.querySelector(".sticker-suggest .selected")
					?.scrollIntoView({block: "nearest", inline: "nearest"});
			}
		);

		return {root, menuFor, peeking, keepFocus, openMenu, closeMenu};
	},
});
</script>
