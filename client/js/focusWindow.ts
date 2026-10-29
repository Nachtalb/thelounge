import {router} from "./router";

const settingsRoutes = ["Appearance", "Notifications", "General", "Account"];

const focusableSelector =
	"a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
	"textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// On touch devices focusing a text field pops up the on-screen keyboard
function opensKeyboard(el: HTMLElement) {
	if (el.tagName === "TEXTAREA" || el.isContentEditable) {
		return true;
	}

	return (
		el.tagName === "INPUT" &&
		!["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(
			(el as HTMLInputElement).type
		)
	);
}

function helpTarget(): HTMLElement | null {
	const help = document.getElementById("help");

	if (!help) {
		return null;
	}

	const container = help.querySelector(".container") ?? help;
	const first = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).find(
		(el) => el.getClientRects().length > 0
	);

	if (first) {
		return first;
	}

	// Nothing to focus: focus the scrolling page itself so the keyboard scrolls it
	help.tabIndex = -1;
	return help;
}

// The first useful control of a page, or undefined if the page has none
export function pageFocusTarget(
	to: string,
	from: string | undefined
): (() => HTMLElement | null) | undefined {
	switch (to) {
		case "Connect":
			return () => document.getElementById("connect:name");
		case "Appearance":
			// Switching between settings tabs leaves focus on the tab
			return from && settingsRoutes.includes(from)
				? undefined
				: () => document.getElementById("theme-select");
		case "Help":
			return helpTarget;
	}

	return undefined;
}

// The page may still be rendering (or the app still loading), so retry for a moment
export function focusPage(getTarget: () => HTMLElement | null) {
	let tries = 0;

	const focus = () => {
		const el = getTarget();

		if (el && navigator.maxTouchPoints > 0 && opensKeyboard(el)) {
			return;
		}

		el?.focus();

		if ((!el || document.activeElement !== el) && tries++ < 60) {
			requestAnimationFrame(focus);
		}
	};

	setTimeout(focus);
}

router.afterEach((to, from, failure) => {
	if (failure) {
		return;
	}

	const getTarget = pageFocusTarget(String(to.name), from.name ? String(from.name) : undefined);

	if (getTarget) {
		focusPage(getTarget);
	}
});
