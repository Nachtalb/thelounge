<template>
	<div id="nookle-picker" ref="root" :style="style" @keydown.esc.stop.prevent="onEscape">
		<div class="sticker-picker-search">
			<!-- Every input event searches: v-model would wait for the end of a composition (Android keyboards) -->
			<input
				ref="search"
				:value="query"
				type="search"
				class="input"
				placeholder="Search memes"
				aria-label="Search memes"
				autocomplete="off"
				@input="query = ($event.target as HTMLInputElement).value"
				@keydown.enter.prevent
			/>
			<button
				v-show="query"
				type="button"
				class="sticker-picker-clear"
				aria-label="Clear search"
				title="Clear search"
				@mousedown.prevent
				@click="query = ''"
			/>
		</div>
		<div class="sticker-picker-tabs" role="tablist">
			<button
				v-for="option in sorts"
				:key="option.value"
				type="button"
				role="tab"
				:class="['sticker-tab', 'nookle-sort', {active: sort === option.value}]"
				:aria-selected="sort === option.value"
				@click="sort = option.value"
			>
				{{ option.label }}
			</button>
		</div>
		<div ref="scroller" class="sticker-picker-scroll" @scroll.passive="loadMoreIfNear">
			<div v-if="items.length" class="sticker-grid">
				<StickerItem
					v-for="item in items"
					:key="item.id"
					:item="item.ref"
					:media="item.tile"
					:label="item.label"
					@pick="send(item)"
					@menu="menuFor = item"
				/>
			</div>
			<p v-if="error" class="sticker-picker-note sticker-picker-error">{{ error }}</p>
			<p v-else-if="loading" class="sticker-picker-note">Loading…</p>
			<p v-else-if="!items.length" class="sticker-picker-note sticker-picker-empty">
				No memes found
			</p>
		</div>
		<StickerMenu
			v-if="menuFor"
			:item="menuFor.ref"
			:media="menuFor.full"
			:open-url="menuFor.url"
			:peek="peeking"
			@send="send(menuFor)"
			@close="closeMenu"
		/>
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
import {tileSticker, useStickerPeek} from "../js/helpers/stickerPeek";
import type {Media} from "../js/stickers";
import StickerItem from "./StickerItem.vue";
import StickerMenu from "./StickerMenu.vue";
import socket from "../js/socket";
import {useStore} from "../js/store";
import type {ClientChan} from "../js/types";
import {normalizeProxyUrl, type StickerRef} from "../../shared/stickers";

type ApiItem = {
	id: string;
	kind: "image" | "gif" | "video";
	url: string;
	thumb_url: string;
	width: number;
	height: number;
	text: string | null;
	tags: string[];
	status: string;
};

// Shown with the sticker picker's tiles, peek and menu; `ref` keys the tile for the peek
type Item = {
	id: string;
	url: string;
	ref: StickerRef;
	label: string;
	tile: Media;
	full: Media;
};

function toItem(item: ApiItem): Item {
	const kind = item.kind === "gif" ? "animated" : item.kind;
	// Assets have no CORS headers, so they can't go through the sticker file cache
	const full: Media = {
		thumb: item.thumb_url,
		src: item.url,
		kind,
		width: item.width,
		height: item.height,
		direct: true,
	};
	return {
		id: item.id,
		url: item.url,
		ref: {pack: "nookle", id: item.id},
		label: item.text || item.tags.join(" ") || "Meme",
		// Photos show their thumb in the grid
		tile: kind === "image" ? {...full, src: ""} : full,
		full,
	};
}

export default defineComponent({
	name: "NooklePicker",
	components: {StickerItem, StickerMenu},
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
		anchorRight: {type: Number, default: 6},
	},
	emits: ["close"],
	setup(props, {emit}) {
		const store = useStore();
		const root = ref<HTMLElement>();
		const menuFor = ref<Item | null>(null);
		const peeking = ref(false);
		const query = ref("");
		const sort = ref("used");
		const items = ref<Item[]>([]);
		const cursor = ref<string | null>(null);
		const loading = ref(false);
		const error = ref("");
		const search = ref<HTMLInputElement>();
		const scroller = ref<HTMLDivElement>();
		const sorts = [
			{value: "used", label: "Most used"},
			{value: "recent", label: "Recent"},
			{value: "added", label: "Newest"},
		];

		const style = computed(() => ({"--sticker-anchor-right": props.anchorRight + "px"}));
		const base = computed(() => normalizeProxyUrl(store.state.settings.nookleUrl));
		const headers = computed(() => ({
			Authorization: `Bearer ${String(store.state.settings.nookleKey).trim()}`,
		}));

		let controller: AbortController | null = null;

		const load = async (more: boolean) => {
			controller?.abort();
			const current = (controller = new AbortController());
			const params = new URLSearchParams({
				q: query.value.trim(),
				sort: sort.value,
				limit: "50",
			});

			if (more && cursor.value) {
				params.set("cursor", cursor.value);
			}

			loading.value = true;
			error.value = "";

			try {
				if (!base.value) {
					throw new Error("Set your Nookle URL in Settings");
				}

				const res = await fetch(`${base.value}/api/items?${params.toString()}`, {
					headers: headers.value,
					signal: current.signal,
					priority: "low",
				});
				const data = await res.json().catch(() => null);

				if (!res.ok || !data) {
					throw new Error(data?.message || `Nookle answered ${res.status}`);
				}

				// Assets only exist once an item is ready
				const page = (data.items as ApiItem[])
					.filter((item) => item.status === "ready")
					.map(toItem);
				items.value = more ? [...items.value, ...page] : page;
				cursor.value = data.next_cursor;
			} catch (e) {
				if (current.signal.aborted) {
					return;
				}

				error.value = e instanceof Error ? e.message : "Couldn't reach Nookle";
			}

			loading.value = false;
			await nextTick();
			loadMoreIfNear();
		};

		// Next page well before the end, and right away while the grid doesn't fill the panel
		function loadMoreIfNear() {
			const el = scroller.value;

			if (el && cursor.value && !loading.value && !error.value) {
				if (el.scrollTop + el.clientHeight * 2 >= el.scrollHeight) {
					void load(true);
				}
			}
		}

		const reload = () => {
			cursor.value = null;
			scroller.value?.scrollTo({top: 0});
			void load(false);
		};

		let timer: ReturnType<typeof setTimeout> | undefined;
		watch(query, () => {
			clearTimeout(timer);
			timer = setTimeout(reload, 250);
		});
		watch(sort, reload);

		const send = (item: Item) => {
			if (!store.state.isConnected) {
				return;
			}

			const replyTo = props.channel.replyingTo?.msgid;
			props.channel.replyingTo = null;

			socket.emit("input", {
				target: props.channel.id,
				text: item.url,
				...(replyTo && {replyTo}),
			});

			// Nookle ranks "Most used" by these
			void fetch(`${base.value}/api/items/${encodeURIComponent(item.id)}/hit`, {
				method: "POST",
				headers: headers.value,
			}).catch(() => {});

			// A tapped tile would keep its highlight
			if (document.activeElement?.closest(".sticker-item")) {
				(document.activeElement as HTMLElement).blur();
			}
		};

		const cancelPeek = useStickerPeek(root, {
			peek(tile) {
				const id = tileSticker(tile).id;
				menuFor.value = items.value.find((item) => item.id === id) || null;
				peeking.value = true;
			},
			menu: () => (peeking.value = false),
			close() {
				menuFor.value = null;
				peeking.value = false;
			},
		});

		// Focusing the search on touch would open the keyboard and move the panel
		const closeMenu = () => {
			cancelPeek();
			menuFor.value = null;
			peeking.value = false;

			if (navigator.maxTouchPoints === 0) {
				search.value?.focus({preventScroll: true});
			}
		};

		const onEscape = () => {
			if (menuFor.value) {
				closeMenu();
			} else {
				emit("close");
			}
		};

		onMounted(() => {
			if (navigator.maxTouchPoints === 0) {
				search.value?.focus();
			}

			void load(false);
		});

		onUnmounted(() => {
			clearTimeout(timer);
			controller?.abort();
		});

		return {
			root,
			menuFor,
			peeking,
			closeMenu,
			onEscape,
			query,
			sort,
			sorts,
			items,
			loading,
			error,
			search,
			scroller,
			style,
			send,
			loadMoreIfNear,
		};
	},
});
</script>
