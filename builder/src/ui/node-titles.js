import { isInvisibleNuvioTitle, isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { sourceCardDetails } from "./source-details.js";

// Shared card and navigation labels. Display fallbacks never enter project data.
export function nodeTitle(value, noun) {
	if (isInvisibleNuvioTitle(value)) {
		const capitalizedNoun = noun[0].toUpperCase() + noun.slice(1);
		return {
			text: "Hidden title",
			hidden: true,
			accessibleName: `${capitalizedNoun} with hidden Nuvio title`,
		};
	}

	const text = isValidVisibleNuvioTitle(value) ? value.trim() : `Untitled ${noun}`;
	return {
		text,
		hidden: false,
		accessibleName: text,
	};
}

export function sourceTitle(source, fallback = sourceCardDetails(source).fallback) {
	if (isInvisibleNuvioTitle(source.editable.title)) {
		return nodeTitle(source.editable.title, "source");
	}

	const title = typeof source.editable.title === "string" ? source.editable.title.trim() : null;
	if (title) {
		return {
			text: title,
			hidden: false,
			accessibleName: title,
		};
	}
	const text = fallback;
	return {
		text,
		hidden: false,
		accessibleName: text,
	};
}
