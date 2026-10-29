import dns from "dns";
import net from "net";

import Config from "../config";
import {getMatcher} from "./prefetchBlocklist";
import {compileFilters, Matcher} from "../../shared/previewFilters";

// Decides which links may be fetched for previews: `prefetchBlocklist` rules and
// `prefetchBlockPrivate`, which keeps previews from making the server send
// requests into its own network (SSRF). Every preview fetch checks the url of
// each hop (checkUrl) and connects through createLookup's lookup, which checks
// the address it hands to the socket, so a DNS answer can't change between
// check and use (DNS rebinding).

type Range = [bigint, number, string]; // network, prefix length, name

function v4(cidr: string, name: string): Range {
	const [ip, bits] = cidr.split("/");
	return [parseV4(ip), Number(bits), name];
}

function v6(cidr: string, name: string): Range {
	const [ip, bits] = cidr.split("/");
	return [parseV6(ip), Number(bits), name];
}

const v4Ranges: Range[] = [
	v4("0.0.0.0/8", "unspecified"),
	v4("10.0.0.0/8", "private"),
	v4("100.64.0.0/10", "carrier-grade NAT"),
	v4("127.0.0.0/8", "loopback"),
	v4("169.254.0.0/16", "link-local"),
	v4("172.16.0.0/12", "private"),
	v4("192.0.0.0/24", "IETF protocol assignments"),
	v4("192.0.2.0/24", "documentation"),
	v4("192.168.0.0/16", "private"),
	v4("198.18.0.0/15", "benchmarking"),
	v4("198.51.100.0/24", "documentation"),
	v4("203.0.113.0/24", "documentation"),
	v4("224.0.0.0/4", "multicast"),
	v4("240.0.0.0/4", "reserved"), // includes broadcast 255.255.255.255
];

const v6Ranges: Range[] = [
	v6("::/96", "unspecified/loopback/IPv4-compatible"), // ::, ::1 and deprecated ::a.b.c.d
	v6("64:ff9b:1::/48", "local NAT64"),
	v6("100::/64", "discard"),
	v6("2001:db8::/32", "documentation"),
	v6("fc00::/7", "unique local"),
	v6("fe80::/10", "link-local"),
	v6("fec0::/10", "site-local"),
	v6("ff00::/8", "multicast"),
];

// Ranges that carry an IPv4 address in their low bits, which is checked instead
const v6Embedding: [Range, number][] = [
	[v6("::ffff:0:0/96", "IPv4-mapped"), 0],
	[v6("64:ff9b::/96", "NAT64"), 0],
	[v6("2002::/16", "6to4"), 80],
];

function parseV4(ip: string): bigint {
	return ip.split(".").reduce((acc, part) => (acc << 8n) | BigInt(Number(part)), 0n);
}

function parseV6(ip: string): bigint {
	// Drop the zone id and turn a trailing dotted IPv4 (::ffff:127.0.0.1) into two groups
	ip = ip.replace(/%.*$/, "").replace(/(\d+\.\d+\.\d+\.\d+)$/, (dotted) => {
		const n = parseV4(dotted);
		return `${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
	});

	const [head, rest] = ip.split("::");
	const left = head ? head.split(":") : [];
	const right = rest ? rest.split(":") : [];
	const groups =
		rest === undefined
			? left
			: [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];

	return groups.reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function inRange(value: bigint, width: number, [network, bits]: Range) {
	const shift = BigInt(width - bits);
	return value >> shift === network >> shift;
}

function stripBrackets(host: string) {
	return host.replace(/^\[(.*)\]$/, "$1");
}

// Name of the non-public range `ip` is in, or null for a public address (or not an ip)
export function classifyAddress(ip: string): string | null {
	ip = stripBrackets(ip);
	const family = net.isIP(ip);

	if (family === 4) {
		const value = parseV4(ip);
		return v4Ranges.find((range) => inRange(value, 32, range))?.[2] ?? null;
	}

	if (family !== 6) {
		return null;
	}

	const value = parseV6(ip);

	for (const [range, shift] of v6Embedding) {
		if (inRange(value, 128, range)) {
			const embedded = (value >> BigInt(shift)) & 0xffffffffn;
			const inner = v4Ranges.find((r) => inRange(embedded, 32, r))?.[2];
			return inner ? `${range[2]} ${inner}` : null;
		}
	}

	return v6Ranges.find((range) => inRange(value, 128, range))?.[2] ?? null;
}

function normalizeHost(host: string) {
	return stripBrackets(host.toLowerCase()).replace(/\.+$/, "");
}

export type UrlCheck = {
	// Why the url must not be fetched, or null
	reason: string | null;
	// Matched a `@@` exception rule: also exempt from prefetchBlockPrivate
	exempt: boolean;
};

// Checks a url (each hop of a fetch) against prefetchBlocklist and, by its host
// alone, prefetchBlockPrivate. Host names are checked again when they are resolved.
export function checkUrl(link: string | URL): UrlCheck {
	let url: URL;

	try {
		url = new URL(link);
	} catch {
		return {reason: "invalid url", exempt: false};
	}

	const verdict = getMatcher().match(url);

	if (verdict === "allow") {
		return {reason: null, exempt: true};
	}

	if (verdict === "block") {
		return {reason: "matches a prefetchBlocklist rule", exempt: false};
	}

	if (!Config.values.prefetchBlockPrivate) {
		return {reason: null, exempt: false};
	}

	const host = normalizeHost(url.hostname);

	if (host === "localhost" || host.endsWith(".localhost")) {
		return {reason: `${host} is a local host name`, exempt: false};
	}

	const range = classifyAddress(host);
	return {reason: range ? `${host} is a ${range} address` : null, exempt: false};
}

export function blockedUrlReason(link: string | URL) {
	return checkUrl(link).reason;
}

export class PrefetchBlockedError extends Error {
	code = "ERR_PREFETCH_BLOCKED";

	constructor(reason: string) {
		super(`Link preview blocked: ${reason}`);
	}
}

export function isPrefetchBlocked(err: unknown) {
	return (err as {code?: string} | null)?.code === "ERR_PREFETCH_BLOCKED";
}

// Throws if the url must not be fetched, returns whether it is exempt from prefetchBlockPrivate
export function assertUrlAllowed(link: string | URL) {
	const {reason, exempt} = checkUrl(link);

	if (reason) {
		throw new PrefetchBlockedError(reason);
	}

	return exempt;
}

type LookupCallback = (
	err: NodeJS.ErrnoException | null,
	address?: string | dns.LookupAddress[],
	family?: number
) => void;

// A dns.lookup for preview connections that drops addresses prefetchBlockPrivate
// forbids and fails if none are left, so the checked address is the one connected
// to. `exempt` tells whether the current hop matched a `@@` exception rule.
export function createLookup(exempt: () => boolean = () => false) {
	function checkedLookup(
		hostname: string,
		options: dns.LookupOptions | number | LookupCallback,
		callback?: LookupCallback
	) {
		if (typeof options === "function") {
			callback = options;
			options = {};
		} else if (typeof options === "number") {
			options = {family: options};
		}

		const all = Boolean(options.all);
		const check = Config.values.prefetchBlockPrivate && !exempt();

		dns.lookup(hostname, {...options, all: true}, (err, addresses) => {
			if (err) {
				return callback!(err);
			}

			const allowed = check
				? addresses.filter((a) => !classifyAddress(a.address))
				: addresses;

			if (!allowed.length) {
				const reason = addresses.length
					? `${hostname} resolves to ${classifyAddress(addresses[0].address)!} address ${
							addresses[0].address
					  }`
					: `${hostname} did not resolve`;
				return callback!(new PrefetchBlockedError(reason));
			}

			if (all) {
				return callback!(null, allowed);
			}

			callback!(null, allowed[0].address, allowed[0].family);
		});
	}

	return checkedLookup as unknown as typeof dns.lookup;
}

const userMatchers = new WeakMap<object, {text: string; matcher: Matcher}>();

// A user's own rules (the synced `previewFilters` setting), recompiled when they change.
// They only add blocks for that user: their `@@` exceptions lift their own rules, never
// prefetchBlocklist or prefetchBlockPrivate, which checkUrl applies separately.
export function userMatcher(client: {config?: {clientSettings?: Record<string, unknown>}}) {
	const value = client.config?.clientSettings?.previewFilters;
	const text = typeof value === "string" ? value : "";
	let entry = userMatchers.get(client);

	if (entry?.text !== text) {
		entry = {text, matcher: compileFilters(text)};
		userMatchers.set(client, entry);
	}

	return entry.matcher;
}
