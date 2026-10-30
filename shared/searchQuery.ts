// "@nick words" searches messages from nick containing words; "\@..." or a quoted query is literal
export function parseSearchQuery(query: string): {nick: string; text: string} {
	query = query.trim();

	if (query.length > 1 && query.startsWith('"') && query.endsWith('"')) {
		return {nick: "", text: query.slice(1, -1)};
	}

	if (query.startsWith("\\@")) {
		return {nick: "", text: query.slice(1)};
	}

	const match = /^@(\S+?)[:,]?(?:\s+(.*))?$/.exec(query);

	if (!match) {
		return {nick: "", text: query};
	}

	return {nick: match[1], text: match[2] || ""};
}
