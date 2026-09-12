// Effective presentation of newly authored nodes. Imported nodes retain their
// own fields, including unsupported values and absent client-defined settings.
export const NEW_COLLECTION_DEFAULTS = Object.freeze({
	viewMode: "TABBED_GRID",
	showAllTab: true,
	pinToTop: false,
	focusGlowEnabled: true,
});

export const NEW_FOLDER_DEFAULTS = Object.freeze({
	tileShape: "POSTER",
	hideTitle: true,
	focusGifEnabled: false,
});
