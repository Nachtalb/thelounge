import {blocksLink, compileFilters, Matcher} from "../../../shared/previewFilters";

let compiled: {text: string; matcher: Matcher} | undefined;

// Whether the user's own rules (`previewFilters` setting) hide the preview of `link`.
// The server decides which links get a new preview (input previews included, so blocked ones
// never show a placeholder); with the same blocksLink this hides previews that were fetched
// before a rule was added, without a reload.
export function isPreviewFiltered(rules: unknown, link: string) {
	const text = typeof rules === "string" ? rules : "";

	if (!text.trim()) {
		return false;
	}

	if (compiled?.text !== text) {
		compiled = {text, matcher: compileFilters(text)};
	}

	return blocksLink(compiled.matcher, link);
}
