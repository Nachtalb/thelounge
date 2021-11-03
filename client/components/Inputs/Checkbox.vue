<script>
import Generic from "./Generic.vue";

export default {
	extends: Generic,
	name: "Checkbox",
	props: {
		type: {
			default: "checkbox",
		},
		inputClass: {
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
