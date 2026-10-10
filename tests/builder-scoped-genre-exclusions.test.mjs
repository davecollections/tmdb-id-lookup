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

function sourceRequest(sources, genreNames = ["Horror"]) {
	return { sourceInternalIds: sources.map((source) => source.internalId), genreNames };
}

test("Source-ID requests are a strict union with dense arrays and unchanged Genre validation", () => {
	const project = projectFor([native("COMPANY")]), sources = project.collections[0].folders[0].sources;
	const valid = sourceRequest(sources), legacy = requestFor(project);
	const inheritedHole = Array(1);
	Object.setPrototypeOf(inheritedHole, Object.assign(Object.create(Array.prototype), { 0: sources[0].internalId }));
	const badRequests = [
		{ ...valid, scope: legacy.scope }, { ...valid, extra: true },
		{ sourceInternalIds: valid.sourceInternalIds }, { genreNames: ["Horror"] },
		{ selection: { sourceInternalIds: valid.sourceInternalIds }, genreNames: ["Horror"] },
		{ ...valid, emptyContainerInternalIds: [] },
		...[null, {}, "source", 3, [null], [1], [""], [undefined], Array(1), inheritedHole, [sources[0].internalId, ,]]
			.map((sourceInternalIds) => ({ ...valid, sourceInternalIds })),
		...[null, {}, "Horror", [], [27], [""], [undefined], ["Horror", "Horror"], ["Musicals"], Array(1), ["Horror", ,]]
			.map((genreNames) => ({ ...valid, genreNames })),
		...[null, {}, { ...legacy.scope, nodeType: "source" }, { ...legacy.scope, extra: true }]
			.map((scope) => ({ ...legacy, scope })),
	];
	for (const request of badRequests) {
		const result = planScopedGenreExclusions(project, request);
		assert.equal(result.ok, false, JSON.stringify(request));
		assert.equal(result.errors[0].code, "INVALID_SCOPED_GENRE_REQUEST");
		assert.equal(Object.hasOwn(result, "outcomes"), false);
	}
	assert.equal(planScopedGenreExclusions(project, valid).ok, true);
});

test("every supplied ID must be a physical Source, even with valid targets alongside it", () => {
	const project = projectFor([native("COMPANY")], [{ id: "legacy", title: "Legacy",
		catalogSources: [{ addonId: "legacy", type: "movie", id: "projection" }] }]);
	const source = project.collections[0].folders[0].sources[0], before = structuredClone(project);
	for (const invalid of ["missing", "projection", project.internalId, project.collections[0].internalId,
		project.collections[0].folders[0].internalId, project.collections[0].folders[1].internalId]) {
		const result = planScopedGenreExclusions(project, { sourceInternalIds: [source.internalId, invalid], genreNames: ["Horror"] });
		assert.equal(result.ok, false);
		assert.equal(result.errors[0].code, "SCOPED_GENRE_SOURCE_MISSING");
		assert.equal(Object.hasOwn(result, "outcomes"), false);
	}
	assert.deepEqual(project, before);
});

test("ambiguous or malformed project structure fails before any selected Source planning", () => {
	const edits = [
		(p) => { p.collections[0].folders[1].sources[0].internalId = p.collections[0].folders[0].sources[0].internalId; },
		(p) => { p.collections[0].folders[1].internalId = p.collections[0].internalId; },
		(p) => { p.collections[0].folders[1].sources[0].internalId = ""; },
		(p) => { p.collections[0].folders[1].sources[0].nodeType = "folder"; },
		(p) => { p.collections[0].folders[1].nodeType = "source"; },
		(p) => { p.collections[0].nodeType = "folder"; },
		(p) => { p.collections[0].folders[1].sources = null; },
		(p) => { p.collections[0].folders = {}; },
		(p) => { p.collections = Array(1); },
	];
	for (const edit of edits) {
		const project = projectFor([native("COMPANY")], [{ id: "other", title: "Unselected", sources: [native("COMPANY")] }]);
		const request = sourceRequest(project.collections[0].folders[0].sources);
		edit(project);
		for (const sourceInternalIds of [request.sourceInternalIds, []]) {
			const result = planScopedGenreExclusions(project, { ...request, sourceInternalIds });
			assert.equal(result.ok, false);
			assert.equal(result.errors[0].code, "INVALID_SCOPED_GENRE_PROJECT");
		}
	}
});

test("mixed membership deduplicates across Collections and Folders in physical hierarchy order", () => {
	let sequence = 0;
	const imported = importNuvioCollections(["Discover", "Decades", "Genres"].map((title, c) => ({
		id: "c-" + c, title, folders: [0, 1].map((f) => ({ id: "f-" + c + f, title: "Same Folder",
			sources: [0, 1].map((s) => ({ ...native("COMPANY"), tmdbId: 1 + c * 10 + f * 2 + s })) })),
	})), { idFactory: () => "multi-" + ++sequence });
	assert.equal(imported.ok, true);
	const project = imported.project;
	project.collections[2].folders[0].sources[1].category = "opaque";
	const all = project.collections.flatMap((c) => c.folders.flatMap((f) => f.sources));
	const chosen = [...all.slice(0, 8), all[9], all[10]];
	const request = sourceRequest([...chosen].reverse().concat(chosen[0], chosen[9]));
	const before = structuredClone(project), plan = planScopedGenreExclusions(project, request);
	assert.equal(plan.ok, true);
	assert.equal(Object.hasOwn(plan, "scope"), false);
	assert.deepEqual(Object.keys(plan).sort(), ["ok", "errors", "sourceInternalIds", "genreNames", "totals", "outcomes", "duplicateGroups"].sort());
	assert.deepEqual(plan.sourceInternalIds, chosen.map((s) => s.internalId));
	assert.deepEqual(plan.outcomes.map((row) => row.sourceInternalId), plan.sourceInternalIds);
	assert.deepEqual(plan.totals, { inspected: 10, changed: 9, unchanged: 0, skipped: 1 });
	assert.equal(plan.outcomes[8].reason.code, "UNSUPPORTED_SOURCE");
	const next = applyPlan(project, plan);
	assert.equal(next.collections[2].folders[0].sources[0], all[8]);
	assert.equal(next.collections[2].folders[1].sources[1], all[11]);
	assert.deepEqual(project, before);
});

test("Source-ID and legacy whole-scope reviews have identical outcomes without extra legacy fields", () => {
	const project = projectFor([native("COMPANY"), native("NETWORK", "TV"), native("LIST")],
		[{ id: "other", title: "Other", sources: [native("COMPANY")] }]);
	for (const folder of [false, true]) {
		const legacy = planScopedGenreExclusions(project, requestFor(project, ["Comedy", "Horror"], folder));
		const sources = folder ? project.collections[0].folders[0].sources : project.collections[0].folders.flatMap((f) => f.sources);
		const multi = planScopedGenreExclusions(project, sourceRequest([...sources].reverse(), ["Horror", "Comedy"]));
		const { scope, ...oldRest } = legacy, { sourceInternalIds, ...newRest } = multi;
		assert.deepEqual(newRest, oldRest);
		assert.deepEqual(scope, requestFor(project, ["Comedy", "Horror"], folder).scope);
		assert.equal(Object.hasOwn(legacy, "sourceInternalIds"), false);
		assert.deepEqual(sourceInternalIds, sources.map((s) => s.internalId));
	}
});

test("empty Source-ID selection is a detached zero-outcome plan", () => {
	const project = projectFor([native("COMPANY")]), request = { sourceInternalIds: [], genreNames: ["Horror"] };
	const plan = planScopedGenreExclusions(project, request);
	assert.equal(plan.ok, true);
	assert.deepEqual(plan.sourceInternalIds, []);
	assert.notEqual(plan.sourceInternalIds, request.sourceInternalIds);
	assert.deepEqual(plan.outcomes, []);
	assert.deepEqual(plan.duplicateGroups, []);
	assert.deepEqual(plan.totals, { inspected: 0, changed: 0, unchanged: 0, skipped: 0 });
	assert.equal(applyPlan(project, plan), project);
});

for (const selectedIndices of [[0], [0, 1], [0, 2], [0, 1, 2, 3]]) {
	test("all changed selected members lose to final identities; unselected blockers stay outside outcomes: " + selectedIndices, () => {
		const project = projectFor([
			native("COMPANY"), native("COMPANY", "MOVIE", { withoutGenres: "16" }),
			native("COMPANY", "MOVIE", { withoutGenres: "16,35" }),
			native("COMPANY", "MOVIE", { withoutGenres: "16,35" }),
		]);
		const sources = project.collections[0].folders[0].sources, before = structuredClone(project);
		const plan = planScopedGenreExclusions(project, sourceRequest(selectedIndices.map((i) => sources[i]), ["Animation", "Comedy"]));
		assert.equal(plan.ok, true);
		assert.equal(plan.totals.changed, 0);
		assert.equal(plan.totals.inspected, selectedIndices.length);
		assert.equal(plan.outcomes[0].reason.code, "DUPLICATE_CONVERGENCE");
		assert.deepEqual(plan.duplicateGroups[0].sourceInternalIds, sources.map((s) => s.internalId).filter((_, i) => i !== 1 || selectedIndices.includes(1)));
		assert.deepEqual(plan.outcomes.map((r) => r.sourceInternalId), selectedIndices.map((i) => sources[i].internalId));
		assert.equal(applyPlan(project, plan), project);
		assert.deepEqual(project, before);
	});
}

test("candidate-only convergence has no winner and unchanged duplicates remain", () => {
	const project = projectFor([native("COMPANY"), native("COMPANY", "MOVIE", { withoutGenres: "16" })]);
	const plan = planScopedGenreExclusions(project, sourceRequest(project.collections[0].folders[0].sources, ["Animation", "Comedy"]));
	assert.equal(plan.totals.skipped, 2);
	assert.ok(plan.outcomes.every((row) => row.reason.code === "DUPLICATE_CONVERGENCE"));
	const duplicates = projectFor([native("COMPANY", "MOVIE", { withoutGenres: "27" }), native("COMPANY", "MOVIE", { withoutGenres: "27" })]);
	const unchanged = planScopedGenreExclusions(duplicates, sourceRequest(duplicates.collections[0].folders[0].sources));
	assert.equal(unchanged.totals.unchanged, 2);
	assert.deepEqual(unchanged.duplicateGroups, []);
	assert.equal(applyPlan(duplicates, unchanged), duplicates);
});

test("other Folders and non-comparable unselected siblings do not acquire guessed identities", () => {
	const opaque = { provider: "community", catalogId: "opaque", metadata: { keep: true } };
	const project = projectFor([native("COMPANY"), opaque, native("COMPANY", "MOVIE", null)], [{
		id: "elsewhere", title: "Other", sources: [native("COMPANY", "MOVIE", { withoutGenres: "27" })],
	}]);
	const sources = project.collections[0].folders[0].sources;
	const plan = planScopedGenreExclusions(project, sourceRequest([sources[0]]));
	assert.deepEqual(plan.totals, { inspected: 1, changed: 1, unchanged: 0, skipped: 0 });
	assert.deepEqual(plan.duplicateGroups, []);
	const next = applyPlan(project, plan);
	assert.equal(next.collections[0].folders[0].sources[1], sources[1]);
	assert.equal(next.collections[0].folders[0].sources[2], sources[2]);
	assert.equal(next.collections[0].folders[1], project.collections[0].folders[1]);
});

test("all selection subsets retain final collision invariants across exclusion combinations", () => {
	const possibilities = ["", "16", "35", "16,35", "35,16"];
	for (const a of possibilities) for (const b of possibilities) for (const c of possibilities) for (let mask = 1; mask < 8; mask++) {
		const project = projectFor([a, b, c].map((withoutGenres) => native("COMPANY", "MOVIE", { withoutGenres })));
		const sources = project.collections[0].folders[0].sources;
		const plan = planScopedGenreExclusions(project, sourceRequest(sources.filter((_, i) => mask & (1 << i)), ["Animation", "Comedy"]));
		assert.equal(plan.ok, true);
		const next = applyPlan(project, plan), finalSources = next.collections[0].folders[0].sources;
		const keys = finalSources.map((s) => sourceEditorFor(s).duplicateKey(s));
		for (const row of plan.outcomes.filter((r) => r.status === "changed")) {
			assert.equal(keys.filter((key) => key === row.proposedIdentity).length, 1);
		}
		sources.forEach((source, i) => { if (!(mask & (1 << i))) assert.equal(finalSources[i], source); });
	}
});

test("the collision routine revisits restored originals and revokes each selected candidate once", async () => {
	// Isolate the actual private routine for a synthetic identity graph. No Nuvio
	// filter semantics or external responses are substituted in planner tests.
	const { readFileSync } = await import("node:fs"), { runInNewContext } = await import("node:vm");
	const moduleText = readFileSync(new URL("../builder/src/source-edit/scoped-genre-exclusions.js", import.meta.url), "utf8");
	const start = moduleText.indexOf("function resolveFolderCollisions("), end = moduleText.indexOf("\n/**", start);
	assert.ok(start > 0 && end > start);
	const resolve = runInNewContext(moduleText.slice(start, end) + "\nresolveFolderCollisions",
		{ reason: (code, message) => ({ code, message }) });
	const candidate = (id, originalIdentity, proposedIdentity) => ({ sourceInternalId: id, folderInternalId: "folder",
		originalIdentity, proposedIdentity, status: "changed", beforeExclusions: "original", afterExclusions: "proposed", patch: {} });
	const a = candidate("a", "A", "B"), b = candidate("b", "B", "C");
	const blocker = Object.freeze({ sourceInternalId: "unselected", originalIdentity: "C" });
	const groups = [], revocations = new Map();
	for (const row of [a, b]) {
		let status = row.status;
		Object.defineProperty(row, "status", { get: () => status, set(value) {
			if (value === "skipped") revocations.set(row.sourceInternalId, (revocations.get(row.sourceInternalId) ?? 0) + 1);
			status = value;
		} });
	}
	resolve([a, b, blocker], groups);
	assert.deepEqual([a.status, b.status], ["skipped", "skipped"]);
	assert.deepEqual([...groups[0].sourceInternalIds], ["b", "unselected"]);
	assert.deepEqual([...groups[1].sourceInternalIds], ["a", "b"]);
	assert.deepEqual([...revocations.values()], [1, 1]);
	for (const row of [a, b]) {
		assert.equal(row.patch, null);
		assert.equal(row.afterExclusions, row.beforeExclusions);
	}
	assert.deepEqual(blocker, { sourceInternalId: "unselected", originalIdentity: "C" });
});

test("multi-target serialization retains overlays, mirrors, parent presentation and every unselected value", () => {
	let project = projectFor([
		{ ...native("COMPANY", "MOVIE", { withoutGenres: "99", without_genres: "99", voteCountGte: "40", inactive: null }),
			id: "raw-a", title: "Exact", metadata: { retain: [null, false, 7] } },
		native("COMPANY", "MOVIE", { withGenres: "27|18" }),
		native("COMPANY", "MOVIE", { withoutGenres: "27", without_genres: "35" }),
		native("NETWORK", "TV"),
		{ ...native("COMPANY"), tmdbId: 999 },
	], [{ id: "outside", title: "Other", tileShape: "WIDE", sources: [{ ...native("COMPANY"), tmdbId: 800 }] }]);
	const originals = project.collections[0].folders[0].sources;
	project = updateEditableValuesMany(project, [{ internalId: originals[0].internalId, editablePatch: { filters: {
		...originals[0].editable.filters, withoutGenres: "16,99", without_genres: "16,99", voteCountGte: "60",
	} } }]);
	project.collections[0].editable.viewMode = "ROWS";
	const before = structuredClone(project), expected = structuredClone(serialized(project));
	const plan = planScopedGenreExclusions(project, sourceRequest(project.collections[0].folders[0].sources.slice(0, 4)));
	assert.deepEqual(plan.totals, { inspected: 4, changed: 1, unchanged: 1, skipped: 2 });
	assert.equal(plan.outcomes[1].reason.code, "INCLUDED_GENRE_CONFLICT");
	assert.equal(plan.outcomes[3].reason.code, "MEDIA_INAPPLICABLE");
	expected[0].folders[0].sources[0].filters.withoutGenres = "16,99,27";
	expected[0].folders[0].sources[0].filters.without_genres = "16,99,27";
	const next = applyPlan(project, plan);
	assert.deepEqual(serialized(next), expected);
	assert.deepEqual(project, before);
	assert.equal(next.collections[0].editable, project.collections[0].editable);
	assert.equal(next.collections[0].folders[0].editable, project.collections[0].folders[0].editable);
	assert.equal(next.collections[0].folders[0].sources[0].rawImported, originals[0].rawImported);
	assert.equal(next.collections[0].folders[0].sources[4], originals[4]);
	assert.equal(next.collections[0].folders[1], project.collections[0].folders[1]);
});

test("new-form targeting retains all supported family and official media mapping policies", () => {
	for (const [label, , source] of supported) {
		const project = projectFor([source]), request = sourceRequest(project.collections[0].folders[0].sources, ["Comedy"]);
		const multi = planScopedGenreExclusions(project, request);
		const legacy = planScopedGenreExclusions(project, requestFor(project, ["Comedy"]));
		assert.deepEqual(multi.outcomes, legacy.outcomes, label);
	}
	for (const concept of GENRE_CONCEPTS) for (const media of ["MOVIE", "TV"]) {
		const project = projectFor([native("COMPANY", media)]);
		const plan = planScopedGenreExclusions(project, sourceRequest(project.collections[0].folders[0].sources, [concept.name]));
		const id = media === "TV" ? concept.tvId : concept.movieId;
		assert.equal(plan.outcomes[0].status, id === null ? "unchanged" : "changed");
		assert.equal(plan.outcomes[0].patch?.filters.withoutGenres ?? null, id === null ? null : String(id));
	}
});

test("large selected sets include many unselected siblings with bounded membership reads", () => {
	const project = projectFor(Array.from({ length: 2400 }, (_, i) => ({ ...native("COMPANY"), tmdbId: i + 1 })));
	const folder = project.collections[0].folders[0], sources = folder.sources, chosen = sources.filter((_, i) => i % 2 === 0);
	let reads = 0;
	Object.defineProperty(folder, "sources", { get() { reads += 1; return sources; }, enumerable: true });
	const plan = planScopedGenreExclusions(project, sourceRequest([...chosen].reverse().concat(chosen)));
	assert.deepEqual(plan.totals, { inspected: 1200, changed: 1200, unchanged: 0, skipped: 0 });
	assert.deepEqual(plan.sourceInternalIds, chosen.map((s) => s.internalId));
	assert.ok(reads <= 2, "the project must not be rescanned per selected or unselected sibling");
});

test("large unselected blocker groups are disclosed once without inflating selected totals", () => {
	const project = projectFor([native("COMPANY"), ...Array.from({ length: 1200 }, () => native("COMPANY", "MOVIE", { withoutGenres: "27" }))]);
	const sources = project.collections[0].folders[0].sources, plan = planScopedGenreExclusions(project, sourceRequest([sources[0]]));
	assert.deepEqual(plan.totals, { inspected: 1, changed: 0, unchanged: 0, skipped: 1 });
	assert.equal(plan.duplicateGroups.length, 1);
	assert.equal(plan.duplicateGroups[0].sourceInternalIds.length, 1201);
	assert.deepEqual(plan.sourceInternalIds, [sources[0].internalId]);
	assert.equal(applyPlan(project, plan), project);
});
