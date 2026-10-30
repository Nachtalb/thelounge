// @ts-expect-error -- vite uses "exports" which requires moduleResolution: "bundler"
import {createServer as createViteServer} from "vite";
import http from "http";
import fs from "fs";

import log from "../log";
import fromRoot from "../rootpath";
import {injectServerConfig} from "./html-config";

// Vite's middlewares need Node's req/res, so they get a loopback http server
// that Bun.serve asks first. Development only.
export default async () => {
	log.debug("Starting server in development mode");

	const vite = await createViteServer({
		configFile: fromRoot("vite.config.mts"),
		server: {middlewareMode: true},
		appType: "custom",
	});

	const middlewares = http.createServer((req, res) => {
		vite.middlewares(req, res, () => {
			res.statusCode = 404;
			res.setHeader("X-Vite-Miss", "1");
			res.end();
		});
	});
	await new Promise<void>((resolve) => middlewares.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(middlewares.address() as {port: number}).port}`;

	// The Vite response, or null if Vite has nothing for this request
	const handle = async (req: Request) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			return null;
		}

		const url = new URL(req.url);
		const res = await fetch(origin + url.pathname + url.search, {
			method: req.method,
			headers: req.headers,
			redirect: "manual",
		});

		if (res.headers.has("X-Vite-Miss")) {
			return null;
		}

		// fetch() already decoded the body
		const headers = new Headers(res.headers);
		headers.delete("Content-Encoding");
		headers.delete("Content-Length");

		return new Response(res.body, {status: res.status, headers});
	};

	handle.indexRequest = async (req: Request) => {
		const rawHtml = fs.readFileSync(fromRoot("client", "index.html"), "utf-8");
		const html = await vite.transformIndexHtml(new URL(req.url).pathname, rawHtml);
		return new Response(injectServerConfig(html), {
			headers: {"Content-Type": "text/html; charset=utf-8"},
		});
	};

	return handle;
};
