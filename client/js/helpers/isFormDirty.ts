// Compare form values the way the user sees them in the inputs: a cleared field ("") is
// the same as a missing value, and the number 6697 is the same as the text "6697".
const normalize = (value: unknown): string => {
	if (value === undefined || value === null) {
		return "";
	}

	if (Array.isArray(value)) {
		return value.join("\n");
	}

	if (typeof value === "object") {
		return JSON.stringify(value);
	}

	return String(value);
};

export default function isFormDirty(
	initial: Record<string, unknown>,
	current: Record<string, unknown>
): boolean {
	const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);

	for (const key of keys) {
		if (normalize(initial[key]) !== normalize(current[key])) {
			return true;
		}
	}

	return false;
}
