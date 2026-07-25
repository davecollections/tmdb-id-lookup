export const NUVIO_INVISIBLE_TITLE = "\u200E";
const nonVisibleTitleCharacters = /[\s\p{Cf}]/gu;

export function isInvisibleNuvioTitle(title) {
	return (
		typeof title === "string"
		&& title.length > 0
		&& [...title].every((character) => character === NUVIO_INVISIBLE_TITLE)
	);
}

export function isValidNuvioTitle(title) {
	return (
		typeof title === "string"
		&& title.length > 0
		&& (
			isInvisibleNuvioTitle(title)
			|| title.replace(nonVisibleTitleCharacters, "").length > 0
		)
	);
}

export function isValidVisibleNuvioTitle(title) {
	return (
		isValidNuvioTitle(title)
		&& !isInvisibleNuvioTitle(title)
	);
}
