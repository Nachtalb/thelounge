<template>
	<Generic v-bind="$attrs" separateLabel :name="name" class="dropdown-container">
		<select
			:class="['input', name ? 'field-' + name : '']"
			:name="name"
			@input="$emit('input', event.target.value)"
			v-bind="$attrs"
			v-model="value"
		>
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
		value: String,
		items: {
			type: Array,
			required: true,
		},
	},
};
</script>
