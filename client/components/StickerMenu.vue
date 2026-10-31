<template>
	<div
		:class="['sticker-menu', {'sticker-menu-peek': peek}]"
		@click.capture="ignoreOpeningPress"
		@contextmenu.capture="ignoreOpeningPress"
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
			<StickerMedia :sticker="data" :thumb="thumb" :src="data?.url" :style="size" urgent />
		</div>
		<ul v-if="!peek" class="sticker-menu-actions" role="menu">
			<li>
				<button
					ref="first"
					type="button"
					class="sticker-menu-item sticker-menu-send"
					@click="send"
				>
					Send Sticker
				</button>
			</li>
			<li>
				<button
					type="button"
					:class="[
						'sticker-menu-item',
						fav ? 'sticker-menu-unfavorite' : 'sticker-menu-favorite',
					]"
					@click="favorite"
				>
					{{ fav ? "Delete from Favorites" : "Add to Favorites" }}
				</button>
			</li>
			<li v-if="inRecent">
				<button
					type="button"
					class="sticker-menu-item sticker-menu-unrecent"
					@click="unrecent"
				>
					Remove from Recent
				</button>
			</li>
			<li v-if="data">
				<button
					type="button"
					class="sticker-menu-item sticker-menu-download"
					@click="download"
				>
					Download
				</button>
			</li>
			<li v-if="openUrl">
				<button type="button" class="sticker-menu-item sticker-menu-open" @click="open">
					Open URL
				</button>
			</li>
			<li v-if="showViewPack">
				<button type="button" class="sticker-menu-item sticker-menu-set" @click="viewPack">
					View Sticker Set
				</button>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import {
	computed,
	defineComponent,
	nextTick,
	onMounted,
	onUnmounted,
	PropType,
	ref,
	watch,
} from "vue";
import {
	findSticker,
	isFavorite,
	openPack,
	proxyUrl,
	removeRecent,
	toggleFavorite,
} from "../js/stickers";
import {normalizeEmoji, type StickerRef} from "../../shared/stickers";
import {loadStickerFile} from "../js/helpers/stickerFiles";
import {emojiImageUrl, findEmojiMatches} from "../js/helpers/emoji";
import StickerMedia from "./StickerMedia.vue";

const MAX = 200;

// Telegram's long-press menu: a large preview with Send, Favorites and View Sticker Set.
// The sticker loads ahead of every other one.
export default defineComponent({
	name: "StickerMenu",
	components: {StickerMedia},
	props: {
		item: {type: Object as PropType<StickerRef>, required: true},
		showViewPack: {type: Boolean, default: true},
		// Adds Open URL, opening this link in a new tab
		openUrl: {type: String, default: ""},
		// Opened from the Recently Used section
		inRecent: {type: Boolean, default: false},
		// Only the preview, while a long press peeks at stickers
		peek: {type: Boolean, default: false},
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

		const unrecent = () => {
			removeRecent(props.item);
			emit("close");
		};

		// The file (already loading for the preview), named after its pack and emoji
		const download = () => {
			const sticker = data.value;

			if (!sticker) {
				return;
			}

			const ext = sticker.format === "webm" ? "webm" : "webp";
			const name = `${props.item.pack}-${
				normalizeEmoji(sticker.emoji) || props.item.id
			}.${ext}`;
			const file = loadStickerFile(sticker.url, -1);
			file.promise.then(
				(href) => {
					const link = document.createElement("a");
					link.href = href;
					link.download = name;
					link.click();
					file.release();
				},
				() => undefined
			);
			emit("close");
		};

		const open = () => {
			window.open(props.openUrl, "_blank", "noopener");
			emit("close");
		};

		const viewPack = () => {
			openPack(props.item.pack);
			emit("close");
		};

		// The long press that opened the menu must not close it (or pick an item) on release:
		// its click/contextmenu lands wherever the finger or mouse lets go. Only a press that
		// starts after the menu opened counts; keyboard clicks (detail 0) always do.
		let pressedSinceOpen = false;

		const onPointerDown = () => {
			pressedSinceOpen = true;
		};

		const ignoreOpeningPress = (e: MouseEvent) => {
			if (pressedSinceOpen || (e.type === "click" && e.detail === 0)) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();
		};

		onMounted(() => {
			window.addEventListener("pointerdown", onPointerDown, true);
			first.value?.focus();
		});

		// A peek that turned into the menu
		watch(
			() => props.peek,
			async () => {
				await nextTick();
				first.value?.focus();
			}
		);

		onUnmounted(() => window.removeEventListener("pointerdown", onPointerDown, true));

		return {
			first,
			data,
			thumb,
			fav,
			emoji,
			size,
			send,
			favorite,
			unrecent,
			download,
			open,
			viewPack,
			ignoreOpeningPress,
		};
	},
});
</script>
