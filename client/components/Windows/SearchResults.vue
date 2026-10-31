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
					:highlight="searchHighlight"
				/>
			</div>
			<DateMarker v-if="shouldDisplayDateMarker(i)" :message="message" />
		</template>
		<div v-if="store.state.messageSearchPendingQuery" class="search-status">Loading…</div>
	</div>
</template>

<style>
/* Sheet above the bottom search bar, newest match nearest to it */
.search-results {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 3;
	display: flex;
	flex-direction: column-reverse;
	max-height: 55vh;
	overflow-y: auto;
	scrollbar-width: thin;
	background: var(--window-bg-color);
	border-top: 1px solid var(--border-color);
	box-shadow: 0 -2px 8px var(--shadow-color);
	line-height: normal;
}

/* Dims the chat behind the sheet; a click closes the list */
.search-scrim {
	position: absolute;
	inset: 0;
	z-index: 2;
	background: rgb(0 0 0 / 45%);
}

.search-scrim-enter-active,
.search-scrim-leave-active {
	transition: opacity 0.15s;
}

.search-scrim-enter-from,
.search-scrim-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.search-scrim-enter-active,
	.search-scrim-leave-active {
		transition: none;
	}
}

.userlist-open .chat-view[data-type="channel"] .search-scrim,
.userlist-open .chat-view[data-type="channel"] .search-results {
	right: 180px;
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
import {
	chatSearch,
	goTo,
	loadMore,
	searchHighlight,
	searchResults,
} from "../../js/helpers/chatSearch";

// Popup listing every match of the in-channel search, newest at the bottom
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

		// Above the oldest match of each day (rows are newest first, shown bottom up)
		const shouldDisplayDateMarker = (i: number) => {
			const older = searchResults.value[i + 1];
			return (
				!older ||
				new Date(older.time).toDateString() !==
					new Date(searchResults.value[i].time).toDateString()
			);
		};

		// Near the top: scrollTop is 0 at the bottom and negative above
		const onScroll = () => {
			const el = list.value;

			if (el && el.scrollHeight - el.clientHeight + el.scrollTop <= 100) {
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
			searchHighlight,
			searchResults,
			shouldDisplayDateMarker,
			onScroll,
			pick,
		};
	},
});
</script>
