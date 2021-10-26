<template>
	<span v-if="text" class="tooltipped tooltipped-n tooltipped-no-delay" :aria-label="text">
		<button class="extra-help" />
	</span>
</template>

<script>
export default {
	name: "HoverHelp",
	props: {
		text: String,
	},
};
</script>
