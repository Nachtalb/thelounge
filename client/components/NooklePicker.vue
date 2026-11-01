<template>
	<div id="nookle-picker" :style="style" @keydown.esc.stop.prevent="$emit('close')">
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
				<button
					v-for="item in items"
					:key="item.id"
					type="button"
					class="sticker-item nookle-item"
					:title="item.text || item.tags.join(' ')"
					@click="send(item)"
				>
					<img
						v-cancel-load
						:src="item.thumb_url"
						alt=""
						loading="lazy"
						fetchpriority="low"
					/>
				</button>
			</div>
			<p v-if="error" class="sticker-picker-note sticker-picker-error">{{ error }}</p>
			<p v-else-if="loading" class="sticker-picker-note">Loading…</p>
			<p v-else-if="!items.length" class="sticker-picker-note sticker-picker-empty">
				No memes found
			</p>
		</div>
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
import cancelLoad from "../js/helpers/cancelLoad";
import socket from "../js/socket";
import {useStore} from "../js/store";
import type {ClientChan} from "../js/types";
import {normalizeProxyUrl} from "../../shared/stickers";

type Item = {
	id: string;
	url: string;
	thumb_url: string;
	text: string | null;
	tags: string[];
	status: string;
};

export default defineComponent({
	name: "NooklePicker",
	directives: {cancelLoad},
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
		anchorRight: {type: Number, default: 6},
	},
	emits: ["close"],
	setup(props) {
		const store = useStore();
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
				const page = (data.items as Item[]).filter((item) => item.status === "ready");
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
			if (document.activeElement?.closest(".nookle-item")) {
				(document.activeElement as HTMLElement).blur();
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
