// Copy an image to the clipboard, falling back to its url as text.
//
// Browsers only reliably accept image/png on the clipboard. The CSP connect-src 'self' blocks
// fetching other origins, so only same-origin images (preview cache, prefetch storage) are
// fetched; a cross-origin image can still be copied if the loaded <img> doesn't taint a canvas.
// Clipboard writes need the user gesture: everything up to clipboard.write() / the text copy
// runs synchronously, the image itself is handed over as a Promise.

export type ImageSource = "fetch" | "canvas" | "link";

// image: image copied; link: url copied because the image can't be read;
// insecure: url copied because the async clipboard is unavailable (needs https);
// failed: image copy failed, url copied instead; error: nothing copied
export type CopyResult = "image" | "link" | "insecure" | "failed" | "error";

export const copyResultMessages: Record<CopyResult, string> = {
	image: "Image copied",
	link: "Link copied",
	insecure: "Link copied (copying images needs HTTPS)",
	failed: "Could not copy the image, link copied",
	error: "Could not copy",
};

export function isSameOrigin(url: string, base: string) {
	try {
		return new URL(url, base).origin === new URL(base).origin;
	} catch {
		return false;
	}
}

export function pickImageSource(url: string, base: string, isCanvasClean: () => boolean) {
	if (isSameOrigin(url, base)) {
		return "fetch";
	}

	return isCanvasClean() ? "canvas" : "link";
}

// Text to copy when the image can't be: the image url itself, unless that is only the
// Lounge's own cache/storage copy, then the original link is more useful
export function fallbackText(preview: {link: string; thumb: string}, base: string) {
	const url = isSameOrigin(preview.thumb, base) ? preview.link : preview.thumb;

	try {
		return new URL(url, base).href;
	} catch {
		return url;
	}
}

export type CopyEnv = {
	base: string;
	// navigator.clipboard.write, undefined outside secure contexts
	write?: (items: ClipboardItem[]) => Promise<void>;
	makeItem?: (png: Promise<Blob>) => ClipboardItem;
	copyText: (text: string) => Promise<void>;
	isCanvasClean: () => boolean;
	fetchPng: (url: string) => Promise<Blob>;
	imagePng: () => Promise<Blob>;
};

export async function copyImage(
	preview: {link: string; thumb: string},
	env: CopyEnv
): Promise<CopyResult> {
	const text = fallbackText(preview, env.base);

	const copyLink = async (result: CopyResult) => {
		try {
			await env.copyText(text);
			return result;
		} catch {
			return "error";
		}
	};

	if (!env.write || !env.makeItem) {
		return copyLink("insecure");
	}

	const source = pickImageSource(preview.thumb, env.base, env.isCanvasClean);

	if (source === "link") {
		return copyLink("link");
	}

	const png = source === "fetch" ? env.fetchPng(preview.thumb) : env.imagePng();
	// Don't report an unhandled rejection; write() rejects with it
	png.catch(() => undefined);

	try {
		await env.write([env.makeItem(png)]);
		return "image";
	} catch {
		return copyLink("failed");
	}
}

type Drawable = CanvasImageSource & {width: number; height: number};

function drawToPng(source: Drawable, width: number, height: number): Promise<Blob> {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(width, height);
		canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
		return canvas.convertToBlob({type: "image/png"});
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);

	return new Promise((resolve, reject) =>
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))))
	);
}

export function imageToPng(img: HTMLImageElement) {
	if (!img.complete || !img.naturalWidth) {
		return Promise.reject(new Error("Image not loaded"));
	}

	return drawToPng(img, img.naturalWidth, img.naturalHeight);
}

// Reading pixels throws a SecurityError once a cross-origin image tainted the canvas
export function isImageCanvasClean(img?: HTMLImageElement) {
	if (!img || !img.complete || !img.naturalWidth) {
		return false;
	}

	try {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(img, 0, 0, 1, 1);
		ctx.getImageData(0, 0, 1, 1);
		return true;
	} catch {
		return false;
	}
}

// Non-PNG images (jpeg, webp, first frame of a gif) are re-encoded. Formats createImageBitmap
// can't decode (svg) are drawn from the already loaded <img>, which is same-origin here.
export async function fetchPng(url: string, img?: HTMLImageElement) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const blob = await response.blob();

	if (blob.type === "image/png") {
		return blob;
	}

	try {
		const bitmap = await createImageBitmap(blob);
		const png = await drawToPng(bitmap, bitmap.width, bitmap.height);
		bitmap.close();
		return png;
	} catch (e) {
		if (img) {
			return imageToPng(img);
		}

		throw e;
	}
}

// Without the async clipboard (plain http), execCommand still copies inside a user gesture
export function copyText(text: string): Promise<void> {
	if (window.isSecureContext && navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text);
	}

	const onCopy = (e: ClipboardEvent) => {
		e.clipboardData?.setData("text/plain", text);
		e.preventDefault();
	};

	document.addEventListener("copy", onCopy, true);

	try {
		return document.execCommand("copy")
			? Promise.resolve()
			: Promise.reject(new Error("Copy was refused"));
	} finally {
		document.removeEventListener("copy", onCopy, true);
	}
}

export function browserEnv(img?: HTMLImageElement): CopyEnv {
	const clipboard = window.isSecureContext ? navigator.clipboard : undefined;
	const canWrite = !!clipboard?.write && typeof ClipboardItem !== "undefined";

	return {
		base: window.location.href,
		write: canWrite ? (items) => clipboard.write(items) : undefined,
		makeItem: canWrite ? (png) => new ClipboardItem({"image/png": png}) : undefined,
		copyText,
		isCanvasClean: () => isImageCanvasClean(img),
		fetchPng: (url) => fetchPng(url, img),
		imagePng: () => (img ? imageToPng(img) : Promise.reject(new Error("No image"))),
	};
}
