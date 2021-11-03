<template>
	<Generic v-bind="$attrs" separate-label :name="name" class="radio-container">
		<div role="group" :aria-labelledby="labelledby">
			<label v-for="item in items" :key="item.value" class="opt">
				<input
					v-model="value"
					v-bind="item.attrs"
					type="radio"
					:name="name"
					:value="item.value"
					@input="handle"
				/>
				{{ item.title }}
				<HoverHelp :text="item.description" />
			</label>
		</div>
	</Generic>
</template>

<script>
import Generic from "./Generic.vue";
import HoverHelp from "../Special/HoverHelp.vue";

export default {
	name: "Radio",
	components: {
		Generic,
		HoverHelp,
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
	data() {
		return {
			labelledby:
				"label-" + this.name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
		};
	},
	methods: {
		handle(event) {
			this.$emit("input", event.target.value);
		},
	},
};
</script>
