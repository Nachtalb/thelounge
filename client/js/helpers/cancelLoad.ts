import type {ObjectDirective} from "vue";

// Removing an <img> from the page does not stop its download, dropping its src does.
// Keeps images scrolled past or skipped from holding up the ones being looked at.
const cancelLoad: ObjectDirective<HTMLImageElement> = {
	beforeUnmount(el) {
		if (!el.complete) {
			el.removeAttribute("src");
		}
	},
};

export default cancelLoad;
