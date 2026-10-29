// Adblock-style link preview filters, used for the server's `prefetchBlocklist` and
// for each user's own rules (`previewFilters` setting; the client uses lintFilters for
// live validation). Supports the network filter subset that makes sense for a bare url:
// `||domain^`, `|` anchors, `*` and `^` in patterns, `/regex/` and `@@` exceptions.
// Cosmetic rules and rules with `$options` are skipped.

export type Verdict = "block" | "allow" | null;
export type LineKind = "rule" | "skipped" | "invalid" | "cosmetic" | "empty";

const separator = "(?:[^\\w.%-]|$)";
const domainAnchor = "^[a-z][a-z0-9+.-]*:\\/\\/(?:[^\\/?#]*\\.)?";

// Punycode of a domain, without node's url module so this also runs in the browser
function toASCII(domain: string) {
	try {
		return new URL(`http://${domain}/`).hostname;
	} catch {
		return domain;
	}
}

class RuleSet {
	domains = new Set<string>();
	patterns: string[] = [];
	regexes: RegExp[] = [];
	combined: RegExp[] = [];

	compile() {
		// A few big alternations instead of one regex per rule
		for (let i = 0; i < this.patterns.length; i += 1000) {
			this.combined.push(
				new RegExp(
					this.patterns
						.slice(i, i + 1000)
						.map((p) => `(?:${p})`)
						.join("|"),
					"i"
				)
			);
		}

		this.patterns = [];
	}

	matches(url: URL) {
		if (this.domains.size) {
			// Check the host and each parent domain
			let host = url.hostname.toLowerCase().replace(/\.+$/, "");

			for (;;) {
				if (this.domains.has(host)) {
					return true;
				}

				const dot = host.indexOf(".");

				if (dot < 0) {
					break;
				}

				host = host.slice(dot + 1);
			}
		}

		return (
			this.combined.some((re) => re.test(url.href)) ||
			this.regexes.some((re) => re.test(url.href))
		);
	}
}

export class Matcher {
	block = new RuleSet();
	allow = new RuleSet();
	rules = 0;
	skipped = 0;
	ignored = 0;

	// What became of the line: a rule, skipped (unsupported option or invalid), cosmetic or empty
	add(line: string): LineKind {
		line = line.trim();

		// Empty lines, comments and the `[Adblock Plus 2.0]` header
		if (!line || line.startsWith("!") || line.startsWith("[")) {
			return "empty";
		}

		const set = line.startsWith("@@") ? this.allow : this.block;

		if (set === this.allow) {
			line = line.slice(2);
		}

		const regex = /^\/(.+)\/(?:\$(.*))?$/.exec(line);

		if (regex) {
			if (regex[2] !== undefined) {
				this.skipped++;
				return "skipped";
			}

			try {
				set.regexes.push(new RegExp(regex[1], "i"));
				this.rules++;
				return "rule";
			} catch {
				this.skipped++;
				return "invalid";
			}
		}

		// Cosmetic (element hiding, scriptlet) rules: ##, #@#, #?#, #$#, ...
		if (/#@?[?$%]?#/.test(line)) {
			this.ignored++;
			return "cosmetic";
		}

		// Request type, domain=... and other options don't apply to previews
		if (/\$~?[a-z]/i.test(line.slice(line.lastIndexOf("$")))) {
			this.skipped++;
			return "skipped";
		}

		const domain = /^\|\|([^/^*|:?#]+)\^\|?$/.exec(line);

		if (domain) {
			set.domains.add(toASCII(domain[1]).toLowerCase());
			this.rules++;
			return "rule";
		}

		const pattern = patternToRegex(line);

		if (pattern) {
			set.patterns.push(pattern);
			this.rules++;
			return "rule";
		}

		this.skipped++;
		return "invalid";
	}

	compile() {
		this.block.compile();
		this.allow.compile();
		return this;
	}

	// `allow` if an exception rule matches, `block` if a block rule matches
	match(url: URL): Verdict {
		if (this.allow.matches(url)) {
			return "allow";
		}

		return this.block.matches(url) ? "block" : null;
	}
}

function patternToRegex(pattern: string) {
	let prefix = "";
	let suffix = "";

	if (pattern.startsWith("||")) {
		prefix = domainAnchor;
		pattern = pattern.slice(2);
	} else if (pattern.startsWith("|")) {
		prefix = "^";
		pattern = pattern.slice(1);
	}

	if (pattern.endsWith("|")) {
		suffix = "$";
		pattern = pattern.slice(0, -1);
	}

	if (!pattern.replace(/\*/g, "")) {
		return null;
	}

	const body = pattern.replace(/[\\^$.*+?()[\]{}|/]/g, (char) =>
		char === "*" ? ".*" : char === "^" ? separator : `\\${char}`
	);

	return prefix + body + suffix;
}

export function compileFilters(text: string) {
	const matcher = new Matcher();

	for (const line of text.split(/\r?\n/)) {
		matcher.add(line);
	}

	return matcher.compile();
}

// Whether `matcher` blocks the preview of `link`, matched like the server fetches it (no `#hash`).
// The server's decision and the client's hiding of existing previews both use this, so they agree.
export function blocksLink(matcher: Matcher, link: string | URL) {
	try {
		const url = new URL(link);
		url.hash = "";
		return matcher.match(url) === "block";
	} catch {
		return false;
	}
}

export type FilterProblem = {line: number; text: string; reason: string};

// Rule count and the lines that are not used, with their 1-based line number
export function lintFilters(text: string) {
	const matcher = new Matcher();
	const problems: FilterProblem[] = [];

	text.split(/\r?\n/).forEach((line, i) => {
		const kind = matcher.add(line);
		const reason = {
			skipped: "$options are not supported for previews",
			invalid: "invalid rule",
			cosmetic: "cosmetic rules do not apply to previews",
		}[kind as string];

		if (reason) {
			problems.push({line: i + 1, text: line.trim(), reason});
		}
	});

	return {rules: matcher.rules, problems};
}
