<script>
import Generic from "./Generic.vue";

export default {
	name: "Checkbox",
	extends: Generic,
	props: {
		type: {
			type: String,
			default: "checkbox",
		},
		inputClass: {
			type: String,
			default: "",
		},
	},
	beforeUpdate() {
		this.$attrs.checked = this.originalValue;
		this.$el.classList.add("checkbox-container");
	},
	methods: {
		handleInput(event) {
			this.$emit("input", event.target.checked);
		},
	},
};
</script>
