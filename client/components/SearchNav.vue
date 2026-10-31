<template>
	<div
		:class="['search-nav', {'beside-userlist': channel.type === 'channel'}]"
		role="toolbar"
		aria-label="Search navigation"
	>
		<div v-if="chatSearch.query && !chatSearch.listOpen" class="search-steps">
			<button
				class="search-step search-older"
				type="button"
				aria-label="Older match (Enter)"
				title="Older match (Enter)"
				:disabled="!canStep(1)"
				@click="step(1)"
			>
				<div class="scroll-down-arrow" />
			</button>
			<button
				class="search-step search-newer"
				type="button"
				aria-label="Newer match (Ctrl+Enter)"
				title="Newer match (Ctrl+Enter)"
				:disabled="!canStep(-1)"
				@click="step(-1)"
			>
				<div class="scroll-down-arrow" />
			</button>
		</div>
		<span class="search-counter" aria-live="polite">{{ counter }}</span>
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

.search-nav > button,
.search-nav .search-step {
	color: var(--icon-button-color);
}

.search-nav > button:disabled,
.search-nav .search-step:disabled {
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

/* Telegram's up/down chevrons, looking like the jump to recent messages button */
.search-nav .search-steps {
	position: absolute;
	bottom: calc(100% + 16px);
	right: 16px;
	z-index: 2;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

#viewport.userlist-open .search-nav.beside-userlist .search-steps {
	right: 196px;
}

.search-nav .search-step:not(:disabled):hover .scroll-down-arrow {
	background: var(--button-color);
	color: var(--button-text-color-hover);
}

.search-nav .scroll-down-arrow::after {
	font: normal normal normal 14px/1 FontAwesome;
	content: "\f107"; /* angle-down */
}

.search-nav .search-older .scroll-down-arrow::after {
	content: "\f106"; /* angle-up */
}

/* The chevrons sit where the jump to recent messages button would */
#chat-container:has(.search-nav) .scroll-down {
	display: none;
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
