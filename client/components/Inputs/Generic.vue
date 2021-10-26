<template>
	<div
		v-if="
			(!advanced || $store.state.settings.advanced) &&
			(!private || !$store.state.serverConfiguration.public)
		"
		:class="wrapperClass"
	>
		<template v-if="separateLabel">
			<label
				v-if="title"
				:for="name"
				:class="{'sr-only': screenReaderTitle, opt: !screenReaderTitle}"
			>
				{{ title }}
				<HoverHelp :text="description" />
			</label>
			<slot><input :name="name" :type="type" v-bind="$attrs" /></slot>
		</template>
		<template v-else>
			<label class="opt">
				<slot><input :name="name" :type="type" v-bind="$attrs" /></slot>

				<span v-if="title" :class="{'sr-only': screenReaderTitle}">
					{{ title }}
					<HoverHelp :text="description" />
				</span>
			</label>
		</template>
	</div>
</template>

<script>
import HoverHelp from "../Special/HoverHelp.vue";

export default {
	name: "Generic",
	components: {
		HoverHelp,
	},
	inheritAttrs: false,
	props: {
		title: String,
		name: String,
		description: String,
		type: String,
		wrapperClass: String,
		screenReaderTitle: {
			type: Boolean,
			default: false,
		},
		separateLabel: {
			type: Boolean,
			default: false,
		},
		advanced: {
			type: Boolean,
			default: false,
		},
		private: {
			type: Boolean,
			default: false,
		},
	},
};
</script>
