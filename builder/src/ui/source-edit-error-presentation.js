import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

export function sourceEditErrorPresentation(result) {
	const errors = Array.isArray(result?.errors) ? result.errors : [];
	const heading = result?.errorHeading
		?? (result?.duplicateRejected
			? "Source already exists"
			: result?.conflict
				? "Source changed"
				: result?.validationFailed
					? "Check your changes"
					: "Couldn’t save changes");
	return Object.freeze({ heading, errors: Object.freeze([...errors]) });
}

export function focusSourceEditAlert(element) {
	if (!element) return false;
	element.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
	focusElementWithoutScroll(element);
	return true;
}
