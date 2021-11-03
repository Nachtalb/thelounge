<template>
	<Generic v-bind="$attrs" separateLabel :name="name" class="radio-container">
		<div role="group" :aria-labelledby="labelledby">
			<label v-for="item in items" :key="item.value" class="opt">
				<input
					type="radio"
					:name="name"
					:value="item.value"
					v-bind="item.attrs"
					v-model="value"
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
	inheritAttrs: false,
	components: {
		Generic,
		HoverHelp,
	},
	methods: {
		handle(event) {
			this.$emit("input", event.target.value);
		},
	},
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
};
</script>
