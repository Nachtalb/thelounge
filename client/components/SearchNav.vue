<template>
	<div class="search-nav" role="toolbar" aria-label="Search navigation">
		<span class="search-counter" aria-live="polite">{{ counter }}</span>
		<button
			class="search-step search-older"
			type="button"
			aria-label="Older match (Enter)"
			title="Older match (Enter)"
			:disabled="!canStep(1)"
			@click="step(1)"
		/>
		<button
			class="search-step search-newer"
			type="button"
			aria-label="Newer match (Ctrl+Enter)"
			title="Newer match (Ctrl+Enter)"
			:disabled="!canStep(-1)"
			@click="step(-1)"
		/>
		<button
			class="search-list-toggle"
			type="button"
			:disabled="!chatSearch.listOpen && !searchResults.length"
			@click="chatSearch.listOpen = !chatSearch.listOpen"
		>
			{{ chatSearch.listOpen ? "Show in chat" : "Show as list" }}
		</button>
	</div>
</template>

<style>
/* Takes the message input's place (#form) while searching */
.search-nav {
	flex: 0 0 auto;
	position: relative;
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 41px;
	padding: 6px 6px 2px;
	border-top: 1px solid var(--border-color);
	background: var(--form-bg-color);
	font-size: 14px;
}

.search-nav > button {
	color: var(--icon-button-color);
}

.search-nav > button:disabled {
	opacity: 0.4;
	cursor: default;
}

.search-nav .search-counter {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--link-color);
}

.search-nav .search-list-toggle {
	flex-shrink: 0;
	height: 32px;
	padding: 0 8px;
	color: var(--link-color);
	font-weight: bold;
}

.search-nav .search-step {
	width: 32px;
	height: 32px;
	flex-shrink: 0;
}

.search-nav .search-step::before {
	font: normal normal normal 14px/1 FontAwesome;
	content: "\f078"; /* chevron-down */
}

.search-nav .search-older::before {
	content: "\f077"; /* chevron-up */
}
</style>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import {useStore} from "../js/store";
import {chatSearch, counterText, searchResults, step, stepPos} from "../js/helpers/chatSearch";
import type {ClientChan} from "../js/types";

// Bottom bar replacing the message input while searching in a channel
export default defineComponent({
	name: "SearchNav",
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup() {
		const store = useStore();

		const counter = computed(() =>
			counterText(
				chatSearch.query,
				chatSearch.pos,
				searchResults.value.length,
				chatSearch.more,
				!!store.state.messageSearchPendingQuery
			)
		);

		const canStep = (dir: 1 | -1) =>
			stepPos(chatSearch.pos, dir, searchResults.value.length, chatSearch.more) !==
			chatSearch.pos;

		return {
			chatSearch,
			searchResults,
			counter,
			canStep,
			step,
		};
	},
});
</script>
