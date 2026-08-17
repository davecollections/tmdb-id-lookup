export const FOLDER_ARTWORK_URL_FIELDS = Object.freeze([
	Object.freeze({
		field: "coverImageUrl",
		label: "Tile artwork URL",
		description: "Poster or Landscape artwork used for the folder tile.",
	}),
	Object.freeze({
		field: "heroBackdropUrl",
		label: "Hero / background URL",
		description: "Background artwork shown independently from the folder tile.",
	}),
	Object.freeze({
		field: "titleLogoUrl",
		label: "Title Logo URL",
		description: "Transparent title-logo artwork kept separate from the Hero.",
	}),
	Object.freeze({
		field: "focusGifUrl",
		label: "Focus artwork URL",
		description: "Optional focused-state artwork. Static image URLs are supported by the stored field.",
	}),
]);

export const FOLDER_ARTWORK_URL_FIELD_NAMES = Object.freeze(FOLDER_ARTWORK_URL_FIELDS.map(({ field }) => field));
