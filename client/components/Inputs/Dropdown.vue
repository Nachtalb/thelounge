<template>
	<Generic v-bind="$attrs" separate-label :name="name" class="dropdown-container">
		<select
			v-model="value"
			:class="['input', name ? 'field-' + name : '']"
			:name="name"
			v-bind="$attrs"
			@input="$emit('input', event.target.value)"
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
	components: {
		Generic,
	},
	inheritAttrs: false,
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
