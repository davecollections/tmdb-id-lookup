import { discoverSortIsPreservationOnly } from "./source-edit-utils.js";
import { DECADES_ADVANCED_FILTER_FIELDS } from "../source-add/decades-source.js";
import { familyAdvancedTouchedFields } from "./source-edit-utils.js";
import {
	discoverSortValue,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
	resolveEffectiveDiscoverSource,
} from "../nuvio/discover.js";
import {
	inspectCanonicalDecadeSource,
	inspectCanonicalDecadeSourceNode,
} from "../source-add/decades-classification.js";
import { buildCanonicalDecadePeriodDrafts } from "../source-add/decades-source.js";
import { GENRE_CONCEPTS, officialGenreConcept } from "../source-add/genre-catalogue.js";
import { DISCOVER_CATALOGUE_FILTER_FIELDS } from "../source-add/advanced-discover.js";
import { DISCOVER_ADVANCED_GROUPS, inspectNativeExtraFilters, validateNativeExtraEdit, ownedNativeExtraMirrorSource } from "../source-add/native-shared-advanced.js";
import { patchTouchedDiscoverFilters, inspectDiscoverMirrors } from "../nuvio/discover-imported-filters.js";
import {
	diagnostic,
	validateTouchedSourceTitle,
} from "./source-edit-utils.js";

export const DECADE_SOURCE_EDITOR_ID = "decade";

export function inspectEditableDecadeSource(source) {
	const effective = resolveEffectiveDiscoverSource(source);
	if (!effective.ok) return null;
	const value = effective.value, filters = value.filters;
	if (!filters || (filters.year !== undefined && filters.year !== null && filters.year !== "")) return null;
	if (inspectDiscoverMirrors(value).unresolved.some((entry) => ["withGenres", "releaseDateGte", "releaseDateLte"].includes(entry.field))) return null;
	const fixed = Object.fromEntries(["withGenres", "releaseDateGte", "releaseDateLte"].filter((field) => Object.hasOwn(filters, field)).map((field) => [field, filters[field]]));
	const anchor = inspectCanonicalDecadeSource({ provider: value.provider, tmdbSourceType: value.tmdbSourceType, tmdbId: value.tmdbId, mediaType: value.mediaType, sortBy: value.sortBy, filters: fixed });
	if (!anchor) return null;
	const safe = inspectNativeExtraFilters(source, DISCOVER_ADVANCED_GROUPS);
	const excludedGenres = (safe.filters.withoutGenres ?? "").split(",").filter(Boolean).map((id) => ({ ...GENRE_CONCEPTS.find((genre) => (anchor.mediaType === "TV" ? genre.tvId : genre.movieId) === Number(id)), tmdbId: Number(id) }));
	return { ...anchor, value, safeFilters: safe.filters, extraEditable: safe.editable, excludedGenres };
}

function inputText(value) {
	return value === undefined || value === null ? "" : typeof value === "string" || typeof value === "number" ? String(value).trim() : "invalid";
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
	const inspected = source ? inspectEditableDecadeSource(source) : null;
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

	const excludedNames = concepts.map((entry) => entry.concept.name);
	const built = buildCanonicalDecadePeriodDrafts({
		periodId: draft.periodId,
		mediaMode: draft.mediaType === "TV" ? "series" : "movies",
		genreName: draft.genreName,
		sortOptionId: draft.sortOptionId,
		advanced: {
			...(Object.hasOwn(draft.advanced, "filters") ? { filters: draft.advanced.filters } : {}),
			minimumRating,
			maximumRating,
			minimumVotes,
			originalLanguage,
			originCountry,
			ordinaryExcludedGenres: Object.freeze(draft.genreName === null ? excludedNames : []),
			exclusionsByGenre: Object.freeze(draft.genreName === null ? {} : { [draft.genreName]: Object.freeze(excludedNames) }),
		},
	});
	if (!built.ok || built.drafts.length !== 1) {
		return Object.freeze({
			ok: false,
			candidate: null,
			errors: built.errors.length > 0 ? built.errors : Object.freeze([diagnostic("SOURCE_EDIT_DECADE_STRUCTURE_FIXED", "$sourceEdit.identity", "The Decade period, media and included Genre cannot be changed in this editor.")]),
		});
	}
	const candidate = Object.freeze({ ...built.drafts[0].editable, title: draft.title });
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
	const inspected = inspectEditableDecadeSource(source);
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
		sortEditable: !discoverSortIsPreservationOnly(inspected?.value),
		advanced: Object.freeze({
			filters: Object.freeze(Object.fromEntries(Object.entries(inspected?.safeFilters ?? {}).filter(([field]) => DISCOVER_CATALOGUE_FILTER_FIELDS.includes(field)))),
			minimumRating: String(inspected?.safeFilters?.voteAverageGte ?? ""),
			maximumRating: String(inspected?.safeFilters?.voteAverageLte ?? ""),
			minimumVotes: String(inspected?.safeFilters?.voteCountGte ?? ""),
			originalLanguage: inspected?.safeFilters?.withOriginalLanguage ?? "",
			originCountry: inspected?.safeFilters?.withOriginCountry ?? "",
			ordinaryExcludedGenres: Object.freeze(genreName === null ? excludedNames : []),
			exclusionsByGenre: Object.freeze(genreName === null ? {} : { [genreName]: Object.freeze(excludedNames) }),
		}),
		advancedTouched: false,
		touchedFilters: Object.freeze([]),
		extraEditable: inspected?.extraEditable,
	});
}

function validateDraft({ draft, source }) {
 if (!draft?.advanced || typeof draft.advanced !== "object" || Array.isArray(draft.advanced) || (draft.touchedFilters !== undefined && (!Array.isArray(draft.touchedFilters) || draft.touchedFilters.some((field) => !DECADES_ADVANCED_FILTER_FIELDS.includes(field))))) return { ok: false, errors: [diagnostic("SOURCE_EDIT_ADVANCED_FIXED", "$sourceEdit.filters", "Only supported optional filters can be changed here.")] };
	const compiled = compileCandidate({ draft, source });
	const errors = [...compiled.errors];
	if (draft.sortTouched && discoverSortIsPreservationOnly(inspectEditableDecadeSource(source)?.value)) errors.push(diagnostic("SOURCE_EDIT_SORT_PRESERVED", "$sourceEdit.sortBy", "The conflicting imported order must be preserved."));
	if (compiled.ok) errors.push(...validateNativeExtraEdit(source, { ...draft, filters: compiled.candidate.filters, touchedFilters: familyAdvancedTouchedFields(draft, readInitialState(source).advanced) }, DISCOVER_ADVANCED_GROUPS).errors);
	return Object.freeze({ ok: !errors.length, errors: Object.freeze(errors) });
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
	const inspected = inspectEditableDecadeSource(source);
	const patch = {};
	if (draft.titleTouched && draft.title !== inspected.value.title) patch.title = draft.title;
	if (draft.sortTouched && compiled.candidate.sortBy !== inspected.value.sortBy) patch.sortBy = compiled.candidate.sortBy;
	if (draft.advancedTouched) Object.assign(patch, patchTouchedDiscoverFilters(source, ownedNativeExtraMirrorSource(inspected.value, DISCOVER_ADVANCED_GROUPS.flat()), compiled.candidate.filters, familyAdvancedTouchedFields(draft, readInitialState(source).advanced), patch));
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
		return inspectEditableDecadeSource(source) !== null;
	},
	identity(editable) {
		const identity = discoverSourceIdentity(editable);
		return identity.comparable ? identity.key : null;
	},
	sourceIdentity(source) {
		const identity = discoverSourceNodeIdentity(source);
		return identity.comparable ? identity.key : null;
	},
	duplicateKey(source) { const identity = discoverSourceNodeIdentity(source); return identity.comparable ? identity.key : null; },
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
