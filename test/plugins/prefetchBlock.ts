import dns from "dns";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {AddressInfo} from "net";
import {expect, vi} from "vitest";
import util from "../util";
import log from "../../server/log";
import Config from "../../server/config";
import link, {prefetchInputLinks} from "../../server/plugins/irc-events/link";
import {checkUrl, classifyAddress, createLookup} from "../../server/plugins/prefetchBlock";
import * as blocklist from "../../server/plugins/prefetchBlocklist";
import {LinkPreview} from "../../shared/types/msg";

// The shipped defaults (the test config changes the cached module, so load a fresh copy)
const defaultsPath = require.resolve("../../defaults/config.js");
const cachedDefaults = require.cache[defaultsPath];
delete require.cache[defaultsPath];
// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaults = require(defaultsPath) as {prefetchBlocklist: string[]};
require.cache[defaultsPath] = cachedDefaults;

// Makes dns.lookup answer `hosts` with fixed addresses
function stubDns(hosts: Record<string, string[]>) {
	const original = dns.lookup;
	return vi.spyOn(dns, "lookup").mockImplementation(((
		hostname: string,
		options: any,
		callback: (...args: unknown[]) => void
	) => {
		if (!(hostname in hosts)) {
			(original as any)(hostname, options, callback);
			return;
		}

		const addresses = hosts[hostname].map((address) => ({
			address,
			family: address.includes(":") ? 6 : 4,
		}));
		process.nextTick(() => {
			if (options.all) {
				callback(null, addresses);
			} else {
				callback(null, addresses[0].address, addresses[0].family);
			}
		});
	}) as any);
}

describe("prefetchBlock", function () {
	afterEach(function () {
		Config.values.prefetchBlockPrivate = false;
		Config.values.prefetchBlocklist = [];
		vi.restoreAllMocks();
		blocklist.reset();
	});

	describe("classifyAddress", function () {
		const nonPublic = {
			"0.0.0.0": "unspecified",
			"0.1.2.3": "unspecified",
			"10.0.0.1": "private",
			"10.255.255.255": "private",
			"100.64.0.1": "carrier-grade NAT",
			"100.127.255.255": "carrier-grade NAT",
			"127.0.0.1": "loopback",
			"127.255.255.254": "loopback",
			"169.254.169.254": "link-local",
			"172.16.0.1": "private",
			"172.31.255.255": "private",
			"192.168.1.1": "private",
			"192.0.2.1": "documentation",
			"198.18.0.1": "benchmarking",
			"224.0.0.1": "multicast",
			"239.255.255.250": "multicast",
			"240.0.0.1": "reserved",
			"255.255.255.255": "reserved",
			"::": "unspecified/loopback/IPv4-compatible",
			"::1": "unspecified/loopback/IPv4-compatible",
			"0:0:0:0:0:0:0:1": "unspecified/loopback/IPv4-compatible",
			"[::1]": "unspecified/loopback/IPv4-compatible",
			"fe80::1": "link-local",
			"fe80::1%eth0": "link-local",
			"febf::1": "link-local",
			"fc00::1": "unique local",
			"fd12:3456:789a::1": "unique local",
			"ff02::1": "multicast",
			"2001:db8::1": "documentation",
			"::ffff:127.0.0.1": "IPv4-mapped loopback",
			"::ffff:7f00:1": "IPv4-mapped loopback",
			"::ffff:10.1.2.3": "IPv4-mapped private",
			"::ffff:a9fe:a9fe": "IPv4-mapped link-local",
			"64:ff9b::7f00:1": "NAT64 loopback",
			"64:ff9b::192.168.0.1": "NAT64 private",
			"2002:c0a8:101::1": "6to4 private",
		};

		for (const [ip, range] of Object.entries(nonPublic)) {
			it(`should classify ${ip} as ${range}`, function () {
				expect(classifyAddress(ip)).to.equal(range);
			});
		}

		it("should not classify public addresses or host names", function () {
			for (const ip of [
				"1.1.1.1",
				"8.8.8.8",
				"9.255.255.255",
				"11.0.0.0",
				"100.63.255.255",
				"100.128.0.0",
				"172.15.255.255",
				"172.32.0.0",
				"192.169.0.1",
				"223.255.255.255",
				"2606:4700:4700::1111",
				"2a00:1450:4001::200e",
				"::ffff:8.8.8.8",
				"64:ff9b::808:808",
				"2002:808:808::1",
				"example.com",
				"",
			]) {
				expect(classifyAddress(ip), ip).to.equal(null);
			}
		});
	});

	describe("filter rules", function () {
		function verdict(rules: string[], url: string) {
			return blocklist.compileFilters(rules.join("\n")).match(new URL(url));
		}

		it("should match ||domain^ on the domain and its subdomains", function () {
			const rules = ["||example.com^"];
			expect(verdict(rules, "https://example.com/")).to.equal("block");
			expect(verdict(rules, "https://a.b.EXAMPLE.com/x")).to.equal("block");
			expect(verdict(rules, "https://example.com./x")).to.equal("block");
			expect(verdict(rules, "https://notexample.com/")).to.equal(null);
			expect(verdict(rules, "https://example.com.evil.org/")).to.equal(null);
			expect(verdict(rules, "https://evil.org/?u=example.com")).to.equal(null);
		});

		it("should match ||domain with a path as a pattern", function () {
			const rules = ["||example.com/ads/"];
			expect(verdict(rules, "https://www.example.com/ads/1")).to.equal("block");
			expect(verdict(rules, "https://example.com/news/")).to.equal(null);
			expect(verdict(rules, "https://evil.org/example.com/ads/")).to.equal(null);
		});

		it("should anchor | at the start and end", function () {
			expect(verdict(["|https://exact.test/pre"], "https://exact.test/prefix")).to.equal(
				"block"
			);
			expect(verdict(["|https://exact.test/pre"], "http://exact.test/prefix")).to.equal(null);
			expect(
				verdict(["|https://exact.test/pre"], "https://a.test/?https://exact.test/pre")
			).to.equal(null);
			expect(verdict([".png|"], "https://a.test/x.png")).to.equal("block");
			expect(verdict([".png|"], "https://a.test/x.png?y")).to.equal(null);
		});

		it("should support * wildcards and ^ separators in substrings", function () {
			expect(verdict(["/ads*banner"], "https://a.test/x/ads/big/banner.png")).to.equal(
				"block"
			);
			expect(verdict(["*/ads*banner"], "https://a.test/x/ads/big/banner.png")).to.equal(
				"block"
			);
			expect(verdict(["*/ads*banner"], "https://a.test/banner/ads")).to.equal(null);
			expect(verdict(["track^"], "https://a.test/track?x=1")).to.equal("block");
			expect(verdict(["track^"], "https://a.test/track/")).to.equal("block");
			expect(verdict(["a.test/track^"], "https://a.test/track")).to.equal("block");
			expect(verdict(["track^"], "https://a.test/tracker")).to.equal(null);
			expect(verdict(["track^"], "https://a.test/track.js")).to.equal(null);
			// Regex characters in patterns are literal
			expect(verdict(["a.test/(x)+"], "https://a.test/(x)+")).to.equal("block");
			expect(verdict(["a.test/(x)+"], "https://aXtest/xx")).to.equal(null);
		});

		it("should support /regex/ rules, case-insensitively", function () {
			expect(verdict(["/\\/secret\\d+$/"], "https://a.test/SECRET42")).to.equal("block");
			expect(verdict(["/\\/secret\\d+$/"], "https://a.test/secret")).to.equal(null);
		});

		it("should let @@ exceptions override blocking rules", function () {
			const rules = ["||example.com^", "@@||good.example.com^", "@@|https://example.com/ok"];
			expect(verdict(rules, "https://example.com/")).to.equal("block");
			expect(verdict(rules, "https://good.example.com/")).to.equal("allow");
			expect(verdict(rules, "https://x.good.example.com/")).to.equal("allow");
			expect(verdict(rules, "https://example.com/ok/1")).to.equal("allow");
			expect(verdict(["/./", "@@/\\.png$/"], "https://a.test/x.png")).to.equal("allow");
		});

		it("should ignore comments, headers and cosmetic rules and skip options", function () {
			const matcher = blocklist.compileFilters(
				[
					"[Adblock Plus 2.0]",
					"! Title: test",
					"",
					"example.com##.ad",
					"##.banner",
					"example.com#@#.ad",
					"example.com#?#div:has(.ad)",
					"||ads.test^$image",
					"||third.test^$third-party,domain=a.test|~b.test",
					"/ads/$script",
					"/(unclosed/",
					"||blocked.test^",
				].join("\r\n")
			);

			expect(matcher.rules).to.equal(1);
			expect(matcher.ignored).to.equal(4);
			expect(matcher.skipped).to.equal(4);
			expect(matcher.match(new URL("https://blocked.test/"))).to.equal("block");
			expect(matcher.match(new URL("https://ads.test/"))).to.equal(null);
			expect(matcher.match(new URL("https://example.com/"))).to.equal(null);
		});

		it("should block IP address links with the default rules", function () {
			const rules = defaults.prefetchBlocklist;

			for (const url of [
				"http://127.0.0.1/",
				"http://203.0.113.7:8080/x",
				"https://8.8.8.8?q",
				"http://1.2.3.4#x",
				// WHATWG URL normalises these to dotted quads
				"http://2130706433/",
				"http://0x7f.1/",
				"http://0177.0.0.1/",
				"http://127.1/",
				"http://127.0.0.1./",
				"http://[::1]/",
				"http://[::ffff:127.0.0.1]/",
				"https://[2001:DB8::1]:8443/x",
			]) {
				expect(verdict(rules, url), url).to.equal("block");
			}

			for (const url of [
				"https://example.com/",
				"https://1.2.3.4.nip.io/",
				"https://example.com/1.2.3.4",
				"https://example.com/?u=http://127.0.0.1/",
			]) {
				expect(verdict(rules, url), url).to.equal(null);
			}
		});

		it("should tell list urls, files and inline rules apart", function () {
			expect(blocklist.sourceKind("https://lists.test/easylist.txt")).to.equal("url");
			expect(blocklist.sourceKind("HTTP://lists.test/x")).to.equal("url");
			expect(blocklist.sourceKind("/etc/thelounge/blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("./blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("../blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("~/blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("C:\\lists\\blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("\\\\nas\\lists\\blocklist.txt")).to.equal("file");
			expect(blocklist.sourceKind("/regex/")).to.equal("rule");
			expect(blocklist.sourceKind("||example.com^")).to.equal("rule");
			expect(blocklist.sourceKind("|https://example.com/")).to.equal("rule");
			expect(blocklist.sourceKind("*/ads/")).to.equal("rule");
		});
	});

	describe("checkUrl", function () {
		it("should block private addresses and local names", function () {
			Config.values.prefetchBlockPrivate = true;

			for (const url of [
				"http://127.0.0.1:8080/",
				"http://2130706433/",
				"http://0x7f.1/",
				"http://10.0.1.3:30066/",
				"http://[::1]/",
				"http://[::ffff:192.168.0.1]/",
				"http://[fe80::1]/",
				"http://localhost:8080/",
				"http://LOCALHOST./",
				"http://app.localhost/",
				"http://0/",
			]) {
				expect(checkUrl(url).reason, url).to.be.a("string");
			}

			for (const url of [
				"http://8.8.8.8/",
				"https://example.com/",
				"http://[2606:4700::1111]/",
			]) {
				expect(checkUrl(url).reason, url).to.equal(null);
			}

			Config.values.prefetchBlockPrivate = false;
			expect(checkUrl("http://127.0.0.1/").reason).to.equal(null);
		});

		it("should apply the blocklist and exempt @@ exceptions from prefetchBlockPrivate", function () {
			Config.values.prefetchBlockPrivate = true;
			Config.values.prefetchBlocklist = [
				...defaults.prefetchBlocklist,
				"@@|http://10.0.1.3:30066/",
				"@@||nas.lan^",
			];

			expect(checkUrl("http://8.8.8.8/").reason).to.equal("matches a prefetchBlocklist rule");
			expect(checkUrl("http://10.0.1.4/").reason).to.equal(
				"matches a prefetchBlocklist rule"
			);
			expect(checkUrl("http://10.0.1.3:30066/x")).to.deep.equal({reason: null, exempt: true});
			expect(checkUrl("http://nas.lan/")).to.deep.equal({reason: null, exempt: true});
			expect(checkUrl("https://example.com/")).to.deep.equal({reason: null, exempt: false});
		});

		it("should load lists from files", function () {
			const file = path.join(os.tmpdir(), `thelounge-blocklist-${process.pid}.txt`);
			fs.writeFileSync(file, "! list\n||from-file.test^\n");

			try {
				Config.values.prefetchBlocklist = [file, "||inline.test^"];
				expect(checkUrl("https://from-file.test/").reason).to.be.a("string");
				expect(checkUrl("https://inline.test/").reason).to.be.a("string");
				expect(checkUrl("https://other.test/").reason).to.equal(null);
			} finally {
				fs.unlinkSync(file);
			}
		});
	});

	describe("remote lists", function () {
		let server: http.Server;
		let listUrl: string;
		let body: string | null;
		let requests: number;

		beforeEach(async function () {
			body = "[Adblock Plus 2.0]\n||remote.test^\n";
			requests = 0;
			server = http.createServer((req, res) => {
				requests++;

				if (body === null) {
					res.statusCode = 500;
					return res.end("broken");
				}

				res.end(body);
			});
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			listUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/list.txt`;
		});

		afterEach(async function () {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			fs.rmSync(path.join(Config.getHomePath(), "cache", "blocklists"), {
				recursive: true,
				force: true,
			});
		});

		it("should download, cache, refresh and keep the last good copy", async function () {
			const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
			Config.values.prefetchBlocklist = [listUrl];

			// Not downloaded yet
			expect(checkUrl("https://remote.test/").reason).to.equal(null);

			await blocklist.refresh();
			expect(requests).to.equal(1);
			expect(checkUrl("https://remote.test/").reason).to.be.a("string");

			// A failed download keeps the last copy
			body = null;
			await blocklist.refresh();
			expect(requests).to.equal(2);
			expect(warn).toHaveBeenCalledOnce();
			expect(String(warn.mock.calls[0][0])).to.contain("keeping the last copy");
			expect(checkUrl("https://remote.test/").reason).to.be.a("string");

			// The disk copy is used after a restart
			blocklist.reset();
			expect(checkUrl("https://remote.test/").reason).to.be.a("string");

			// A refresh replaces the list
			body = "||other.test^\n";
			await blocklist.refresh();
			expect(checkUrl("https://remote.test/").reason).to.equal(null);
			expect(checkUrl("https://sub.other.test/").reason).to.be.a("string");
		});

		it("should refresh remote lists periodically", async function () {
			vi.useFakeTimers({toFake: ["setInterval"]});

			try {
				Config.values.prefetchBlocklist = [listUrl];
				blocklist.start();
				await vi.waitFor(() => expect(requests).to.equal(1));
				vi.advanceTimersByTime(24 * 60 * 60 * 1000);
				await vi.waitFor(() => expect(requests).to.equal(2));
			} finally {
				blocklist.stop();
				vi.useRealTimers();
			}
		});
	});

	describe("lookup", function () {
		function resolve(hostname: string, options: dns.LookupOptions, exempt = false) {
			return new Promise<any>((done) =>
				createLookup(() => exempt)(hostname, options, (err, address) =>
					done(err ? err : address)
				)
			);
		}

		it("should refuse host names resolving to private addresses", async function () {
			Config.values.prefetchBlockPrivate = true;
			stubDns({
				"rebind.test": ["127.0.0.1"],
				"mixed.test": ["10.0.0.1", "93.184.215.14", "::1"],
				"public.test": ["93.184.215.14"],
			});

			const err = await resolve("rebind.test", {});
			expect(err.code).to.equal("ERR_PREFETCH_BLOCKED");
			expect(err.message).to.contain("rebind.test resolves to loopback address 127.0.0.1");

			expect(await resolve("mixed.test", {})).to.equal("93.184.215.14");
			expect(await resolve("mixed.test", {all: true})).to.deep.equal([
				{address: "93.184.215.14", family: 4},
			]);
			expect(await resolve("public.test", {})).to.equal("93.184.215.14");

			// @@ exceptions and prefetchBlockPrivate = false resolve normally
			expect(await resolve("rebind.test", {}, true)).to.equal("127.0.0.1");
			Config.values.prefetchBlockPrivate = false;
			expect(await resolve("rebind.test", {})).to.equal("127.0.0.1");
		});
	});

	describe("link previews", function () {
		let server: http.Server;
		let port: number;
		let requests: string[];

		beforeEach(async function () {
			requests = [];
			server = http.createServer((req, res) => {
				requests.push(req.url!);

				if (req.url!.startsWith("/redirect?to=")) {
					res.writeHead(302, {Location: decodeURIComponent(req.url!.slice(13))});
					return res.end();
				}

				res.setHeader("Content-Type", "text/html");
				res.end("<title>internal title</title>");
			});
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			port = (server.address() as AddressInfo).port;
			Config.values.prefetchBlockPrivate = true;
			Config.values.prefetchBlocklist = defaults.prefetchBlocklist;
			stubDns({
				"rebind.test": ["127.0.0.1"],
				"allowed.test": ["127.0.0.1"],
			});
		});

		afterEach(async function () {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		});

		// Posts the url and waits for the preview to be shown or dropped
		function post(url: string) {
			const client = util.createClient();
			const network = util.createNetwork();
			const message = client.createMessage({text: url});
			const shown: LinkPreview[] = [];
			const debug = vi.spyOn(log, "debug").mockImplementation(() => undefined);
			client.on("msg:preview", (data) => shown.push(data.preview));
			link(client as any, network.channels[0], message, message.text);

			return {
				message,
				shown,
				dropped: () =>
					vi.waitFor(() =>
						expect(
							debug.mock.calls.some((c) => String(c[0]).includes("blocked"))
						).to.equal(true)
					),
			};
		}

		const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		it("should not fetch IP address and private links", async function () {
			const ipLink = post(`http://127.0.0.1:${port}/ip`);
			const localLink = post(`http://localhost:${port}/local`);
			expect(ipLink.message.previews).to.deep.equal([]);
			expect(localLink.message.previews).to.deep.equal([]);
			await wait(200);
			expect(requests).to.deep.equal([]);
			expect(ipLink.shown).to.deep.equal([]);
		});

		it("should not connect to host names resolving to private addresses", async function () {
			const {message, shown, dropped} = post(`http://rebind.test:${port}/rebind`);
			expect(message.previews).to.have.length(1);
			await dropped();
			expect(message.previews).to.deep.equal([]);
			expect(shown).to.deep.equal([]);
			expect(requests).to.deep.equal([]);
		});

		it("should check every redirect", async function () {
			Config.values.prefetchBlocklist = [...defaults.prefetchBlocklist, "@@||allowed.test^"];

			for (const target of [
				`http://127.0.0.1:${port}/secret-ip`,
				`http://rebind.test:${port}/secret-dns`,
				`http://[::ffff:127.0.0.1]:${port}/secret-mapped`,
			]) {
				requests = [];
				const {message, shown, dropped} = post(
					`http://allowed.test:${port}/redirect?to=${encodeURIComponent(target)}`
				);
				await dropped();
				expect(message.previews).to.deep.equal([]);
				expect(shown).to.deep.equal([]);
				expect(requests).to.have.length(1);
				vi.restoreAllMocks();
				stubDns({"rebind.test": ["127.0.0.1"], "allowed.test": ["127.0.0.1"]});
			}
		});

		it("should fetch links allowed by @@ exceptions", async function () {
			Config.values.prefetchBlocklist = [
				...defaults.prefetchBlocklist,
				"@@||allowed.test^",
				`@@|http://127.0.0.1:${port}/ok`,
			];

			for (const url of [`http://allowed.test:${port}/a`, `http://127.0.0.1:${port}/ok`]) {
				const {shown} = post(url);
				await vi.waitFor(() => expect(shown).to.have.length(1));
				expect(shown[0].head).to.equal("internal title");
			}

			expect(requests).to.deep.equal(["/a", "/ok"]);
		});

		it("should still fetch public links", async function () {
			// The test server is local, so let the private check pass for this name only
			Config.values.prefetchBlockPrivate = false;
			Config.values.prefetchBlocklist = defaults.prefetchBlocklist;
			const {shown} = post(`http://allowed.test:${port}/public`);
			await vi.waitFor(() => expect(shown).to.have.length(1));
			expect(requests).to.deep.equal(["/public"]);
		});

		it("should answer blocked input links right away, without fetching", async function () {
			const emitted: [string, boolean | undefined][] = [];
			const ip = `http://127.0.0.1:${port}/input`;
			const local = `http://localhost:${port}/input`;
			const rebind = `http://rebind.test:${port}/input`;
			const result = prefetchInputLinks(
				util.createClient() as any,
				[ip, local, rebind],
				(preview, isRemoved) => emitted.push([preview.link, isRemoved])
			);

			// IP literals and local names are known before any DNS lookup or request
			expect(result).to.deep.equal({accepted: [rebind], blocked: [ip, local]});
			// A name resolving to a private address is only found out later and then removed
			await vi.waitFor(() => expect(emitted).to.deep.equal([[rebind, true]]));
			expect(requests).to.deep.equal([]);
		});
	});
});
