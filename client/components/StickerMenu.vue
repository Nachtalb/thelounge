<template>
	<div
		class="sticker-menu"
		@click.self="$emit('close')"
		@contextmenu.prevent.self="$emit('close')"
	>
		<div class="sticker-menu-preview" @click="$emit('close')">
			<div v-if="emoji.length" class="sticker-menu-emoji">
				<span
					v-for="(e, i) in emoji"
					:key="i"
					:class="['emoji', {'emoji-img': e.image}]"
					:style="e.image ? {backgroundImage: `url('${e.image}')`} : undefined"
					>{{ e.emoji }}</span
				>
			</div>
			<StickerMedia :sticker="data" :thumb="thumb" :src="data?.url" :style="size" />
		</div>
		<ul class="sticker-menu-actions" role="menu">
			<li>
				<button ref="first" type="button" class="sticker-menu-item" @click="send">
					Send sticker
				</button>
			</li>
			<li>
				<button type="button" class="sticker-menu-item" @click="favorite">
					{{ fav ? "Remove from Favorites" : "Add to Favorites" }}
				</button>
			</li>
			<li v-if="showViewPack">
				<button type="button" class="sticker-menu-item" @click="viewPack">View pack</button>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, PropType, ref} from "vue";
import {findSticker, isFavorite, openPack, proxyUrl, toggleFavorite} from "../js/stickers";
import type {StickerRef} from "../../shared/stickers";
import {emojiImageUrl, findEmojiMatches} from "../js/helpers/emoji";
import StickerMedia from "./StickerMedia.vue";

const MAX = 200;

// Telegram's long-press menu: a large preview with Send, Favorites and View pack
export default defineComponent({
	name: "StickerMenu",
	components: {StickerMedia},
	props: {
		item: {type: Object as PropType<StickerRef>, required: true},
		showViewPack: {type: Boolean, default: true},
	},
	emits: ["close", "send"],
	setup(props, {emit}) {
		const first = ref<HTMLButtonElement>();
		const data = computed(() => findSticker(props.item));
		const thumb = computed(() => `${proxyUrl.value}/${props.item.pack}/${props.item.id}/thumb`);
		const fav = computed(() => isFavorite(props.item));

		// The sticker's emoji, shown above it like Telegram
		const emoji = computed(() =>
			findEmojiMatches(data.value?.emoji || "").map((m) => ({
				emoji: m.emoji,
				image: emojiImageUrl(m.image),
			}))
		);

		const size = computed(() => {
			const s = data.value;
			const scale = s?.width && s.height ? Math.min(MAX / s.width, MAX / s.height, 1) : 1;
			return {
				width: Math.round((s?.width || MAX) * scale) + "px",
				height: Math.round((s?.height || MAX) * scale) + "px",
			};
		});

		const send = () => {
			emit("send", props.item);
			emit("close");
		};

		const favorite = () => {
			toggleFavorite(props.item);
			emit("close");
		};

		const viewPack = () => {
			openPack(props.item.pack);
			emit("close");
		};

		onMounted(() => first.value?.focus());

		return {first, data, thumb, fav, emoji, size, send, favorite, viewPack};
	},
});
</script>
