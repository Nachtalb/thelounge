<template>
	<Generic v-bind="$attrs" separateLabel>
		<input v-if="type !== 'textarea'" :type="type" v-bind="$attrs" class="input" />
		<textarea v-else v-bind="$attrs" class="input" />
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
	props: {
		type: String,
		srOnlyTitle: {
			type: Boolean,
			default: false,
		},
	},
};
</script>
