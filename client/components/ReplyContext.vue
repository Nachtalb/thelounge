<template>
	<component
		:is="parentInHistory ? 'div' : 'span'"
		:class="[
			'reply-context',
			{
				disabled: !parentInHistory,
				tooltipped: !parentInHistory,
				'tooltipped-e': !parentInHistory,
			},
		]"
		:role="parentInHistory ? 'button' : undefined"
		:tabindex="parentInHistory ? 0 : undefined"
		:aria-label="!parentInHistory ? 'Original message is no longer in scrollback' : undefined"
		@click="parentInHistory ? $emit('scroll-to-parent') : undefined"
		@keydown.enter.prevent="parentInHistory ? $emit('scroll-to-parent') : undefined"
		@keydown.space.prevent="parentInHistory ? $emit('scroll-to-parent') : undefined"
	>
		<span class="reply-context-icon" aria-hidden="true" />
		<template v-if="message.replyToNick">
			<img v-if="media" class="reply-context-thumb" :src="media.thumb" alt="" />
			<span class="reply-context-nick">{{ message.replyToNick }}</span>
			<span v-if="media || message.replyToText" class="reply-context-text">{{
				media ? media.caption || media.kind : message.replyToText
			}}</span>
		</template>
		<span v-else class="reply-context-unknown">In reply to a message</span>
	</component>
</template>

<script lang="ts">
import {defineComponent, PropType} from "vue";
import type {ClientMessage} from "../js/types";
import type {replyMedia} from "../js/helpers/replyMedia";

export default defineComponent({
	name: "ReplyContext",
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		parentInHistory: {type: Boolean, required: true},
		media: {type: Object as PropType<ReturnType<typeof replyMedia>>, default: null},
	},
	emits: ["scroll-to-parent"],
});
</script>
