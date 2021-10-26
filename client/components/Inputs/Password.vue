<template>
	<Generic v-bind="$attrs" separateLabel class="password-container">
		<input :type="isVisible ? 'text' : 'password'" class="input" v-bind="$attrs" />
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
	props: {
		srOnlyTitle: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			isVisible: false,
		};
	},
	methods: {
		onClick() {
			this.isVisible = !this.isVisible;
		},
	},
};
</script>
