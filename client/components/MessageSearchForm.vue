<template>
	<form :class="['message-search', {opened: isOpen}]" @submit.prevent>
		<div class="input-wrapper">
			<input
				ref="searchInputField"
				v-model="searchInput"
				type="search"
				name="search"
				class="input"
				placeholder="Search messages…"
				enterkeyhint="search"
				@keydown.enter.prevent="onEnter"
				@keydown.esc.prevent="close"
			/>
			<span class="search-counter" aria-live="polite">{{ counter }}</span>
			<button
				class="search-older"
				type="button"
				aria-label="Older match (Enter)"
				title="Older match (Enter)"
				:disabled="!canStep(1)"
				@click="step(1)"
			/>
			<button
				class="search-newer"
				type="button"
				aria-label="Newer match (Ctrl+Enter)"
				title="Newer match (Ctrl+Enter)"
				:disabled="!canStep(-1)"
				@click="step(-1)"
			/>
			<button
				class="search-list"
				type="button"
				aria-label="Show all results"
				title="Show all results"
				:disabled="!searchResults.length"
				@click="chatSearch.listOpen = !chatSearch.listOpen"
			/>
			<button
				class="close"
				type="button"
				aria-label="Close search"
				title="Close search"
				@click="close"
			/>
		</div>
		<SearchResults v-if="isOpen && chatSearch.listOpen" :network="network" :channel="channel" />
		<button
			class="search"
			type="button"
			aria-label="Search messages in this channel"
			@mousedown.prevent
			@click="toggleSearch"
		/>
	</form>
</template>

<style>
form.message-search {
	display: flex;
}

form.message-search input {
	flex: 1;
	min-width: 0;
	height: auto !important;
	margin: 7px;
	border: 0;
	color: inherit;
	background-color: var(--search-input-bg-color);
	appearance: none;
}

form.message-search input::placeholder {
	color: var(--chat-placeholder-color);
}

form.message-search .input-wrapper {
	position: absolute;
	top: 45px;
	left: 0;
	right: 0;
	z-index: 2;
	display: flex;
	align-items: center;
	height: 0;
	overflow: hidden;
	background: var(--window-bg-color);
}

form.message-search.opened .input-wrapper {
	height: 50px;
	border-bottom: 1px solid var(--border-color);
}

form.message-search .search-counter {
	white-space: nowrap;
	color: var(--body-color-muted);
	padding: 0 6px;
}

#chat form.message-search button {
	display: flex;
	color: var(--icon-button-color);
}

#chat form.message-search .input-wrapper button {
	width: 36px;
	height: 36px;
	flex-shrink: 0;
	justify-content: center;
	align-items: center;
}

#chat form.message-search .input-wrapper button:disabled {
	opacity: 0.4;
}

form.message-search .input-wrapper button::before {
	font: normal normal normal 14px/1 FontAwesome;
}

form.message-search .search-older::before {
	content: "\f077"; /* chevron-up */
}

form.message-search .search-newer::before {
	content: "\f078"; /* chevron-down */
}

form.message-search .search-list::before {
	content: "\f03a"; /* list */
}
</style>

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
import eventbus from "../js/eventbus";
import {useStore} from "../js/store";
import {
	chatSearch,
	closeSearch,
	openSearch,
	search,
	searchResults,
	step,
	stepPos,
} from "../js/helpers/chatSearch";
import SearchResults from "./Windows/SearchResults.vue";
import {ClientNetwork, ClientChan} from "../js/types";

export default defineComponent({
	name: "MessageSearchForm",
	components: {SearchResults},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const store = useStore();
		const searchInput = ref(chatSearch.query);
		const searchInputField = ref<HTMLInputElement | null>(null);
		const isOpen = computed(() => chatSearch.chanId === props.channel.id);

		const counter = computed(() => {
			const total = searchResults.value.length;

			if (!chatSearch.query) {
				return "";
			}

			if (!total) {
				return store.state.messageSearchPendingQuery ? "Searching…" : "No results";
			}

			return `${Math.max(chatSearch.pos, 0) + 1} of ${total}${chatSearch.more ? "+" : ""}`;
		});

		const canStep = (dir: 1 | -1) =>
			stepPos(chatSearch.pos, dir, searchResults.value.length, chatSearch.more) !==
			chatSearch.pos;

		const focusField = async () => {
			await nextTick();
			searchInputField.value?.focus();
		};

		const close = () => {
			if (!isOpen.value) {
				return;
			}

			if (chatSearch.listOpen) {
				chatSearch.listOpen = false;
				return;
			}

			closeSearch();
			// Imported here: closeWindow imports the router, which imports this component
			void import("../js/closeWindow").then(({focusInput}) => focusInput());
		};

		const toggleSearch = () => {
			if (isOpen.value) {
				closeSearch();
				return;
			}

			openSearch(props.channel);
			void focusField();
		};

		const onEnter = (e: KeyboardEvent) => {
			const query = searchInput.value.trim();

			if (e.isComposing) {
				return;
			}

			if (query !== chatSearch.query) {
				void search(props.network, props.channel, query);
				return;
			}

			void step(e.ctrlKey || e.metaKey || e.shiftKey ? -1 : 1);
		};

		// The query also comes from the /search command
		watch(
			() => chatSearch.query,
			(query) => {
				searchInput.value = query;
			}
		);

		// Search stays in its channel
		watch(
			() => props.channel.id,
			() => {
				if (chatSearch.chanId !== -1) {
					closeSearch();
				}
			}
		);

		onMounted(() => eventbus.on("escapekey", close));
		onUnmounted(() => {
			eventbus.off("escapekey", close);
			closeSearch();
		});

		return {
			chatSearch,
			searchResults,
			searchInput,
			searchInputField,
			isOpen,
			counter,
			canStep,
			step,
			close,
			toggleSearch,
			onEnter,
		};
	},
});
</script>
