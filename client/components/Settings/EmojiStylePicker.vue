<template>
	<div class="emoji-style-picker" :class="{open}" @focusout="onFocusOut">
		<div
			id="emoji-style-select"
			ref="combobox"
			class="input emoji-style-combobox"
			role="combobox"
			tabindex="0"
			aria-haspopup="listbox"
			aria-controls="emoji-style-list"
			:aria-labelledby="labelledby"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-activedescendant="open ? optionId(options[active]) : undefined"
			@click="open ? close() : show(selectedIndex)"
			@keydown="onKeydown"
		>
			<img
				v-if="previewUrl(selected.id)"
				class="emoji-style-preview"
				:src="previewUrl(selected.id)!"
				alt=""
				width="20"
				height="20"
			/>
			<span v-else class="emoji-style-preview" aria-hidden="true">🙂</span>
			<span class="emoji-style-name">{{ selected.name }}</span>
		</div>
		<ul
			v-show="open"
			id="emoji-style-list"
			ref="list"
			class="emoji-style-list"
			role="listbox"
			tabindex="-1"
			:aria-labelledby="labelledby"
		>
			<li
				v-for="(option, i) in options"
				:id="optionId(option)"
				:key="option.id"
				role="option"
				:aria-selected="option.id === modelValue ? 'true' : 'false'"
				:class="{active: i === active}"
				@mousedown.prevent
				@mousemove="active = i"
				@click="pick(i)"
			>
				<img
					v-if="previewUrl(option.id)"
					class="emoji-style-preview"
					:src="previewUrl(option.id)!"
					alt=""
					width="20"
					height="20"
				/>
				<span v-else class="emoji-style-preview" aria-hidden="true">🙂</span>
				<span class="emoji-style-name">{{ option.name }}</span>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, nextTick, PropType, ref} from "vue";
import {emojiImageUrl, EmojiStyle} from "../../js/helpers/emoji";

export type EmojiStyleOption = {id: string; name: string};

// Settings > Appearance > Emoji style: a select-only combobox (WAI-ARIA APG) that,
// unlike a native <select>, can show each style's own smiley in its options
export default defineComponent({
	name: "EmojiStylePicker",
	props: {
		options: {type: Array as PropType<EmojiStyleOption[]>, required: true},
		modelValue: {type: String, required: true},
		labelledby: {type: String, default: undefined},
	},
	emits: ["update:modelValue"],
	setup(props, {emit}) {
		const open = ref(false);
		const active = ref(0);
		const combobox = ref<HTMLElement | null>(null);
		const list = ref<HTMLElement | null>(null);
		let typed = "";
		let typedTimer: ReturnType<typeof setTimeout> | undefined;

		const selectedIndex = computed(() =>
			Math.max(
				0,
				props.options.findIndex((option) => option.id === props.modelValue)
			)
		);
		const selected = computed(
			() => props.options[selectedIndex.value] ?? {id: props.modelValue, name: ""}
		);

		// 🙂 in the given style, or null for native (the character itself)
		const previewUrl = (id: string) => emojiImageUrl("1f642", id as EmojiStyle);

		const optionId = (option?: EmojiStyleOption) =>
			option ? `emoji-style-option-${option.id}` : undefined;

		const scrollToActive = () => {
			void nextTick(() => {
				list.value?.children[active.value]?.scrollIntoView({block: "nearest"});
			});
		};

		const show = (index: number) => {
			active.value = Math.min(Math.max(index, 0), props.options.length - 1);
			open.value = true;
			scrollToActive();
		};

		const close = () => {
			open.value = false;
			typed = "";
		};

		const pick = (index: number) => {
			const option = props.options[index];
			close();
			combobox.value?.focus();

			if (option && option.id !== props.modelValue) {
				emit("update:modelValue", option.id);
			}
		};

		// Next option whose name starts with the typed text; repeating one
		// letter cycles through the options starting with it
		const typeAhead = (key: string) => {
			clearTimeout(typedTimer);
			typedTimer = setTimeout(() => (typed = ""), 500);
			typed += key.toLowerCase();

			const cycling = typed.length > 1 && [...typed].every((c) => c === typed[0]);
			const search = cycling ? typed[0] : typed;
			const start = open.value ? active.value : selectedIndex.value;
			const count = props.options.length;

			for (let n = typed.length === 1 || cycling ? 1 : 0; n <= count; n++) {
				const i = (start + n) % count;

				if (props.options[i].name.toLowerCase().startsWith(search)) {
					return i;
				}
			}

			return -1;
		};

		const onKeydown = (e: KeyboardEvent) => {
			const last = props.options.length - 1;

			if (e.ctrlKey || e.metaKey) {
				return;
			}

			if (!open.value) {
				switch (e.key) {
					case "ArrowDown":
					case "ArrowUp":
					case "Enter":
					case " ":
						show(selectedIndex.value);
						break;
					case "Home":
						show(0);
						break;
					case "End":
						show(last);
						break;

					default: {
						if (e.key.length !== 1 || e.altKey) {
							return;
						}

						const i = typeAhead(e.key);
						show(i < 0 ? selectedIndex.value : i);
					}
				}

				e.preventDefault();
				e.stopPropagation();
				return;
			}

			switch (e.key) {
				case "ArrowDown":
					active.value = Math.min(active.value + 1, last);
					break;
				case "ArrowUp":
					if (e.altKey) {
						pick(active.value);
						break;
					}

					active.value = Math.max(active.value - 1, 0);
					break;
				case "Home":
				case "PageUp":
					active.value = 0;
					break;
				case "End":
				case "PageDown":
					active.value = last;
					break;
				case "Enter":
					pick(active.value);
					break;
				case " ":
					if (typed) {
						const i = typeAhead(e.key);
						active.value = i < 0 ? active.value : i;
					} else {
						pick(active.value);
					}

					break;
				case "Escape":
					close();
					break;
				case "Tab":
					pick(active.value);
					return;

				default: {
					if (e.key.length !== 1 || e.altKey) {
						return;
					}

					const i = typeAhead(e.key);
					active.value = i < 0 ? active.value : i;
				}
			}

			scrollToActive();
			e.preventDefault();
			e.stopPropagation();
		};

		const onFocusOut = (e: FocusEvent) => {
			const to = e.relatedTarget as Node | null;

			if (!to || !(e.currentTarget as HTMLElement).contains(to)) {
				close();
			}
		};

		return {
			open,
			active,
			combobox,
			list,
			selected,
			selectedIndex,
			optionId,
			previewUrl,
			show,
			close,
			pick,
			onKeydown,
			onFocusOut,
		};
	},
});
</script>
