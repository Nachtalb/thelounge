// Lets the browser / Android back button close an overlay instead of leaving the chat. Opening adds
// one history entry with the same URL; back pops it and calls `close`. Closing any other way calls
// the returned function, which removes that entry again so none are left behind. The router never
// sees these popstate events (same URL, nothing to navigate).
const KEY = "closeOnBack";
let lastId = 0;

function swallowNextPopState() {
	window.addEventListener("popstate", (e) => e.stopImmediatePropagation(), {
		capture: true,
		once: true,
	});
}

export function closeOnBack(close: () => void): () => void {
	const id = ++lastId;
	let open = true;

	const onPopState = (e: PopStateEvent) => {
		if ((history.state as Record<string, unknown> | null)?.[KEY] === id) {
			return;
		}

		e.stopImmediatePropagation();
		open = false;
		window.removeEventListener("popstate", onPopState, true);
		close();
	};

	history.pushState({...(history.state as object | null), [KEY]: id}, "");
	window.addEventListener("popstate", onPopState, true);

	return () => {
		if (!open) {
			return;
		}

		open = false;
		window.removeEventListener("popstate", onPopState, true);

		// Not ours anymore if the router navigated meanwhile
		if ((history.state as Record<string, unknown> | null)?.[KEY] === id) {
			swallowNextPopState();
			history.back();
		}
	};
}
