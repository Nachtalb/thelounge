export default (event: MouseEvent | Mousetrap.ExtendedKeyboardEvent) => {
	const target = event.target as HTMLElement;

	// The chat input is a contenteditable element
	if (target.isContentEditable) {
		return !!target.textContent;
	}

	if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") {
		return false;
	}

	// If focus is in a textarea, do not handle keybinds if user has typed anything
	// This is done to prevent keyboard layout binds conflicting with ours
	// For example alt+shift+left on macos selects a word
	return !!(event.target as any).value;
};
