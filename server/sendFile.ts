import fs from "fs";
import path from "path";

type SendFileOptions = {
	// Cache-Control max-age in seconds, unless headers sets Cache-Control
	maxAge?: number;
	headers?: Record<string, string>;
};

// Serves a file like express' res.sendFile: weak ETag, Last-Modified and 304s.
// Bun adds Content-Type, Content-Length, Range and HEAD for Bun.file bodies.
// Returns null if the file does not exist.
export function sendFile(
	req: Request,
	filePath: string,
	{maxAge = 0, headers = {}}: SendFileOptions = {}
): Response | null {
	let stat: fs.Stats;

	try {
		stat = fs.statSync(filePath);
	} catch {
		return null;
	}

	if (!stat.isFile()) {
		return null;
	}

	const etag = `W/"${stat.size.toString(16)}-${stat.mtime.getTime().toString(16)}"`;
	const responseHeaders = new Headers({
		"Cache-Control": `public, max-age=${maxAge}`,
		...headers,
		ETag: etag,
		"Last-Modified": stat.mtime.toUTCString(),
	});

	const ifNoneMatch = req.headers.get("if-none-match");
	const ifModifiedSince = req.headers.get("if-modified-since");
	const notModified = ifNoneMatch
		? ifNoneMatch
				.split(/\s*,\s*/)
				.some((tag) => tag === "*" || tag.replace(/^W\//, "") === etag.slice(2))
		: ifModifiedSince !== null &&
		  Date.parse(ifModifiedSince) >= Math.floor(stat.mtimeMs / 1000) * 1000;

	if (notModified) {
		return new Response(null, {status: 304, headers: responseHeaders});
	}

	return new Response(Bun.file(filePath), {headers: responseHeaders});
}

// Serves urlPath from inside root like express.static (no dotfiles, no directory
// listings, no escaping root). Returns null if there is no such file.
export function serveStatic(
	req: Request,
	root: string,
	urlPath: string,
	options?: SendFileOptions
): Response | null {
	let relative: string;

	try {
		relative = decodeURIComponent(urlPath);
	} catch {
		return null;
	}

	const filePath = path.join(root, relative);
	const inside = path.relative(root, filePath);

	if (
		relative.includes("\0") ||
		!inside ||
		inside.startsWith("..") ||
		path.isAbsolute(inside) ||
		inside.split(path.sep).some((part) => part.startsWith("."))
	) {
		return null;
	}

	return sendFile(req, filePath, options);
}
