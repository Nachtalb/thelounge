// Sticker files (pictures, videos) load through here, never straight from an element's src:
// - Cache first: files are named by their Telegram file id and never change, so they are kept in
//   Cache Storage (oldest dropped above MAX_BYTES) and a reload doesn't download them again.
// - At most MAX_ACTIVE downloads at once, at low fetch priority, best rank first (on screen before
//   near the screen), so stickers never crowd out the chat's own requests. A negative rank (the
//   sticker opened in its menu) starts at once at high priority, past the limit, and nothing else
//   starts until it finished.
// - A download nobody wants any more (sticker scrolled away, picker closed) is aborted.
// Elements get object URLs, which are revoked once unused (a few recent ones are kept for scrolling back).

const FILE_CACHE = "stickers-v1";
const JSON_CACHE = "sticker-packs-v1";
const MAX_ACTIVE = 4;
const MAX_BYTES = 100 * 1024 * 1024;
const KEEP_IDLE_URLS = 60;

export type StickerFile = {
	// Resolves with an object URL; rejects when the download failed or was cancelled
	promise: Promise<string>;
	// Lower goes first; may change while waiting
	setRank(rank: number): void;
	// Not wanted any more: aborts the download if nobody else wants it, releases the object URL
	release(): void;
};

type Handle = {rank: number; resolve: (href: string) => void; reject: (e: Error) => void};

type Job = {
	url: string;
	handles: Set<Handle>;
	seq: number;
	state: "cache" | "queued" | "loading";
	controller: AbortController;
};

const jobs = new Map<string, Job>();
const objectUrls = new Map<string, {href: string; refs: number}>();
// Unused object URLs in the order they became unused
const idle = new Set<string>();
let active = 0;
let seq = 0;
let putsSinceTrim = 0;

const openCache = (name: string) =>
	typeof caches === "undefined" ? Promise.resolve(null) : caches.open(name).catch(() => null);

const rankOf = (job: Job) => Math.min(...[...job.handles].map((h) => h.rank));

function acquire(url: string): string | null {
	const entry = objectUrls.get(url);

	if (!entry) {
		return null;
	}

	entry.refs++;
	idle.delete(url);
	return entry.href;
}

function releaseUrl(url: string) {
	const entry = objectUrls.get(url);

	if (!entry || --entry.refs > 0) {
		return;
	}

	idle.add(url);

	for (const old of idle) {
		if (idle.size <= KEEP_IDLE_URLS) {
			break;
		}

		idle.delete(old);
		URL.revokeObjectURL(objectUrls.get(old)!.href);
		objectUrls.delete(old);
	}
}

function finish(job: Job, blob: Blob | null, error?: Error) {
	// Cancelled meanwhile (maybe already asked for again: that's a new job)
	if (jobs.get(job.url) !== job) {
		return;
	}

	jobs.delete(job.url);

	if (!blob) {
		job.handles.forEach((h) => h.reject(error || new Error("Failed")));
		return;
	}

	objectUrls.set(job.url, {href: URL.createObjectURL(blob), refs: 0});
	idle.add(job.url);
	job.handles.forEach((h) => h.resolve(acquire(job.url)!));
}

const urgentLoading = () =>
	[...jobs.values()].some((job) => job.state === "loading" && rankOf(job) < 0);

function pump() {
	for (;;) {
		let next: Job | null = null;

		for (const job of jobs.values()) {
			if (
				job.state === "queued" &&
				(!next ||
					rankOf(job) < rankOf(next) ||
					(rankOf(job) === rankOf(next) && job.seq < next.seq))
			) {
				next = job;
			}
		}

		if (!next || (rankOf(next) >= 0 && (active >= MAX_ACTIVE || urgentLoading()))) {
			return;
		}

		void download(next);
	}
}

async function download(job: Job) {
	job.state = "loading";
	active++;

	try {
		const res = await fetch(job.url, {
			signal: job.controller.signal,
			priority: rankOf(job) < 0 ? "high" : "low",
		});

		if (!res.ok) {
			throw new Error(String(res.status));
		}

		const blob = await res.blob();
		void store(job.url, blob);
		finish(job, blob);
	} catch (e) {
		finish(job, null, e as Error);
	} finally {
		active--;
		pump();
	}
}

async function store(url: string, blob: Blob) {
	const cache = await openCache(FILE_CACHE);

	if (!cache) {
		return;
	}

	try {
		await cache.put(
			url,
			new Response(blob, {
				headers: {"Content-Type": blob.type, "Content-Length": String(blob.size)},
			})
		);

		if (++putsSinceTrim >= 20) {
			putsSinceTrim = 0;
			await trim(cache);
		}
	} catch {
		// Storage full or unavailable: the file still shows, it's just not kept
	}
}

// Drop the oldest files once the origin's storage use passes MAX_BYTES
async function trim(cache: Cache) {
	const estimate = await navigator.storage?.estimate?.();
	let excess = (estimate?.usage || 0) - MAX_BYTES;

	if (excess <= 0) {
		return;
	}

	excess += MAX_BYTES / 10;

	for (const request of await cache.keys()) {
		if (excess <= 0) {
			break;
		}

		const res = await cache.match(request);
		excess -= Number(res?.headers.get("Content-Length")) || 0;
		await cache.delete(request);
	}
}

async function start(job: Job) {
	const cache = await openCache(FILE_CACHE);
	const hit = await cache?.match(job.url).catch(() => undefined);
	const blob = hit ? await hit.blob().catch(() => null) : null;

	if (blob) {
		finish(job, blob);
		return;
	}

	if (jobs.get(job.url) !== job) {
		return;
	}

	job.state = "queued";
	pump();
}

export function loadStickerFile(url: string, rank: number): StickerFile {
	const handle = {rank} as Handle;
	let href: string | null = null;
	let released = false;

	const promise = new Promise<string>((resolve, reject) => {
		handle.resolve = (h) => {
			if (released) {
				releaseUrl(url);
			} else {
				href = h;
				resolve(h);
			}
		};

		handle.reject = reject;
	});
	// Callers that only release() needn't handle the rejection
	promise.catch(() => undefined);

	const ready = acquire(url);

	if (ready) {
		href = ready;
		handle.resolve(ready);
	} else {
		let job = jobs.get(url);

		if (!job) {
			job = {
				url,
				handles: new Set(),
				seq: seq++,
				state: "cache",
				controller: new AbortController(),
			};
			jobs.set(url, job);
			void start(job);
		}

		job.handles.add(handle);
		pump();
	}

	return {
		promise,
		setRank(r) {
			handle.rank = r;
			pump();
		},
		release() {
			if (released) {
				return;
			}

			released = true;

			if (href) {
				releaseUrl(url);
				return;
			}

			const job = jobs.get(url);

			if (!job) {
				return;
			}

			job.handles.delete(handle);
			handle.reject(new Error("Cancelled"));

			if (job.handles.size === 0) {
				jobs.delete(url);
				job.controller.abort();
			}
		},
	};
}

// Cached JSON at once, revalidated in the background: `update` gets the network copy when it
// differs. Without a cached copy, waits for the network. Resolves with the HTTP status on failure.
export async function cachedJson<T>(url: string, update: (data: T) => void): Promise<T | number> {
	const cache = await openCache(JSON_CACHE);
	const hit = await cache?.match(url).catch(() => undefined);
	const cachedText = hit ? await hit.text() : null;

	const network = fetch(url, {priority: "low"}).then(async (res) => {
		if (!res.ok) {
			return res.status;
		}

		const text = await res.text();
		void cache?.put(url, new Response(text, {headers: {"Content-Type": "application/json"}}));
		return text;
	});

	if (cachedText !== null) {
		network
			.then((text) => {
				if (typeof text === "string" && text !== cachedText) {
					update(JSON.parse(text) as T);
				}
			})
			.catch(() => undefined);
		return JSON.parse(cachedText) as T;
	}

	const text = await network;
	return typeof text === "string" ? (JSON.parse(text) as T) : text;
}
