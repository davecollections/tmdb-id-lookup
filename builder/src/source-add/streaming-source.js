import {
	buildDiscoverSourceDraft,
	DEFAULT_DISCOVER_SORT_OPTION_ID,
	DISCOVER_SORT_OPTIONS,
	discoverSourceIdentity,
	discoverSourceNodeIdentity,
} from "../nuvio/discover.js";
import { isValidNuvioTitle } from "../nuvio/titles.js";
import { streamingProviderCommonAvailability } from "./streaming-catalogue.js";

export const STREAMING_MEDIA_CHOICES = Object.freeze([
	Object.freeze({ id: "movies", label: "Movies", mediaTypes: Object.freeze(["MOVIE"]) }),
	Object.freeze({ id: "series", label: "Series", mediaTypes: Object.freeze(["TV"]) }),
	Object.freeze({ id: "both", label: "Both", mediaTypes: Object.freeze(["MOVIE", "TV"]) }),
]);
export const STREAMING_SORT_OPTIONS = Object.freeze(DISCOVER_SORT_OPTIONS.map((option) => Object.freeze({
	id: option.id,
	label: option.label === "Top rated" ? "Top Rated" : option.label === "Most voted" ? "Most Votes" : option.label,
	description: option.id === "popular"
		? "Popular titles first."
		: option.id === "recent"
			? "Recently released titles first."
			: option.id === "top-rated"
				? "Highest-rated titles first."
				: "Titles with the most votes first.",
})));
export const DEFAULT_STREAMING_SORT_OPTION_ID = DEFAULT_DISCOVER_SORT_OPTION_ID;

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function canonicalRegionCode(value) {
	const code = canonicalText(value).toUpperCase();
	return /^[A-Z]{2}$/.test(code) ? code : null;
}

function diagnostic(code, path, message) {
	return Object.freeze({ code, path, message });
}

function sameKeys(value, expected) {
	return plainObject(value)
		&& Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function choiceForId(choiceId) {
	return STREAMING_MEDIA_CHOICES.find((choice) => choice.id === choiceId) ?? null;
}

export function streamingSourceCandidateKey(regionCode, mediaType) {
	const code = canonicalRegionCode(regionCode);
	return code !== null && ["MOVIE", "TV"].includes(mediaType)
		? `${code}|${mediaType}`
		: null;
}

export function defaultStreamingSourceName(providerName, regionCode, mediaType) {
	const name = canonicalText(providerName);
	const code = canonicalRegionCode(regionCode);
	const mediaLabel = mediaType === "MOVIE" ? "Movies" : mediaType === "TV" ? "Series" : null;
	return name && code !== null && mediaLabel !== null ? `${name}, ${code} - ${mediaLabel}` : null;
}

export function reconcileStreamingSourceTitles(sourceTitles, drafts) {
	const current = plainObject(sourceTitles) ? sourceTitles : {};
	const next = {};
	for (const draft of drafts ?? []) {
		const key = streamingSourceCandidateKey(
			draft?.editable?.filters?.watchRegion,
			draft?.editable?.mediaType,
		);
		if (key !== null && Object.hasOwn(current, key)) next[key] = current[key];
	}
	return Object.freeze(next);
}

function normalizedSelectedRegionCodes(value) {
	const values = Array.isArray(value) ? value : [value];
	if (values.length === 0) return null;
	const codes = [];
	const seen = new Set();
	for (const value of values) {
		const code = canonicalRegionCode(value);
		if (code === null || code !== value || seen.has(code)) return null;
		seen.add(code);
		codes.push(code);
	}
	return Object.freeze(codes);
}

function normalizedKnownRegionCodes(value, catalogueRegions) {
	if (!Array.isArray(value) || value.length === 0 || !Array.isArray(catalogueRegions)) return null;
	const knownByCode = new Map();
	for (const region of catalogueRegions) {
		const code = canonicalRegionCode(region?.code);
		const name = canonicalText(region?.name);
		if (code !== null && region.code === code && name && region.name === name && !knownByCode.has(code)) {
			knownByCode.set(code, name);
		}
	}
	const codes = [];
	const seen = new Set();
	for (const region of value) {
		const code = canonicalRegionCode(region?.code);
		const name = canonicalText(region?.name);
		if (code === null || region.code !== code || !name || region.name !== name || knownByCode.get(code) !== name || seen.has(code)) return null;
		seen.add(code);
		codes.push(code);
	}
	return Object.freeze(codes);
}

export function streamingMediaChoiceSupport(provider, regionCodes) {
	const codes = normalizedSelectedRegionCodes(regionCodes);
	if (codes === null) return Object.freeze({ movies: false, series: false, both: false });
	const availability = streamingProviderCommonAvailability(provider, codes);
	return Object.freeze({
		movies: availability.movies,
		series: availability.series,
		both: availability.both,
	});
}

export function defaultStreamingMediaChoice(provider, regionCodes) {
	const support = streamingMediaChoiceSupport(provider, regionCodes);
	if (support.both) return "both";
	if (support.movies) return "movies";
	if (support.series) return "series";
	return null;
}

export function buildStreamingSourceDrafts(provider, {
	regionCodes,
	mediaChoice,
	sortOptionId = DEFAULT_STREAMING_SORT_OPTION_ID,
	sourceTitles = {},
} = {}) {
	const errors = [];
	const id = Number.isSafeInteger(provider?.id) && provider.id > 0 ? provider.id : null;
	const name = canonicalText(provider?.name);
	const codes = normalizedSelectedRegionCodes(regionCodes);
	const choice = choiceForId(mediaChoice);
	if (id === null || !name || provider?.name !== name) {
		errors.push(diagnostic("INVALID_STREAMING_PROVIDER", "$streaming.provider", "A normalized Streaming provider identity is required."));
	}
	if (codes === null) {
		errors.push(diagnostic("INVALID_STREAMING_REGIONS", "$streaming.regions", "Choose one or more distinct normalized Streaming regions."));
	}
	if (choice === null) {
		errors.push(diagnostic("INVALID_STREAMING_MEDIA", "$streaming.mediaChoice", "Choose Movies, Series or Both."));
	} else if (codes !== null) {
		const support = streamingMediaChoiceSupport(provider, codes);
		if (!support[choice.id]) {
			errors.push(diagnostic("UNAVAILABLE_STREAMING_MEDIA", "$streaming.mediaChoice", "This provider does not support that media choice in every selected region."));
		}
	}
	if (!STREAMING_SORT_OPTIONS.some((option) => option.id === sortOptionId)) {
		errors.push(diagnostic("INVALID_STREAMING_SORT", "$streaming.sortOptionId", "Choose a supported Streaming sort order."));
	}
	if (!plainObject(sourceTitles)) {
		errors.push(diagnostic("INVALID_STREAMING_SOURCE_TITLES", "$streaming.sourceTitles", "Streaming source names must be keyed by region and media type."));
	}
	if (errors.length > 0) return Object.freeze({ ok: false, drafts: Object.freeze([]), errors: Object.freeze(errors) });

	const drafts = [];
	for (const code of codes) {
		for (const mediaType of choice.mediaTypes) {
			const candidateKey = streamingSourceCandidateKey(code, mediaType);
			const defaultTitle = defaultStreamingSourceName(name, code, mediaType);
			const title = Object.hasOwn(sourceTitles, candidateKey) ? sourceTitles[candidateKey] : defaultTitle;
			if (!isValidNuvioTitle(title)) {
				errors.push(diagnostic(
					"INVALID_STREAMING_SOURCE_TITLE",
					`$streaming.sourceTitles.${candidateKey}`,
					"Enter a name for this source before adding it.",
				));
				continue;
			}
			const built = buildDiscoverSourceDraft({
				title: defaultTitle,
				mediaType,
				sortOptionId,
				filters: {
					watchRegion: code,
					withWatchProviders: String(id),
				},
			});
			if (!built.ok) errors.push(...built.errors);
			else drafts.push(Object.freeze({
				...built.draft,
				editable: Object.freeze({ ...built.draft.editable, title }),
			}));
		}
	}
	return Object.freeze({
		ok: errors.length === 0,
		drafts: Object.freeze(errors.length === 0 ? drafts : []),
		errors: Object.freeze(errors),
	});
}

export function validateStreamingSourceDrafts(drafts, {
	provider,
	regionCodes,
	mediaChoice,
	sortOptionId = DEFAULT_STREAMING_SORT_OPTION_ID,
} = {}) {
	const expected = buildStreamingSourceDrafts(provider, { regionCodes, mediaChoice, sortOptionId });
	if (!expected.ok) return Object.freeze({ ok: false, errors: expected.errors });
	if (!Array.isArray(drafts) || drafts.length !== expected.drafts.length) {
		return Object.freeze({ ok: false, errors: Object.freeze([
			diagnostic("INVALID_STREAMING_SOURCE_BUNDLE", "$streaming.sources", "The Streaming source bundle must contain the configured media candidates."),
		]) });
	}
	const errors = [];
	const identities = [];
	for (const [index, draft] of drafts.entries()) {
		const path = `$streaming.sources[${index}]`;
		const editable = draft?.editable;
		const expectedEditable = expected.drafts[index].editable;
		const identity = discoverSourceIdentity(editable);
		if (
			!plainObject(draft)
			|| !sameKeys(draft, ["category", "editable"])
			|| draft.category !== "native-tmdb"
			|| !plainObject(editable)
			|| !sameKeys(editable, ["title", "sortBy", "tmdbId", "filters", "provider", "mediaType", "tmdbSourceType"])
			|| !identity.comparable
			|| editable.provider !== expectedEditable.provider
			|| editable.tmdbSourceType !== expectedEditable.tmdbSourceType
			|| editable.mediaType !== expectedEditable.mediaType
			|| editable.tmdbId !== expectedEditable.tmdbId
			|| !isValidNuvioTitle(editable.title)
			|| editable.sortBy !== expectedEditable.sortBy
			|| !plainObject(editable.filters)
			|| Object.keys(editable.filters).sort().join("\u0000") !== "watchRegion\u0000withWatchProviders"
			|| editable.filters.watchRegion !== expectedEditable.filters.watchRegion
			|| editable.filters.withWatchProviders !== expectedEditable.filters.withWatchProviders
		) {
			errors.push(diagnostic("INVALID_STREAMING_SOURCE_DRAFT", path, "The Streaming source must match the selected provider, ordered regions and DISCOVER contract."));
			continue;
		}
		identities.push(identity.key);
	}
	if (identities.length !== drafts.length || new Set(identities).size !== identities.length) {
		errors.push(diagnostic("DUPLICATE_STREAMING_SOURCE_IDENTITY", "$streaming.sources", "Streaming source candidates must have distinct comparable DISCOVER identities."));
	}
	return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function findCollectionAndFolder(project, folderInternalId) {
	for (const collection of project?.collections ?? []) {
		const folder = collection.folders.find((entry) => entry.internalId === folderInternalId);
		if (folder) return { collection, folder };
	}
	return null;
}

function candidateIdentities(drafts) {
	const candidates = new Map();
	for (const draft of drafts ?? []) {
		const identity = discoverSourceIdentity(draft?.editable);
		if (identity.comparable) candidates.set(identity.key, Object.freeze({
			mediaType: draft.editable.mediaType,
			regionCode: draft.editable.filters.watchRegion,
			title: draft.editable.title,
		}));
	}
	return candidates;
}

export function summarizeStreamingSourceDrafts(drafts, duplicateReview = { destination: [] }) {
	const destinationIdentities = new Set((duplicateReview?.destination ?? []).map((entry) => entry.identity));
	return Object.freeze((drafts ?? []).map((draft) => {
		const identity = discoverSourceIdentity(draft?.editable);
		return Object.freeze({
			identity: identity.comparable ? identity.key : null,
			title: canonicalText(draft?.editable?.title),
			regionCode: canonicalRegionCode(draft?.editable?.filters?.watchRegion),
			mediaType: draft?.editable?.mediaType ?? null,
			existsInDestination: identity.comparable && destinationIdentities.has(identity.key),
		});
	}));
}

export function inspectStreamingSourceDuplicates(project, destinationFolderInternalId, drafts) {
	const candidates = candidateIdentities(drafts);
	const destination = [];
	const elsewhere = [];
	for (const collection of project?.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const identity = discoverSourceNodeIdentity(source);
				if (!identity.comparable || !candidates.has(identity.key)) continue;
				const candidate = candidates.get(identity.key);
				const occurrence = Object.freeze({
					identity: identity.key,
					mediaType: candidate.mediaType,
					regionCode: candidate.regionCode,
					collectionInternalId: collection.internalId,
					collectionTitle: canonicalText(collection.editable?.title),
					folderInternalId: folder.internalId,
					folderTitle: canonicalText(folder.editable?.title),
					sourceInternalId: source.internalId,
					sourceTitle: canonicalText(source.editable?.title),
				});
				if (folder.internalId === destinationFolderInternalId) destination.push(occurrence);
				else elsewhere.push(occurrence);
			}
		}
	}
	return Object.freeze({ destination: Object.freeze(destination), elsewhere: Object.freeze(elsewhere) });
}

export function streamingDuplicateOverrideIdentity(folderInternalId, drafts) {
	if (typeof folderInternalId !== "string" || !folderInternalId) return null;
	const identities = [...candidateIdentities(drafts).keys()];
	if (identities.length !== drafts?.length) return null;
	return `${folderInternalId}\n${identities.join("\n")}`;
}

export function createStreamingSourceBundle(controller, {
	folderInternalId,
	provider,
	regions,
	catalogueRegions,
	mediaChoice,
	sortOptionId = DEFAULT_STREAMING_SORT_OPTION_ID,
	drafts,
	duplicateOverrideIdentity = null,
	interactionLocked = false,
} = {}) {
	const regionCodes = normalizedKnownRegionCodes(regions, catalogueRegions);
	if (regionCodes === null) {
		return { ok: false, errors: [diagnostic("INVALID_STREAMING_REGIONS", "$streaming.regions", "Choose one or more distinct known Streaming regions.")], warnings: [] };
	}
	const validation = validateStreamingSourceDrafts(drafts, {
		provider,
		regionCodes,
		mediaChoice,
		sortOptionId,
	});
	if (!validation.ok) return { ok: false, errors: validation.errors, warnings: [] };
	if (interactionLocked) {
		return { ok: false, errors: [diagnostic("STREAMING_CREATION_INTERACTION_LOCKED", "$streaming.creation", "Finish the current hierarchy interaction before adding Streaming sources.")], warnings: [] };
	}
	const state = controller.getState();
	const location = findCollectionAndFolder(state.project, folderInternalId);
	if (!location || state.selection.folderInternalId !== folderInternalId) {
		return { ok: false, errors: [diagnostic("STREAMING_FOLDER_UNAVAILABLE", "$streaming.destination", "The selected destination folder is no longer available.")], warnings: [] };
	}
	const duplicateReview = inspectStreamingSourceDuplicates(state.project, folderInternalId, drafts);
	const destinationIdentities = new Set(duplicateReview.destination.map((entry) => entry.identity));
	const override = streamingDuplicateOverrideIdentity(folderInternalId, drafts);
	const hasDuplicates = drafts.some((draft) => destinationIdentities.has(discoverSourceIdentity(draft.editable).key));
	const addAll = hasDuplicates && duplicateOverrideIdentity === override;
	const draftsToAdd = addAll
		? drafts
		: drafts.filter((draft) => !destinationIdentities.has(discoverSourceIdentity(draft.editable).key));
	if (draftsToAdd.length === 0) {
		return {
			ok: false,
			requiresDuplicateOverride: true,
			errors: [diagnostic("STREAMING_SOURCES_ALREADY_EXIST", "$streaming.sources", "Every configured Streaming source already exists in this folder.")],
			warnings: [],
			duplicateReview,
		};
	}
	const result = controller.addSourcesToFolder(folderInternalId, {
		sources: draftsToAdd.map((draft) => ({ category: draft.category, editable: draft.editable })),
	});
	return result.ok
		? { ...result, addedSourceCount: draftsToAdd.length, duplicateReview, duplicateOverrideUsed: addAll }
		: result;
}
