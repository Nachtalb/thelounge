<template>
	<span ref="root" class="sticker-media" @mouseenter="hover = true" @mouseleave="hover = false">
		<img v-if="picture" v-show="!ready" :src="picture" alt="" draggable="false" />
		<img v-if="animating" :src="animatedSrc" alt="" draggable="false" @load="ready = true" />
		<template v-if="videoSrc">
			<video
				ref="videoEl"
				v-release-media
				:src="videoSrc"
				muted
				loop
				playsinline
				disablepictureinpicture
				@loadeddata="onLoaded"
			/>
			<canvas ref="canvas" />
		</template>
	</span>
</template>

<script lang="ts">
import {
	computed,
	defineComponent,
	ObjectDirective,
	onMounted,
	onUnmounted,
	PropType,
	Ref,
	ref,
	watch,
} from "vue";
import type {Media} from "../js/stickers";
import {loadStickerFile, type StickerFile} from "../js/helpers/stickerFiles";
import {watchInView} from "../js/helpers/stickerInView";

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

// Videos near the screen are attached ahead (paused) up to this many, so they play as soon as they
// scroll in. Chrome refuses media players beyond 75 per page (40 on Android).
const VIDEO_SLOTS = /Android/.test(navigator.userAgent) ? 36 : 64;
let videoSlots = 0;

// A removed <video> keeps its media player until garbage collected, and Chrome refuses new ones
// over the limit: release it right away
const releaseMedia: ObjectDirective<HTMLVideoElement> = {
	beforeUnmount(el) {
		el.removeAttribute("src");
		el.load();
	},
};

// The object URL of `url` while `wanted`, through the sticker file queue. A picture that finished
// stays (no flicker when scrolling back); one still loading is cancelled once it isn't wanted.
// `direct` files skip the queue: the element loads `url` itself.
function useFile(
	url: Ref<string>,
	wanted: Ref<boolean>,
	rank: Ref<number>,
	keep: boolean,
	direct: Ref<boolean>
) {
	const href = ref("");

	if (direct.value) {
		watch(
			[url, wanted],
			() => {
				if (wanted.value) {
					href.value = url.value;
				} else if (!keep || href.value !== url.value) {
					href.value = "";
				}
			},
			{immediate: true}
		);
		return href;
	}

	let file: StickerFile | null = null;
	let fileUrl = "";

	const drop = () => {
		file?.release();
		file = null;
		fileUrl = "";
		href.value = "";
	};

	watch(
		[url, wanted],
		() => {
			if (fileUrl && (fileUrl !== url.value || (!wanted.value && !(keep && href.value)))) {
				drop();
			}

			if (!file && url.value && wanted.value) {
				const current = loadStickerFile(url.value, rank.value);
				file = current;
				fileUrl = url.value;
				current.promise.then(
					(h) => file === current && (href.value = h),
					() => undefined
				);
			}
		},
		{immediate: true}
	);

	watch(rank, (r) => file?.setRank(r));
	onUnmounted(drop);
	return href;
}

// A sticker picture, an animated picture or a video. Files load once the sticker is near the screen
// (visible ones first); videos and animated pictures play only while on screen (on hover only with
// reduced motion), pausing when scrolled away. The static thumbnail shows until the first video frame
// is drawn, then is hidden (kept, so it shows again at once without decoding), so a transparent video
// never shows it underneath. Only a presented frame counts: drawing at `loadeddata` can draw nothing yet,
// which left the tile blank until the next frame.
// Frames are drawn into a canvas with high quality smoothing: Chromium scales
// <video> with plain bilinear filtering, which looks blocky at 512px → ~70px.
export default defineComponent({
	name: "StickerMedia",
	directives: {releaseMedia},
	props: {
		media: {type: Object as PropType<Media>, required: true},
		// Loads at once, ahead of every other sticker (the one opened in its menu)
		urgent: {type: Boolean, default: false},
	},
	setup(props) {
		const root = ref<HTMLElement>();
		const videoEl = ref<HTMLVideoElement>();
		const canvas = ref<HTMLCanvasElement>();
		const hover = ref(false);
		const seenNear = ref(false);
		const seenVisible = ref(false);
		const near = computed(() => props.urgent || seenNear.value);
		const visible = computed(() => props.urgent || seenVisible.value);
		const ready = ref(false);

		const video = computed(() => props.media.kind === "video");
		const animated = computed(() => props.media.kind === "animated");
		const direct = computed(() => !!props.media.direct);
		const motion = computed(() => !reducedMotion?.matches || hover.value);
		// Has one of the video slots; visible stickers always get one
		const wantVideo = ref(false);
		const playing = computed(() => wantVideo.value && visible.value);

		watch(
			[video, near, visible, motion],
			() => {
				const want = video.value && near.value && motion.value;

				if (!want && wantVideo.value) {
					wantVideo.value = false;
					videoSlots--;
				} else if (
					want &&
					!wantVideo.value &&
					(visible.value || videoSlots < VIDEO_SLOTS)
				) {
					wantVideo.value = true;
					videoSlots++;
				}
			},
			{immediate: true}
		);

		const picture = useFile(
			computed(() =>
				props.media.kind === "image"
					? props.media.src || props.media.thumb
					: props.media.thumb
			),
			near,
			computed(() => (props.urgent ? -1 : visible.value ? 0 : 2)),
			true,
			direct
		);
		const movingRank = computed(() => (props.urgent ? -1 : visible.value ? 1 : 3));
		const videoSrc = useFile(
			computed(() => (video.value ? props.media.src : "")),
			wantVideo,
			movingRank,
			false,
			direct
		);
		const animatedSrc = useFile(
			computed(() => (animated.value ? props.media.src : "")),
			computed(() => near.value && motion.value),
			movingRank,
			false,
			direct
		);
		const animating = computed(() => !!animatedSrc.value && visible.value && motion.value);

		watch([videoSrc, animating], () => (ready.value = false));

		const play = () => {
			const v = videoEl.value;

			if (!v) {
				return;
			}

			if (playing.value) {
				v.play().catch(() => undefined);
			} else {
				v.pause();
			}
		};

		watch(playing, play);

		const hasFrameCallback = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

		// Waits while paused, stops by itself once the video is unmounted
		const nextFrame = (v: HTMLVideoElement, callback: () => void) => {
			if (hasFrameCallback) {
				v.requestVideoFrameCallback(callback);
			} else {
				requestAnimationFrame(callback);
			}
		};

		const draw = () => {
			const v = videoEl.value;
			const c = canvas.value;

			if (!v || !c) {
				return;
			}

			// Only a presented frame (or, without requestVideoFrameCallback, a playing video) is
			// really drawable: at `loadeddata` the canvas can stay empty
			if (!v.videoWidth || (!hasFrameCallback && (v.paused || !v.currentTime))) {
				nextFrame(v, draw);
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

			nextFrame(v, draw);
		};

		const onLoaded = () => {
			nextFrame(videoEl.value!, draw);
			play();
		};

		let unwatch: (() => void) | null = null;

		onMounted(() => {
			unwatch = watchInView(root.value!, (n, v) => {
				seenNear.value = n;
				seenVisible.value = v;
			});
		});

		onUnmounted(() => {
			unwatch?.();

			if (wantVideo.value) {
				videoSlots--;
			}
		});

		return {
			root,
			videoEl,
			canvas,
			hover,
			ready,
			picture,
			videoSrc,
			animatedSrc,
			animating,
			onLoaded,
		};
	},
});
</script>
