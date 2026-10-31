<template>
	<button
		class="date-picker-button"
		type="button"
		popovertarget="date-picker"
		aria-label="Jump to date"
		title="Jump to date"
	/>
	<div
		id="date-picker"
		ref="popover"
		popover
		class="date-picker"
		role="dialog"
		aria-label="Choose date"
		tabindex="-1"
		@toggle="onToggle"
		@keydown.esc.stop.prevent="close"
	>
		<div class="date-picker-head">
			<button
				class="date-picker-prev"
				type="button"
				aria-label="Previous month"
				:disabled="!neighbour(months, viewKey, -1)"
				@click="goMonth(-1)"
			/>
			<span class="date-picker-ym">
				<output>{{ monthName }}</output>
				<input
					type="number"
					aria-label="Year"
					:value="view.year"
					@change="onYearInput"
					@keydown.enter.prevent="onYearInput"
				/>
				<span class="date-picker-spin">
					<button
						type="button"
						aria-label="Next year"
						:disabled="!neighbour(years, String(view.year), 1)"
						@click="goYear(1)"
					/>
					<button
						type="button"
						aria-label="Previous year"
						:disabled="!neighbour(years, String(view.year), -1)"
						@click="goYear(-1)"
					/>
				</span>
			</span>
			<button
				class="date-picker-next"
				type="button"
				aria-label="Next month"
				:disabled="!neighbour(months, viewKey, 1)"
				@click="goMonth(1)"
			/>
		</div>
		<div class="date-picker-grid" @keydown="onGridKey">
			<span v-for="d in weekdays" :key="d" class="dow">{{ d }}</span>
			<button
				v-for="cell in cells"
				:key="cell.key"
				type="button"
				:data-key="cell.key"
				:class="{out: cell.out}"
				:disabled="!days.has(cell.key)"
				:tabindex="cell.key === focusKey ? 0 : -1"
				:aria-current="cell.key === today ? 'date' : undefined"
				:aria-pressed="cell.key === selected"
				@click="pick(cell.key)"
			>
				{{ cell.day }}
			</button>
		</div>
	</div>
</template>

<style>
.date-picker-button {
	anchor-name: --date-picker;
}

.date-picker {
	position-anchor: --date-picker;
	inset: auto;
	bottom: anchor(top);
	left: anchor(left);
	position-try-fallbacks: flip-block, flip-inline;
	box-sizing: border-box;
	width: 288px;
	max-width: calc(100vw - 16px);
	margin: 0 0 8px;
	padding: 12px;
	border: 1px solid var(--border-color);
	border-radius: 8px;
	background: var(--window-bg-color);
	color: var(--body-color);
	box-shadow: 0 4px 16px var(--shadow-color);
	font: inherit;
	font-size: 14px;
}

@supports not (bottom: anchor(top)) {
	.date-picker {
		inset: 0;
		margin: auto;
	}
}

.date-picker:focus {
	outline: none;
}

.date-picker button {
	color: inherit;
	border-radius: 4px;
	cursor: pointer;
}

.date-picker button:disabled {
	cursor: default;
}

.date-picker button:focus-visible,
.date-picker input:focus-visible {
	outline: 2px solid var(--link-color);
	outline-offset: 1px;
}

.date-picker-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.date-picker-head > button {
	width: 30px;
	height: 30px;
	display: flex;
	justify-content: center;
	align-items: center;
	color: var(--link-color);
}

.date-picker-head button:disabled {
	opacity: 0.3;
}

.date-picker-head button::before {
	content: "";
	width: 16px;
	height: 16px;
	background-color: currentcolor;
	mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 18-6-6 6-6'/%3E%3C/svg%3E")
		center / contain no-repeat;
}

.date-picker-head .date-picker-next::before {
	transform: scaleX(-1);
}

.date-picker-ym {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: bold;
}

.date-picker-ym input {
	width: 4.2em;
	padding: 2px 4px;
	border: 1px solid var(--border-color);
	border-radius: 4px;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: center;
	appearance: textfield;
}

.date-picker-ym input::-webkit-inner-spin-button {
	appearance: none;
}

.date-picker-spin {
	display: grid;
	gap: 2px;
}

.date-picker-head .date-picker-spin button {
	width: 16px;
	height: 12px;
	display: flex;
	justify-content: center;
	align-items: center;
	color: var(--link-color);
}

.date-picker-head .date-picker-spin button::before {
	width: 10px;
	height: 10px;
	transform: rotate(90deg);
}

.date-picker-head .date-picker-spin button + button::before {
	transform: rotate(-90deg);
}

.date-picker-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 2px;
	text-align: center;
	font-variant-numeric: tabular-nums;
}

.date-picker-grid .dow {
	padding-bottom: 4px;
	color: var(--body-color-muted);
	font-size: 11px;
}

.date-picker-grid button {
	aspect-ratio: 1;
	border: 1px solid transparent;
}

.date-picker-grid button:not(:disabled):hover {
	background: color-mix(in srgb, currentcolor 12%, transparent);
}

.date-picker-grid button.out {
	color: var(--body-color-muted);
}

.date-picker-grid button:disabled {
	opacity: 0.3;
}

.date-picker-grid button[aria-current="date"] {
	border-color: var(--body-color-muted);
}

.date-picker-grid button[aria-pressed="true"],
.date-picker-grid button[aria-pressed="true"]:hover {
	background: var(--link-color);
	color: var(--window-bg-color);
}

@media (prefers-reduced-motion: no-preference) {
	.date-picker-grid button {
		transition: background-color 0.12s;
	}
}
</style>

<script lang="ts">
import {computed, defineComponent, nextTick, PropType, reactive, ref} from "vue";
import {dayKey, matchDays, neighbour} from "../js/helpers/chatSearch";

// Calendar popover where only days with a match can be picked; emits the match position
export default defineComponent({
	name: "DatePicker",
	props: {
		times: {type: Array as PropType<number[]>, required: true}, // newest first
		current: {type: Number, default: 0}, // time of the current match
	},
	emits: ["pick"],
	setup(props, {emit}) {
		const popover = ref<HTMLDivElement | null>(null);
		const view = reactive({year: 0, month: 0});
		const focusKey = ref("");
		const today = ref("");

		const days = computed(() => matchDays(props.times));
		const sortedDays = computed(() => [...days.value.keys()].sort());
		const months = computed(() => [...new Set(sortedDays.value.map((d) => d.slice(0, 7)))]);
		const years = computed(() => [...new Set(sortedDays.value.map((d) => d.slice(0, 4)))]);
		const selected = computed(() => (props.current ? dayKey(props.current) : ""));
		const viewKey = computed(() => dayKey(new Date(view.year, view.month, 1)).slice(0, 7));
		const monthName = computed(() =>
			new Date(view.year, view.month, 1).toLocaleDateString(undefined, {month: "long"})
		);
		const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

		// Monday-first 6 week grid
		const cells = computed(() => {
			const lead = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
			return Array.from({length: 42}, (_, i) => {
				const d = new Date(view.year, view.month, i - lead + 1);
				return {key: dayKey(d), day: d.getDate(), out: d.getMonth() !== view.month};
			});
		});

		const show = (key: string) => {
			view.year = Number(key.slice(0, 4));
			view.month = Number(key.slice(5, 7)) - 1;
		};

		const focusDay = async (key: string) => {
			focusKey.value = key;
			show(key);
			await nextTick();
			popover.value?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
		};

		const firstDayIn = (prefix: string) => sortedDays.value.find((d) => d.startsWith(prefix));

		const showMonth = async (month?: string) => {
			if (!month) {
				return;
			}

			show(month);
			focusKey.value = firstDayIn(month) || "";
			await nextTick();

			// The focused day may have gone with the old month
			if (!popover.value?.contains(document.activeElement)) {
				void focusDay(focusKey.value);
			}
		};

		const goMonth = (dir: 1 | -1) => showMonth(neighbour(months.value, viewKey.value, dir));

		const goYear = (dir: 1 | -1) => {
			const year = neighbour(years.value, String(view.year), dir);
			const inYear = (m: string) => !!year && m.startsWith(year);
			void showMonth(dir > 0 ? months.value.find(inYear) : months.value.findLast(inYear));
		};

		const onYearInput = (e: Event) => {
			const input = e.target as HTMLInputElement;
			void showMonth(months.value.find((m) => m.startsWith(input.value + "-")));
			input.value = String(view.year);
		};

		// Arrows move between days with matches, skipping the others
		const onGridKey = (e: KeyboardEvent) => {
			const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[e.key];

			if (!step || !focusKey.value) {
				return;
			}

			e.preventDefault();
			const [y, m, d] = focusKey.value.split("-").map(Number);
			const dir = step > 0 ? 1 : -1;
			// For a week step: the nearest day at least 7 days away
			const from = dayKey(new Date(y, m - 1, d + step - dir));
			const next = neighbour(sortedDays.value, from, dir);

			if (next) {
				void focusDay(next);
			}
		};

		const close = () => popover.value?.hidePopover();

		const pick = (key: string) => {
			emit("pick", days.value.get(key));
			close();
		};

		const onToggle = (e: Event) => {
			if ((e as ToggleEvent).newState !== "open") {
				return;
			}

			today.value = dayKey(Date.now());
			const start = days.value.has(selected.value)
				? selected.value
				: sortedDays.value[sortedDays.value.length - 1];

			if (start) {
				void focusDay(start);
			}
		};

		return {
			popover,
			view,
			viewKey,
			monthName,
			weekdays,
			cells,
			days,
			months,
			years,
			selected,
			today,
			focusKey,
			neighbour,
			goMonth,
			goYear,
			onYearInput,
			onGridKey,
			close,
			pick,
			onToggle,
		};
	},
});
</script>
