<template>
	<div
		ref="list"
		class="search-results"
		:class="{
			'time-seconds': store.state.settings.showSeconds,
			'time-12h': store.state.settings.use12hClock,
		}"
		role="listbox"
		aria-label="Search results"
		@scroll.passive="onScroll"
	>
		<template v-for="(message, i) in searchResults" :key="message.id">
			<DateMarker v-if="shouldDisplayDateMarker(i)" :message="message" />
			<div
				:class="['result', {current: i === chatSearch.pos}]"
				role="option"
				:aria-selected="i === chatSearch.pos"
				@click="pick(i)"
			>
				<Message
					:channel="channel"
					:network="network"
					:message="message"
					:highlight="chatSearch.query"
				/>
			</div>
		</template>
		<div v-if="store.state.messageSearchPendingQuery" class="search-status">Loading…</div>
	</div>
</template>

<style>
.search-results {
	position: absolute;
	top: 95px;
	right: 0;
	z-index: 2;
	width: min(600px, 100%);
	max-height: 60vh;
	overflow-y: auto;
	scrollbar-width: thin;
	background: var(--window-bg-color);
	border: 1px solid var(--border-color);
	box-shadow: 0 2px 8px var(--shadow-color);
	line-height: normal;
}

.search-results .result {
	cursor: pointer;
}

.search-results .result:hover,
.search-results .result.current {
	background-color: var(--search-current-bg-color);
}

.search-results .search-status {
	padding: 10px;
	text-align: center;
}
</style>

<script lang="ts">
import Message from "../Message.vue";
import DateMarker from "../DateMarker.vue";
import {defineComponent, onMounted, PropType, ref} from "vue";
import type {ClientChan, ClientNetwork} from "../../js/types";
import {useStore} from "../../js/store";
import {chatSearch, goTo, loadMore, searchResults} from "../../js/helpers/chatSearch";

// Popup listing every match of the in-channel search, newest first
export default defineComponent({
	name: "SearchResults",
	components: {
		Message,
		DateMarker,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup() {
		const store = useStore();
		const list = ref<HTMLDivElement>();

		const shouldDisplayDateMarker = (i: number) => {
			const previous = searchResults.value[i - 1];
			return (
				!previous ||
				new Date(previous.time).toDateString() !==
					new Date(searchResults.value[i].time).toDateString()
			);
		};

		const onScroll = () => {
			const el = list.value;

			if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
				void loadMore();
			}
		};

		const pick = (i: number) => {
			chatSearch.listOpen = false;
			void goTo(i);
		};

		onMounted(() => {
			list.value?.querySelector(".result.current")?.scrollIntoView({block: "center"});
		});

		return {
			store,
			list,
			chatSearch,
			searchResults,
			shouldDisplayDateMarker,
			onScroll,
			pick,
		};
	},
});
</script>
