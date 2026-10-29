import * as cheerio from "cheerio";
import type {Element} from "domhandler";
import got from "got";
import type {Request, Response} from "express";
import fs from "fs";
import {URL} from "url";
import mime from "mime-types";
import contentDisposition from "content-disposition";
import path from "path";

import log from "../../log";
import Config from "../../config";
import {findLinksWithSchema} from "../../../shared/linkify";
import {cleanIrcMessage} from "../../../shared/irc";
import {LinkPreview, MessageType} from "../../../shared/types/msg";
import storage from "../storage";
import previewCache from "../previewCache";
import Client from "../../client";
import Chan from "../../models/chan";
import Msg from "../../models/msg";

type FetchRequest = {
	data: Buffer;
	type: string;
	size: number;
	filename: string | null;
};
const currentFetchPromises = new Map<string, Promise<FetchRequest>>();
const imageTypeRegex = /^image\/.+/;
const mediaTypeRegex = /^(audio|video)\/.+/;
const backfilled = new WeakSet<Msg>();
const backfillQueue: (() => Promise<void>)[] = [];
let backfillRunning = 0;

export default function prefetch(
	client: Client,
	chan: Chan,
	msg: Msg,
	cleanText: string,
	queued = false
) {
	if (!Config.values.prefetch) {
		return;
	}

	msg.previews = findLinksWithSchema(cleanText).reduce((cleanLinks: LinkPreview[], link) => {
		const url = normalizeURL(link.link);

		// If the URL is invalid and cannot be normalized, don't fetch it
		if (!url) {
			return cleanLinks;
		}

		// If there are too many urls in this message, only fetch first X valid links
		if (cleanLinks.length > 4) {
			return cleanLinks;
		}

		// Do not fetch duplicate links twice
		if (cleanLinks.some((l) => l.link === link.link)) {
			return cleanLinks;
		}

		const preview: LinkPreview = {
			type: "loading",
			head: "",
			body: "",
			thumb: "",
			size: -1,
			link: link.link, // Send original matched link to the client
			shown: null,
		};

		cleanLinks.push(preview);
		loadPreview(client, chan, msg, preview, url, queued);

		return cleanLinks;
	}, []);
}

// Fills in previews of messages from history that have none, like messages loaded from the
// message storage after a restart. Uncached links are fetched in the background, a few at a time.
export function backfillPreviews(client: Client, chan: Chan, messages: Msg[]) {
	if (!previewCache.isEnabled()) {
		return;
	}

	for (const msg of messages) {
		if (
			backfilled.has(msg) ||
			msg.previews.length ||
			![MessageType.MESSAGE, MessageType.ACTION].includes(msg.type)
		) {
			continue;
		}

		backfilled.add(msg);
		prefetch(client, chan, msg, cleanIrcMessage(msg.text), true);
	}
}

function runQueued(job?: () => Promise<void>) {
	if (job) {
		backfillQueue.push(job);
	}

	while (backfillRunning < 4 && backfillQueue.length) {
		backfillRunning++;
		void backfillQueue.shift()!().finally(() => {
			backfillRunning--;
			runQueued();
		});
	}
}

function loadPreview(
	client: Client,
	chan: Chan,
	msg: Msg,
	preview: LinkPreview,
	url: string,
	queued: boolean
) {
	const fetchPreview = () =>
		fetch(url, {
			accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			language: client.config.browser?.language || "",
		})
			.then((res) => {
				parse(msg, chan, preview, res, client);
			})
			.catch((err) => {
				preview.type = "error";
				preview.error = "message";
				preview.message = err.message;
				emitPreview(client, chan, msg, preview);
			});

	if (!previewCache.isEnabled()) {
		void fetchPreview();
		return;
	}

	void previewCache.getPreview(url).then((cached) => {
		if (!cached) {
			return queued ? runQueued(fetchPreview) : fetchPreview();
		}

		Object.assign(preview, cached);
		emitPreview(client, chan, msg, preview, false);
	});
}

// Images are proxied through The Lounge instead of being loaded from the source
function isProxied() {
	return Config.values.prefetchStorage || previewCache.isEnabled();
}

function parseHtml(preview, res, client: Client) {
	// TODO:
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	return new Promise((resolve: (preview: FetchRequest | null) => void) => {
		const $ = cheerio.load(res.data);

		return parseHtmlMedia($, preview, client)
			.then((newRes) => resolve(newRes))
			.catch(() => {
				preview.type = "link";
				preview.head =
					$('meta[property="og:title"]').attr("content") ||
					$("head > title, title").first().text() ||
					"";
				preview.body =
					$('meta[property="og:description"]').attr("content") ||
					$('meta[name="description"]').attr("content") ||
					"";

				if (preview.head.length) {
					preview.head = preview.head.substr(0, 100);
				}

				if (preview.body.length) {
					preview.body = preview.body.substr(0, 300);
				}

				if (!isProxied() && Config.values.disableMediaPreview) {
					resolve(res);
					return;
				}

				let thumb =
					$('meta[property="og:image"]').attr("content") ||
					$('meta[name="twitter:image:src"]').attr("content") ||
					$('link[rel="image_src"]').attr("href") ||
					"";

				// Make sure thumbnail is a valid and absolute url
				if (thumb.length) {
					thumb = normalizeURL(thumb, preview.link) || "";
				}

				// Verify that thumbnail pic exists and is under allowed size
				if (thumb.length) {
					fetch(thumb, {language: client.config.browser?.language || ""})
						.then((resThumb) => {
							if (
								resThumb !== null &&
								imageTypeRegex.test(resThumb.type) &&
								resThumb.size <= Config.values.prefetchMaxImageSize * 1024
							) {
								preview.thumbActualUrl = thumb;
							}

							resolve(resThumb);
						})
						.catch(() => resolve(null));
				} else {
					resolve(res);
				}
			});
	});
}

// TODO: type $
function parseHtmlMedia($: any, preview, client: Client): Promise<FetchRequest> {
	return new Promise((resolve, reject) => {
		if (Config.values.disableMediaPreview) {
			reject();
			return;
		}

		let foundMedia = false;
		const openGraphType = $('meta[property="og:type"]').attr("content");

		// Certain news websites may include video and audio tags,
		// despite actually being an article (as indicated by og:type).
		// If there is og:type tag, we will only select video or audio if it matches
		if (
			openGraphType &&
			!openGraphType.startsWith("video") &&
			!openGraphType.startsWith("music")
		) {
			reject();
			return;
		}

		["video", "audio"].forEach((type) => {
			if (foundMedia) {
				return;
			}

			$(`meta[property="og:${type}:type"]`).each(function (this: Element, i: number) {
				const mimeType = $(this).attr("content");

				if (!mimeType) {
					return;
				}

				if (mediaTypeRegex.test(mimeType)) {
					// If we match a clean video or audio tag, parse that as a preview instead
					let mediaUrl = $($(`meta[property="og:${type}"]`).get(i)).attr("content");

					if (!mediaUrl) {
						return;
					}

					// Make sure media is a valid url
					mediaUrl = normalizeURL(mediaUrl, preview.link, true);

					// Make sure media is a valid url
					if (!mediaUrl) {
						return;
					}

					foundMedia = true;

					fetch(mediaUrl, {
						accept:
							type === "video"
								? "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5"
								: "audio/webm, audio/ogg, audio/wav, audio/*;q=0.9, application/ogg;q=0.7, video/*;q=0.6; */*;q=0.5",
						language: client.config.browser?.language || "",
					})
						.then((resMedia) => {
							if (resMedia === null || !mediaTypeRegex.test(resMedia.type)) {
								return reject();
							}

							preview.type = type;
							preview.media = mediaUrl;
							preview.mediaType = normalizeMediaType(resMedia.type);

							resolve(resMedia);
						})
						.catch(reject);

					return false;
				}
			});
		});

		if (!foundMedia) {
			reject();
		}
	});
}

function parse(msg: Msg, chan: Chan, preview: LinkPreview, res: FetchRequest, client: Client) {
	let promise: Promise<FetchRequest | null> | null = null;

	preview.size = res.size;

	switch (res.type) {
		case "text/html":
			preview.size = -1;
			promise = parseHtml(preview, res, client);
			break;

		case "text/plain":
			preview.type = "link";
			preview.body = res.data.toString().substr(0, 300);
			break;

		case "image/png":
		case "image/gif":
		case "image/jpg":
		case "image/jpeg":
		case "image/jxl":
		case "image/webp":
		case "image/avif":
			if (!isProxied() && Config.values.disableMediaPreview) {
				return removePreview(msg, preview);
			}

			if (res.size > Config.values.prefetchMaxImageSize * 1024) {
				preview.type = "error";
				preview.error = "image-too-big";
				preview.maxSize = Config.values.prefetchMaxImageSize * 1024;
			} else {
				preview.type = "image";
				preview.thumbActualUrl = preview.link;
			}

			break;

		case "audio/midi":
		case "audio/mpeg":
		case "audio/mpeg3":
		case "audio/ogg":
		case "audio/wav":
		case "audio/x-wav":
		case "audio/x-mid":
		case "audio/x-midi":
		case "audio/x-mpeg":
		case "audio/x-mpeg-3":
		case "audio/flac":
		case "audio/x-flac":
		case "audio/mp4":
		case "audio/x-m4a":
			if (!preview.link.startsWith("https://")) {
				break;
			}

			if (Config.values.disableMediaPreview) {
				return removePreview(msg, preview);
			}

			preview.type = "audio";
			preview.media = preview.link;
			preview.mediaType = normalizeMediaType(res.type);

			break;

		case "video/webm":
		case "video/ogg":
		case "video/mp4":
			if (!preview.link.startsWith("https://")) {
				break;
			}

			if (Config.values.disableMediaPreview) {
				return removePreview(msg, preview);
			}

			preview.type = "video";
			preview.media = preview.link;
			preview.mediaType = res.type;

			break;

		default:
			return removePreview(msg, preview);
	}

	if (res.filename && ["image", "audio", "video"].includes(preview.type)) {
		preview.filename = res.filename;
	}

	if (!promise) {
		return handlePreview(client, chan, msg, preview, res);
	}

	void promise.then((newRes) => handlePreview(client, chan, msg, preview, newRes));
}

// Browsers only recognise the registered mime type of some formats in <source type>
export function normalizeMediaType(type: string): string {
	return type === "audio/x-flac" ? "audio/flac" : type;
}

// Use the filename from the Content-Disposition header if there is one,
// otherwise fall back to the last segment of the URL path if it has an extension
export function getFilename(uri: string, disposition?: string): string | null {
	if (disposition) {
		try {
			const filename = contentDisposition.parse(disposition).parameters.filename;

			if (filename) {
				return filename;
			}
		} catch {
			// Ignore malformed headers and fall back to the url
		}
	}

	try {
		const basename = decodeURIComponent(path.posix.basename(new URL(uri).pathname));
		return basename.indexOf(".") > 0 ? basename : null;
	} catch {
		return null;
	}
}

function handlePreview(client: Client, chan: Chan, msg: Msg, preview: LinkPreview, res) {
	const thumb = preview.thumbActualUrl || "";
	delete preview.thumbActualUrl;

	if (thumb.length && previewCache.isEnabled() && res?.data) {
		void previewCache
			.setImage(normalizeURL(thumb) || thumb, res.type, res.data)
			.then((hash) => {
				preview.thumb = `preview-cache/${hash}`;
				emitPreview(client, chan, msg, preview);
			});
		return;
	}

	if (!thumb.length || !Config.values.prefetchStorage) {
		preview.thumb = thumb;
		return emitPreview(client, chan, msg, preview);
	}

	// Get the correct file extension for the provided content-type
	// This is done to prevent user-input being stored in the file name (extension)
	const extension = mime.extension(res.type);

	if (!extension) {
		// For link previews, drop the thumbnail
		// For other types, do not display preview at all
		if (preview.type !== "link") {
			return removePreview(msg, preview);
		}

		return emitPreview(client, chan, msg, preview);
	}

	storage.store(res.data, extension, (uri) => {
		preview.thumb = uri;

		emitPreview(client, chan, msg, preview);
	});
}

function emitPreview(client: Client, chan: Chan, msg: Msg, preview: LinkPreview, cache = true) {
	// If there is no title but there is preview or description, set title
	// otherwise bail out and show no preview
	if (!preview.head.length && preview.type === "link") {
		if (preview.thumb.length || preview.body.length) {
			preview.head = "Untitled page";
		} else {
			return removePreview(msg, preview);
		}
	}

	// Errors may be temporary, so they are not cached
	const url = normalizeURL(preview.link);

	if (cache && url && preview.type !== "error" && previewCache.isEnabled()) {
		void previewCache.setPreview(url, preview);
	}

	client.emit("msg:preview", {
		id: msg.id,
		chan: chan.id,
		preview: preview,
	});
}

function removePreview(msg: Msg, preview: LinkPreview) {
	// If a preview fails to load, remove the link from msg object
	// So that client doesn't attempt to display an preview on page reload
	const index = msg.previews.indexOf(preview);

	if (index > -1) {
		msg.previews.splice(index, 1);
	}
}

function getRequestHeaders(headers: Record<string, string>) {
	const formattedHeaders = {
		// Certain websites like Amazon only add <meta> tags to known bots,
		// lets pretend to be them to get the metadata
		"User-Agent":
			"Mozilla/5.0 (compatible; The Lounge IRC Client; +https://github.com/thelounge/thelounge)" +
			" facebookexternalhit/1.1 Twitterbot/1.0",
		Accept: headers.accept || "*/*",
		"X-Purpose": "preview",
	};

	if (headers.language) {
		formattedHeaders["Accept-Language"] = headers.language;
	}

	return formattedHeaders;
}

// We know link prefetch can be used for SSRF, see https://github.com/thelounge/thelounge/issues/1990
// This feature is disabled by default, do not report this as a security vulnerability.
function fetch(uri: string, headers: Record<string, string>) {
	// Stringify the object otherwise the objects won't compute to the same value
	const cacheKey = JSON.stringify([uri, headers]);
	let promise = currentFetchPromises.get(cacheKey);

	if (promise) {
		return promise;
	}

	const prefetchTimeout = Config.values.prefetchTimeout;

	if (!prefetchTimeout) {
		log.warn(
			"prefetchTimeout is missing from your The Lounge configuration, defaulting to 5000 ms"
		);
	}

	promise = new Promise<FetchRequest>((resolve, reject) => {
		let buffer = Buffer.from("");
		let contentLength = 0;
		let contentType: string | undefined;
		let filename: string | null = null;
		let limit = Config.values.prefetchMaxImageSize * 1024;

		try {
			const gotStream = got.stream(uri, {
				retry: 0,
				timeout: prefetchTimeout || 5000, // milliseconds
				headers: getRequestHeaders(headers),
				localAddress: Config.values.bind,
			});

			gotStream
				.on("response", function (res) {
					contentLength = parseInt(res.headers["content-length"], 10) || 0;
					contentType = res.headers["content-type"];
					// Use the final url after redirects for the filename fallback
					filename = getFilename(res.url || uri, res.headers["content-disposition"]);

					if (contentType && imageTypeRegex.test(contentType)) {
						// response is an image
						// if Content-Length header reports a size exceeding the prefetch limit, abort fetch
						// and if file is not to be stored we don't need to download further either
						if (contentLength > limit || !isProxied()) {
							gotStream.destroy();
						}
					} else if (contentType && mediaTypeRegex.test(contentType)) {
						// We don't need to download the file any further after we received content-type header
						gotStream.destroy();
					} else {
						// if not image, limit download to the max search size, since we need only meta tags
						// twitter.com sends opengraph meta tags within ~20kb of data for individual tweets, the default is set to 50.
						// for sites like Youtube the og tags are in the first 300K and hence this is configurable by the admin
						limit =
							"prefetchMaxSearchSize" in Config.values
								? Config.values.prefetchMaxSearchSize * 1024
								: // set to the previous size if config option is unset
								  50 * 1024;
					}
				})
				.on("error", (e) => reject(e))
				.on("data", (data) => {
					buffer = Buffer.concat(
						[buffer, data],
						buffer.length + (data as Array<any>).length
					);

					if (buffer.length >= limit) {
						gotStream.destroy();
					}
				})
				.on("end", () => gotStream.destroy())
				.on("close", () => {
					let type = "";

					// If we downloaded more data then specified in Content-Length, use real data size
					const size = contentLength > buffer.length ? contentLength : buffer.length;

					if (contentType) {
						type = contentType.split(/ *; */).shift() || "";
					}

					resolve({data: buffer, type, size, filename});
				});
		} catch (e: any) {
			return reject(e);
		}
	});

	const removeCache = () => currentFetchPromises.delete(cacheKey);

	promise.then(removeCache).catch(removeCache);

	currentFetchPromises.set(cacheKey, promise);

	return promise;
}

function normalizeURL(link: string, baseLink?: string, disallowHttp = false) {
	try {
		const url = new URL(link, baseLink);

		// Only fetch http and https links
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}

		if (disallowHttp && url.protocol === "http:") {
			return undefined;
		}

		// Do not fetch links without hostname or ones that contain authorization
		if (!url.hostname || url.username || url.password) {
			return undefined;
		}

		// Drop hash from the url, if any
		url.hash = "";

		return url.toString();
	} catch (e: any) {
		// if an exception was thrown, the url is not valid
	}

	return undefined;
}

// Serves a cached preview image by its url hash, fetching it from the source if it is not cached.
// Only urls the link plugin recorded as preview images can be requested, so this is not an open proxy.
export async function routeCachedImage(req: Request, res: Response) {
	const hash = req.params.hash;
	const entry = previewCache.isValidHash(hash) ? await previewCache.read(hash) : null;

	if (!previewCache.isEnabled() || !entry?.image) {
		return res.status(404).send("Not found");
	}

	res.setHeader("Cache-Control", "max-age=86400");
	res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

	const filePath = previewCache.getPath(hash, "img");

	if (fs.existsSync(filePath)) {
		return res.contentType(entry.image).sendFile(filePath);
	}

	try {
		const image = await fetch(entry.url, {accept: "image/*"});

		if (
			!imageTypeRegex.test(image.type) ||
			image.size > Config.values.prefetchMaxImageSize * 1024 ||
			image.data.length < image.size
		) {
			return res.status(404).send("Not found");
		}

		await previewCache.setImage(entry.url, image.type, image.data);
		return res.contentType(image.type).send(image.data);
	} catch {
		return res.status(404).send("Not found");
	}
}
