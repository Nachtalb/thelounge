<template>
	<Generic v-bind="$attrs" separateLabel :name="name">
		<select v-bind="$attrs" :name="name" class="input">
			<option v-for="item in items" :key="item.value" :value="item.value">
				{{ item.title }}
			</option>
		</select>
	</Generic>
</template>

<script>
import Generic from "./Generic.vue";

export default {
	name: "Dropdown",
	inheritAttrs: false,
	components: {
		Generic,
	},
	props: {
		name: String,
		items: {
			type: Array,
			required: true,
		},
	},
};
</script>
