<template>
	<span v-if="text" class="tooltipped tooltipped-n tooltipped-no-delay" :aria-label="text">
		<button v-if="title === 'button'" class="extra-help" />
		<template v-else>{{ title }}</template>
	</span>
</template>

<script>
export default {
	name: "HoverHelp",
	props: {
		text: String,
		title: {
			type: String,
			default: "button",
		},
	},
};
</script>
