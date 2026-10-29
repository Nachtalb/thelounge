// Parses "#rgb", "#rrggbb" or "rgb(r, g, b)" / "rgba(r, g, b, a)" / "rgb(r g b / a)"
function parseColor(color: string): number[] | null {
	const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());

	if (hex) {
		const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
		return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
	}

	const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color.trim());
	return rgb ? rgb.slice(1, 4).map(Number) : null;
}

// WCAG 2 relative luminance
function luminance(rgb: number[]) {
	const [r, g, b] = rgb.map((c) => {
		c /= 255;
		return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Black or white, whichever has the higher WCAG contrast ratio on the given background
export default (background: string): "black" | "white" => {
	const rgb = parseColor(background);

	if (!rgb) {
		return "black";
	}

	const l = luminance(rgb);
	// Contrast with black is (l + 0.05) / 0.05, with white 1.05 / (l + 0.05)
	return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "black" : "white";
};
