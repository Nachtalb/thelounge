// Telegram's sticker peek: holding a sticker shows only its large preview, sliding over other
// stickers switches the preview, letting go closes it without sending. On touch, holding still on
// one sticker a little longer opens its menu, which stays open after letting go.

export const PEEK_TOUCH_MS = 450;
export const PEEK_MOUSE_MS = 500;
export const PEEK_MENU_MS = 700;
// A press that moves further before the preview opens is a scroll (or a drag), not a peek
export const PEEK_SLOP = 10;

export type PeekPointer = "mouse" | "touch" | "pen";

export type PeekState = {
	phase: "idle" | "pressing" | "peek" | "menu";
	pointer: PeekPointer;
	// The sticker shown (or pressed), as "pack/id"
	item: string | null;
	// The pointer left the stickers while peeking (the preview stays)
	away: boolean;
	x: number;
	y: number;
};

export type PeekEvent =
	| {type: "down"; pointer: PeekPointer; item: string; x: number; y: number}
	// `item` is the sticker under the pointer, null if none
	| {type: "move"; x: number; y: number; item: string | null}
	// The armed timer ran out
	| {type: "timer"}
	| {type: "up"}
	| {type: "cancel"};

// `timer`: arm (or restart) the timer for that many ms, null clears it, undefined keeps it
export type PeekStep = {state: PeekState; timer?: number | null};

export const idlePeek: PeekState = {
	phase: "idle",
	pointer: "mouse",
	item: null,
	away: false,
	x: 0,
	y: 0,
};

// Holding still on the shown sticker opens its menu (touch only, desktop has right click)
const menuTimer = (pointer: PeekPointer) => (pointer === "mouse" ? null : PEEK_MENU_MS);

export function stepPeek(state: PeekState, event: PeekEvent): PeekStep {
	switch (event.type) {
		case "down":
			return {
				state: {
					phase: "pressing",
					pointer: event.pointer,
					item: event.item,
					away: false,
					x: event.x,
					y: event.y,
				},
				timer: event.pointer === "mouse" ? PEEK_MOUSE_MS : PEEK_TOUCH_MS,
			};

		case "move":
			if (state.phase === "pressing") {
				if (Math.hypot(event.x - state.x, event.y - state.y) > PEEK_SLOP) {
					return {state: idlePeek, timer: null};
				}
			} else if (state.phase === "peek") {
				// The menu only opens while holding still on a sticker
				if (!event.item) {
					return state.away ? {state} : {state: {...state, away: true}, timer: null};
				}

				if (event.item !== state.item || state.away) {
					return {
						state: {...state, item: event.item, away: false},
						timer: menuTimer(state.pointer),
					};
				}
			}

			return {state};

		case "timer":
			if (state.phase === "pressing") {
				return {state: {...state, phase: "peek"}, timer: menuTimer(state.pointer)};
			}

			if (state.phase === "peek") {
				return {state: {...state, phase: "menu"}, timer: null};
			}

			return {state};

		case "up":
		case "cancel":
			return {state: idlePeek, timer: null};
	}
}

export type PeekHandlers = {
	// Show the preview of `tile`'s sticker (again called when sliding to another one)
	peek: (tile: HTMLElement) => void;
	// The shown preview becomes its menu
	menu: () => void;
	// The preview closes (not called once it became the menu)
	close: () => void;
};

const TILE = ".sticker-item[data-sticker]";

// Binds the peek gesture to the sticker tiles inside `root`. Returns `cancel` (closing the
// preview from elsewhere, e.g. Escape) and `unbind`.
export function bindStickerPeek(root: HTMLElement, handlers: PeekHandlers) {
	let state = idlePeek;
	let timer: ReturnType<typeof setTimeout> | null = null;
	// The click(s) ending a peek must not send the sticker; until the next press or this time
	let swallowClicksUntil = 0;
	// Removes the window listeners of the press in progress
	let pressListeners: AbortController | null = null;

	const tileAt = (x: number, y: number) => {
		const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>(TILE);
		return tile && root.contains(tile) ? tile : null;
	};

	const tileFor = (item: string | null) =>
		item
			? [...root.querySelectorAll<HTMLElement>(TILE)].find((t) => t.dataset.sticker === item)
			: undefined;

	const apply = (event: PeekEvent, tile?: HTMLElement | null) => {
		const before = state;
		const next = stepPeek(state, event);
		state = next.state;

		if (next.timer !== undefined) {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}

			if (next.timer !== null) {
				timer = setTimeout(() => {
					timer = null;
					apply({type: "timer"});
				}, next.timer);
			}
		}

		if (state.phase === "idle") {
			pressListeners?.abort();
			pressListeners = null;
		}

		if (state.phase === "peek" && (before.phase !== "peek" || before.item !== state.item)) {
			const shown = tile || tileFor(state.item);

			if (shown) {
				handlers.peek(shown);
			}
		} else if (state.phase === "menu" && before.phase === "peek") {
			handlers.menu();
		} else if (state.phase === "idle" && before.phase === "peek") {
			handlers.close();
		}

		if (state.phase === "idle" && (before.phase === "peek" || before.phase === "menu")) {
			swallowClicksUntil = performance.now() + 500;
		}
	};

	const onMove = (e: PointerEvent) => {
		if (!e.isPrimary) {
			return;
		}

		// Touch pointers stay bound to the tile they started on: look up what is under the finger
		const tile = state.phase === "peek" ? tileAt(e.clientX, e.clientY) : null;
		apply(
			{type: "move", x: e.clientX, y: e.clientY, item: tile?.dataset.sticker || null},
			tile
		);
	};

	const onUp = (e: PointerEvent) => e.isPrimary && apply({type: "up"});
	const onCancel = (e: PointerEvent) => e.isPrimary && apply({type: "cancel"});
	const onBlur = () => apply({type: "cancel"});

	const onDown = (e: PointerEvent) => {
		swallowClicksUntil = 0;
		const tile = (e.target as Element).closest<HTMLElement>(TILE);

		if (!e.isPrimary || e.button !== 0 || !tile || state.phase !== "idle") {
			return;
		}

		apply({
			type: "down",
			pointer: e.pointerType as PeekPointer,
			item: tile.dataset.sticker!,
			x: e.clientX,
			y: e.clientY,
		});
		pressListeners = new AbortController();
		const signal = pressListeners.signal;
		window.addEventListener("pointermove", onMove, {capture: true, signal});
		window.addEventListener("pointerup", onUp, {capture: true, signal});
		window.addEventListener("pointercancel", onCancel, {capture: true, signal});
		window.addEventListener("blur", onBlur, {signal});
	};

	// Sliding while the preview shows must not scroll the panel
	const onTouchMove = (e: TouchEvent) => {
		if ((state.phase === "peek" || state.phase === "menu") && e.cancelable) {
			e.preventDefault();
		}
	};

	// Android's own long-press menu (and text selection callout) during a touch press
	const onContextMenu = (e: MouseEvent) => {
		if (state.phase !== "idle" && state.pointer !== "mouse") {
			e.preventDefault();
			e.stopPropagation();
		}
	};

	const onClick = (e: MouseEvent) => {
		if (performance.now() < swallowClicksUntil) {
			e.preventDefault();
			e.stopPropagation();
		}
	};

	// A dragged sticker image would cancel the press
	const onDragStart = (e: DragEvent) => {
		if ((e.target as Element).closest?.(TILE)) {
			e.preventDefault();
		}
	};

	root.addEventListener("pointerdown", onDown);
	root.addEventListener("touchmove", onTouchMove, {passive: false});
	root.addEventListener("contextmenu", onContextMenu, true);
	root.addEventListener("click", onClick, true);
	root.addEventListener("dragstart", onDragStart);

	return {
		cancel() {
			if (state.phase !== "idle") {
				apply({type: "cancel"});
			}
		},
		unbind() {
			if (timer) {
				clearTimeout(timer);
			}

			state = idlePeek;
			pressListeners?.abort();
			root.removeEventListener("pointerdown", onDown);
			root.removeEventListener("touchmove", onTouchMove);
			root.removeEventListener("contextmenu", onContextMenu, true);
			root.removeEventListener("click", onClick, true);
			root.removeEventListener("dragstart", onDragStart);
		},
	};
}
