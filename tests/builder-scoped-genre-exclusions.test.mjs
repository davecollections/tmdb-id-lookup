import assert from "node:assert/strict";
import test from "node:test";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { updateEditableValuesMany } from "../builder/src/domain/operations.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { planScopedGenreExclusions } from "../builder/src/source-edit/scoped-genre-exclusions.js";
import { sourceEditorFor } from "../builder/src/source-edit/source-editors.js";
import { GENRE_CONCEPTS } from "../builder/src/source-add/genre-catalogue.js";

const native = (type = "DISCOVER", mediaType = "MOVIE", filters = {}) => ({
	provider: "tmdb", tmdbSourceType: type, mediaType, sortBy: "popularity.desc",
	tmdbId: type === "DISCOVER" ? null : 7, filters,
});
function projectFor(sources, extraFolders = []) {
	let id = 0;
	const result = importNuvioCollections([{ id: "c", title: "Collection", folders: [
		{ id: "f", title: "Folder", sources }, ...extraFolders,
	] }], { idFactory: () => "local-" + ++id });
	assert.equal(result.ok, true);
	return result.project;
}
function requestFor(project, genreNames = ["Horror"], folder = false) {
	return { scope: { nodeType: folder ? "folder" : "collection",
		internalId: folder ? project.collections[0].folders[0].internalId : project.collections[0].internalId }, genreNames };
}
function planFor(sources, names = ["Horror"]) {
	const project = projectFor(sources);
	const before = structuredClone(project);
	const plan = planScopedGenreExclusions(project, requestFor(project, names));
	assert.equal(plan.ok, true, JSON.stringify(plan.errors));
	assert.deepEqual(project, before, "planning must not mutate mutable domain input");
	assert.equal(plan.totals.changed + plan.totals.unchanged + plan.totals.skipped, plan.totals.inspected);
	return { project, plan };
}
function applyPlan(project, plan) {
	return updateEditableValuesMany(project, plan.outcomes.filter((row) => row.status === "changed")
		.map((row) => ({ internalId: row.sourceInternalId, editablePatch: row.patch })));
}
function serialized(project) {
	const result = serializeNuvioProject(project);
	assert.equal(result.ok, true, JSON.stringify(result.errors));
	return result.value;
}

const supported = [
	["Studio Movie", "studio", native("COMPANY")],
	["Studio TV", "studio", native("COMPANY", "TV")],
	["Network TV", "network", native("NETWORK", "TV")],
	["Genre Movie", "genre", native("DISCOVER", "MOVIE", { withGenres: "18" })],
	["Genre TV", "genre", native("DISCOVER", "TV", { withGenres: "18" })],
	["Decade Movie", "decade", native("DISCOVER", "MOVIE", { releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" })],
	["Year TV", "decade", native("DISCOVER", "TV", { releaseDateGte: "2001-01-01", releaseDateLte: "2001-12-31" })],
	["Genre decade", "decade", native("DISCOVER", "MOVIE", { withGenres: "18", releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" })],
	["Streaming Movie", "streaming", native("DISCOVER", "MOVIE", { watchRegion: "AU", withWatchProviders: "8" })],
	["Streaming TV", "streaming", native("DISCOVER", "TV", { watchRegion: "AU", withWatchProviders: "8" })],
	["Overlapping anchors", "advanced-discover", native("DISCOVER", "MOVIE", { withGenres: "18", watchRegion: "AU", withWatchProviders: "8" })],
	["Full Discover", "advanced-discover", native("DISCOVER", "MOVIE", { withGenres: "18|80", withKeywords: "11|12" })],
	["Empty Discover", "advanced-discover", native()],
];
for (const [label, adapterId, source] of supported) test("eligible " + label, () => {
	const { project, plan } = planFor([source], ["Comedy"]);
	assert.equal(sourceEditorFor(project.collections[0].folders[0].sources[0])?.id, adapterId);
	assert.equal(plan.outcomes[0].adapterId, adapterId);
	assert.equal(plan.outcomes[0].status, "changed", JSON.stringify(plan.outcomes[0].reason));
	const expected = structuredClone(serialized(project));
	expected[0].folders[0].sources[0].filters.withoutGenres = "35";
	assert.deepEqual(serialized(applyPlan(project, plan)), expected);
});

for (const source of [
	native("PERSON"), native("DIRECTOR", "TV"), native("COLLECTION"), native("LIST"),
	{ provider: "trakt", traktListId: "12", mediaType: "MOVIE", sortBy: "rank", sortHow: "asc", filters: { withoutGenres: "27" } },
	{ provider: "community", type: "movie", catalogId: "local", extra: { keep: true } },
	{ provider: "tmdb", tmdbSourceType: "NEW_KIND", mediaType: "MOVIE" },
	{ ...native("COMPANY"), tmdbId: 0 }, { ...native(), tmdbId: 12 },
	native("NETWORK", "MOVIE"), native("COMPANY", "BOTH"),
]) test("unsupported configuration stays intact: " + JSON.stringify(source), () => {
	const { project, plan } = planFor([source]);
	assert.equal(plan.outcomes[0].status, "skipped");
	assert.equal(plan.outcomes[0].patch, null);
	assert.equal(applyPlan(project, plan), project);
});

test("all official concepts map only to their media identities", () => {
	for (const concept of GENRE_CONCEPTS) for (const media of ["MOVIE", "TV"]) {
		const { plan } = planFor([native("COMPANY", media)], [concept.name]);
		const id = media === "TV" ? concept.tvId : concept.movieId;
		assert.equal(plan.outcomes[0].status, id === null ? "unchanged" : "changed", concept.name + media);
		assert.equal(plan.outcomes[0].patch?.filters.withoutGenres ?? null, id === null ? null : String(id));
	}
});
test("deterministic additions retain existing order and exact media notes", () => {
	const { plan } = planFor([native("COMPANY", "MOVIE", { withoutGenres: "99,16" }), native("NETWORK", "TV")],
		["Horror", "Comedy", "Action & Adventure"]);
	assert.equal(plan.outcomes[0].afterExclusions, "99,16,35,27");
	assert.equal(plan.outcomes[1].afterExclusions, "10759,35");
	assert.deepEqual(plan.outcomes[0].inapplicableGenres, ["Action & Adventure"]);
	assert.deepEqual(plan.outcomes[1].inapplicableGenres, ["Horror"]);
});
for (const withGenres of ["27", "27,18", "27|18"]) test("whole Source conflict: " + withGenres, () => {
	const { plan } = planFor([native("DISCOVER", "MOVIE", { withGenres })], ["Horror", "Comedy"]);
	assert.equal(plan.outcomes[0].reason.code, "INCLUDED_GENRE_CONFLICT");
	assert.deepEqual(plan.outcomes[0].conflictingGenres, ["Horror"]);
	assert.equal(plan.outcomes[0].patch, null);
});

for (const filters of [
	null, [], "genres", 5,
	{ withoutGenres: "27|35" }, { withoutGenres: "27,27" }, { withoutGenres: "027" },
	{ withoutGenres: "0" }, { withoutGenres: "-1" }, { withoutGenres: "2147483648" },
	{ withoutGenres: "999999" }, { withoutGenres: "10759" },
	{ withoutGenres: "27,35|18" }, { withoutGenres: " " }, { withoutGenres: " 27" },
	{ withoutGenres: 27 }, { withoutGenres: [27] }, { withoutGenres: {} },
	{ withGenres: "27", withoutGenres: "27" }, { withGenres: "018" },
	{ without_genres: "27" }, { withoutGenres: "35", without_genres: "27" },
	{ with_genres: "18" }, { withGenres: "18", with_genres: "27" },
	{ mystery: true }, { mystery: [] }, { voteCountGte: -1 }, { voteAverageGte: "9", voteAverageLte: "3" },
	{ withKeywords: "1,1" }, { withoutCompanies: "1|2" }, { withNetworks: "3" },
	{ withWatchProviders: "8" }, { withOriginCountry: "au" }, { year: 2020, releaseDateGte: "2021-01-01" },
	{ sortBy: "vote_count.desc" },
]) test("unsafe imported filters remain preserved: " + JSON.stringify(filters), () => {
	const { project, plan } = planFor([native("COMPANY", "MOVIE", filters)]);
	assert.equal(plan.outcomes[0].status, "skipped", JSON.stringify(plan.outcomes[0]));
	assert.equal(plan.outcomes[0].patch, null);
	assert.equal(applyPlan(project, plan), project);
	assert.deepEqual(project.collections[0].folders[0].sources[0].rawImported.filters, filters);
});

test("unknown inactive placeholders, supported pipe keywords and imported sort survive actual serialization", () => {
	const source = { ...native("COMPANY", "MOVIE", {
		withGenres: "18|80", with_genres: "18|80", withoutGenres: "99,16", without_genres: "99,16",
		voteCountGte: "120", "vote_count.gte": "120", voteAverageGte: "6.0", voteAverageLte: 9,
		"vote_average.gte": "6.0", withOriginalLanguage: "en", withOriginCountry: "AU",
		releaseDateGte: "2020-01-01", releaseDateLte: "2020-12-31", year: "2020",
		withKeywords: "1|2", withoutKeywords: "3|4", mystery: null, inactive: "",
	}), id: "source-raw-id", title: "Exact title", sortBy: "preserved.custom.order", unknown: { nested: [null, true, 3] } };
	const project = projectFor([source, { provider: "community", type: "movie", catalogId: "kept" }], [
		{ id: "outside", title: "Other", sources: [native("COMPANY")] },
	]);
	project.collections[0].editable.viewMode = "ROWS";
	project.collections[0].folders[0].rawImported.catalogSources = [{ addonId: "local", type: "movie", id: "opaque" }];
	const before = structuredClone(project);
	const expected = structuredClone(serialized(project));
	const plan = planScopedGenreExclusions(project, requestFor(project, ["Horror", "Comedy"], true));
	assert.equal(plan.totals.changed, 1, JSON.stringify(plan));
	const next = applyPlan(project, plan);
	expected[0].folders[0].sources[0].filters.withoutGenres = "99,16,35,27";
	expected[0].folders[0].sources[0].filters.without_genres = "99,16,35,27";
	assert.deepEqual(serialized(next), expected, "only the owned native value and equivalent mirror change");
	assert.deepEqual(project, before);
	assert.equal(next.collections[0].folders[0].sources[0].rawImported, project.collections[0].folders[0].sources[0].rawImported);
	assert.equal(next.collections[0].folders[1], project.collections[0].folders[1]);
});

for (const type of ["DISCOVER", "COMPANY", "NETWORK"]) test("equivalent mirrors and all other filters serialize unchanged: " + type, () => {
	const source = native(type, "TV", { withGenres: "18", withoutGenres: "99", without_genres: "99",
		"with_genres": "18", withKeywords: "3|4", withoutKeywords: "5|6",
		voteCountGte: "0", voteAverageLte: "8.25", withOriginalLanguage: "en", withOriginCountry: "AU",
		watchRegion: "AU", withWatchProviders: "8", withoutWatchProviders: "9|10",
		releaseDateGte: "2001-01-01", releaseDateLte: "2002-12-31", withNetworks: "213" });
	if (type === "DISCOVER") { source.filters.voteCountGte = 0; source.filters.voteAverageLte = 8.25; }
	const { project, plan } = planFor([source], ["Comedy"]);
	assert.equal(plan.outcomes[0].status, "changed", JSON.stringify(plan.outcomes[0]));
	const expected = structuredClone(serialized(project));
	expected[0].folders[0].sources[0].filters.withoutGenres = "99,35";
	expected[0].folders[0].sources[0].filters.without_genres = "99,35";
	assert.deepEqual(serialized(applyPlan(project, plan)), expected);
});

test("absent filters can initialize; inactive exclusions are not rewritten by no-ops", () => {
	const noFilters = native("COMPANY"); delete noFilters.filters;
	const { plan } = planFor([noFilters]);
	assert.equal(plan.outcomes[0].afterExclusions, "27");
	for (const value of [null, ""]) {
		const { project, plan: empty } = planFor([native("NETWORK", "TV", { withoutGenres: value })]);
		assert.equal(empty.outcomes[0].reason.code, "MEDIA_INAPPLICABLE");
		assert.equal(applyPlan(project, empty), project);
	}
	const { plan: already } = planFor([native("COMPANY", "MOVIE", { withoutGenres: "27" })]);
	assert.equal(already.outcomes[0].reason.code, "ALREADY_EXCLUDED");
});

test("final-set convergence skips all changed members, preserves pre-existing duplicates, and ignores other Folders", () => {
	const sources = [
		native("COMPANY", "MOVIE", { withoutGenres: "16" }),
		native("COMPANY"),
		native("COMPANY", "MOVIE", { withoutGenres: "16,35" }),
		native("COMPANY", "MOVIE", { withoutGenres: "16,35" }),
		{ ...native("COMPANY"), tmdbId: 8 },
	];
	const project = projectFor(sources, [{ id: "other", title: "Same", sources: [{ ...native("COMPANY", "MOVIE", { withoutGenres: "16,35" }), tmdbId: 8 }] }]);
	const plan = planScopedGenreExclusions(project, requestFor(project, ["Animation", "Comedy"], true));
	assert.deepEqual(plan.outcomes.map((row) => row.status), ["skipped", "skipped", "unchanged", "unchanged", "changed"]);
	assert.equal(plan.outcomes[0].reason.code, "DUPLICATE_CONVERGENCE");
	const next = applyPlan(project, plan);
	assert.equal(next.collections[0].folders[0].sources[0], project.collections[0].folders[0].sources[0]);
	assert.equal(next.collections[0].folders[1], project.collections[0].folders[1]);
});
test("candidate-versus-candidate convergence is checked together", () => {
	const { plan } = planFor([native(), native("DISCOVER", "MOVIE", { withoutGenres: "16" })], ["Animation", "Comedy"]);
	assert.deepEqual(plan.outcomes.map((row) => row.reason.code), ["DUPLICATE_CONVERGENCE", "DUPLICATE_CONVERGENCE"]);
});
test("literal exclusion order remains distinct under existing duplicate comparison", () => {
	const { plan } = planFor([native("COMPANY", "MOVIE", { withoutGenres: "16" }), native("COMPANY", "MOVIE", { withoutGenres: "35" })], ["Animation", "Comedy"]);
	assert.equal(plan.totals.changed, 2);
	assert.deepEqual(plan.outcomes.map((row) => row.afterExclusions), ["16,35", "35,16"]);
});
test("final collision invariants hold across all exclusion combinations and Source orders", () => {
	const possibilities = ["", "16", "35", "16,35", "35,16"];
	for (const a of possibilities) for (const b of possibilities) for (const c of possibilities) {
		const { plan } = planFor([a, b, c].map((withoutGenres) => native("COMPANY", "MOVIE", { withoutGenres })), ["Animation", "Comedy"]);
		for (const row of plan.outcomes.filter((entry) => entry.status === "changed")) {
			assert.equal(plan.outcomes.filter((other) => (other.status === "changed" ? other.proposedIdentity : other.originalIdentity) === row.proposedIdentity).length, 1);
		}
	}
});

test("explicit scope excludes sibling folders and legacy-only projections", () => {
	const project = projectFor([native("COMPANY")], [{ id: "other", title: "Folder", sources: [native("COMPANY")] },
		{ id: "legacy", title: "Legacy", catalogSources: [{ addonId: "legacy", type: "movie", id: "a" }] }]);
	const plan = planScopedGenreExclusions(project, requestFor(project, ["Horror"], true));
	assert.equal(plan.totals.inspected, 1);
	const all = planScopedGenreExclusions(project, requestFor(project));
	assert.equal(all.totals.inspected, 2);
	const again = planScopedGenreExclusions(applyPlan(project, all), requestFor(project));
	assert.equal(again.totals.changed, 0);
	assert.equal(again.totals.unchanged, 2);
});
test("empty scope and invalid requests fail closed without arbitrary defaults", () => {
	const project = projectFor([]);
	assert.deepEqual(planScopedGenreExclusions(project, requestFor(project)).totals, { inspected: 0, changed: 0, unchanged: 0, skipped: 0 });
	const valid = requestFor(project);
	for (const bad of [null, {}, { ...valid, patches: [] }, { ...valid, genreNames: [] },
		{ ...valid, genreNames: ["Horror", "Horror"] }, { ...valid, genreNames: ["Musicals"] },
		{ ...valid, genreNames: [27] }, { ...valid, genreNames: Array(1) },
		{ ...valid, scope: { ...valid.scope, nodeType: "source" } },
		{ ...valid, scope: { ...valid.scope, internalId: "missing" } }]) {
		assert.equal(planScopedGenreExclusions(project, bad).ok, false);
	}
	const ambiguous = projectFor([native(), native()]);
	ambiguous.collections[0].folders[0].sources[1].internalId = ambiguous.collections[0].folders[0].sources[0].internalId;
	assert.equal(planScopedGenreExclusions(ambiguous, requestFor(ambiguous)).ok, false);
});
test("large scopes have no cap and use bounded project membership traversal", () => {
	const project = projectFor(Array.from({ length: 1200 }, (_, i) => ({ ...native("COMPANY"), tmdbId: i + 1 })));
	const folder = project.collections[0].folders[0], sources = folder.sources;
	let reads = 0;
	Object.defineProperty(folder, "sources", { get() { reads += 1; return sources; }, enumerable: true });
	const plan = planScopedGenreExclusions(project, requestFor(project));
	assert.equal(plan.totals.changed, 1200);
	assert.ok(reads <= 2, "membership must not be rescanned per Source");
	assert.deepEqual(plan.outcomes.map((row) => row.sourceInternalId), sources.map((source) => source.internalId));
});


test("native fixed entity contradictions are unsafe even when the stored inclusion omits the anchor", () => {
	const { plan } = planFor([native("COMPANY", "MOVIE", { withoutCompanies: "7" })]);
	assert.equal(plan.outcomes[0].reason.code, "INVALID_FILTERS");
});
test("malformed containers and mirrors skip safely across every candidate adapter family", () => {
	for (const [, , source] of supported) for (const filters of [null, [], "raw",
		{ ...source.filters, withoutGenres: "27|35" }, { ...source.filters, without_genres: "27" },
		{ ...source.filters, unknown: { unsafe: true } }]) {
		const { plan } = planFor([{ ...source, filters }], ["Comedy"]);
		assert.equal(plan.totals.skipped, 1);
		assert.equal(plan.totals.changed, 0);
	}
});
test("every supported family retains imported raw extras and non-owned serialized data", () => {
	for (const [label, , original] of supported) {
		const source = { ...original, title: "Preserve " + label, id: "raw-id", extra: { nested: [null, false, 7] },
			filters: { ...original.filters, withoutGenres: "99", without_genres: "99", voteCountGte: 10, inactive: null } };
		const { project, plan } = planFor([source], ["Comedy"]);
		assert.equal(plan.totals.changed, 1, label + JSON.stringify(plan.outcomes[0].reason));
		const expected = structuredClone(serialized(project));
		expected[0].folders[0].sources[0].filters.withoutGenres = "99,35";
		expected[0].folders[0].sources[0].filters.without_genres = "99,35";
		assert.deepEqual(serialized(applyPlan(project, plan)), expected, label);
	}
});
test("existing editable overlays remain authoritative over the untouched raw import", () => {
	let project = projectFor([native("COMPANY", "MOVIE", { withoutGenres: "99", without_genres: "99", voteCountGte: "40" })]);
	const source = project.collections[0].folders[0].sources[0];
	project = updateEditableValuesMany(project, [{ internalId: source.internalId, editablePatch: { filters: {
		...source.editable.filters, withoutGenres: "16", without_genres: "16", voteCountGte: "60",
	} } }]);
	const expected = structuredClone(serialized(project));
	const plan = planScopedGenreExclusions(project, requestFor(project));
	assert.equal(plan.outcomes[0].beforeExclusions, "16");
	expected[0].folders[0].sources[0].filters.withoutGenres = "16,27";
	expected[0].folders[0].sources[0].filters.without_genres = "16,27";
	const next = applyPlan(project, plan);
	assert.deepEqual(serialized(next), expected);
	assert.deepEqual(next.collections[0].folders[0].sources[0].rawImported, source.rawImported);
});
test("large duplicate groups are disclosed once rather than expanded for every member", () => {
	const { plan } = planFor(Array.from({ length: 1200 }, () => native("COMPANY")));
	assert.equal(plan.totals.skipped, 1200);
	assert.equal(plan.duplicateGroups.length, 1);
	assert.equal(plan.duplicateGroups[0].sourceInternalIds.length, 1200);
	assert.ok(plan.outcomes.every((row) => row.duplicateGroupId === plan.duplicateGroups[0].id));
});
