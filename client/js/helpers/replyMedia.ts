import type {LinkPreview} from "../../../shared/types/msg";

// Telegram-style media summary of a replied-to message: first thumbnail plus
// the caption (text without the image links), or "Photo"/"GIF"/"Video" if empty
export function replyMedia(message?: {text: string; previews?: LinkPreview[]}) {
	const images = (message?.previews || []).filter((p) => p.thumb && p.type !== "error");

	if (!images.length) {
		return null;
	}

	const caption = images
		.reduce((text, p) => text.split(p.link).join(""), message?.text || "")
		.replace(/\s+/g, " ")
		.trim();
	const p = images[0];
	const kind =
		p.type === "video"
			? "Video"
			: /\.gif($|[?#])/i.test(p.filename || p.link)
			? "GIF"
			: "Photo";

	return {thumb: p.thumb, caption, kind};
}
