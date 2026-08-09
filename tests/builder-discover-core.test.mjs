import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { importNuvioCollections } from "../builder/src/import/index.js";
import {
	buildDiscoverSourceDraft,
	canonicalizeDiscoverFiltersForComparison,
	DEFAULT_DISCOVER_SORT,
	DEFAULT_DISCOVER_SORT_OPTION_ID,
	DISCOVER_CLASSIFICATIONS,
	DISCOVER_EDIT_READINESS,
	DISCOVER_FILTER_DESCRIPTORS,
	DISCOVER_SORT_OPTIONS,
	discoverFilterDescriptor,
	discoverSortOptionId,
	discoverSortValue,
	discoverSourceNodeIdentity,
	discoverSourceIdentity,
	effectiveDiscoverSort,
	inspectDiscoverSourceNode,
	inspectDiscoverSource,
	resolveEffectiveDiscoverSource,
} from "../builder/src/nuvio/discover.js";
import { DISCOVER_FILTER_FIELDS } from "../builder/src/nuvio/known-fields.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

function countingIdFactory(prefix = "discover") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function deepFreeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

function loadJsonFixture(relativePath) {
	return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function source(overrides = {}) {
	return {
		title: "Discover source",
		sortBy: "popularity.desc",
		tmdbId: null,
		filters: {},
		provider: "tmdb",
		mediaType: "MOVIE",
		tmdbSourceType: "DISCOVER",
		...overrides,
	};
}

function identity(overrides = {}) {
	const result = discoverSourceIdentity(source(overrides));
	assert.equal(result.comparable, true, JSON.stringify(result.reasons));
	return result.key;
}

function serializeSource(editable) {
	const imported = importNuvioCollections([{
		id: "collection",
		title: "DISCOVER Core",
		folders: [{ id: "folder", title: "Sources", sources: [editable], catalogSources: [] }],
	}], { idFactory: countingIdFactory() });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	const serialized = serializeNuvioProject(imported.project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	return serialized.value[0].folders[0];
}

function importSourceNodes(sources) {
	const imported = importNuvioCollections([{
		id: "collection",
		title: "DISCOVER Core",
		folders: [{ id: "folder", title: "Sources", sources, catalogSources: [] }],
	}], { idFactory: countingIdFactory("imported-discover") });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	return {
		project: imported.project,
		nodes: imported.project.collections[0].folders[0].sources,
	};
}

const completeTvFilters = Object.freeze({
	withGenres: "28,12",
	releaseDateGte: "2020-01-01",
	releaseDateLte: "2026-12-31",
	voteAverageGte: 7,
	voteAverageLte: 10,
	voteCountGte: 100,
	withOriginalLanguage: "en",
	withOriginCountry: "AU",
	withKeywords: "9715|12377",
	withCompanies: "1,2",
	withNetworks: "213",
	year: 2026,
	watchRegion: "AU",
	withWatchProviders: "8|337",
});

test("the descriptor inventory exactly matches all 14 authoritative recognized fields and expected types", () => {
	assert.deepEqual(DISCOVER_FILTER_DESCRIPTORS.map((entry) => entry.field), DISCOVER_FILTER_FIELDS);
	assert.deepEqual(Object.fromEntries(DISCOVER_FILTER_DESCRIPTORS.map((entry) => [entry.field, entry.valueType])), {
		withGenres: "string",
		releaseDateGte: "string",
		releaseDateLte: "string",
		voteAverageGte: "number",
		voteAverageLte: "number",
		voteCountGte: "integer",
		withOriginalLanguage: "string",
		withOriginCountry: "string",
		withKeywords: "string",
		withCompanies: "string",
		withNetworks: "string",
		year: "integer",
		watchRegion: "string",
		withWatchProviders: "string",
	});
	assert.equal(discoverFilterDescriptor("futureFilter"), null);
});

test("descriptors record Movie and TV request semantics without making Movie networks portable", () => {
	for (const descriptor of DISCOVER_FILTER_DESCRIPTORS) {
		assert.ok(descriptor.media.MOVIE);
		assert.ok(descriptor.media.TV);
	}
	assert.equal(discoverFilterDescriptor("releaseDateGte").media.MOVIE.requestParameter, "primary_release_date.gte");
	assert.equal(discoverFilterDescriptor("releaseDateGte").media.TV.requestParameter, "first_air_date.gte");
	assert.equal(discoverFilterDescriptor("releaseDateLte").media.TV.requestParameter, "first_air_date.lte");
	assert.equal(discoverFilterDescriptor("year").media.MOVIE.requestParameter, "year");
	assert.equal(discoverFilterDescriptor("year").media.TV.requestParameter, "first_air_date_year");
	assert.equal(discoverFilterDescriptor("withNetworks").media.MOVIE.applicable, false);
	assert.equal(discoverFilterDescriptor("withNetworks").media.MOVIE.portable, false);
	assert.equal(discoverFilterDescriptor("withNetworks").media.TV.requestParameter, "with_networks");
});

test("DISCOVER owns all four media-specific semantic sort mappings", () => {
	const expected = {
		popular: { MOVIE: "popularity.desc", TV: "popularity.desc" },
		recent: { MOVIE: "primary_release_date.desc", TV: "first_air_date.desc" },
		"top-rated": { MOVIE: "vote_average.desc", TV: "vote_average.desc" },
		"most-votes": { MOVIE: "vote_count.desc", TV: "vote_count.desc" },
	};
	assert.deepEqual(Object.fromEntries(DISCOVER_SORT_OPTIONS.map((entry) => [entry.id, entry.values])), expected);
	for (const option of DISCOVER_SORT_OPTIONS) {
		for (const mediaType of ["MOVIE", "TV"]) {
			assert.equal(discoverSortValue(option.id, mediaType), expected[option.id][mediaType]);
			assert.equal(discoverSortOptionId(expected[option.id][mediaType], mediaType), option.id);
		}
	}
	assert.equal(DEFAULT_DISCOVER_SORT_OPTION_ID, "popular");
	assert.equal(DEFAULT_DISCOVER_SORT, "popularity.desc");
});

test("canonical Movie construction emits the exact native source shape and explicit null tmdbId", () => {
	const result = buildDiscoverSourceDraft({
		title: "Netflix Australia Movies · Popular",
		mediaType: "MOVIE",
		filters: { watchRegion: "AU", withWatchProviders: "8" },
	});
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.deepEqual(result.draft, {
		category: "native-tmdb",
		editable: {
			title: "Netflix Australia Movies · Popular",
			sortBy: "popularity.desc",
			tmdbId: null,
			filters: { watchRegion: "AU", withWatchProviders: "8" },
			provider: "tmdb",
			mediaType: "MOVIE",
			tmdbSourceType: "DISCOVER",
		},
	});
	assert.equal(inspectDiscoverSource(result.draft.editable).classification, DISCOVER_CLASSIFICATIONS.CANONICAL);
});

test("canonical TV construction accepts all 14 descriptors without inventing null filter keys", () => {
	const result = buildDiscoverSourceDraft({
		title: "Complete Series Discover",
		mediaType: "TV",
		sortOptionId: "recent",
		filters: completeTvFilters,
	});
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(result.draft.editable.sortBy, "first_air_date.desc");
	assert.deepEqual(result.draft.editable.filters, completeTvFilters);
	assert.equal(Object.keys(result.draft.editable.filters).length, 14);
	assert.equal(inspectDiscoverSource(result.draft.editable).classification, DISCOVER_CLASSIFICATIONS.CANONICAL);
});

test("an imported SourceNode using every evidenced TV field is fully understood for future known-field editing", () => {
	const { nodes } = importSourceNodes([source({
		title: "Complete imported TV Discover",
		mediaType: "TV",
		filters: completeTvFilters,
	})]);
	const inspected = inspectDiscoverSourceNode(nodes[0]);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.CANONICAL);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD);
	assert.deepEqual(inspected.capabilities.editableKnownFields, DISCOVER_FILTER_FIELDS);
	assert.deepEqual(inspected.capabilities.preservedUnknownFields, []);
	assert.deepEqual(inspected.capabilities.unsafeKnownFields, []);
});

test("the canonical constructor rejects unsupported envelopes and malformed Builder-created filters", () => {
	const result = buildDiscoverSourceDraft({
		title: " Untrimmed ",
		mediaType: "BOTH",
		sortOptionId: "future",
		filters: {
			withGenres: "28, 12",
			voteAverageGte: "7",
			futureFilter: true,
		},
	});
	assert.equal(result.ok, false);
	assert.equal(result.draft, null);
	assert.deepEqual(new Set(result.errors.map((entry) => entry.code)), new Set([
		"INVALID_DISCOVER_TITLE",
		"INVALID_DISCOVER_MEDIA_TYPE",
		"INVALID_DISCOVER_SORT",
		"INVALID_DISCOVER_FILTER_VALUE",
		"UNKNOWN_DISCOVER_FILTER",
	]));
});

test("canonical construction omits null and blank filters but does not retain an inactive watch region", () => {
	const omitted = buildDiscoverSourceDraft({
		title: "No filters",
		mediaType: "MOVIE",
		filters: { withGenres: null, withKeywords: "", voteAverageGte: null },
	});
	assert.equal(omitted.ok, true);
	assert.deepEqual(omitted.draft.editable.filters, {});
	const inactive = buildDiscoverSourceDraft({ title: "Region only", mediaType: "MOVIE", filters: { watchRegion: "AU" } });
	assert.equal(inactive.ok, false);
	assert.ok(inactive.errors.some((entry) => entry.code === "DISCOVER_REGION_REQUIRES_PROVIDERS"));
});

test("an imported SourceNode diagnoses a contradictory full date range without changing its understood fields or stored identity", () => {
	const filters = {
		releaseDateGte: "2006-01-01",
		releaseDateLte: "2005-12-31",
	};
	const { nodes } = importSourceNodes([source({ title: "🔥 2006", filters })]);
	const node = nodes[0];
	const before = structuredClone(node);
	deepFreeze(node);

	const inspected = inspectDiscoverSourceNode(node);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.comparisonSafe, true);
	assert.equal(inspected.capabilities.knownFieldEditingSafe, true);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD);
	assert.deepEqual(inspected.capabilities.editableKnownFields, ["releaseDateGte", "releaseDateLte"]);
	assert.deepEqual(inspected.capabilities.unsafeKnownFields, []);
	assert.ok(inspected.reasons.includes("CONTRADICTORY_DISCOVER_DATE_RANGE"));

	const effective = resolveEffectiveDiscoverSource(node);
	assert.equal(effective.ok, true, JSON.stringify(effective.reasons));
	assert.deepEqual(effective.value.filters, filters);
	const firstIdentity = discoverSourceNodeIdentity(node);
	const secondIdentity = discoverSourceNodeIdentity(node);
	assert.equal(firstIdentity.comparable, true, JSON.stringify(firstIdentity.reasons));
	assert.equal(firstIdentity.key, secondIdentity.key);
	assert.deepEqual(firstIdentity.value.filters, filters);
	assert.deepEqual(node, before);
});

test("canonical construction rejects a contradictory strict full date range", () => {
	const result = buildDiscoverSourceDraft({
		title: "Contradictory dates",
		mediaType: "MOVIE",
		filters: { releaseDateGte: "2006-01-01", releaseDateLte: "2005-12-31" },
	});
	assert.equal(result.ok, false);
	assert.equal(result.draft, null);
	assert.ok(result.errors.some((entry) => entry.code === "CONTRADICTORY_DISCOVER_DATE_RANGE"));
});

test("a valid strict full date range remains canonical", () => {
	const result = buildDiscoverSourceDraft({
		title: "2006",
		mediaType: "MOVIE",
		filters: { releaseDateGte: "2006-01-01", releaseDateLte: "2006-12-31" },
	});
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(inspectDiscoverSource(result.draft.editable).classification, DISCOVER_CLASSIFICATIONS.CANONICAL);
});

test("equal strict full date bounds remain allowed", () => {
	const result = buildDiscoverSourceDraft({
		title: "One day",
		mediaType: "TV",
		filters: { releaseDateGte: "2006-01-01", releaseDateLte: "2006-01-01" },
	});
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	assert.equal(inspectDiscoverSource(result.draft.editable).classification, DISCOVER_CLASSIFICATIONS.CANONICAL);
});

test("a Sherlock-style partial imported date is preserved without a contradictory-range diagnosis", () => {
	const imported = source({
		title: "Series",
		mediaType: "TV",
		filters: { releaseDateGte: "1982" },
	});
	const inspected = inspectDiscoverSource(imported);
	assert.ok(!inspected.reasons.includes("CONTRADICTORY_DISCOVER_DATE_RANGE"));
	assert.equal(inspected.capabilities.knownFieldEditingSafe, true);
	assert.deepEqual(discoverSourceIdentity(imported).value.filters, { releaseDateGte: "1982" });
});

test("unusual and invalid imported date strings are not interpreted by the full-date relational rule", () => {
	for (const filters of [
		{ releaseDateGte: "2020-1-1", releaseDateLte: "2019-12-31" },
		{ releaseDateGte: "2020-02-30", releaseDateLte: "2020-02-29" },
	]) {
		const imported = source({ filters });
		const inspected = inspectDiscoverSource(imported);
		assert.ok(!inspected.reasons.includes("CONTRADICTORY_DISCOVER_DATE_RANGE"));
		assert.equal(inspected.capabilities.knownFieldEditingSafe, true);
		assert.deepEqual(discoverSourceIdentity(imported).value.filters, filters);
	}
});

test("Movie withNetworks is rejected for canonical construction but remains preservable and comparable when imported", () => {
	const built = buildDiscoverSourceDraft({ title: "Movie networks", mediaType: "MOVIE", filters: { withNetworks: "213" } });
	assert.equal(built.ok, false);
	assert.ok(built.errors.some((entry) => entry.code === "NONPORTABLE_MOVIE_NETWORKS"));
	const imported = source({ filters: { withNetworks: "213" } });
	const inspected = inspectDiscoverSource(imported);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.comparisonSafe, true);
	assert.equal(inspected.capabilities.knownFieldEditingSafe, false);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.PRESERVE_ONLY);
	assert.deepEqual(inspected.capabilities.unsafeKnownFields, ["withNetworks"]);
	assert.ok(inspected.reasons.includes("NONPORTABLE_MOVIE_NETWORKS"));
});

test("pure comma AND expressions compare independently of token order", () => {
	assert.equal(
		identity({ filters: { withGenres: "28,12" } }),
		identity({ filters: { withGenres: "12,28" } }),
	);
	assert.equal(
		identity({ filters: { withKeywords: "9715,12377,9715" } }),
		identity({ filters: { withKeywords: "9715,9715,12377" } }),
	);
});

test("pure pipe OR expressions normalize order while remaining distinct from AND", () => {
	const left = identity({ filters: { withWatchProviders: "337|8", watchRegion: "AU" } });
	const right = identity({ filters: { withWatchProviders: "8|337", watchRegion: "AU" } });
	const and = identity({ filters: { withWatchProviders: "8,337", watchRegion: "AU" } });
	assert.equal(left, right);
	assert.notEqual(left, and);
});

test("compound expression ordering remains precision-safe beyond Number.MAX_SAFE_INTEGER", () => {
	const lower = "9007199254740992";
	const higher = "9007199254740993";
	for (const field of ["withGenres", "withKeywords", "withCompanies", "withWatchProviders"]) {
		assert.equal(
			identity({ filters: { [field]: `${higher},${lower}` } }),
			identity({ filters: { [field]: `${lower},${higher}` } }),
		);
		assert.equal(
			identity({ filters: { [field]: `${higher}|${lower}` } }),
			identity({ filters: { [field]: `${lower}|${higher}` } }),
		);
		assert.notEqual(
			identity({ filters: { [field]: `8,${lower}` } }),
			identity({ filters: { [field]: `8,${higher}` } }),
		);
	}
});

test("compound expression normalization retains duplicate token multiplicity", () => {
	for (const field of ["withGenres", "withKeywords", "withCompanies", "withWatchProviders"]) {
		assert.notEqual(
			identity({ filters: { [field]: "8,8,337" } }),
			identity({ filters: { [field]: "8,337" } }),
		);
		assert.notEqual(
			identity({ filters: { [field]: "8|8|337" } }),
			identity({ filters: { [field]: "8|337" } }),
		);
	}
});

test("mixed malformed whitespace leading-zero and empty-token expressions remain opaque", () => {
	for (const [left, right] of [
		["28,12|35", "12,28|35"],
		["28, 12", "12, 28"],
		["028,12", "12,028"],
		["28,,12", "12,,28"],
	]) {
		assert.notEqual(identity({ filters: { withGenres: left } }), identity({ filters: { withGenres: right } }));
	}
});

test("provider-region comparison uses the evidenced US default and ignores inactive regions", () => {
	assert.equal(
		identity({ filters: { withWatchProviders: "8" } }),
		identity({ filters: { withWatchProviders: "8", watchRegion: "US" } }),
	);
	assert.equal(
		identity({ filters: {} }),
		identity({ filters: { watchRegion: "AU" } }),
	);
	assert.notEqual(
		identity({ filters: { withWatchProviders: "8", watchRegion: "AU" } }),
		identity({ filters: { withWatchProviders: "8", watchRegion: "US" } }),
	);
});

test("missing null and empty sort use effective Popular while unusual or whitespace sorts remain exact", () => {
	assert.equal(effectiveDiscoverSort(undefined), "popularity.desc");
	assert.equal(effectiveDiscoverSort(null), "popularity.desc");
	assert.equal(effectiveDiscoverSort(""), "popularity.desc");
	assert.equal(identity({ sortBy: undefined }), identity({ sortBy: "popularity.desc" }));
	assert.equal(identity({ sortBy: null }), identity({ sortBy: "popularity.desc" }));
	assert.notEqual(identity({ sortBy: " " }), identity({ sortBy: "popularity.desc" }));
	assert.equal(effectiveDiscoverSort("original"), "original");
});

test("DISCOVER identity includes sort and media while excluding display title", () => {
	assert.equal(identity({ title: "Popular" }), identity({ title: "Completely different title" }));
	assert.equal(identity({ provider: "TMDB", tmdbSourceType: "discover", mediaType: "movie" }), identity());
	assert.notEqual(identity({ sortBy: "popularity.desc" }), identity({ sortBy: "primary_release_date.desc" }));
	assert.notEqual(identity({ mediaType: "MOVIE" }), identity({ mediaType: "TV" }));
});

test("absent and null tmdbId are equivalent while a non-null imported ID conservatively distinguishes identity", () => {
	const absent = source();
	delete absent.tmdbId;
	assert.equal(discoverSourceIdentity(absent).key, identity({ tmdbId: null }));
	assert.notEqual(identity({ tmdbId: 8 }), identity({ tmdbId: null }));
	const inspected = inspectDiscoverSource(source({ tmdbId: 8 }));
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.ok(inspected.reasons.includes("NONCANONICAL_TMDB_ID"));
});

test("unknown nested objects compare with sorted keys while arrays preserve order and primitive types", () => {
	assert.equal(
		identity({ filters: { future: { beta: 2, alpha: { two: 2, one: 1 } } } }),
		identity({ filters: { future: { alpha: { one: 1, two: 2 }, beta: 2 } } }),
	);
	assert.notEqual(identity({ filters: { future: [1, 2] } }), identity({ filters: { future: [2, 1] } }));
	assert.notEqual(identity({ filters: { future: 0 } }), identity({ filters: { future: "0" } }));
	assert.notEqual(identity({ filters: { future: null } }), identity({ filters: {} }));
});

test("comparison is pure and does not rewrite stored expression or object order", () => {
	const filters = { withGenres: "28,12", future: { beta: 2, alpha: 1 } };
	const before = structuredClone(filters);
	const compared = canonicalizeDiscoverFiltersForComparison(filters);
	assert.equal(compared.comparable, true);
	assert.deepEqual(filters, before);
	assert.equal(filters.withGenres, "28,12");
	assert.equal(compared.value.withGenres, "12,28");
	assert.deepEqual(Object.keys(compared.value.future), ["alpha", "beta"]);
});

test("non-object filters and non-JSON custom values return explicit non-comparable results", () => {
	for (const filters of [null, [], "future"]) {
		const result = discoverSourceIdentity(source({ filters }));
		assert.equal(result.comparable, false);
		assert.equal(result.key, null);
	}
	const circular = {};
	circular.self = circular;
	const result = discoverSourceIdentity(source({ filters: { future: circular } }));
	assert.equal(result.comparable, false);
	assert.ok(result.reasons.some((entry) => entry.code === "CIRCULAR_DISCOVER_VALUE"));
});

test("unusual imported sorts remain exact preservable data", () => {
	const imported = source({ sortBy: "revenue.desc" });
	const inspected = inspectDiscoverSource(imported);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.comparisonSafe, true);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS);
	assert.ok(inspected.reasons.includes("NONCANONICAL_SORT"));
	assert.notEqual(discoverSourceIdentity(imported).key, identity({ sortBy: "popularity.desc" }));
});

test("full nullable client filter envelopes are preservable and remain safe for known-field overlay", () => {
	const filters = Object.fromEntries(DISCOVER_FILTER_FIELDS.map((field) => [field, null]));
	const inspected = inspectDiscoverSource(source({ filters }));
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.comparisonSafe, true);
	assert.equal(inspected.capabilities.knownFieldEditingSafe, true);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD);
	assert.equal(discoverSourceIdentity(source({ filters })).key, identity({ filters: {} }));
});

test("existing importer and serializer preserve known plus unknown custom filters without Core normalization", () => {
	const importedSource = source({
		sortBy: "revenue.desc",
		filters: {
			withGenres: "28,12",
			futureNested: { beta: [2, 1], alpha: false },
		},
		unknownSource: { keep: true },
	});
	const folder = serializeSource(importedSource);
	assert.equal(folder.sources[0].sortBy, "revenue.desc");
	assert.equal(folder.sources[0].filters.withGenres, "28,12");
	assert.deepEqual(folder.sources[0].filters.futureNested, { beta: [2, 1], alpha: false });
	assert.deepEqual(folder.sources[0].unknownSource, { keep: true });
});

test("actual imported SourceNodes retain unknown filters in distinct identities and PRESERVABLE classification", () => {
	const { nodes } = importSourceNodes([
		source({ filters: { withGenres: "27", futureFilter: { mode: "A" } } }),
		source({ filters: { withGenres: "27", futureFilter: { mode: "B" } } }),
	]);
	const left = discoverSourceNodeIdentity(nodes[0]);
	const right = discoverSourceNodeIdentity(nodes[1]);
	assert.equal(left.comparable, true, JSON.stringify(left.reasons));
	assert.equal(right.comparable, true, JSON.stringify(right.reasons));
	assert.notEqual(left.key, right.key);
	assert.deepEqual(left.value.filters.futureFilter, { mode: "A" });
	assert.deepEqual(right.value.filters.futureFilter, { mode: "B" });
	for (const node of nodes) {
		const inspected = inspectDiscoverSourceNode(node);
		assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
		assert.equal(inspected.capabilities.comparisonSafe, true);
		assert.ok(inspected.reasons.includes("UNKNOWN_DISCOVER_FILTER"));
	}
});

test("SourceNode effective resolution overlays known edits while retaining detached unknown raw data", () => {
	const { project, nodes } = importSourceNodes([source({
		filters: { withGenres: "27", futureFilter: { mode: "A", nested: [1, 2] } },
		futureSource: { keep: true },
	})]);
	const node = nodes[0];
	node.editable.filters.withGenres = "28";
	const before = structuredClone(node);
	deepFreeze(node);

	const resolved = resolveEffectiveDiscoverSource(node);
	assert.equal(resolved.ok, true, JSON.stringify(resolved.reasons));
	assert.equal(resolved.value.filters.withGenres, "28");
	assert.deepEqual(resolved.value.filters.futureFilter, { mode: "A", nested: [1, 2] });
	assert.deepEqual(resolved.value.futureSource, { keep: true });
	assert.deepEqual(node, before);
	assert.equal(node.rawImported.filters.withGenres, "27");
	assert.equal(node.editable.filters.withGenres, "28");

	const currentIdentity = discoverSourceNodeIdentity(node);
	const staleIdentity = discoverSourceIdentity(source({
		filters: { withGenres: "27", futureFilter: { mode: "A", nested: [1, 2] } },
	}));
	assert.equal(currentIdentity.comparable, true, JSON.stringify(currentIdentity.reasons));
	assert.notEqual(currentIdentity.key, staleIdentity.key);
	assert.equal(currentIdentity.value.filters.withGenres, "28");
	assert.deepEqual(currentIdentity.value.filters.futureFilter, { mode: "A", nested: [1, 2] });

	resolved.value.filters.futureFilter.mode = "changed only in detached result";
	resolved.value.filters.futureFilter.nested.reverse();
	assert.deepEqual(node, before);
	const serialized = serializeNuvioProject(project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.value[0].folders[0].sources[0].filters, {
		withGenres: "28",
		futureFilter: { mode: "A", nested: [1, 2] },
	});
});

test("the checked-in owner-run DISCOVER audit imports into explicit real-world readiness states", () => {
	const fixture = loadJsonFixture("../manual-tests/tmdb-discover/fixtures/00-complete-audit.json");
	const imported = importNuvioCollections(fixture, { idFactory: countingIdFactory("audit") });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	const nodes = imported.project.collections.flatMap((collection) => collection.folders.flatMap((folder) => folder.sources));
	assert.equal(nodes.length, 29);
	const byTitle = new Map(nodes.map((node) => [node.rawImported.title, { node, inspected: inspectDiscoverSourceNode(node) }]));

	for (const title of [
		"M1 Movie baseline",
		"M2 Movie withGenres 28",
		"T1 TV baseline",
		"T2 TV withNetworks 49",
		"W1 Movie providers 8 no region",
		"W2 Movie providers 8 region AU",
	]) {
		assert.equal(byTitle.get(title).inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.FULLY_UNDERSTOOD, title);
	}
	assert.deepEqual(byTitle.get("M2 Movie withGenres 28").inspected.capabilities.editableKnownFields, ["withGenres"]);
	assert.deepEqual(byTitle.get("T2 TV withNetworks 49").inspected.capabilities.editableKnownFields, ["withNetworks"]);
	assert.deepEqual(byTitle.get("W2 Movie providers 8 region AU").inspected.capabilities.editableKnownFields, ["watchRegion", "withWatchProviders"]);

	const unknownCases = new Map([
		["U1 Movie candidate withoutGenres 27", "withoutGenres"],
		["U2 Movie candidate withRuntimeGte 90", "withRuntimeGte"],
		["U3 Movie candidate voteCountLte 500", "voteCountLte"],
		["U4 Movie candidate withCast 31", "withCast"],
		["U5 TV candidate withStatus 0|3|4", "withStatus"],
		["U6 TV candidate withType 0|2", "withType"],
	]);
	for (const [title, field] of unknownCases) {
		const { inspected } = byTitle.get(title);
		assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE, title);
		assert.equal(inspected.capabilities.comparisonSafe, true, title);
		assert.equal(inspected.capabilities.knownFieldEditingSafe, true, title);
		assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS, title);
		assert.deepEqual(inspected.capabilities.preservedUnknownFields, [field], title);
	}

	const movieNetworks = byTitle.get("D1 Movie withNetworks 49 divergence").inspected;
	assert.equal(movieNetworks.capabilities.editReadiness, DISCOVER_EDIT_READINESS.PRESERVE_ONLY);
	assert.deepEqual(movieNetworks.capabilities.unsafeKnownFields, ["withNetworks"]);
	for (const title of [
		"S2 Movie raw sort revenue.desc",
		"S3 Movie raw sort original_title.asc",
		"S5 TV raw sort name.asc",
		"S7 Movie sort original client divergence",
		"S8 Movie invalid sort definitely_invalid.desc",
	]) {
		assert.equal(byTitle.get(title).inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS, title);
	}
	assert.ok(nodes.every((node) => inspectDiscoverSourceNode(node).classification !== DISCOVER_CLASSIFICATIONS.NOT_NATIVE));
});

test("a checked-in preservation profile supports a known edit without dropping its unknown DISCOVER evidence", () => {
	const fixture = loadJsonFixture("../manual-tests/nuvio-clients/issue-78-source-editing/source-edit-input.json");
	const imported = importNuvioCollections(fixture, { idFactory: countingIdFactory("issue-78-readiness") });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	const node = imported.project.collections[0].folders[0].sources.find((candidate) => candidate.rawImported?.tmdbSourceType === "DISCOVER");
	assert.ok(node);
	let inspected = inspectDiscoverSourceNode(node);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS);
	assert.deepEqual(inspected.capabilities.editableKnownFields, ["withKeywords"]);
	assert.deepEqual(inspected.capabilities.preservedUnknownFields, ["issue78UnknownDiscoverFilter"]);

	node.editable.filters.withKeywords = "9951";
	const effective = resolveEffectiveDiscoverSource(node);
	assert.equal(effective.ok, true, JSON.stringify(effective.reasons));
	assert.equal(effective.value.filters.withKeywords, "9951");
	assert.equal(effective.value.filters.issue78UnknownDiscoverFilter, "keep-before");
	inspected = inspectDiscoverSourceNode(node);
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.UNDERSTOOD_WITH_PRESERVED_EXTRAS);
	const serialized = serializeNuvioProject(imported.project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	const output = serialized.value[0].folders[0].sources.find((candidate) => candidate.tmdbSourceType === "DISCOVER");
	assert.equal(output.filters.withKeywords, "9951");
	assert.equal(output.filters.issue78UnknownDiscoverFilter, "keep-before");
});

test("canonical DISCOVER serialization creates no native catalogSources projection", () => {
	const built = buildDiscoverSourceDraft({ title: "Horror Movies", mediaType: "MOVIE", filters: { withGenres: "27" } });
	assert.equal(built.ok, true);
	const folder = serializeSource(built.draft.editable);
	assert.deepEqual(folder.sources, [built.draft.editable]);
	assert.deepEqual(folder.catalogSources, []);
});

test("representative Streaming identities retain Popular Recent and Horror as distinct rows", () => {
	const popular = source({ title: "Netflix AU Movies Popular", filters: { withWatchProviders: "8", watchRegion: "AU" } });
	const recent = source({ ...popular, title: "Netflix AU Movies Recent", sortBy: "primary_release_date.desc" });
	const horror = source({ ...popular, title: "Netflix AU Horror Movies Popular", filters: { ...popular.filters, withGenres: "27" } });
	assert.equal(new Set([discoverSourceIdentity(popular).key, discoverSourceIdentity(recent).key, discoverSourceIdentity(horror).key]).size, 3);
});

test("representative Genre identities distinguish sort and rating refinements", () => {
	const popular = source({ title: "Horror Movies Popular", filters: { withGenres: "27" } });
	const recent = source({ ...popular, title: "Horror Movies Recent", sortBy: "primary_release_date.desc" });
	const rated = source({ ...popular, title: "Horror Movies Rating 7+", filters: { withGenres: "27", voteAverageGte: 7 } });
	assert.equal(new Set([discoverSourceIdentity(popular).key, discoverSourceIdentity(recent).key, discoverSourceIdentity(rated).key]).size, 3);
});

test("representative Decade identities share stored date names but remain media-specific", () => {
	const filters = { releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" };
	const movies = source({ title: "1990s Movies", mediaType: "MOVIE", filters });
	const series = source({ title: "1990s Series", mediaType: "TV", filters });
	assert.notEqual(discoverSourceIdentity(movies).key, discoverSourceIdentity(series).key);
	assert.deepEqual(discoverSourceIdentity(movies).value.filters, filters);
	assert.deepEqual(discoverSourceIdentity(series).value.filters, filters);
});

test("the representative combined filter set constructs and compares as one ordinary DISCOVER query", () => {
	const filters = {
		watchRegion: "AU",
		withWatchProviders: "8",
		withGenres: "27",
		voteAverageGte: 7,
		releaseDateGte: "2020-01-01",
	};
	const built = buildDiscoverSourceDraft({ title: "Netflix AU Horror 7+ since 2020", mediaType: "MOVIE", filters });
	assert.equal(built.ok, true, JSON.stringify(built.errors));
	assert.equal(discoverSourceIdentity(built.draft.editable).comparable, true);
	assert.deepEqual(discoverSourceIdentity(built.draft.editable).value.filters, {
		releaseDateGte: "2020-01-01",
		voteAverageGte: 7,
		watchRegion: "AU",
		withGenres: "27",
		withWatchProviders: "8",
	});
});

test("custom imported sources remain preservable without being mistaken for canonical", () => {
	const custom = source({
		title: null,
		sortBy: "custom_rank.desc",
		tmdbId: 999,
		filters: { withGenres: "28,12|35", futureFilter: { mode: "experimental" } },
		sortHow: "descending",
	});
	const inspected = inspectDiscoverSource(custom);
	assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.PRESERVABLE);
	assert.equal(inspected.capabilities.comparisonSafe, true);
	assert.ok(inspected.reasons.includes("NONCANONICAL_TITLE"));
	assert.ok(inspected.reasons.includes("NONCANONICAL_SORT"));
	assert.ok(inspected.reasons.includes("NONCANONICAL_TMDB_ID"));
	assert.ok(inspected.reasons.includes("UNKNOWN_DISCOVER_FILTER"));
	assert.ok(inspected.reasons.includes("NONCANONICAL_SOURCE_FIELDS"));
	assert.equal(inspected.capabilities.editReadiness, DISCOVER_EDIT_READINESS.PRESERVE_ONLY);
	assert.deepEqual(inspected.capabilities.unsafeKnownFields, ["withGenres"]);
});

test("non-DISCOVER and invalid-media sources are not classified as native DISCOVER", () => {
	for (const candidate of [
		null,
		source({ provider: "addon" }),
		source({ tmdbSourceType: "COMPANY" }),
		source({ mediaType: "BOTH" }),
	]) {
		const inspected = inspectDiscoverSource(candidate);
		assert.equal(inspected.classification, DISCOVER_CLASSIFICATIONS.NOT_NATIVE);
		assert.equal(inspected.capabilities.comparisonSafe, false);
	}
});
