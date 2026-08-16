export const CREATION_OPTION_IDS = Object.freeze({
	BLANK: "blank",
	DECADES: "decades",
});

export const CREATION_OPTIONS = Object.freeze([
	Object.freeze({
		id: CREATION_OPTION_IDS.BLANK,
		label: "Blank",
		description: "Start from scratch and build it yourself.",
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.DECADES,
		label: "Decades",
		description: "Create movie and series collections organised by decade.",
	}),
]);

export function creationOptionById(optionId) {
	return CREATION_OPTIONS.find((option) => option.id === optionId) ?? null;
}
