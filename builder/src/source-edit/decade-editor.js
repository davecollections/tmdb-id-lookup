import {
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
} from "../nuvio/discover.js";
import {
	inspectCanonicalDecadeSource,
	inspectCanonicalDecadeSourceNode,
} from "../source-add/decades-classification.js";
import { GENRE_CONCEPTS, officialGenreConcept } from "../source-add/genre-catalogue.js";
import {
	diagnostic,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const DECADE_SOURCE_EDITOR_ID = "decade";

function inputText(value) {
	return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function parseRating(value, field, label, errors) {
	const text = inputText(value);
	if (!text) return null;
	const parsed = Number(text);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_RATING_INVALID", `$sourceEdit.advanced.${field}`, `${label} must be a number from 0 to 10.`));
		return null;
	}
	return parsed;
}

function parseVotes(value, errors) {
	const text = inputText(value);
	if (!text) return null;
	if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_VOTES_INVALID", "$sourceEdit.advanced.minimumVotes", "Minimum votes must be a nonnegative whole number."));
		return null;
	}
	return Number(text);
}

function exclusionNames(draft) {
	return draft?.genreName
		? draft?.advanced?.exclusionsByGenre?.[draft.genreName] ?? []
		: draft?.advanced?.ordinaryExcludedGenres ?? [];
}

function compileCandidate({ source, draft }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	const inspected = source ? inspectCanonicalDecadeSourceNode(source) : null;
	if (
		(source && inspected === null)
		|| (inspected && (
			draft?.mediaType !== inspected.mediaType
			|| draft?.periodId !== inspected.period.id
			|| JSON.stringify(draft?.periodFilters) !== JSON.stringify(inspected.period.filters)
			|| draft?.genreName !== (inspected.genre?.name ?? null)
			|| draft?.genreId !== (inspected.genre?.tmdbId ?? null)
		))
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_DECADE_STRUCTURE_FIXED",
			"$sourceEdit.identity",
			"The Decade period, media and included Genre cannot be changed in this editor.",
		));
	}

	const sortBy = discoverSortValue(draft?.sortOptionId, draft?.mediaType);
	if (sortBy === null || sortBy !== draft?.sortBy) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_SORT_UNSUPPORTED", "$sourceEdit.sortBy", "Choose a supported Decade sort order."));
	}
	const minimumRating = parseRating(draft?.advanced?.minimumRating, "minimumRating", "Minimum rating", errors);
	const maximumRating = parseRating(draft?.advanced?.maximumRating, "maximumRating", "Maximum rating", errors);
	const minimumVotes = parseVotes(draft?.advanced?.minimumVotes, errors);
	if (minimumRating !== null && maximumRating !== null && minimumRating > maximumRating) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_RATING_RANGE_INVALID", "$sourceEdit.advanced.maximumRating", "Maximum rating must be the same as or higher than Minimum rating."));
	}
	const originalLanguage = inputText(draft?.advanced?.originalLanguage).toLowerCase();
	const originCountry = inputText(draft?.advanced?.originCountry).toUpperCase();
	if (originalLanguage && !/^[a-z]{2}$/.test(originalLanguage)) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_LANGUAGE_INVALID", "$sourceEdit.advanced.originalLanguage", "Original language must be a two-letter code."));
	}
	if (originCountry && !/^[A-Z]{2}$/.test(originCountry)) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_COUNTRY_INVALID", "$sourceEdit.advanced.originCountry", "Origin country must be a two-letter code."));
	}

	const names = exclusionNames(draft);
	const concepts = [];
	if (!Array.isArray(names) || new Set(names).size !== names.length) {
		errors.push(diagnostic("SOURCE_EDIT_DECADE_EXCLUSIONS_INVALID", "$sourceEdit.advanced.exclusions", "Choose each official excluded Genre at most once."));
	} else {
		for (const name of names) {
			const concept = officialGenreConcept(name);
			const tmdbId = draft?.mediaType === "MOVIE" ? concept?.movieId : concept?.tvId;
			if (concept === null || tmdbId === null || tmdbId === draft?.genreId) {
				errors.push(diagnostic("SOURCE_EDIT_DECADE_EXCLUSION_INCOMPATIBLE", "$sourceEdit.advanced.exclusions", "Excluded Genres must be official, available for this media and different from the included Genre."));
				continue;
			}
			concepts.push({ concept, tmdbId });
		}
	}
	if (errors.length > 0) return Object.freeze({ ok: false, candidate: null, errors: Object.freeze(errors) });

	const filters = {
		...draft.periodFilters,
		...(draft.genreId !== null ? { withGenres: String(draft.genreId) } : {}),
		...(minimumRating !== null ? { voteAverageGte: minimumRating } : {}),
		...(maximumRating !== null ? { voteAverageLte: maximumRating } : {}),
		...(minimumVotes !== null ? { voteCountGte: minimumVotes } : {}),
		...(originalLanguage ? { withOriginalLanguage: originalLanguage } : {}),
		...(originCountry ? { withOriginCountry: originCountry } : {}),
		...(concepts.length > 0 ? { withoutGenres: concepts.map((entry) => entry.tmdbId).join(",") } : {}),
	};
	const candidate = Object.freeze({
		title: draft.title,
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: draft.mediaType,
		sortBy,
		filters: Object.freeze(filters),
	});
	const candidateInspection = inspectCanonicalDecadeSource(candidate);
	if (
		candidateInspection === null
		|| candidateInspection.period.id !== draft.periodId
		|| candidateInspection.genre?.tmdbId !== (draft.genreId ?? undefined)
	) {
		return Object.freeze({
			ok: false,
			candidate: null,
			errors: Object.freeze([diagnostic("SOURCE_EDIT_DECADE_STRUCTURE_FIXED", "$sourceEdit.identity", "The Decade period, media and included Genre cannot be changed in this editor.")]),
		});
	}
	return Object.freeze({ ok: true, candidate, errors: Object.freeze([]) });
}

function readInitialState(source) {
	const inspected = inspectCanonicalDecadeSourceNode(source);
	const excludedNames = inspected?.excludedGenres.map((entry) => entry.name) ?? [];
	const genreName = inspected?.genre?.name ?? null;
	return Object.freeze({
		title: typeof inspected?.value?.title === "string" ? inspected.value.title : "",
		titleTouched: false,
		mediaType: inspected?.mediaType ?? null,
		periodId: inspected?.period?.id ?? null,
		periodLabel: inspected?.period?.label ?? null,
		periodFilters: Object.freeze({ ...(inspected?.period?.filters ?? {}) }),
		genreName,
		genreId: inspected?.genre?.tmdbId ?? null,
		sortBy: inspected?.value?.sortBy,
		sortOptionId: inspected?.sortOptionId ?? null,
		sortTouched: false,
		advanced: Object.freeze({
			minimumRating: inspected?.value?.filters?.voteAverageGte === undefined ? "" : String(inspected.value.filters.voteAverageGte),
			maximumRating: inspected?.value?.filters?.voteAverageLte === undefined ? "" : String(inspected.value.filters.voteAverageLte),
			minimumVotes: inspected?.value?.filters?.voteCountGte === undefined ? "" : String(inspected.value.filters.voteCountGte),
			originalLanguage: inspected?.value?.filters?.withOriginalLanguage ?? "",
			originCountry: inspected?.value?.filters?.withOriginCountry ?? "",
			ordinaryExcludedGenres: Object.freeze(genreName === null ? excludedNames : []),
			exclusionsByGenre: Object.freeze(genreName === null ? {} : { [genreName]: Object.freeze(excludedNames) }),
		}),
		advancedTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const compiled = compileCandidate({ draft, source });
	return Object.freeze({ ok: compiled.ok, errors: compiled.errors });
}

function draftIdentity({ draft }) {
	const compiled = compileCandidate({ draft });
	if (!compiled.ok) return null;
	const identity = discoverSourceIdentity(compiled.candidate);
	return identity.comparable ? identity.key : null;
}

function buildPatch({ source, draft }) {
	const compiled = compileCandidate({ source, draft });
	if (!compiled.ok) return {};
	const inspected = inspectCanonicalDecadeSourceNode(source);
	const patch = {};
	if (draft.titleTouched && draft.title !== inspected.value.title) patch.title = draft.title;
	if (draft.sortTouched && compiled.candidate.sortBy !== inspected.value.sortBy) patch.sortBy = compiled.candidate.sortBy;
	if (draft.advancedTouched && JSON.stringify(compiled.candidate.filters) !== JSON.stringify(inspected.value.filters)) patch.filters = compiled.candidate.filters;
	return patch;
}

export const decadeSourceEditor = Object.freeze({
	id: DECADE_SOURCE_EDITOR_ID,
	label: "Decade",
	ownedFields: Object.freeze(["title", "sortBy", "filters"]),
	duplicateMessage() {
		return "This folder already contains this Decade period, media, sort and filter combination. Change the options or cancel your changes.";
	},
	canEdit(source) {
		return inspectCanonicalDecadeSourceNode(source) !== null;
	},
	identity(editable) {
		const identity = discoverSourceIdentity(editable);
		return identity.comparable ? identity.key : null;
	},
	sourceIdentity(source) {
		const identity = discoverSourceNodeIdentity(source);
		return identity.comparable ? identity.key : null;
	},
	readInitialState,
	validateDraft,
	draftIdentity,
	buildPatch,
	describeIdentity(draft) {
		return `TMDB · DISCOVER · ${draft?.periodLabel ?? "Unknown period"} · ${draft?.mediaType ?? "Invalid media"}${draft?.genreName ? ` · ${draft.genreName}` : ""}`;
	},
});

export function decadeEditSortValue(optionId, mediaType) {
	return discoverSortValue(optionId, mediaType);
}

export function decadeExclusionNamesForMedia(mediaType) {
	return Object.freeze(GENRE_CONCEPTS
		.filter((concept) => mediaType === "MOVIE" ? concept.movieId !== null : concept.tvId !== null)
		.map((concept) => concept.name));
}
