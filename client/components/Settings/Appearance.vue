<template>
	<div>
		<SettingCard title="Theme">
			<label for="theme-select" class="sr-only">Theme</label>
			<select
				id="theme-select"
				:value="store.state.settings.theme"
				name="theme"
				class="input"
			>
				<option
					v-for="theme in store.state.serverConfiguration?.themes"
					:key="theme.name"
					:value="theme.name"
				>
					{{ theme.displayName }}
				</option>
			</select>
		</SettingCard>

		<SettingCard title="Emoji style" title-id="emoji-style-title">
			<EmojiStylePicker
				:options="emojiStyleOptions"
				:model-value="store.state.settings.emojiStyle"
				labelledby="emoji-style-title"
				@update:model-value="setEmojiStyle"
			/>
		</SettingCard>

		<SettingCard title="Messages">
			<SettingToggle
				name="motd"
				label="Show MOTD"
				description="Display the server's Message of the Day when connecting"
				:checked="store.state.settings.motd"
			/>
			<SettingToggle
				name="showSeconds"
				label="Include seconds in timestamps"
				description="Show seconds alongside hours and minutes in message timestamps"
				:checked="store.state.settings.showSeconds"
			/>
			<SettingToggle
				name="use12hClock"
				label="Use 12-hour clock"
				description="Display timestamps in 12-hour format instead of 24-hour"
				:checked="store.state.settings.use12hClock"
			/>
		</SettingCard>

		<SettingCard v-if="store.state.serverConfiguration?.prefetch" title="Link previews">
			<SettingToggle
				name="media"
				label="Auto-expand media"
				description="Automatically show inline previews for images and videos"
				:checked="store.state.settings.media"
			/>
			<SettingToggle
				name="links"
				label="Auto-expand websites"
				description="Automatically show link previews for URLs"
				:checked="store.state.settings.links"
			/>
		</SettingCard>

		<SettingCard
			v-if="
				store.state.serverConfiguration?.prefetch &&
				!store.state.serverConfiguration?.public
			"
			title="Link preview filters"
		>
			<div class="setting-card-intro">
				No previews for links matching these rules, in addition to the server's. One
				adblock-style rule per line: <code>||example.com^</code>,
				<code>|https://prefix</code>, <code>*</code> wildcards, <code>/regex/</code>,
				<code>@@</code> exceptions (only lift your own rules) and <code>!</code> comments
			</div>
			<label for="preview-filters-input" class="sr-only">Link preview filters</label>
			<textarea
				id="preview-filters-input"
				:value="previewFiltersText"
				class="input"
				name="previewFilters"
				spellcheck="false"
				autocomplete="off"
				placeholder="||example.com^"
				@input="previewFiltersText = ($event.target as HTMLTextAreaElement).value"
			/>
			<div id="preview-filters-status" class="setting-row-description">
				{{ previewFiltersLint.rules }} active
				{{ previewFiltersLint.rules === 1 ? "rule" : "rules" }}
				<div
					v-for="problem in previewFiltersLint.problems"
					:key="problem.line"
					class="preview-filters-problem"
				>
					Line {{ problem.line }}: {{ problem.reason }} (<code>{{ problem.text }}</code
					>)
				</div>
			</div>
		</SettingCard>

		<SettingCard title="Status messages">
			<div class="setting-card-intro">
				Control how joins, parts, quits, kicks, nick changes, and mode changes appear
			</div>
			<div class="setting-radio-pills" role="group" aria-label="Status messages">
				<label class="setting-radio-pill">
					<input
						:checked="store.state.settings.statusMessages === 'shown'"
						type="radio"
						name="statusMessages"
						value="shown"
					/>
					<span class="pill-label">Show</span>
				</label>
				<label class="setting-radio-pill">
					<input
						:checked="store.state.settings.statusMessages === 'condensed'"
						type="radio"
						name="statusMessages"
						value="condensed"
					/>
					<span class="pill-label">Condense</span>
				</label>
				<label class="setting-radio-pill">
					<input
						:checked="store.state.settings.statusMessages === 'hidden'"
						type="radio"
						name="statusMessages"
						value="hidden"
					/>
					<span class="pill-label">Hide</span>
				</label>
			</div>
		</SettingCard>

		<SettingCard title="Visual aids">
			<SettingToggle
				name="coloredNicks"
				label="Colored nicknames"
				description="Assign a unique color to each nickname in chat"
				:checked="store.state.settings.coloredNicks"
			/>
			<SettingToggle
				name="statusIndicators"
				label="Online status indicators"
				description="Show a dot for whether the person in a query window is online or away"
				:checked="store.state.settings.statusIndicators"
			/>
			<SettingToggle
				name="autocomplete"
				label="Autocomplete"
				description="Suggest nicknames, channels, and commands as you type"
				:checked="store.state.settings.autocomplete"
			/>
			<label for="nickPostfix" class="setting-row-text">
				<div class="setting-row-label">Nick autocomplete postfix</div>
				<div class="setting-row-description">
					Character added after a completed nickname (e.g. a comma)
				</div>
			</label>
			<input
				id="nickPostfix"
				:value="store.state.settings.nickPostfix"
				type="text"
				name="nickPostfix"
				class="input"
				placeholder="e.g. , "
			/>
		</SettingCard>

		<SettingCard title="Custom stylesheet">
			<div class="setting-card-intro">Override any style with your own CSS</div>
			<label for="user-specified-css-input" class="sr-only"> Custom stylesheet </label>
			<textarea
				id="user-specified-css-input"
				:value="store.state.settings.userStyles"
				class="input"
				name="userStyles"
				placeholder="/* Add your custom CSS here */"
			/>
		</SettingCard>
	</div>
</template>

<style>
textarea#user-specified-css-input {
	height: 100px;
}

textarea#preview-filters-input {
	height: 100px;
	font-family: monospace;
}

.preview-filters-problem {
	color: var(--error-color);
}
</style>

<script lang="ts">
import {computed, defineComponent, ref, watch} from "vue";
import {lintFilters} from "../../../shared/previewFilters";
import {useStore} from "../../js/store";
import SettingCard from "./SettingCard.vue";
import SettingToggle from "./SettingToggle.vue";
import EmojiStylePicker from "./EmojiStylePicker.vue";
import {emojiImageSets} from "../../js/helpers/emoji";

export default defineComponent({
	name: "AppearanceSettings",
	components: {
		SettingCard,
		SettingToggle,
		EmojiStylePicker,
	},
	setup() {
		const store = useStore();
		// What is typed, validated live; saved like the other settings on change (blur)
		const previewFiltersText = ref(String(store.state.settings.previewFilters || ""));
		watch(
			() => store.state.settings.previewFilters,
			(value) => (previewFiltersText.value = String(value || ""))
		);
		const previewFiltersLint = computed(() => lintFilters(previewFiltersText.value));

		return {
			store,
			previewFiltersText,
			previewFiltersLint,
			emojiStyleOptions: [
				...emojiImageSets.map((set) => ({id: set.name, name: set.label})),
				{id: "native", name: "Native (system font)"},
			],
			setEmojiStyle: (value: string) =>
				store.dispatch("settings/update", {name: "emojiStyle", value, sync: true}),
		};
	},
});
</script>
