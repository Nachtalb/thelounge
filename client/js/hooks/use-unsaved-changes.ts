import {onMounted, onUnmounted} from "vue";

type UnsavedChangesCheck = () => boolean;

const checks = new Set<UnsavedChangesCheck>();

// Lets a form on a page that Escape closes ask for confirmation before its edits are thrown away
export default function useUnsavedChanges(check: UnsavedChangesCheck) {
	onMounted(() => checks.add(check));
	onUnmounted(() => checks.delete(check));
}

export function hasUnsavedChanges(): boolean {
	return [...checks].some((check) => check());
}
