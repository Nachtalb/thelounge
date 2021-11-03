<template>
	<Generic v-bind="$attrs" separate-label class="password-container">
		<input
			v-model="value"
			v-bind="$attrs"
			:type="isVisible ? 'text' : 'password'"
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			@input="$emit('input', value)"
		/>
		<span
			ref="revealButton"
			type="button"
			:class="[
				'reveal-password tooltipped tooltipped-n tooltipped-no-delay',
				{'reveal-password-visible': isVisible},
			]"
			:aria-label="isVisible ? 'Hide password' : 'Show password'"
			@click="onClick"
		>
			<span :aria-label="isVisible ? 'Hide password' : 'Show password'" />
		</span>
	</Generic>
</template>

<script>
import Generic from "./Generic.vue";

export default {
	name: "Password",
	components: {
		Generic,
	},
	inheritAttrs: false,
	model: {
		prop: "originalValue",
	},
	props: {
		originalValue: String,
		srOnlyTitle: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			isVisible: false,
			value: this.originalValue,
		};
	},
	watch: {
		originalValue(value) {
			this.value = value;
		},
	},
	methods: {
		onClick() {
			this.isVisible = !this.isVisible;
		},
	},
};
</script>
