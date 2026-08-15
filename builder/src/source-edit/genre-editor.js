import {
	discoverSortOptionId,
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	effectiveDiscoverSort,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import {
	compileGenreAdvancedFilters,
	readGenreAdvancedFilters,
} from "../source-add/genre-advanced.js";
import { officialGenreReference } from "../source-add/genre-catalogue.js";
import { genreSourceTitle } from "../source-add/genre-source.js";
import {
	canonicalText,
	diagnostic,
	isPlainObject,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const GENRE_SOURCE_EDITOR_ID = "genre";

const knownSourceFields = new Set([
	"filters",
	"mediaType",
	"provider",
	"sortBy",
	"title",
	"tmdbId",
	"tmdbSourceType",
]);

function meaningful(value) {
	return value !== null
		&& value !== undefined
		&& !(typeof value === "string" && value.trim().length === 0);
}

function buildEditableFilters(draft) {
	const compiled = compileGenreAdvancedFilters(draft?.advanced, {
		mediaType: draft?.mediaType,
		includedGenre: draft?.genreName,
		includedGenres: [draft?.genreName],
		sharedMediaChoice: draft?.mediaType === "MOVIE" ? "movies" : "series",
	});
	return compiled.ok
		? Object.freeze({ ok: true, filters: Object.freeze({ withGenres: String(draft.genreId), ...compiled.filters }), errors: Object.freeze([]) })
		: compiled;
}

export function inspectEditableGenreSource(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok || !isPlainObject(effective.value)) return null;
	const value = effective.value;
	const provider = canonicalText(value.provider).toLowerCase();
	const sourceType = canonicalText(value.tmdbSourceType).toUpperCase();
	const mediaType = canonicalText(value.mediaType).toUpperCase();
	if (provider !== "tmdb" || sourceType !== "DISCOVER" || !["MOVIE", "TV"].includes(mediaType)) return null;
	if (meaningful(value.tmdbId) || !isPlainObject(value.filters)) return null;
	for (const [field, fieldValue] of Object.entries(value)) {
		if (!knownSourceFields.has(field) && meaningful(fieldValue)) return null;
	}
	const genreValue = value.filters.withGenres;
	if (typeof genreValue !== "string" || !/^[1-9]\d*$/.test(genreValue)) return null;
	const genreId = Number(genreValue);
	if (!Number.isSafeInteger(genreId)) return null;
	const reference = officialGenreReference(mediaType, genreId);
	if (reference === null) return null;
	const advanced = readGenreAdvancedFilters(value.filters, { mediaType, includedGenre: reference.name });
	if (advanced === null || discoverSortOptionId(effectiveDiscoverSort(value.sortBy), mediaType) === null) return null;
	const identity = discoverSourceNodeIdentity(source);
	if (!identity.comparable) return null;
	return Object.freeze({
		value,
		identity: identity.key,
		genreId,
		genreName: reference.name,
		mediaType,
		advanced,
	});
}

function readInitialState(source) {
	const inspected = inspectEditableGenreSource(source);
	return Object.freeze({
		title: typeof inspected?.value?.title === "string" ? inspected.value.title : "",
		titleTouched: false,
		genreId: inspected?.genreId ?? null,
		genreName: inspected?.genreName ?? null,
		mediaType: inspected?.mediaType ?? null,
		advanced: inspected?.advanced ?? null,
		advancedTouched: false,
		sortBy: inspected?.value?.sortBy,
		originalSortBy: inspected?.value?.sortBy,
		sortOptionId: discoverSortOptionId(effectiveDiscoverSort(inspected?.value?.sortBy), inspected?.mediaType),
		sortTouched: false,
	});
}

function validateDraft({ draft, source }) {
	const errors = [...validateTouchedSourceTitle(draft)];
	const inspected = inspectEditableGenreSource(source);
	if (
		inspected === null
		|| draft?.genreId !== inspected.genreId
		|| draft?.genreName !== inspected.genreName
		|| draft?.mediaType !== inspected.mediaType
	) {
		errors.push(diagnostic(
			"SOURCE_EDIT_GENRE_IDENTITY_FIXED",
			"$sourceEdit.identity",
			"The Genre and media type cannot be changed in this editor.",
		));
	}
	const selectedSort = discoverSortValue(draft?.sortOptionId, draft?.mediaType);
	if (draft?.sortTouched && (selectedSort === null || selectedSort !== draft.sortBy)) {
		errors.push(diagnostic(
			"SOURCE_EDIT_GENRE_SORT_UNSUPPORTED",
			"$sourceEdit.sortBy",
			"Choose a supported Genre sort order.",
		));
	}
	const filters = buildEditableFilters(draft);
	if (!filters.ok) errors.push(...filters.errors.map((entry) => Object.freeze({ ...entry, path: entry.path.replace("$genres", "$sourceEdit") })));
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function draftIdentity({ draft }) {
	const filters = buildEditableFilters(draft);
	if (!filters.ok) return null;
	const identity = discoverSourceIdentity({
		provider: "tmdb",
		tmdbSourceType: "DISCOVER",
		tmdbId: null,
		mediaType: draft?.mediaType,
		sortBy: draft?.sortBy,
		filters: filters.filters,
	});
	return identity.comparable ? identity.key : null;
}

function buildPatch({ source, draft }) {
	const patch = {};
	const current = inspectEditableGenreSource(source)?.value ?? source.editable;
	if (draft.titleTouched && draft.title !== current.title) patch.title = draft.title;
	if (draft.sortTouched && draft.sortBy !== current.sortBy) patch.sortBy = draft.sortBy;
	if (draft.advancedTouched) {
		const compiled = buildEditableFilters(draft);
		if (compiled.ok && JSON.stringify(compiled.filters) !== JSON.stringify(current.filters)) patch.filters = compiled.filters;
	}
	return patch;
}

export const genreSourceEditor = Object.freeze({
	id: GENRE_SOURCE_EDITOR_ID,
	label: "Genre",
	ownedFields: Object.freeze(["title", "sortBy", "filters"]),
	duplicateMessage() {
		return "This folder already contains this Genre, media, sort and filter combination. Change the options or cancel your changes.";
	},
	canEdit(source) {
		return inspectEditableGenreSource(source) !== null;
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
		return `TMDB · DISCOVER · ${draft?.genreName ?? "Unknown Genre"} · ${draft?.mediaType ?? "Invalid media"}`;
	},
});

export function genreEditSortValue(optionId, mediaType) {
	return discoverSortValue(optionId, mediaType);
}

export function genreDefaultSourceName(genreName, mediaType) {
	return genreSourceTitle(genreName, mediaType);
}
