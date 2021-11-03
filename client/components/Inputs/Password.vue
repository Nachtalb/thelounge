<template>
	<Generic v-bind="$attrs" separateLabel class="password-container">
		<input
			:class="['input', $attrs.name ? 'field-' + $attrs.name : '']"
			:type="isVisible ? 'text' : 'password'"
			@input="$emit('input', value)"
			v-bind="$attrs"
			v-model="value"
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
import RevealPassword from "../RevealPassword.vue";

export default {
	name: "Password",
	inheritAttrs: false,
	components: {
		RevealPassword,
		Generic,
	},
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
