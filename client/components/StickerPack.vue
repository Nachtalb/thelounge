<template>
	<div
		v-if="name"
		id="sticker-pack-overlay"
		@click.self="close"
		@keydown.esc.stop.prevent="onEscape"
	>
		<div
			id="sticker-pack"
			ref="packDialog"
			role="dialog"
			aria-modal="true"
			:aria-label="pack?.title || name"
			@keydown.tab="trapTab"
		>
			<div class="sticker-pack-header">
				<span class="sticker-pack-heading">
					<span class="sticker-pack-title">{{ pack?.title || name }}</span>
					<span class="sticker-picker-note">{{ subtitle }}</span>
				</span>
				<button
					ref="closeBtn"
					type="button"
					class="sticker-pack-close"
					aria-label="Close"
					@click="close"
				>
					&times;
				</button>
			</div>
			<div class="sticker-pack-body">
				<div v-if="pack" class="sticker-grid">
					<StickerItem
						v-for="sticker in pack.stickers"
						:key="sticker.id"
						:item="{pack: pack.name, id: sticker.id}"
						@pick="send"
						@menu="openMenu"
					/>
				</div>
			</div>
			<div v-if="pack" class="sticker-pack-footer">
				<a
					class="btn sticker-pack-telegram"
					:href="pack.link"
					target="_blank"
					rel="noopener"
					aria-label="Open in Telegram"
					title="Open in Telegram"
				/>
				<button
					type="button"
					class="btn sticker-pack-copy"
					aria-label="Copy link"
					title="Copy link"
					@click="copyLink(pack.link)"
				/>
				<button
					type="button"
					:class="['btn', {'sticker-pack-remove': added}]"
					@click="togglePack(pack.name)"
				>
					{{ added ? "Remove" : "Add" }} {{ pack.stickers.length }} stickers
				</button>
			</div>
			<StickerMenu
				v-if="menuFor"
				:item="menuFor"
				:show-view-pack="false"
				:peek="peeking"
				@send="send"
				@close="closeMenu"
			/>
		</div>
		<div v-if="toast" class="copy-toast" role="status">{{ toast }}</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, nextTick, onMounted, onUnmounted, ref} from "vue";
import eventbus from "../js/eventbus";
import {useStore} from "../js/store";
import {addedPacks, loadPack, loadedPack, packs, sendSticker, togglePack} from "../js/stickers";
import {ChanType} from "../../shared/types/chan";
import type {StickerRef} from "../../shared/stickers";
import {tileSticker, useStickerPeek} from "../js/helpers/stickerPeek";
import {copyText} from "../js/helpers/copyImage";
import StickerItem from "./StickerItem.vue";
import StickerMenu from "./StickerMenu.vue";

// Telegram's pack preview: title, count, all stickers, Add/Remove pack
export default defineComponent({
	name: "StickerPack",
	components: {StickerItem, StickerMenu},
	setup() {
		const store = useStore();
		const name = ref("");
		const closeBtn = ref<HTMLButtonElement>();
		const menuFor = ref<StickerRef | null>(null);
		const peeking = ref(false);
		const packDialog = ref<HTMLElement>();
		const pack = computed(() => (name.value ? loadedPack(name.value) : null));
		const added = computed(() => addedPacks.value.includes(name.value));

		const toast = ref("");
		let toastTimer: ReturnType<typeof setTimeout> | undefined;

		const showToast = (message: string, ms: number) => {
			clearTimeout(toastTimer);
			toast.value = message;
			toastTimer = setTimeout(() => (toast.value = ""), ms);
		};

		// The t.me link adds the pack in Telegram and in the "+" of the picker; if the browser
		// refuses to copy, the link is shown instead
		const copyLink = (link: string) => {
			copyText(link).then(
				() => showToast("Link copied", 2000),
				() => showToast(link, 6000)
			);
		};

		const subtitle = computed(() => {
			const state = packs[name.value];

			if (pack.value) {
				return `${pack.value.stickers.length} stickers`;
			}

			return state && "error" in state ? state.error : "Loading…";
		});

		const open = (packName: string) => {
			name.value = packName;
			menuFor.value = null;
			void loadPack(packName);
			void nextTick(() => closeBtn.value?.focus());
		};

		const close = () => {
			if (!name.value) {
				return;
			}

			name.value = "";
			document.getElementById("input")?.focus();
		};

		const cancelPeek = useStickerPeek(packDialog, {
			peek(tile) {
				menuFor.value = tileSticker(tile);
				peeking.value = true;
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
		};

		const closeMenu = () => {
			cancelPeek();
			menuFor.value = null;
			peeking.value = false;
		};

		const onEscape = () => (menuFor.value ? closeMenu() : close());

		const send = (item: StickerRef) => {
			const channel = store.state.activeChannel?.channel;

			if (channel && (channel.type === ChanType.CHANNEL || channel.type === ChanType.QUERY)) {
				sendSticker(channel, item);
				close();
			}
		};

		// Keep Tab inside the dialog
		const trapTab = (e: KeyboardEvent) => {
			const dialog = e.currentTarget as HTMLElement;
			const focusable = [...dialog.querySelectorAll<HTMLElement>("button, a[href]")];
			const index = focusable.indexOf(document.activeElement as HTMLElement);
			const next = index + (e.shiftKey ? -1 : 1);

			if (next < 0 || next >= focusable.length) {
				e.preventDefault();
				focusable[(next + focusable.length) % focusable.length]?.focus();
			}
		};

		onMounted(() => {
			eventbus.on("stickers:pack", open);
			eventbus.on("escapekey", close);
		});

		onUnmounted(() => {
			eventbus.off("stickers:pack", open);
			eventbus.off("escapekey", close);
		});

		return {
			name,
			closeBtn,
			menuFor,
			peeking,
			packDialog,
			openMenu,
			closeMenu,
			pack,
			added,
			subtitle,
			close,
			onEscape,
			send,
			trapTab,
			togglePack,
			toast,
			copyLink,
		};
	},
});
</script>
