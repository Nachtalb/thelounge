<template>
	<span
		ref="root"
		class="sticker-message"
		role="button"
		tabindex="0"
		:data-sticker="sticker.pack + '/' + sticker.id"
		:title="data?.emoji"
		:aria-label="data?.emoji ? `Sticker ${data.emoji}` : 'Sticker'"
		@click="openPack(sticker.pack)"
		@contextmenu.prevent="openMenu"
		@keydown.enter.prevent="openPack(sticker.pack)"
	>
		<StickerMedia :sticker="data" :thumb="thumb" :src="data?.url" :style="size" />
		<span class="only-copy">{{ text }}</span>
		<Teleport to="body">
			<StickerMenu
				v-if="menuOpen"
				class="sticker-menu-window"
				:item="sticker"
				:peek="peeking"
				:open-url="shareUrl"
				@send="sendStickerHere"
				@close="closeMenu"
			/>
		</Teleport>
	</span>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, onUnmounted, PropType, ref} from "vue";
import eventbus from "../js/eventbus";
import {findSticker, loadPack, openPack, packs, proxyUrl, sendStickerHere} from "../js/stickers";
import {stickerShareUrl, type StickerRef} from "../../shared/stickers";
import {useStickerPeek} from "../js/helpers/stickerPeek";
import StickerMedia from "./StickerMedia.vue";
import StickerMenu from "./StickerMenu.vue";

const MAX = 160;

// A message that is only a sticker link, shown like Telegram: the sticker, no bubble.
// Clicking opens its pack; right click, long press and holding open the pickers' menu.
export default defineComponent({
	name: "StickerMessage",
	components: {StickerMedia, StickerMenu},
	props: {
		sticker: {type: Object as PropType<StickerRef>, required: true},
		text: {type: String, required: true},
	},
	setup(props) {
		const root = ref<HTMLElement>();
		const menuOpen = ref(false);
		const peeking = ref(false);
		const data = computed(() => findSticker(props.sticker));
		const shareUrl = computed(() => stickerShareUrl(proxyUrl.value, props.sticker));
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

		const hide = () => {
			menuOpen.value = false;
			peeking.value = false;
			eventbus.off("escapekey", closeMenu);
		};

		const openMenu = () => {
			if (!menuOpen.value) {
				eventbus.on("escapekey", closeMenu);
			}

			menuOpen.value = true;
			peeking.value = false;
		};

		const cancelPeek = useStickerPeek(root, {
			peek() {
				openMenu();
				peeking.value = true;
			},
			menu: () => (peeking.value = false),
			close: hide,
		});

		function closeMenu() {
			cancelPeek();
			hide();
		}

		onMounted(() => {
			if (!packs[props.sticker.pack]) {
				void loadPack(props.sticker.pack);
			}
		});

		onUnmounted(() => eventbus.off("escapekey", closeMenu));

		return {
			root,
			menuOpen,
			peeking,
			data,
			shareUrl,
			thumb,
			size,
			openPack,
			openMenu,
			closeMenu,
			sendStickerHere,
		};
	},
});
</script>
