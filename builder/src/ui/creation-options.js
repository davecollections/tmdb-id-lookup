export const CREATION_OPTION_IDS = Object.freeze({
	BLANK: "blank",
	DECADES: "decades",
	PEOPLE: "people",
	FRANCHISES: "franchises",
	STUDIOS: "studios",
	NETWORKS: "networks",
	GENRES: "genres",
	STREAMING_SERVICES: "streaming-services",
});

export const CREATION_SCOPES = Object.freeze({
	NEW_COLLECTION: "new-collection",
	NEW_FOLDER: "new-folder",
});

const BOTH_SCOPES = Object.freeze([CREATION_SCOPES.NEW_COLLECTION, CREATION_SCOPES.NEW_FOLDER]);

export const CREATION_OPTIONS = Object.freeze([
	Object.freeze({
		id: CREATION_OPTION_IDS.BLANK,
		label: "Blank",
		icon: "blank",
		supportingText: "Start manually.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.DECADES,
		label: "Decades",
		icon: "decades",
		supportingText: "Build by decade or year.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.PEOPLE,
		label: "People",
		icon: "people",
		supportingText: "Build around actors or directors.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.FRANCHISES,
		label: "Franchises",
		icon: "franchises",
		supportingText: "Build from a movie franchise.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.STUDIOS,
		label: "Studios",
		icon: "studios",
		supportingText: "Build from movie or TV studios.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.NETWORKS,
		label: "Networks",
		icon: "networks",
		supportingText: "Build from TV networks.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.GENRES,
		label: "Genres",
		icon: "genres",
		supportingText: "Build by genre.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.STREAMING_SERVICES,
		label: "Streaming",
		icon: "streaming-services",
		supportingText: "Build from streaming services.",
		scopes: BOTH_SCOPES,
	}),
]);

export function creationOptionById(optionId) {
	return CREATION_OPTIONS.find((option) => option.id === optionId) ?? null;
}

export function creationOptionSupportsScope(optionId, scope) {
	return creationOptionById(optionId)?.scopes.includes(scope) ?? false;
}

export function creationOptionsForScope(scope) {
	return Object.freeze(CREATION_OPTIONS.filter((option) => option.scopes.includes(scope)));
}
