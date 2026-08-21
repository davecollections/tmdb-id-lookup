export const CREATION_OPTION_IDS = Object.freeze({
	BLANK: "blank",
	DECADES: "decades",
	PEOPLE: "people",
	FRANCHISES: "franchises",
	STUDIOS: "studios",
	NETWORKS: "networks",
	GENRES: "genres",
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
		description: "Start from scratch and build it yourself.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.DECADES,
		label: "Decades",
		description: "Create movie and series collections organised by decade.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.PEOPLE,
		label: "People",
		description: "Create one configured folder for each selected person.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.FRANCHISES,
		label: "Franchises",
		description: "Create one folder and native movie source for each TMDB collection.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.STUDIOS,
		label: "Studios",
		description: "Create one configured folder for each selected Studio.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.NETWORKS,
		label: "Networks",
		description: "Create one Series folder for each selected TV Network.",
		scopes: BOTH_SCOPES,
	}),
	Object.freeze({
		id: CREATION_OPTION_IDS.GENRES,
		label: "Genres",
		description: "Create one configured folder for each selected official Genre.",
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
