<template>
	<span ref="root" class="sticker-media" @mouseenter="hover = true" @mouseleave="hover = false">
		<img v-if="!ready" :src="video ? thumb : src || thumb" alt="" draggable="false" />
		<template v-if="playing">
			<video
				ref="videoEl"
				:src="sticker!.url"
				muted
				autoplay
				loop
				playsinline
				disablepictureinpicture
				@loadeddata="draw"
			/>
			<canvas ref="canvas" />
		</template>
	</span>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, onUnmounted, PropType, ref, watch} from "vue";
import type {Sticker} from "../js/stickers";

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

// A sticker picture, or a video sticker playing while on screen (on hover only
// with reduced motion). The static thumbnail shows until the first video frame is
// drawn, then goes away, so a transparent video never shows it underneath.
// Frames are drawn into a canvas with high quality smoothing: Chromium scales
// <video> with plain bilinear filtering, which looks blocky at 512px → ~70px.
export default defineComponent({
	name: "StickerMedia",
	props: {
		sticker: {type: Object as PropType<Sticker | null>, default: null},
		thumb: {type: String, required: true},
		// Picture for non-video stickers, the thumb if empty
		src: {type: String, default: ""},
	},
	setup(props) {
		const root = ref<HTMLElement>();
		const videoEl = ref<HTMLVideoElement>();
		const canvas = ref<HTMLCanvasElement>();
		const hover = ref(false);
		const visible = ref(false);
		const ready = ref(false);

		const video = computed(() => props.sticker?.format === "webm");
		const playing = computed(
			() => video.value && visible.value && (!reducedMotion?.matches || hover.value)
		);

		watch([playing, () => props.sticker?.url], () => (ready.value = false));

		const draw = () => {
			const v = videoEl.value;
			const c = canvas.value;

			if (!v || !c || !v.videoWidth) {
				return;
			}

			const dpr = window.devicePixelRatio || 1;
			const w = Math.round(c.clientWidth * dpr);
			const h = Math.round(c.clientHeight * dpr);

			if (c.width !== w || c.height !== h) {
				c.width = w;
				c.height = h;
			}

			const ctx = c.getContext("2d");

			if (ctx) {
				// object-fit: contain
				const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
				const dw = v.videoWidth * scale;
				const dh = v.videoHeight * scale;
				ctx.imageSmoothingQuality = "high";
				ctx.clearRect(0, 0, w, h);
				ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
				ready.value = true;
			}

			// Stops by itself once the video is unmounted
			if ("requestVideoFrameCallback" in v) {
				v.requestVideoFrameCallback(draw);
			} else {
				requestAnimationFrame(draw);
			}
		};

		let observer: IntersectionObserver | null = null;

		onMounted(() => {
			observer = new IntersectionObserver(([entry]) => {
				visible.value = entry.isIntersecting;
			});
			observer.observe(root.value!);
		});

		onUnmounted(() => {
			observer?.disconnect();
		});

		return {root, videoEl, canvas, hover, ready, video, playing, draw};
	},
});
</script>
