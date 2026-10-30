import Config from "../config";
import busboy, {BusboyHeaders} from "@fastify/busboy";
import path from "path";
import fs from "fs";
import fileType from "file-type";
import crypto from "crypto";
import log from "../log";
import contentDisposition from "content-disposition";
import type {Socket} from "socket.io";
import {Readable} from "stream";
import {sendFile} from "../sendFile";
import NodeBuffer, {Buffer} from "buffer";

// Map of allowed mime types to their respecive default filenames
// that will be rendered in browser without forcing them to be downloaded
const inlineContentDispositionTypes = {
	"application/ogg": "media.ogx",
	"audio/midi": "audio.midi",
	"audio/mpeg": "audio.mp3",
	"audio/ogg": "audio.ogg",
	"audio/vnd.wave": "audio.wav",
	"audio/x-flac": "audio.flac",
	"audio/x-m4a": "audio.m4a",
	"image/bmp": "image.bmp",
	"image/gif": "image.gif",
	"image/jpeg": "image.jpg",
	"image/png": "image.png",
	"image/webp": "image.webp",
	"image/avif": "image.avif",
	"image/jxl": "image.jxl",
	"text/plain": "text.txt",
	"video/mp4": "video.mp4",
	"video/ogg": "video.ogv",
	"video/webm": "video.webm",
};

const uploadTokens = new Map();

class Uploader {
	constructor(socket: Socket) {
		socket.on("upload:auth", () => {
			const token = crypto.randomUUID();

			socket.emit("upload:auth", token);

			// Invalidate the token in one minute
			const timeout = Uploader.createTokenTimeout(token);

			uploadTokens.set(token, timeout);
		});

		socket.on("upload:ping", (token) => {
			if (typeof token !== "string") {
				return;
			}

			let timeout = uploadTokens.get(token);

			if (!timeout) {
				return;
			}

			clearTimeout(timeout);
			timeout = Uploader.createTokenTimeout(token);
			uploadTokens.set(token, timeout);
		});
	}

	static createTokenTimeout(this: void, token: string) {
		return setTimeout(() => uploadTokens.delete(token), 60 * 1000);
	}

	static routes(this: void) {
		const getFile = (req: Bun.BunRequest<string>) =>
			req.method === "GET" || req.method === "HEAD"
				? Uploader.routeGetFile(req, req.params.name, new URL(req.url).pathname)
				: null;

		return {
			"/uploads/:name": getFile,
			"/uploads/:name/*": getFile,
			"/uploads/new/:token": (req: Bun.BunRequest<"/uploads/new/:token">) =>
				req.method === "POST" ? Uploader.routeUploadFile(req, req.params.token) : null,
		};
	}

	static async routeGetFile(this: void, req: Request, name: string, pathname: string) {
		const nameRegex = /^[0-9a-f]{16}$/;

		if (!nameRegex.test(name)) {
			return null;
		}

		const folder = name.substring(0, 2);
		const uploadPath = Config.getFileUploadPath();
		const filePath = path.join(uploadPath, folder, name);
		let detectedMimeType = await Uploader.getFileType(filePath);

		// doesn't exist
		if (detectedMimeType === null) {
			return null;
		}

		// Force a download in the browser if it's not an allowed type (binary or otherwise unknown)
		let slug: string | undefined = pathname.split("/")[3];

		try {
			slug = slug && decodeURIComponent(slug);
		} catch {
			return null;
		}

		const isInline = detectedMimeType in inlineContentDispositionTypes;
		let disposition = isInline ? "inline" : "attachment";

		if (!slug && isInline) {
			slug = inlineContentDispositionTypes[detectedMimeType];
		}

		if (slug) {
			disposition = contentDisposition(slug.trim(), {
				fallback: false,
				type: disposition,
			});
		}

		// Send a more common mime type for audio files
		// so that browsers can play them correctly
		if (detectedMimeType === "audio/vnd.wave") {
			detectedMimeType = "audio/wav";
		} else if (detectedMimeType === "audio/x-flac") {
			detectedMimeType = "audio/flac";
		} else if (detectedMimeType === "audio/x-m4a") {
			detectedMimeType = "audio/mp4";
		} else if (detectedMimeType === "video/quicktime") {
			detectedMimeType = "video/mp4";
		}

		return sendFile(req, filePath, {
			headers: {
				"Content-Disposition": disposition,
				"Cache-Control": "max-age=86400",
				"Content-Type": detectedMimeType,
			},
		});
	}

	static routeUploadFile(this: void, req: Request, token: string) {
		return new Promise<Response>((resolve) => Uploader.upload(req, token, resolve));
	}

	static upload(this: void, req: Request, token: string, respond: (res: Response) => void) {
		const respondJson = (status: number, json: object) =>
			respond(Response.json(json, {status}));
		const body = req.body ? Readable.fromWeb(req.body as any) : null;
		let busboyInstance: busboy | null | undefined;
		let uploadUrl: string | URL;
		let randomName: string;
		let destDir: fs.PathLike;
		let destPath: fs.PathLike | null;
		let streamWriter: fs.WriteStream | null;
		let originalName: string;

		const doneCallback = () => {
			// detach the stream and drain any remaining data
			if (busboyInstance) {
				body?.unpipe(busboyInstance);
				body?.resume();

				busboyInstance.removeAllListeners();
				busboyInstance = null;
			}

			// close the output file stream
			if (streamWriter) {
				streamWriter.end();
				streamWriter = null;
			}
		};

		const abortWithError = (err: any) => {
			doneCallback();

			// if we ended up erroring out, delete the output file from disk
			if (destPath && fs.existsSync(destPath)) {
				fs.unlinkSync(destPath);
				destPath = null;
			}

			return respondJson(400, {error: err.message});
		};

		// if the authentication token is incorrect, bail out
		if (uploadTokens.delete(token) !== true) {
			return abortWithError(Error("Invalid upload token"));
		}

		// if the request does not contain any body data, bail out
		const contentLength = req.headers.get("content-length");

		if (!body || (contentLength && parseInt(contentLength) < 1)) {
			return abortWithError(Error("Length Required"));
		}

		// Only allow multipart, as busboy can throw an error on unsupported types
		if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
			return abortWithError(Error("Unsupported Content Type"));
		}

		// create a new busboy processor, it is wrapped in try/catch
		// because it can throw on malformed headers
		try {
			busboyInstance = new busboy({
				headers: Object.fromEntries(req.headers) as BusboyHeaders,
				limits: {
					files: 1, // only allow one file per upload
					fileSize: Uploader.getMaxFileSize(),
				},
			});
		} catch (err) {
			return abortWithError(err);
		}

		// Any error or limit from busboy will abort the upload with an error
		busboyInstance.on("error", abortWithError);
		busboyInstance.on("partsLimit", () => abortWithError(Error("Parts limit reached")));
		busboyInstance.on("filesLimit", () => abortWithError(Error("Files limit reached")));
		busboyInstance.on("fieldsLimit", () => abortWithError(Error("Fields limit reached")));

		// generate a random output filename for the file
		// we use do/while loop to prevent the rare case of generating a file name
		// that already exists on disk
		do {
			randomName = crypto.randomBytes(8).toString("hex");
			destDir = path.join(Config.getFileUploadPath(), randomName.substring(0, 2));
			destPath = path.join(destDir, randomName);
		} while (fs.existsSync(destPath));

		// we split the filename into subdirectories (by taking 2 letters from the beginning)
		// this helps avoid file system and certain tooling limitations when there are
		// too many files on one folder
		try {
			fs.mkdirSync(destDir, {recursive: true});
		} catch (err: any) {
			log.error(`Error ensuring ${destDir} exists for uploads: ${err.message}`);

			return abortWithError(err);
		}

		// Open a file stream for writing
		streamWriter = fs.createWriteStream(destPath);
		streamWriter.on("error", abortWithError);

		busboyInstance.on(
			"file",
			(
				fieldname: any,
				fileStream: {
					on: (arg0: string, arg1: (err?: any) => void) => void;
					unpipe: (arg0: any) => void;
					read: {bind: (arg0: any) => any};
					pipe: (arg0: any) => void;
				},
				filename: string | number | boolean
			) => {
				originalName = String(filename);
				uploadUrl = `${randomName}/${encodeURIComponent(filename)}`;

				if (Config.values.fileUpload.baseUrl) {
					uploadUrl = new URL(uploadUrl, Config.values.fileUpload.baseUrl).toString();
				} else {
					uploadUrl = `uploads/${uploadUrl}`;
				}

				// if the busboy data stream errors out or goes over the file size limit
				// abort the processing with an error
				fileStream.on("error", abortWithError);
				fileStream.on("limit", () => {
					fileStream.unpipe(streamWriter);
					fileStream.on("readable", fileStream.read.bind(fileStream));

					return abortWithError(Error("File size limit reached"));
				});

				// Attempt to write the stream to file
				fileStream.pipe(streamWriter);
			}
		);

		busboyInstance.on("finish", () => {
			const writer = streamWriter;
			doneCallback();

			if (!uploadUrl) {
				return respondJson(400, {error: "Missing file"});
			}

			if (!Config.values.fileUpload.rustypaste?.url) {
				// upload was done, send the generated file url to the client
				return respondJson(200, {
					url: uploadUrl,
				});
			}

			// hand the file over to rustypaste and send its url instead of the local one
			const localPath = destPath as string;

			const forward = () => {
				Uploader.forwardToRustypaste(localPath, originalName)
					.then((url) => respondJson(200, {url}))
					.catch((err: Error) => {
						log.error(`Rustypaste upload failed: ${err.message}`);
						respondJson(400, {error: err.message});
					})
					.finally(() => fs.unlink(localPath, () => {}));
			};

			if (writer && !writer.closed) {
				writer.once("close", forward);
			} else {
				forward();
			}
		});

		// pipe request body to busboy for processing
		body.pipe(busboyInstance);
	}

	static async forwardToRustypaste(this: void, filePath: string, filename: string) {
		const {url, token} = Config.values.fileUpload.rustypaste!;
		const form = new FormData();
		form.append("file", new Blob([await fs.promises.readFile(filePath)]), filename || "file");

		const response = await fetch(url, {
			method: "POST",
			headers: token ? {Authorization: token} : {},
			body: form,
		});
		const body = (await response.text()).trim();

		if (!response.ok) {
			throw new Error(`Rustypaste responded with ${response.status}: ${body}`);
		}

		return body;
	}

	static getMaxFileSize() {
		const configOption = Config.values.fileUpload.maxFileSize;

		// Busboy uses Infinity to allow unlimited file size
		if (configOption < 1) {
			return Infinity;
		}

		// maxFileSize is in bytes, but config option is passed in as KB
		return configOption * 1024;
	}

	// Returns null if an error occurred (e.g. file not found)
	// Returns a string with the type otherwise
	static async getFileType(filePath: string) {
		try {
			const handle = await fs.promises.open(filePath, "r");
			const buffer = Buffer.alloc(5120);
			await handle.read(buffer, 0, 5120, 0);
			await handle.close();

			// returns {ext, mime} if found, null if not.
			const file = await fileType.fromBuffer(buffer);

			// if a file type was detected correctly, return it
			if (file) {
				return file.mime;
			}

			// if the buffer is a valid UTF-8 buffer, use text/plain
			if (NodeBuffer.isUtf8(buffer)) {
				return "text/plain";
			}

			// otherwise assume it's random binary data
			return "application/octet-stream";
		} catch (e: any) {
			if (e.code !== "ENOENT") {
				log.warn(`Failed to read ${filePath}: ${e.message}`);
			}
		}

		return null;
	}
}

export default Uploader;
