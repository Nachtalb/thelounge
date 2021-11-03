<template>
	<Generic v-bind="$attrs" separateLabel class="textbox-container">
		<input
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			:type="type"
			@input="$emit('input', $event.target.value)"
			v-bind="$attrs"
			v-if="type !== 'textarea'"
			v-model="value"
		/>
		<textarea
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			@input="$emit('input', $event.target.value)"
			v-bind="$attrs"
			v-else
			ref="textarea"
			v-model="value"
		/>
	</Generic>
</template>

<script>
import Generic from "./Generic.vue";

export default {
	name: "Textbox",
	inheritAttrs: false,
	components: {
		Generic,
	},
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
		value(value) {
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
