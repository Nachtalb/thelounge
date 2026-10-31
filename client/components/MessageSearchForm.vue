<template>
	<form :class="['message-search', {opened: isOpen}]" @submit.prevent>
		<div class="input-wrapper">
			<button
				class="search-back"
				type="button"
				aria-label="Close search (Esc)"
				title="Close search (Esc)"
				@click="back"
			/>
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
				@keydown.ctrl.f.prevent="focusSearch"
				@keydown.meta.f.prevent="focusSearch"
			/>
			<button
				v-show="searchInput"
				class="search-clear"
				type="button"
				aria-label="Clear search"
				title="Clear search"
				@click="clear"
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

form.message-search input::-webkit-search-cancel-button {
	display: none;
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

#chat form.message-search :is(.search-back, .search-clear)::before {
	content: "";
	width: 16px;
	height: 16px;
	background-color: currentcolor;
	mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E")
		center / contain no-repeat;
}

#chat form.message-search .search-back::before {
	width: 18px;
	height: 18px;
	mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 19-7-7 7-7M19 12H5'/%3E%3C/svg%3E");
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
import {enableSearchNickAutocomplete} from "../js/autocompletion";
import {useStore} from "../js/store";
import {
	chatSearch,
	closeSearch,
	focusSearch,
	openSearch,
	search,
	step,
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

		const focusField = async () => {
			await nextTick();
			searchInputField.value?.focus();
		};

		// Enter/Escape pick or dismiss a nick completion first
		let completing = false;

		const close = () => {
			if (!isOpen.value || completing) {
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

		const back = () => {
			chatSearch.listOpen = false;
			close();
		};

		const clear = () => {
			void search(props.network, props.channel, "");
			void focusField();
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

			if (e.isComposing || completing) {
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

		let textcomplete: ReturnType<typeof enableSearchNickAutocomplete> | undefined;

		onMounted(() => {
			eventbus.on("escapekey", close);

			if (searchInputField.value) {
				textcomplete = enableSearchNickAutocomplete(searchInputField.value);
				textcomplete.on("show", () => (completing = true));
				// After this key's other listeners ran
				textcomplete.on("hidden", () => setTimeout(() => (completing = false)));
			}
		});
		onUnmounted(() => {
			eventbus.off("escapekey", close);
			textcomplete?.destroy();
			closeSearch();
		});

		return {
			store,
			chatSearch,
			focusSearch,
			searchInput,
			searchInputField,
			isOpen,
			back,
			clear,
			close,
			toggleSearch,
			onEnter,
		};
	},
});
</script>
