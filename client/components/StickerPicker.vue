<template>
	<div id="sticker-picker" :style="style" @keydown.esc.stop.prevent="onEscape">
		<div class="sticker-picker-search">
			<!-- Every input event searches: v-model would wait for the end of a composition (Android keyboards) -->
			<input
				ref="search"
				:value="query"
				type="search"
				class="input"
				placeholder="Search stickers by emoji"
				aria-label="Search stickers by emoji"
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
				v-for="section in sections"
				:key="section.key"
				type="button"
				role="tab"
				:class="[
					'sticker-tab',
					'sticker-tab-' + section.kind,
					{active: activeTab === section.key},
				]"
				:aria-selected="activeTab === section.key"
				:aria-label="section.title"
				:title="section.title"
				@click="scrollToSection(section.key)"
			>
				<StickerMedia
					v-if="section.kind === 'pack' && section.icon"
					:thumb="section.icon"
				/>
			</button>
			<button
				type="button"
				role="tab"
				:class="['sticker-tab', 'sticker-tab-add', {active: adding}]"
				:aria-selected="adding"
				aria-label="Add sticker pack"
				title="Add sticker pack"
				@click="toggleAdding"
			/>
		</div>
		<div ref="scroller" class="sticker-picker-scroll" @scroll.passive="onScroll">
			<div v-if="adding" class="sticker-picker-add">
				<!-- Inside the message form: Enter must not submit (and send) it -->
				<div class="sticker-picker-add-row">
					<input
						ref="packInput"
						v-model="packInputValue"
						class="input"
						placeholder="t.me/addstickers/… or pack name"
						aria-label="Sticker pack link or name"
						autocomplete="off"
						@keydown.enter.prevent="addFromInput"
					/>
					<button type="button" class="btn" :disabled="addBusy" @click="addFromInput">
						Add
					</button>
				</div>
				<p v-if="addBusy" class="sticker-picker-note">Getting the pack…</p>
				<p v-else-if="addError" class="sticker-picker-note sticker-picker-error">
					{{ addError }}
				</p>
				<h3 class="sticker-section-title">Known packs</h3>
				<p v-if="known === null" class="sticker-picker-note">Loading…</p>
				<p v-else-if="known.length === 0" class="sticker-picker-note">No packs known yet</p>
				<div v-for="pack in known || []" :key="pack.name" class="sticker-known-pack">
					<video
						v-if="pack.thumb_url && pack.format === 'webm'"
						:src="pack.thumb_url"
						muted
						preload="metadata"
						playsinline
					/>
					<img v-else-if="pack.thumb_url" :src="pack.thumb_url" loading="lazy" alt="" />
					<span class="sticker-known-pack-text">
						<span class="sticker-known-pack-title">{{ pack.title }}</span>
						<span class="sticker-picker-note">{{ pack.count }} stickers</span>
					</span>
					<button
						type="button"
						class="btn btn-small"
						:disabled="addedPacks.includes(pack.name)"
						@click="addPack(pack.name)"
					>
						{{ addedPacks.includes(pack.name) ? "Added" : "Add" }}
					</button>
				</div>
			</div>
			<template v-else-if="query.trim()">
				<div v-if="results.length" class="sticker-grid">
					<StickerItem
						v-for="item in results"
						:key="item.pack + '/' + item.id"
						:item="item"
						@pick="send"
						@menu="menuFor = $event"
					/>
				</div>
				<p v-else class="sticker-picker-note sticker-picker-empty">No stickers found</p>
			</template>
			<template v-else>
				<p v-if="sections.length === 0" class="sticker-picker-note sticker-picker-empty">
					Add a sticker pack with the + button
				</p>
				<section
					v-for="section in sections"
					:key="section.key"
					:data-section="section.key"
					class="sticker-section"
				>
					<h3 class="sticker-section-title">
						<button
							v-if="section.kind === 'pack'"
							type="button"
							@click="openPack(section.pack)"
						>
							{{ section.title }}
						</button>
						<template v-else>{{ section.title }}</template>
					</h3>
					<p v-if="section.status" class="sticker-picker-note">{{ section.status }}</p>
					<div class="sticker-grid">
						<StickerItem
							v-for="item in section.items"
							:key="item.pack + '/' + item.id"
							:item="item"
							@pick="send"
							@menu="menuFor = $event"
						/>
					</div>
				</section>
			</template>
		</div>
		<StickerMenu v-if="menuFor" :item="menuFor" @send="send" @close="closeMenu" />
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, nextTick, onMounted, PropType, ref, watch} from "vue";
import {emojiForQuery, stickerMatches} from "../js/helpers/stickerSearch";
import StickerItem from "./StickerItem.vue";
import StickerMenu from "./StickerMenu.vue";
import StickerMedia from "./StickerMedia.vue";
import type {ClientChan} from "../js/types";
import {
	addedPacks,
	favorites,
	loadKnownPacks,
	loadPack,
	loadUserPacks,
	loadedPack,
	openPack,
	packs,
	recent,
	refsOf,
	sendSticker,
	togglePack,
	type KnownPack,
} from "../js/stickers";
import {parsePackInput, type StickerRef} from "../../shared/stickers";

type Section = {
	key: string;
	kind: "favorites" | "recent" | "pack";
	title: string;
	items: StickerRef[];
	pack: string;
	icon?: string | null;
	status?: string;
};

export default defineComponent({
	name: "StickerPicker",
	components: {StickerItem, StickerMedia, StickerMenu},
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
		anchorRight: {type: Number, default: 6},
	},
	emits: ["close"],
	setup(props, {emit}) {
		const query = ref("");
		const search = ref<HTMLInputElement>();
		const scroller = ref<HTMLDivElement>();
		const packInput = ref<HTMLInputElement>();
		const activeTab = ref("");
		const adding = ref(false);
		const packInputValue = ref("");
		const addError = ref("");
		const addBusy = ref(false);
		const known = ref<KnownPack[] | null>(null);
		const menuFor = ref<StickerRef | null>(null);

		const style = computed(() => ({"--sticker-anchor-right": props.anchorRight + "px"}));

		// Favorites and recents may come from packs the user didn't add (or removed)
		watch([addedPacks, favorites, recent], loadUserPacks, {immediate: true});

		const usable = (refs: StickerRef[]) =>
			refs.filter((r) => !packs[r.pack] || !("error" in packs[r.pack]));

		const sections = computed<Section[]>(() => {
			const list: Section[] = [];
			const fav = usable(refsOf(favorites.value));
			const rec = usable(refsOf(recent.value));

			if (fav.length) {
				list.push({
					key: "favorites",
					kind: "favorites",
					title: "Favorites",
					items: fav,
					pack: "",
				});
			}

			if (rec.length) {
				list.push({
					key: "recent",
					kind: "recent",
					title: "Recently Used",
					items: rec,
					pack: "",
				});
			}

			// Stored oldest first; the newest added pack comes first
			for (const name of [...addedPacks.value].reverse()) {
				const state = packs[name];
				const pack = loadedPack(name);
				const first = pack?.stickers[0];
				const video = pack?.format === "webm";
				list.push({
					key: "pack:" + name,
					kind: "pack",
					title: pack?.title || name,
					pack: name,
					items: pack ? pack.stickers.map((s) => ({pack: name, id: s.id})) : [],
					// Video packs' own thumbnails are videos too; the first sticker's is a picture
					icon: video ? first?.thumb_url : pack?.thumbnail || first?.thumb_url,
					status: state && "error" in state ? state.error : pack ? "" : "Loading…",
				});
			}

			return list;
		});

		const results = computed<StickerRef[]>(() => {
			const wanted = emojiForQuery(query.value);
			const found = new Map<string, StickerRef>();

			for (const name of addedPacks.value) {
				for (const sticker of loadedPack(name)?.stickers || []) {
					if (stickerMatches(sticker.emoji, wanted)) {
						found.set(name + "/" + sticker.id, {pack: name, id: sticker.id});
					}
				}
			}

			return [...found.values()];
		});

		const onScroll = () => {
			const el = scroller.value;

			if (!el || adding.value || query.value.trim()) {
				return;
			}

			let current = sections.value[0]?.key || "";

			for (const section of el.querySelectorAll<HTMLElement>("[data-section]")) {
				if (section.offsetTop - el.offsetTop <= el.scrollTop + 8) {
					current = section.dataset.section || current;
				}
			}

			activeTab.value = current;
		};

		const scrollToSection = async (key: string) => {
			adding.value = false;
			query.value = "";
			activeTab.value = key;
			await nextTick();
			const el = scroller.value;
			const section = el?.querySelector<HTMLElement>(`[data-section="${CSS.escape(key)}"]`);

			if (el && section) {
				el.scrollTop = section.offsetTop - el.offsetTop;
			}

			// Scrolling fires onScroll; the last section may not reach the top
			activeTab.value = key;
		};

		const toggleAdding = async () => {
			adding.value = !adding.value;
			addError.value = "";

			if (adding.value) {
				activeTab.value = "";
				void loadKnownPacks().then((list) => (known.value = list));
				await nextTick();

				// No keyboard popping up on touch devices
				if (navigator.maxTouchPoints === 0) {
					packInput.value?.focus();
				}
			} else {
				await nextTick();
				onScroll();
			}
		};

		const addPack = async (name: string) => {
			addBusy.value = true;
			addError.value = "";
			const state = await loadPack(name);
			addBusy.value = false;

			if ("error" in state) {
				addError.value = state.error;
				return;
			}

			if (!addedPacks.value.includes(name)) {
				togglePack(name);
			}

			packInputValue.value = "";
			await scrollToSection("pack:" + name);
		};

		const addFromInput = () => {
			const name = parsePackInput(packInputValue.value);

			if (!name) {
				addError.value = "Paste a t.me/addstickers link or a pack name";
				return;
			}

			void addPack(name);
		};

		const send = (item: StickerRef) => {
			sendSticker(props.channel, item);

			// A tapped tile would keep its highlight
			if (document.activeElement?.closest(".sticker-item")) {
				(document.activeElement as HTMLElement).blur();
			}
		};

		// Focusing the search on touch would open the keyboard and move the panel
		const closeMenu = () => {
			menuFor.value = null;

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

		// Packs arrive after opening: highlight the first tab once there is one
		watch(
			() => sections.value.length,
			async () => {
				await nextTick();
				onScroll();
			}
		);

		onMounted(async () => {
			if (navigator.maxTouchPoints === 0) {
				search.value?.focus();
			}

			await nextTick();
			onScroll();
		});

		return {
			query,
			search,
			scroller,
			packInput,
			activeTab,
			adding,
			packInputValue,
			addError,
			addBusy,
			known,
			menuFor,
			style,
			sections,
			results,
			addedPacks,
			onScroll,
			scrollToSection,
			toggleAdding,
			addPack,
			addFromInput,
			send,
			closeMenu,
			onEscape,
			openPack,
		};
	},
});
</script>
