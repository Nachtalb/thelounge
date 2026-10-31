import {afterEach, beforeEach, expect, vi} from "vitest";
import {cachedJson, loadStickerFile} from "../../../../client/js/helpers/stickerFiles";

type Pending = {url: string; signal: AbortSignal; resolve: (r: Response) => void};

describe("stickerFiles", function () {
	let pending: Pending[];
	let started: string[];

	beforeEach(function () {
		pending = [];
		started = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(url: string, init: RequestInit) =>
					new Promise<Response>((resolve, reject) => {
						started.push(url);
						init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
						pending.push({url, signal: init.signal!, resolve});
					})
			)
		);
	});

	afterEach(function () {
		vi.unstubAllGlobals();
	});

	const flush = () => new Promise((r) => setTimeout(r, 0));
	const answer = (url: string, body = "x") =>
		pending.find((p) => p.url === url)!.resolve(new Response(body));

	it("downloads at most four at a time, lowest rank next", async function () {
		const files = ["a", "b", "c", "d", "e", "f"].map((n, i) =>
			loadStickerFile(`https://s.test/${n}`, i < 4 ? 0 : n === "e" ? 3 : 1)
		);
		await flush();
		expect(started).to.deep.equal(["a", "b", "c", "d"].map((n) => `https://s.test/${n}`));

		answer("https://s.test/a");
		const href = await files[0].promise;
		expect(href).to.match(/^blob:/);
		await flush();
		// f (rank 1) before e (rank 3)
		expect(started.at(-1)).to.equal("https://s.test/f");
		files.forEach((f) => f.release());
	});

	it("starts a negative rank at once at high priority, past the limit", async function () {
		const files = ["l", "m", "n", "o", "p"].map((n) =>
			loadStickerFile(`https://s.test/${n}`, 0)
		);
		const priority = () => vi.mocked(fetch).mock.lastCall?.[1]?.priority;
		await flush();
		expect(started).to.not.include("https://s.test/p");
		const urgent = loadStickerFile("https://s.test/u", -1);
		await flush();
		expect(started.at(-1)).to.equal("https://s.test/u");
		expect(priority()).to.equal("high");
		// Nothing else starts meanwhile, a queued one moved to the front does
		answer("https://s.test/l");
		await flush();
		expect(started).to.not.include("https://s.test/p");
		files[4].setRank(-1);
		await flush();
		expect(started.at(-1)).to.equal("https://s.test/p");
		[...files, urgent].forEach((f) => f.release());
	});

	it("aborts a download nobody wants and never starts a released queued one", async function () {
		const files = ["g", "h", "i", "j", "k"].map((n) =>
			loadStickerFile(`https://s.test/${n}`, 0)
		);
		await flush();
		const first = pending[0];
		files[0].release();
		expect(first.signal.aborted).to.equal(true);
		files[4].release();
		await flush();
		expect(started).to.not.include("https://s.test/k");
		await expect(files[0].promise).rejects.toThrow();
		files.forEach((f) => f.release());
	});

	it("shares one download between users of the same file", async function () {
		const a = loadStickerFile("https://s.test/same", 0);
		const b = loadStickerFile("https://s.test/same", 2);
		await flush();
		expect(started.filter((u) => u === "https://s.test/same")).to.have.length(1);
		a.release();
		expect(pending.at(-1)!.signal.aborted).to.equal(false);
		answer("https://s.test/same");
		expect(await b.promise).to.match(/^blob:/);
		b.release();
	});

	it("returns JSON from the network, or the status on failure", async function () {
		const ok = cachedJson("https://s.test/p.json", () => undefined);
		const missing = cachedJson("https://s.test/q.json", () => undefined);
		await flush();
		answer("https://s.test/p.json", '{"name":"p"}');
		pending
			.find((p) => p.url === "https://s.test/q.json")!
			.resolve(new Response("", {status: 404}));
		expect(await ok).to.deep.equal({name: "p"});
		expect(await missing).to.equal(404);
	});
});
