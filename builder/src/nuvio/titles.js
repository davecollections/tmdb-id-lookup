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

export function reversibleTitleFieldProps(visibleTitleDraft, hiddenEverywhere) {
	return Object.freeze({
		value: hiddenEverywhere ? "" : typeof visibleTitleDraft === "string" ? visibleTitleDraft : "",
		disabled: hiddenEverywhere,
	});
}

export function transitionReversibleTitleDraft({
	title,
	visibleTitleDraft,
	hiddenEverywhere,
	hiddenTitle = "",
}) {
	const rememberedTitle = hiddenEverywhere && isValidVisibleNuvioTitle(title)
		? title
		: visibleTitleDraft;

	return Object.freeze({
		title: hiddenEverywhere ? hiddenTitle : rememberedTitle ?? "",
		visibleTitleDraft: rememberedTitle,
	});
}
