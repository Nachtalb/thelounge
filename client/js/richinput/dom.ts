// Rendering of the rich input document into its contenteditable element,
// reading it back, and mapping DOM selections to plain text offsets.
import {Doc, Run, Style, TOGGLE_ATTRS, normalize} from "./model";
import {emojiImageUrl, findEmojiMatches} from "../helpers/emoji";

const classNames = {
	bold: "irc-bold",
	italic: "irc-italic",
	underline: "irc-underline",
	strikethrough: "irc-strikethrough",
	monospace: "irc-monospace",
};

// Same classes and inline styles as the message renderer (helpers/parse.ts)
export function styleClasses(style: Style) {
	const classes: string[] = [];

	if (style.bold) {
		classes.push(classNames.bold);
	}

	if (style.fg !== undefined) {
		classes.push("irc-fg" + String(style.fg));
	}

	if (style.bg !== undefined) {
		classes.push("irc-bg" + String(style.bg));
	}

	for (const attr of TOGGLE_ATTRS) {
		if (attr !== "bold" && style[attr]) {
			classes.push(classNames[attr]);
		}
	}

	return classes;
}

function readStyle(el: HTMLElement): Style | null {
	if (!el.hasAttribute("data-irc")) {
		return null;
	}

	const style: Style = {};

	for (const attr of TOGGLE_ATTRS) {
		if (el.classList.contains(classNames[attr])) {
			style[attr] = true;
		}
	}

	el.classList.forEach((cls) => {
		const match = /^irc-(fg|bg)(\d+)$/.exec(cls);

		if (match) {
			style[match[1] as "fg" | "bg"] = Number(match[2]);
		}
	});

	const hex = el.getAttribute("data-hex");

	if (hex) {
		const [hexFg, hexBg] = hex.split(",");
		style.hexFg = hexFg;

		if (hexBg) {
			style.hexBg = hexBg;
		}
	}

	return style;
}

// Text with emoji shown in the chosen emoji style. The emoji stays the text of
// its span, so reading the DOM back, selections and copying see the character.
function textNodes(text: string, owner: Document): Node[] {
	const nodes: Node[] = [];
	let last = 0;

	for (const match of findEmojiMatches(text)) {
		const image = emojiImageUrl(match.image);

		if (!image) {
			continue;
		}

		if (match.start > last) {
			nodes.push(owner.createTextNode(text.slice(last, match.start)));
		}

		const span = owner.createElement("span");
		span.setAttribute("data-emoji", "");
		// Not editable, so the caret (and IME compositions) can't end up inside
		span.contentEditable = "false";
		span.className = "emoji-img";
		span.style.backgroundImage = `url("${image}")`;
		span.textContent = match.emoji;
		nodes.push(span);
		last = match.end;
	}

	if (last < text.length || !nodes.length) {
		nodes.push(owner.createTextNode(text.slice(last)));
	}

	return nodes;
}

function runNodes(run: Run, doc: Document): Node[] {
	const nodes = textNodes(run.text, doc);
	const classes = styleClasses(run.style);

	if (!classes.length && !run.style.hexFg) {
		return nodes;
	}

	const span = doc.createElement("span");
	span.setAttribute("data-irc", "");

	if (classes.length) {
		span.className = classes.join(" ");
	}

	if (run.style.hexFg) {
		span.setAttribute(
			"data-hex",
			run.style.hexFg + (run.style.hexBg ? "," + run.style.hexBg : "")
		);
		span.style.color = "#" + run.style.hexFg;

		if (run.style.hexBg) {
			span.style.backgroundColor = "#" + run.style.hexBg;
		}
	}

	span.append(...nodes);
	return [span];
}

export function buildNodes(doc: Doc, owner: Document): Node[] {
	const nodes = doc.flatMap((run) => runNodes(run, owner));
	const last = doc[doc.length - 1];

	// A trailing newline is only rendered as an empty line when something follows it
	if (last && last.text.endsWith("\n")) {
		const br = owner.createElement("br");
		br.setAttribute("data-sentinel", "");
		nodes.push(br);
	}

	return nodes;
}

// Bring the element's children in line with the document, touching as few
// nodes as possible so the caret and IMEs are disturbed as little as possible
export function render(root: HTMLElement, doc: Doc) {
	const wanted = buildNodes(doc, root.ownerDocument);

	wanted.forEach((node, i) => {
		const existing = root.childNodes[i];

		if (!existing) {
			root.appendChild(node);
			return;
		}

		if (existing.isEqualNode(node)) {
			return;
		}

		// Same element, only the text changed: update the text in place
		if (
			existing.nodeType === Node.ELEMENT_NODE &&
			node.nodeType === Node.ELEMENT_NODE &&
			existing.childNodes.length === 1 &&
			existing.firstChild?.nodeType === Node.TEXT_NODE
		) {
			const clone = node.cloneNode(false) as Element;
			clone.appendChild(existing.firstChild.cloneNode());

			if (clone.isEqualNode(existing)) {
				(existing.firstChild as Text).data = node.textContent || "";
				return;
			}
		}

		if (existing.nodeType === Node.TEXT_NODE && node.nodeType === Node.TEXT_NODE) {
			(existing as Text).data = (node as Text).data;
			return;
		}

		root.replaceChild(node, existing);
	});

	while (root.childNodes.length > wanted.length) {
		root.removeChild(root.lastChild!);
	}
}

type Leaf = {node: Node; start: number; length: number};

// Text-bearing nodes in document order with their plain text offsets.
// Line breaks count as one character, except the trailing one browsers keep
// in an otherwise empty line and our own sentinel.
function collect(root: HTMLElement) {
	const leaves: Leaf[] = [];
	const runs: Run[] = [];
	let offset = 0;

	const push = (node: Node, text: string, style: Style) => {
		leaves.push({node, start: offset, length: text.length});
		runs.push({text, style});
		offset += text.length;
	};

	const walk = (parent: Node, style: Style) => {
		parent.childNodes.forEach((child) => {
			if (child.nodeType === Node.TEXT_NODE) {
				push(child, (child as Text).data, style);
				return;
			}

			if (child.nodeType !== Node.ELEMENT_NODE) {
				return;
			}

			const el = child as HTMLElement;

			if (el.tagName === "BR") {
				push(el, el.hasAttribute("data-sentinel") ? "" : "\n", {});
				return;
			}

			// Browsers may still wrap lines in blocks (e.g. pasting into an old engine)
			if (/^(DIV|P|LI)$/.test(el.tagName) && offset > 0) {
				const prev = runs[runs.length - 1];

				if (prev && !prev.text.endsWith("\n")) {
					runs.push({text: "\n", style: {}});
					offset++;
				}
			}

			walk(el, readStyle(el) ?? style);
		});
	};

	walk(root, {});

	// Drop a trailing <br> (an empty line placeholder, not content)
	const last = leaves[leaves.length - 1];

	if (last && last.node.nodeName === "BR" && last.length === 1) {
		last.length = 0;
		runs[runs.length - 1].text = "";
	}

	return {leaves, runs};
}

export function readDoc(root: HTMLElement): Doc {
	return normalize(collect(root).runs);
}

function pointOffset(root: HTMLElement, leaves: Leaf[], node: Node, offset: number) {
	if (node.nodeType === Node.TEXT_NODE) {
		const leaf = leaves.find((l) => l.node === node);

		if (leaf) {
			return leaf.start + Math.min(offset, leaf.length);
		}
	}

	// A position between children: count every leaf before it
	const range = root.ownerDocument.createRange();
	range.setStart(node, offset);
	let total = 0;

	for (const leaf of leaves) {
		if (range.comparePoint(leaf.node, 0) < 0) {
			total = leaf.start + leaf.length;
		}
	}

	return total;
}

export type Offsets = {start: number; end: number};

// Selection inside root as plain text offsets, or null if it is elsewhere
export function getOffsets(
	root: HTMLElement,
	range: {startContainer: Node; startOffset: number; endContainer: Node; endOffset: number}
): Offsets | null {
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
		return null;
	}

	const {leaves} = collect(root);

	return {
		start: pointOffset(root, leaves, range.startContainer, range.startOffset),
		end: pointOffset(root, leaves, range.endContainer, range.endOffset),
	};
}

export function getSelectionOffsets(root: HTMLElement): Offsets | null {
	const selection = root.ownerDocument.getSelection();

	if (!selection || selection.rangeCount === 0) {
		return null;
	}

	const range = selection.getRangeAt(0);
	const offsets = getOffsets(root, range);

	if (!offsets) {
		return null;
	}

	// Keep the direction of a backwards selection (anchor after focus)
	if (
		selection.anchorNode === range.endContainer &&
		selection.anchorOffset === range.endOffset &&
		!range.collapsed
	) {
		return {start: offsets.end, end: offsets.start};
	}

	return offsets;
}

// DOM position of a plain text offset. At a run boundary the end of the
// previous text node wins, so composed text continues the previous style.
export function domPoint(root: HTMLElement, offset: number): [Node, number] {
	const {leaves} = collect(root);

	for (const leaf of leaves) {
		if (leaf.node.nodeType === Node.TEXT_NODE) {
			if (offset <= leaf.start + leaf.length) {
				const span = leaf.node.parentNode as HTMLElement;

				// Keep the caret out of emoji images: text typed there would be invisible
				if (span !== root && span.hasAttribute("data-emoji")) {
					const parent = span.parentNode!;
					const index = Array.prototype.indexOf.call(parent.childNodes, span);
					return [parent, offset <= leaf.start ? index : index + 1];
				}

				return [leaf.node, Math.max(0, offset - leaf.start)];
			}
		} else if (leaf.length > 0 && offset <= leaf.start) {
			const parent = leaf.node.parentNode!;
			return [parent, Array.prototype.indexOf.call(parent.childNodes, leaf.node)];
		}
	}

	// Past the end: before a trailing <br>, else at the end
	const last = root.lastChild;

	if (last && last.nodeName === "BR") {
		return [root, root.childNodes.length - 1];
	}

	return [root, root.childNodes.length];
}

export function setSelectionOffsets(root: HTMLElement, start: number, end: number) {
	const selection = root.ownerDocument.getSelection();

	if (!selection) {
		return;
	}

	const [anchorNode, anchorOffset] = domPoint(root, start);
	const [focusNode, focusOffset] =
		start === end ? [anchorNode, anchorOffset] : domPoint(root, end);

	selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}
