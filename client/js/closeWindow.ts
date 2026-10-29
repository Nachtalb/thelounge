import eventbus from "./eventbus";
import {router, switchToChannel} from "./router";
import {store} from "./store";
import {hasUnsavedChanges} from "./hooks/use-unsaved-changes";
import {richInputFor} from "./richinput/RichInput";

// Pages that Escape closes, returning to where the user came from
const closableRoutes = ["Connect", "Appearance", "Notifications", "General", "Account"];

// Pages that are never a place to return to
const pageRoutes = [...closableRoutes, "Help", "Changelog", "SignIn"];

let returnPath: string | undefined;

router.afterEach((to, _from, failure) => {
	if (!failure && to.name && !pageRoutes.includes(String(to.name))) {
		returnPath = to.fullPath;
	}
});

// Deferred and retried: ChatInput blurs itself on Escape, and after a route change the
// input only exists once the chat window has rendered.
export function focusInput() {
	let tries = 0;

	const focus = () => {
		const input = document.getElementById("input");
		const richInput = richInputFor(input);

		if (richInput) {
			// Continue typing after the draft, not wherever the caret was last
			richInput.setSelection(richInput.getText().length);
			richInput.focus();
		} else {
			input?.focus();
		}

		if (document.activeElement !== input && tries++ < 30) {
			requestAnimationFrame(focus);
		}
	};

	setTimeout(focus);
}

async function goBack() {
	if (returnPath && !(await router.push(returnPath))) {
		focusInput();
		return;
	}

	// Nothing to go back to (page opened directly, or that channel is gone)
	const lobby = store.state.networks[0]?.channels[0];

	if (lobby) {
		switchToChannel(lobby);
		focusInput();
	}
}

export function closeWindowOnEscape(e: KeyboardEvent): boolean {
	if (e.key !== "Escape") {
		return false;
	}

	if (!closableRoutes.includes(String(router.currentRoute.value.name))) {
		return false;
	}

	// This Escape belongs to an open dialog or menu
	if (
		document.querySelector(
			"#confirm-dialog-overlay.opened, #context-menu-container, #mentions-popup-container"
		)
	) {
		return false;
	}

	const focused = document.activeElement as HTMLElement | null;

	// Settings save on "change", which a text field only fires when it loses focus
	focused?.blur();

	if (!hasUnsavedChanges()) {
		void goBack();
		return true;
	}

	// Deferred so the Escape that opens the dialog can't also close it
	setTimeout(() => {
		eventbus.emit(
			"confirm-dialog",
			{
				title: "Discard unsaved changes?",
				text: "The changes you made on this page will be lost.",
				button: "Discard",
			},
			(discard: boolean) => {
				if (discard) {
					void goBack();
				} else {
					// The dialog hands focus to #input, which this page doesn't have
					setTimeout(() => focused?.focus());
				}
			}
		);
	});

	return true;
}
