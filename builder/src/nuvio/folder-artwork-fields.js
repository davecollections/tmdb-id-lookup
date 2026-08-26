function field(definition) {
	return Object.freeze(definition);
}

function group(definition) {
	return Object.freeze({
		...definition,
		fields: Object.freeze(definition.fields),
	});
}

export const FOLDER_ARTWORK_FIELD_GROUPS = Object.freeze([
	group({
		slug: "tile",
		title: "Tile",
		fields: [
			field({
				field: "coverImageUrl",
				inputType: "url",
				label: "Tile artwork URL",
				description: "Artwork used for the folder tile.",
				preview: "tile",
			}),
			field({
				field: "coverEmoji",
				inputType: "text",
				label: "Fallback emoji",
				description: "Used by Nuvio as a fallback when suitable cover artwork is not available.",
				visibleInSettings: false,
			}),
		],
	}),
	group({
		slug: "hero-background",
		title: "Hero / Background",
		fields: [
			field({
				field: "heroBackdropUrl",
				inputType: "url",
				label: "Backdrop Image URL",
				description: "Background image for the folder.",
				preview: "backdrop",
			}),
			field({
				field: "heroVideoUrl",
				inputType: "url",
				label: "Backdrop Video URL",
				description: "Existing video background for this folder.",
				preview: "video",
			}),
		],
	}),
	group({
		slug: "branding",
		title: "Branding",
		fields: [
			field({
				field: "titleLogoUrl",
				inputType: "url",
				label: "Title Logo URL",
				description: "Transparent title logo.",
				preview: "logo",
			}),
		],
	}),
	group({
		slug: "focus",
		title: "Focus GIF",
		fields: [
			field({
				field: "focusGifUrl",
				inputType: "url",
				label: "Focus GIF URL",
				description: "Animated artwork shown when the folder is focused.",
				preview: "focus",
			}),
		],
	}),
]);

export const FOLDER_ARTWORK_TEXT_FIELDS = Object.freeze(
	FOLDER_ARTWORK_FIELD_GROUPS.flatMap(({ fields }) => fields),
);

export const FOLDER_ARTWORK_TEXT_FIELD_NAMES = Object.freeze(
	FOLDER_ARTWORK_TEXT_FIELDS.map(({ field: fieldName }) => fieldName),
);

export const FOLDER_ARTWORK_URL_FIELDS = Object.freeze(
	FOLDER_ARTWORK_TEXT_FIELDS.filter(({ inputType }) => inputType === "url"),
);

export const FOLDER_ARTWORK_URL_FIELD_NAMES = Object.freeze(
	FOLDER_ARTWORK_URL_FIELDS.map(({ field: fieldName }) => fieldName),
);
