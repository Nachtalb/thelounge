<template>
	<Generic v-bind="$attrs" separate-label class="textbox-container">
		<input
			v-if="type !== 'textarea'"
			v-model="value"
			v-bind="$attrs"
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			:type="type"
			@input="$emit('input', $event.target.value)"
		/>
		<textarea
			v-else
			ref="textarea"
			v-model="value"
			v-bind="$attrs"
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			@input="$emit('input', $event.target.value)"
		/>
	</Generic>
</template>

<script>
import Generic from "./Generic.vue";

export default {
	name: "Textbox",
	components: {
		Generic,
	},
	inheritAttrs: false,
	model: {
		prop: "originalValue",
	},
	props: {
		type: String,
		originalValue: [String, Number],
		srOnlyTitle: {
			type: Boolean,
			default: false,
		},
		autoresize: {
			type: Boolean,
			default: true,
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
		value() {
			if (!this.$refs.textarea && this.autoresize) {
				return;
			}

			this.$refs.textarea.style.height = "0";
			this.$refs.textarea.style.height =
				Math.ceil(this.$refs.textarea.scrollHeight + 2) + "px";
		},
	},
};
</script>
