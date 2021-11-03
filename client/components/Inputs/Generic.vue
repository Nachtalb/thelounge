<template>
	<div
		v-if="
			(!advancedOnly || $store.state.settings.advanced) &&
			(!privateOnly || !$store.state.serverConfiguration.public)
		"
		class="form-field"
	>
		<template v-if="separateLabel">
			<label
				v-if="title"
				:for="name"
				:class="[screenReaderTitle ? 'sr-only' : '', name ? 'label-' + name : '']"
			>
				{{ title }}
				<HoverHelp v-if="descriptionShown" :text="description" :title="descriptionTitle" />
			</label>
			<slot>
				<input
					:class="[inputClass, name ? 'field-' + name : '']"
					:name="name"
					:type="type"
					:value="value"
					v-bind="$attrs"
					@input="handleInput"
				/>
			</slot>
		</template>
		<template v-else>
			<label :class="['opt', name ? 'label-' + name : '']">
				<slot>
					<input
						:class="[inputClass, name ? 'field-' + name : '']"
						:name="name"
						:type="type"
						:value="value"
						v-bind="$attrs"
						@input="handleInput"
					/>
				</slot>

				<span v-if="title" :class="{'sr-only': screenReaderTitle}">
					{{ title }}
					<HoverHelp
						v-if="descriptionShown"
						:text="description"
						:title="descriptionTitle"
					/>
				</span>
			</label>
		</template>
	</div>
</template>

<script>
import HoverHelp from "../Special/HoverHelp.vue";

export default {
	name: "Generic",
	components: {
		HoverHelp,
	},
	inheritAttrs: false,
	model: {
		prop: "originalValue",
	},
	props: {
		title: String,
		name: String,
		type: String,
		originalValue: null,
		description: String,
		descriptionTitle: String,
		inputClass: {
			type: String,
			default: "input",
		},
		descriptionShown: {
			type: Boolean,
			default: true,
		},
		screenReaderTitle: {
			type: Boolean,
			default: false,
		},
		separateLabel: {
			type: Boolean,
			default: false,
		},
		advancedOnly: {
			type: Boolean,
			default: false,
		},
		privateOnly: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			value: this.originalValue,
		};
	},
	watch: {
		originalValue(value) {
			this.value = value;
		},
	},
	mounted() {
		if (this.originalValue !== undefined) {
			// Fix some update order and reactivity cases
			this.$forceUpdate();
		}
	},
	methods: {
		handleInput(event) {
			this.$emit("input", event.target.value);
		},
	},
};
</script>
