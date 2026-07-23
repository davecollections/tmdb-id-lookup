import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildCompatibilityMatrix,
	MATRIX_PATH,
	serializeCompatibilityMatrix,
} from "../scripts/lib/tmdb-discover-compatibility.mjs";
import { validateNuvioContract } from "./helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manualDir = path.join(rootDir, "manual-tests", "tmdb-discover");
const readText = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const normalizeLineEndings = (value) => value.replaceAll("\r\n", "\n");

const matrixText = normalizeLineEndings(readText(MATRIX_PATH));
const matrix = JSON.parse(matrixText);
const manifest = readJson("manual-tests/tmdb-discover/fixture-manifest.json");
const directPlan = readJson("manual-tests/tmdb-discover/direct-tmdb-test-plan.json");
const ownerResults = readJson("manual-tests/tmdb-discover/owner-results-2026-07-23.json");
const completeAuditRelativePath = `manual-tests/tmdb-discover/${manifest.completeAuditFixture.path}`;
const completeAuditText = normalizeLineEndings(readText(completeAuditRelativePath));
const completeAudit = JSON.parse(completeAuditText);
const oneSourcePerFolderRelativePath = `manual-tests/tmdb-discover/${manifest.oneSourcePerFolderAuditFixture.path}`;
const oneSourcePerFolderText = normalizeLineEndings(readText(oneSourcePerFolderRelativePath));
const oneSourcePerFolderAudit = JSON.parse(oneSourcePerFolderText);

const expectedMovieParameters = [
	"certification", "certification.gte", "certification.lte", "certification_country", "include_adult", "include_video", "language", "page", "primary_release_year", "primary_release_date.gte", "primary_release_date.lte", "region", "release_date.gte", "release_date.lte", "sort_by", "vote_average.gte", "vote_average.lte", "vote_count.gte", "vote_count.lte", "watch_region", "with_cast", "with_companies", "with_crew", "with_genres", "with_keywords", "with_origin_country", "with_original_language", "with_people", "with_release_type", "with_runtime.gte", "with_runtime.lte", "with_watch_monetization_types", "with_watch_providers", "without_companies", "without_genres", "without_keywords", "without_watch_providers", "year",
];

const expectedTvParameters = [
	"air_date.gte", "air_date.lte", "first_air_date_year", "first_air_date.gte", "first_air_date.lte", "include_adult", "include_null_first_air_dates", "language", "page", "screened_theatrically", "sort_by", "timezone", "vote_average.gte", "vote_average.lte", "vote_count.gte", "vote_count.lte", "watch_region", "with_companies", "with_genres", "with_keywords", "with_networks", "with_origin_country", "with_original_language", "with_runtime.gte", "with_runtime.lte", "with_status", "with_watch_monetization_types", "with_watch_providers", "without_companies", "without_genres", "without_keywords", "without_watch_providers", "with_type",
];

const expectedMovieSorts = [
	"original_title.asc", "original_title.desc", "popularity.asc", "popularity.desc", "revenue.asc", "revenue.desc", "primary_release_date.asc", "primary_release_date.desc", "title.asc", "title.desc", "vote_average.asc", "vote_average.desc", "vote_count.asc", "vote_count.desc",
];

const expectedTvSorts = [
	"first_air_date.asc", "first_air_date.desc", "name.asc", "name.desc", "original_name.asc", "original_name.desc", "popularity.asc", "popularity.desc", "vote_average.asc", "vote_average.desc", "vote_count.asc", "vote_count.desc",
];

const knownFilterFields = new Set([
	"withGenres", "releaseDateGte", "releaseDateLte", "voteAverageGte", "voteAverageLte", "voteCountGte", "withOriginalLanguage", "withOriginCountry", "withKeywords", "withCompanies", "withNetworks", "year", "watchRegion", "withWatchProviders",
]);

const expectedOwnerWindowsFilterFields = [
	"withGenres", "releaseDateGte", "releaseDateLte", "voteAverageGte", "voteAverageLte", "voteCountGte", "withOriginalLanguage", "withOriginCountry", "withKeywords", "withCompanies", "withNetworks", "year", "withWatchProviders", "watchRegion",
];

const allowedClassifications = new Set([
	"confirmed-both-clients",
	"code-supported-both-manual-pending",
	"tv-only",
	"mobile-only",
	"client-divergence",
	"transformed-or-defaulted",
	"sort-pass-through",
	"builder-preserved-but-nuvio-ignored",
	"official-tmdb-only",
	"unsupported-or-invalid",
	"needs-manual-evidence",
]);

function sorted(values) {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function allFixtureSources(value) {
	return value.flatMap((collection) => collection.folders.flatMap((folder) => folder.sources));
}

function assertComparatorGraph(records, keyFor, label) {
	const byKey = new Map(records.map((record) => [keyFor(record), record]));
	assert.equal(byKey.size, records.length, `${label} keys must be unique`);
	const states = new Map();

	function visit(key, chain = []) {
		const state = states.get(key);
		assert.notEqual(state, "visiting", `${label} comparator cycle: ${[...chain, key].join(" -> ")}`);
		if (state === "visited") return;
		states.set(key, "visiting");

		const record = byKey.get(key);
		assert.ok(record.compareTo === null || typeof record.compareTo === "string", `${label} ${key} compareTo`);
		if (record.compareTo !== null) {
			assert.ok(byKey.has(record.compareTo), `${label} ${key} missing comparator ${record.compareTo}`);
			visit(record.compareTo, [...chain, key]);
		}

		states.set(key, "visited");
	}

	for (const key of byKey.keys()) visit(key);
	return byKey;
}

test("generated compatibility matrix is current and has exact official counts", () => {
	assert.equal(matrixText, serializeCompatibilityMatrix());
	assert.deepEqual(matrix, buildCompatibilityMatrix());
	assert.equal(matrix.counts.movieOfficialParameters, 38);
	assert.equal(matrix.counts.tvOfficialParameters, 33);
	assert.equal(matrix.counts.endpointSpecificParameterRows, 71);
	assert.equal(matrix.counts.endpointSpecificSortRows, 26);
	assert.equal(matrix.entries.length, 97);

	const parameters = matrix.entries.filter((entry) => entry.recordType === "parameter");
	const sorts = matrix.entries.filter((entry) => entry.recordType === "sort-value");
	assert.deepEqual(parameters.filter((entry) => entry.media === "movie").map((entry) => entry.officialTmdbParameter), expectedMovieParameters);
	assert.deepEqual(parameters.filter((entry) => entry.media === "tv").map((entry) => entry.officialTmdbParameter), expectedTvParameters);
	assert.deepEqual(sorts.filter((entry) => entry.media === "movie").map((entry) => entry.officialSortValue), expectedMovieSorts);
	assert.deepEqual(sorts.filter((entry) => entry.media === "tv").map((entry) => entry.officialSortValue), expectedTvSorts);
});

test("every matrix row has a unique key, classification, and resolvable evidence", () => {
	const keys = matrix.entries.map((entry) => entry.key);
	assert.equal(new Set(keys).size, keys.length);

	for (const entry of matrix.entries) {
		assert.ok(allowedClassifications.has(entry.classification), `${entry.key} classification`);
		assert.ok(entry.sourceReferences.length > 0, `${entry.key} source references`);
		for (const reference of entry.sourceReferences) {
			assert.ok(matrix.sourceReferences[reference], `${entry.key} missing ${reference}`);
		}
		for (const [fieldName, evidenceName, clientPrefix] of [
			[entry.actualNuvioTvJsonField, "nuvioTvEvidence", "nuviotv-"],
			[entry.actualNuvioMobileJsonField, "nuvioMobileEvidence", "nuviomobile-"],
		]) {
			if (fieldName === null) continue;
			assert.ok(fieldName === "sortBy" || knownFilterFields.has(fieldName), `${entry.key} invents ${fieldName}`);
			assert.ok(entry[evidenceName].some((reference) => reference.startsWith(clientPrefix)), `${entry.key} lacks model evidence`);
			for (const reference of entry[evidenceName]) assert.ok(matrix.sourceReferences[reference], `${entry.key} evidence ${reference}`);
		}
		assert.ok(Array.isArray(entry.ownerWindowsEditorEvidence), `${entry.key} owner visual evidence`);
		for (const reference of entry.ownerWindowsEditorEvidence) {
			assert.ok(matrix.sourceReferences[reference], `${entry.key} owner evidence ${reference}`);
			assert.ok(entry.sourceReferences.includes(reference), `${entry.key} owner evidence is not a row source`);
		}
		assert.equal(entry.ownerWindowsEditorVisible, entry.ownerWindowsEditorEvidence.length > 0, entry.key);
		assert.ok(Array.isArray(entry.ownerControlledResultCases), `${entry.key} owner controlled cases`);
		assert.equal(
			entry.sourceReferences.includes("owner-results-2026-07-23"),
			entry.ownerControlledResultCases.length > 0,
			`${entry.key} owner controlled source`,
		);
		if (entry.proposedNuvioJsonField !== null) {
			assert.ok(entry.proposedNuvioJsonField === "sortBy" || knownFilterFields.has(entry.proposedNuvioJsonField));
		}
		assert.equal(entry.builderCurrentlyEditable, false, entry.key);
		assert.equal(entry.builderRoundTripsOnUnrelatedEdit, true, entry.key);
		assert.equal(entry.builderLosesRawEvidenceOnSourceReplacement, true, entry.key);
		if (entry.builderCurrentlyRecognizes) {
			assert.equal(entry.builderImportedRepresentation, "editable-and-rawImported", entry.key);
			assert.equal(entry.builderPreservesUnknownRawValue, null, entry.key);
			assert.equal(entry.builderRecognizedEditCanOverwriteOrClearThisValue, true, entry.key);
		} else {
			assert.equal(entry.builderImportedRepresentation, "rawImported-only", entry.key);
			assert.equal(entry.builderPreservesUnknownRawValue, true, entry.key);
			assert.equal(entry.builderRecognizedEditCanOverwriteOrClearThisValue, false, entry.key);
		}
	}

	const entryByKey = new Map(matrix.entries.map((entry) => [entry.key, entry]));
	assert.ok(entryByKey.get("movie:parameter:with_release_type").sourceReferences.includes("tmdb-region"));
	assert.ok(entryByKey.get("movie:parameter:certification").sourceReferences.includes("tmdb-certifications"));
	assert.ok(entryByKey.get("tv:parameter:timezone").sourceReferences.includes("tmdb-timezones"));
	assert.ok(entryByKey.get("movie:parameter:watch_region").sourceReferences.includes("tmdb-watch-regions"));
	assert.match(entryByKey.get("movie:parameter:with_companies").tvTransformationOrDefault, /COMPANY source forces tmdbId/);
	assert.match(entryByKey.get("tv:parameter:with_networks").mobileTransformationOrDefault, /NETWORK source forces tmdbId/);
	assert.match(entryByKey.get("movie:parameter:with_keywords").priorManualNuvioEvidence, /Historical unpaired Shark Movies/);
	assert.equal(matrix.counts.priorRepositoryManualFilterCases, 1);
	assert.equal("issue47ControlledManualFilterEffects" in matrix.counts, false);
	assert.equal("issue47ControlledManualSortEffects" in matrix.counts, false);

	const ownerEvidence = matrix.ownerSuppliedVisualEvidence.windowsCustomEditor;
	assert.equal(ownerEvidence.sourceReference, "owner-windows-custom-editor-screenshots");
	assert.equal(ownerEvidence.evidenceLevel, "visible-ui-only");
	assert.equal(ownerEvidence.versionPinned, false);
	assert.equal(ownerEvidence.behaviorProven, false);
	assert.deepEqual(ownerEvidence.filterFields, expectedOwnerWindowsFilterFields);
	assert.deepEqual(ownerEvidence.additionalWindowsOnlyFilterFieldsVisible, []);
	assert.deepEqual(ownerEvidence.mediaSourceControls, ["Movies", "Series", "Both"]);
	assert.deepEqual(ownerEvidence.sortChoiceLabels, ["Popular", "Top Rated", "Most Voted", "Recent"]);
	assert.equal(ownerEvidence.quickChipsAreAdditionalFields, false);
	assert.equal(ownerEvidence.movieWithNetworksHelper, "For series only.");
	assert.equal(ownerEvidence.delimiterHelp.withGenres, "comma=AND; pipe=OR");
	assert.equal(ownerEvidence.delimiterHelp.withWatchProviders, "comma=AND; pipe=OR");
	assert.deepEqual(ownerEvidence.placeholderOnlyCommaExamples, ["withOriginalLanguage", "withOriginCountry"]);
	assert.equal(matrix.sourceReferences[ownerEvidence.sourceReference].versionPinned, false);

	const controlledEvidence = matrix.ownerControlledDeviceEvidence;
	assert.equal(controlledEvidence.sourceReference, "owner-results-2026-07-23");
	assert.deepEqual(controlledEvidence.completedRuns.map((run) => [run.client, run.observedSources, run.plannedSources]), [
		["Nuvio Desktop", 29, 29],
		["Retained official Nuvio iOS", 29, 29],
	]);
	assert.deepEqual(controlledEvidence.pendingRuns.map((run) => [run.client, run.observedSources, run.plannedSources]), [
		["NuvioTV", 0, 29],
	]);
	assert.deepEqual(controlledEvidence.nonOfficialOrOffMediaCases, ["D1", "S4", "S6", "S7", "S8"]);
	assert.match(controlledEvidence.completedRuns[1].scope, /not current\/future NuvioMobile proof/);

	const expectedControlledCases = new Map([
		["movie:parameter:vote_count.lte", ["U3"]],
		["movie:parameter:watch_region", ["W2", "A5", "A6"]],
		["movie:parameter:with_cast", ["U4"]],
		["movie:parameter:with_genres", ["M2", "A1", "A2"]],
		["movie:parameter:with_keywords", ["A3", "A4"]],
		["movie:parameter:with_runtime.gte", ["U2"]],
		["movie:parameter:with_watch_providers", ["W1", "W2", "A5", "A6"]],
		["movie:parameter:without_genres", ["U1"]],
		["tv:parameter:with_networks", ["T2"]],
		["tv:parameter:with_status", ["U5"]],
		["tv:parameter:with_type", ["U6"]],
		["movie:sort:original_title.asc", ["S3"]],
		["movie:sort:popularity.desc", ["S1"]],
		["movie:sort:primary_release_date.desc", ["S4C"]],
		["movie:sort:revenue.desc", ["S2"]],
		["tv:sort:first_air_date.desc", ["S6C"]],
		["tv:sort:name.asc", ["S5"]],
	]);
	for (const entry of matrix.entries) {
		assert.deepEqual(entry.ownerControlledResultCases, expectedControlledCases.get(entry.key) ?? [], entry.key);
	}
	const officialRowCases = new Set(matrix.entries.flatMap((entry) => entry.ownerControlledResultCases));
	for (const caseCode of controlledEvidence.nonOfficialOrOffMediaCases) {
		assert.equal(officialRowCases.has(caseCode), false, `${caseCode} must remain a separate manual case`);
	}

	const ownerVisibleFields = new Set(matrix.entries
		.filter((entry) => entry.recordType === "parameter" && entry.ownerWindowsEditorVisible)
		.map((entry) => entry.actualNuvioTvJsonField));
	assert.deepEqual(sorted(ownerVisibleFields), sorted(expectedOwnerWindowsFilterFields));
	assert.equal(matrix.entries.filter((entry) => entry.recordType === "sort-value" && entry.ownerWindowsEditorVisible).length, 8);
	assert.equal(entryByKey.get("movie:parameter:with_genres").supportsCommaAnd, true);
	assert.equal(entryByKey.get("movie:parameter:with_watch_providers").supportsPipeOr, true);
	assert.equal(entryByKey.get("movie:parameter:with_original_language").supportsCommaAnd, false);
	assert.equal(entryByKey.get("movie:parameter:with_origin_country").supportsPipeOr, false);
});

test("media-specific official parameters remain endpoint-specific", () => {
	const movie = new Set(expectedMovieParameters);
	const tv = new Set(expectedTvParameters);
	const shared = new Set([...movie].filter((name) => tv.has(name)));
	assert.equal(shared.size, 22);
	assert.equal([...movie].filter((name) => !shared.has(name)).length, 16);
	assert.equal([...tv].filter((name) => !shared.has(name)).length, 11);

	for (const entry of matrix.entries.filter((item) => item.recordType === "parameter")) {
		if (entry.media === "movie" && !tv.has(entry.officialTmdbParameter)) assert.ok(!entry.key.startsWith("tv:"));
		if (entry.media === "tv" && !movie.has(entry.officialTmdbParameter)) assert.ok(!entry.key.startsWith("movie:"));
	}
});

test("fixtures are valid ordered native TMDB DISCOVER collections without external dependencies", () => {
	let fixtureSourceCount = 0;
	const componentFixtures = [];
	for (const fixtureEntry of manifest.fixtures) {
		const fixturePath = path.join(manualDir, fixtureEntry.path);
		const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
		componentFixtures.push(fixture);
		const validation = validateNuvioContract(fixture, { mode: "canonical" });
		assert.deepEqual(validation.errors, [], fixtureEntry.path);

		const sources = allFixtureSources(fixture);
		fixtureSourceCount += sources.length;
		assert.deepEqual(sources.map((source) => source.title), fixtureEntry.sources.map((source) => source.title));
		for (const collection of fixture) {
			assert.ok(!("backdropImageUrl" in collection));
			for (const folder of collection.folders) {
				assert.deepEqual(folder.catalogSources, []);
				for (const source of folder.sources) {
					assert.equal(source.provider, "tmdb");
					assert.equal(source.tmdbSourceType, "DISCOVER");
					assert.ok(["MOVIE", "TV"].includes(source.mediaType));
					assert.equal("addonId" in source, false);
					assert.equal("traktListId" in source, false);
				}
			}
		}

		const raw = fs.readFileSync(fixturePath, "utf8");
		assert.doesNotMatch(raw, /https?:\/\//i);
		assert.doesNotMatch(raw, /(?:artwork|trakt|addonId|catalogId)/i);
	}
	assert.equal(fixtureSourceCount, manifest.fixtureSourceCount);
	assert.equal(fixtureSourceCount, 29);

	const manifestSources = manifest.fixtures.flatMap((fixture) => fixture.sources);
	assert.equal(manifestSources.filter((source) => source.priority === "essential").length, manifest.essentialSourceCount);
	assert.equal(manifest.essentialSourceCount, 19);
	const manifestSourceByTitle = assertComparatorGraph(manifestSources, (source) => source.title, "fixture manifest");
	for (const source of manifestSources.filter((item) => item.priority === "essential" && item.compareTo !== null)) {
		assert.equal(manifestSourceByTitle.get(source.compareTo).priority, "essential", `${source.title} depends on optional ${source.compareTo}`);
	}
	assert.equal(manifestSourceByTitle.get("S1 Movie UI sort popularity.desc").priority, "essential");
	const componentByTitle = new Map(manifest.fixtures.flatMap((fixture) => fixture.sources.map((source) => [source.title, fixture.path])));
	const crossComponentComparisons = manifestSources
		.filter((source) => source.compareTo !== null && componentByTitle.get(source.title) !== componentByTitle.get(source.compareTo))
		.map((source) => `${source.title} -> ${source.compareTo}`);
	assert.ok(crossComponentComparisons.includes("U1 Movie candidate withoutGenres 27 -> M1 Movie baseline"));
	const manualReadme = readText("manual-tests/tmdb-discover/README.md");
	assert.match(manualReadme, /component alone only for preservation-only observations/i);
	assert.match(manualReadme, /one complete fixture for every cross-component comparison/i);
	assert.match(manualReadme, /essential U1/i);

	assert.deepEqual(manifest.completeAuditFixture.orderedComponentPaths, manifest.fixtures.map((fixture) => fixture.path));
	assert.ok(!manifest.fixtures.some((fixture) => fixture.path === manifest.completeAuditFixture.path));
	assert.equal(manifest.completeAuditFixture.collectionCount, 4);
	assert.equal(manifest.completeAuditFixture.sourceCount, manifest.fixtureSourceCount);
	assert.match(manifest.completeAuditFixture.usage, /Mobile requires the combined fixture whenever compareTo crosses components/i);
	assert.match(manifest.clientImportBehavior.nuvioTv, /upserts collections by collection ID/i);
	assert.match(manifest.clientImportBehavior.nuvioMobile, /one of the two complete fixtures/i);

	const expectedCompleteAudit = componentFixtures.flatMap((fixture) => fixture);
	assert.deepEqual(completeAudit, expectedCompleteAudit);
	assert.equal(completeAuditText, `${JSON.stringify(expectedCompleteAudit, null, 2)}\n`);
	const completeValidation = validateNuvioContract(completeAudit, { mode: "canonical" });
	assert.deepEqual(completeValidation.errors, [], manifest.completeAuditFixture.path);
	assert.equal(completeAudit.length, manifest.completeAuditFixture.collectionCount);

	const collectionIds = completeAudit.map((collection) => collection.id);
	const folderIds = completeAudit.flatMap((collection) => collection.folders.map((folder) => folder.id));
	assert.equal(new Set(collectionIds).size, collectionIds.length);
	assert.equal(new Set(folderIds).size, folderIds.length);
	assert.equal(new Set([...collectionIds, ...folderIds]).size, collectionIds.length + folderIds.length);

	const completeSources = allFixtureSources(completeAudit);
	assert.equal(completeSources.length, 29);
	assert.deepEqual(completeSources.map((source) => source.title), manifestSources.map((source) => source.title));
	for (const collection of completeAudit) {
		assert.ok(!("backdropImageUrl" in collection));
		for (const folder of collection.folders) {
			assert.deepEqual(folder.catalogSources, []);
			for (const source of folder.sources) {
				assert.equal(source.provider, "tmdb");
				assert.equal(source.tmdbSourceType, "DISCOVER");
				assert.equal("addonId" in source, false);
				assert.equal("traktListId" in source, false);
			}
		}
	}
	assert.doesNotMatch(completeAuditText, /https?:\/\//i);
	assert.doesNotMatch(completeAuditText, /(?:artwork|trakt|addonId|catalogId)/i);

	assert.equal(manifest.oneSourcePerFolderAuditFixture.generatedFrom, "completeAuditFixture.orderedComponentPaths");
	assert.equal(manifest.oneSourcePerFolderAuditFixture.collectionCount, 4);
	assert.equal(manifest.oneSourcePerFolderAuditFixture.folderCount, 29);
	assert.equal(manifest.oneSourcePerFolderAuditFixture.sourceCount, 29);
	const sourceCode = (source) => {
		const match = source.title.match(/^([A-Z]\d+C?)\b/);
		assert.ok(match, source.title);
		return match[1].toLowerCase();
	};
	const expectedOneSourcePerFolder = completeAudit.map((collection) => ({
		...collection,
		folders: collection.folders.flatMap((folder) => folder.sources.map((source) => ({
			...folder,
			id: `${folder.id}-${sourceCode(source)}`,
			title: source.title,
			sources: [source],
			catalogSources: [],
		}))),
	}));
	assert.deepEqual(oneSourcePerFolderAudit, expectedOneSourcePerFolder);
	assert.equal(oneSourcePerFolderText, `${JSON.stringify(expectedOneSourcePerFolder, null, 2)}\n`);
	assert.equal(oneSourcePerFolderAudit.length, 4);
	assert.equal(oneSourcePerFolderAudit.flatMap((collection) => collection.folders).length, 29);
	const alternateSources = allFixtureSources(oneSourcePerFolderAudit);
	assert.equal(alternateSources.length, 29);
	assert.deepEqual(alternateSources, completeSources);
	const alternateFolders = oneSourcePerFolderAudit.flatMap((collection) => collection.folders);
	assert.ok(alternateFolders.every((folder) => folder.sources.length === 1));
	assert.ok(alternateFolders.every((folder) => folder.title === folder.sources[0].title));
	assert.ok(alternateFolders.every((folder) => folder.catalogSources.length === 0));
	const alternateFolderIds = alternateFolders.map((folder) => folder.id);
	assert.equal(new Set(alternateFolderIds).size, 29);
	const alternateValidation = validateNuvioContract(oneSourcePerFolderAudit, { mode: "canonical" });
	assert.deepEqual(alternateValidation.errors, [], manifest.oneSourcePerFolderAuditFixture.path);
	assert.doesNotMatch(oneSourcePerFolderText, /https?:\/\//i);
	assert.doesNotMatch(oneSourcePerFolderText, /(?:artwork|trakt|addonId|catalogId)/i);
});

test("results template represents every fixture source exactly once", () => {
	const template = readText("manual-tests/tmdb-discover/RESULTS_TEMPLATE.md").replaceAll("\\|", "|");
	const titles = manifest.fixtures.flatMap((fixture) => fixture.sources.map((source) => source.title));
	for (const title of titles) {
		assert.equal(template.split(title).length - 1, 1, title);
	}
	assert.equal(new Set(titles).size, titles.length);
	assert.match(template, /### S1 Movie UI sort popularity\.desc/);
	assert.doesNotMatch(template, /TV import accepted.*Mobile import accepted/i);
});

test("owner results contain two complete version-scoped runs and exact pipeline evidence", () => {
	assert.equal(ownerResults.evidenceDate, "2026-07-23");
	assert.equal(ownerResults.issue.number, 47);
	assert.equal(ownerResults.contractCountsChanged, false);
	assert.deepEqual(ownerResults.screenshots, {
		suppliedInOwnerConversation: true,
		committed: false,
		note: "Screenshots supported the observations but no screenshot files or paths are committed.",
	});
	assert.equal(ownerResults.completedRuns.length, 2);
	assert.equal(ownerResults.completedRuns.some((run) => /current.*mobile/i.test(run.evidenceScope)), false);

	const manifestSources = manifest.fixtures.flatMap((fixture) => fixture.sources);
	const expectedTitles = manifestSources.map((source) => source.title);
	const titleToCode = new Map(expectedTitles.map((title) => [title, title.match(/^([A-Z]\d+C?)\b/)[1]]));
	const expectedCodes = expectedTitles.map((title) => titleToCode.get(title));
	const expectedCompareCodes = new Map(manifestSources.map((source) => [
		titleToCode.get(source.title),
		source.compareTo === null ? null : titleToCode.get(source.compareTo),
	]));

	for (const run of ownerResults.completedRuns) {
		assert.equal(run.testDate, "2026-07-23");
		assert.equal(run.sourceCount, 29);
		assert.equal(run.observations.length, 29);
		assert.deepEqual(run.observations.map((observation) => observation.code), expectedCodes);
		assert.deepEqual(run.observations.map((observation) => observation.title), expectedTitles);
		assert.equal(new Set(run.observations.map((observation) => observation.code)).size, 29);
		for (const observation of run.observations) {
			assert.equal(observation.compareTo, expectedCompareCodes.get(observation.code), `${run.clientId} ${observation.code}`);
			assert.ok(typeof observation.verdict === "string" && observation.verdict.length > 0);
			assert.ok(typeof observation.confidence === "string" && observation.confidence.length > 0);
			assert.ok(
				observation.visibleResultsRef === null || Array.isArray(ownerResults.resultSets[observation.visibleResultsRef]),
				`${run.clientId} ${observation.code} visible results`,
			);
			if (observation.visibleResultsRef === null) assert.ok(typeof observation.visibleState === "string");
		}
	}

	const desktop = ownerResults.completedRuns[0];
	assert.equal(desktop.clientId, "nuvio-desktop-windows");
	assert.equal(desktop.version, "0.1.14-alpha");
	assert.equal(desktop.build, "14");
	assert.equal(desktop.operatingSystem, "Windows 11 Home 25H2");
	assert.equal(desktop.operatingSystemBuild, "26200.8875");
	assert.deepEqual([desktop.importShape.collectionCount, desktop.importShape.folderCount, desktop.importShape.sourceCount], [4, 4, 29]);
	assert.deepEqual(desktop.exportObservation.unknownNestedFilterFields.affectedCodes, ["U1", "U2", "U3", "U4", "U5", "U6"]);
	assert.equal(desktop.exportObservation.unknownNestedFilterFields.preserved, false);
	assert.equal(desktop.exportObservation.rawSortValuesPreserved, true);

	const retainedIos = ownerResults.completedRuns[1];
	assert.equal(retainedIos.clientId, "retained-official-nuvio-ios");
	assert.equal(retainedIos.version, "1.2.23");
	assert.equal(retainedIos.build, "96");
	assert.match(retainedIos.evidenceScope, /historical-retained-official-build/);
	assert.match(retainedIos.installationContext, /No sideload was used/);
	assert.ok(retainedIos.limitations.some((limitation) => /does not prove current or future NuvioMobile behavior/.test(limitation)));
	assert.deepEqual([
		retainedIos.importShape.auditedFixture.collectionCount,
		retainedIos.importShape.auditedFixture.folderCount,
		retainedIos.importShape.auditedFixture.sourceCount,
	], [4, 29, 29]);
	assert.equal(retainedIos.copyAndExportObservation.unknownNestedFilterFieldsPreserved, true);
	assert.equal(retainedIos.copyAndExportObservation.sourceOrFolderLossObserved, false);
	for (const code of ["U1", "U2", "U3", "U4", "U5", "U6"]) {
		assert.deepEqual(retainedIos.observations.find((item) => item.code === code).notes, [
			"Preserved but not visibly applied on retained official iOS 1.2.23 (96).",
		]);
	}

	const desktopS3 = desktop.observations.find((item) => item.code === "S3");
	const iosS3 = retainedIos.observations.find((item) => item.code === "S3");
	assert.equal(desktopS3.visibleResultsRef, null);
	assert.equal(desktopS3.visibleState, "endless spinner; no content and no error");
	assert.equal(desktopS3.verdict, "desktop-alpha-runtime-failure");
	assert.deepEqual(ownerResults.resultSets[iosS3.visibleResultsRef], [
		"Sr.",
		"Wuthering Heights",
		"#1 Cheerleader Camp",
		"#AnneFrank: Parallel Stories",
		"#Horror",
	]);
	assert.equal(iosS3.nextVisibleTitle, "#Iamhere");
	assert.equal(iosS3.verdict, "visible-sort-order-confirmed");

	assert.deepEqual(ownerResults.pendingRuns.map((run) => [run.clientId, run.sourceCountObserved, run.sourceCountPlanned, run.status]), [
		["nuviotv-device", 0, 29, "pending"],
	]);
	assert.deepEqual(ownerResults.directTmdbResearch, {
		status: "pending",
		plannedRequestCount: 60,
		hardRequestCap: 60,
		liveRequestsSent: 0,
	});

	assert.equal(ownerResults.accountManagementProfileExport.attribution.startsWith("The responsible layer was not isolated"), true);
	assert.deepEqual(ownerResults.accountManagementProfileExport.fieldRemovals, [
		{ code: "W1", removedPaths: ["filters.withWatchProviders"] },
		{ code: "W2", removedPaths: ["filters.watchRegion", "filters.withWatchProviders"] },
		{ code: "A5", removedPaths: ["filters.watchRegion", "filters.withWatchProviders"] },
		{ code: "A6", removedPaths: ["filters.watchRegion", "filters.withWatchProviders"] },
		{ code: "U1", removedPaths: ["filters.withoutGenres"] },
		{ code: "U2", removedPaths: ["filters.withRuntimeGte"] },
		{ code: "U3", removedPaths: ["filters.voteCountLte"] },
		{ code: "U4", removedPaths: ["filters.withCast"] },
		{ code: "U5", removedPaths: ["filters.withStatus"] },
		{ code: "U6", removedPaths: ["filters.withType"] },
	]);
	assert.deepEqual(ownerResults.accountManagementProfileExport.sortChanges, [
		{ code: "S2", from: "revenue.desc", to: "popularity.desc" },
		{ code: "S3", from: "original_title.asc", to: "popularity.desc" },
		{ code: "S5", from: "name.asc", to: "first_air_date.desc" },
		{ code: "S8", from: "definitely_invalid.desc", to: "popularity.desc" },
	]);
	assert.deepEqual(ownerResults.accountManagementProfileExport.sortsRetained, [
		{ code: "S4", value: "first_air_date.desc" },
		{ code: "S4C", value: "primary_release_date.desc" },
		{ code: "S6", value: "primary_release_date.desc" },
		{ code: "S6C", value: "first_air_date.desc" },
		{ code: "S7", value: "original" },
	]);

	const ownerEvidenceText = [
		readText("manual-tests/tmdb-discover/OWNER_RESULTS_2026-07-23.md"),
		readText("manual-tests/tmdb-discover/owner-results-2026-07-23.json"),
	].join("\n");
	assert.doesNotMatch(ownerEvidenceText, /[A-Za-z]:\\|\/Users\/|\/home\//);
	assert.doesNotMatch(ownerEvidenceText, /"(?:screenshotPath|profileId|accountId|userId|email)"\s*:/i);
	const committedImageFiles = fs.readdirSync(manualDir, { recursive: true })
		.filter((entry) => typeof entry === "string" && /\.(?:png|jpe?g|webp|gif)$/i.test(entry));
	assert.deepEqual(committedImageFiles, []);
});

test("direct TMDB plan is bounded, deterministic, and covers required research cases", () => {
	assert.equal(directPlan.plannedRequestCount, directPlan.cases.length);
	assert.equal(directPlan.plannedRequestCount, 60);
	assert.equal(directPlan.hardRequestCap, 60);
	assert.ok(directPlan.plannedRequestCount <= directPlan.hardRequestCap);
	const directCaseById = assertComparatorGraph(directPlan.cases, (item) => item.id, "direct plan");
	assert.equal(directPlan.baselines.movie.language, "en-US");
	assert.equal(directPlan.baselines.tv.language, "en-US");
	assert.match(directPlan.baselines.movie["primary_release_date.gte"], /^\d{4}-\d{2}-\d{2}$/);
	assert.match(directPlan.baselines.tv["first_air_date.gte"], /^\d{4}-\d{2}-\d{2}$/);

	const categories = new Set(directPlan.cases.map((item) => item.category));
	for (const category of ["baseline", "and-or", "range", "exclusion", "people", "certification", "release-type", "status-type", "vote-maximum", "date-field", "client-divergence", "client-effective-query", "invalid-input", "sort"]) {
		assert.ok(categories.has(category), category);
	}

	const plannedSorts = directPlan.cases
		.filter((item) => item.category === "sort" || item.category === "baseline")
		.map((item) => `${item.media}:${item.query.sort_by ?? directPlan.baselines[item.media].sort_by}`);
	const matrixSorts = matrix.entries.filter((item) => item.recordType === "sort-value").map((item) => `${item.media}:${item.officialSortValue}`);
	assert.deepEqual(sorted(plannedSorts), sorted(matrixSorts));
	assert.equal(matrix.liveResearch.plannedRequests, 60);
	assert.equal(matrix.liveResearch.hardRequestCap, 60);
	assert.equal(matrix.liveResearch.requestsSent, 0);

	const monetizationUnion = "flatrate|free|ads|rent|buy";
	const providerCases = directPlan.cases.filter((item) => Object.hasOwn(item.query, "with_watch_providers"));
	assert.equal(providerCases.length, 4);
	for (const item of providerCases) {
		assert.ok(typeof item.query.watch_region === "string" && item.query.watch_region.trim().length > 0, `${item.id} watch_region`);
		assert.equal(item.query.with_watch_monetization_types, monetizationUnion, `${item.id} monetization union`);
	}

	const providerUs = directCaseById.get("movie-provider-8-us");
	const providerAu = directCaseById.get("movie-provider-8-au");
	assert.equal(providerUs.compareTo, null);
	assert.equal(providerAu.compareTo, providerUs.id);
	assert.deepEqual(providerUs.omitBaselineParameters, ["primary_release_date.gte", "primary_release_date.lte", "vote_count.gte"]);
	assert.deepEqual(providerAu.omitBaselineParameters, providerUs.omitBaselineParameters);
	assert.deepEqual([providerUs.query.watch_region, providerAu.query.watch_region], ["US", "AU"]);
	assert.equal(providerUs.query.with_watch_providers, "8");
	assert.equal(providerAu.query.with_watch_providers, "8");

	function effectiveQuery(item) {
		const query = { ...directPlan.baselines[item.media] };
		for (const name of item.omitBaselineParameters ?? []) delete query[name];
		return { ...query, ...item.query };
	}
	assert.deepEqual(effectiveQuery(providerUs), {
		language: "en-US",
		page: "1",
		sort_by: "popularity.desc",
		watch_region: "US",
		with_watch_monetization_types: monetizationUnion,
		with_watch_providers: "8",
	});
	assert.deepEqual(effectiveQuery(providerAu), {
		language: "en-US",
		page: "1",
		sort_by: "popularity.desc",
		watch_region: "AU",
		with_watch_monetization_types: monetizationUnion,
		with_watch_providers: "8",
	});

	const registryByParameter = new Map([
		["with_genres", "genres"],
		["without_genres", "genres"],
		["with_keywords", "keywords"],
		["without_keywords", "keywords"],
		["with_companies", "companies"],
		["without_companies", "companies"],
		["with_watch_providers", "watchProviders"],
		["without_watch_providers", "watchProviders"],
		["with_cast", "people"],
		["with_crew", "people"],
		["with_people", "people"],
		["with_networks", "networks"],
	]);
	const usedRegistryIds = new Map([...new Set(registryByParameter.values())].map((name) => [name, new Set()]));
	for (const item of directPlan.cases) {
		for (const [parameter, value] of Object.entries(item.query)) {
			const registryName = registryByParameter.get(parameter);
			if (!registryName) continue;
			for (const id of String(value).split(/[,|]/).filter(Boolean)) usedRegistryIds.get(registryName).add(id);
		}
	}
	for (const [registryName, usedIds] of usedRegistryIds) {
		const records = directPlan.testDataReferences[registryName];
		assert.ok(Array.isArray(records) && records.length > 0, registryName);
		const registeredIds = new Set(records.map((record) => String(record.id)));
		assert.deepEqual(sorted(usedIds), sorted(registeredIds), registryName);
		for (const record of records) {
			assert.ok(typeof record.label === "string" && record.label.length > 0);
			assert.match(record.officialLookup, /^https:\/\/(?:api\.)?themoviedb\.org\//);
			assert.doesNotMatch(record.officialLookup, /[?&]api_key=/i);
		}
	}
	assert.equal(directPlan.testDataReferences.certifications[0].value, "PG-13");
});

test("committed research evidence contains no credential-shaped values", () => {
	const evidencePaths = [
		"docs/v2/TMDB_DISCOVER_COMPATIBILITY.md",
		"manual-tests/tmdb-discover/compatibility-matrix.json",
		"manual-tests/tmdb-discover/direct-tmdb-test-plan.json",
		"manual-tests/tmdb-discover/fixture-manifest.json",
		"manual-tests/tmdb-discover/README.md",
		"manual-tests/tmdb-discover/RESULTS_TEMPLATE.md",
		"manual-tests/tmdb-discover/OWNER_RESULTS_2026-07-23.md",
		"manual-tests/tmdb-discover/owner-results-2026-07-23.json",
		"scripts/research-tmdb-discover.mjs",
		"scripts/generate-tmdb-discover-compatibility.mjs",
		"scripts/lib/tmdb-discover-compatibility.mjs",
		"tests/tmdb-discover-compatibility.test.mjs",
		"docs/v2/BUILDER_KNOWLEDGE.md",
		completeAuditRelativePath,
		oneSourcePerFolderRelativePath,
		...manifest.fixtures.map((fixture) => `manual-tests/tmdb-discover/${fixture.path}`),
	];
	const secretPatterns = [
		/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
		/\bsk-[A-Za-z0-9_-]{16,}\b/,
		/[?&]api_key=[A-Za-z0-9_-]{16,}/i,
		/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i,
	];
	for (const evidencePath of evidencePaths) {
		const content = readText(evidencePath);
		for (const pattern of secretPatterns) assert.doesNotMatch(content, pattern, evidencePath);
	}
});

test("research harness dry-runs without a token and fails closed before live requests", () => {
	const scriptPath = path.join(rootDir, "scripts", "research-tmdb-discover.mjs");
	const environment = { ...process.env };
	delete environment.TMDB_BEARER_TOKEN;

	const dryRun = spawnSync(process.execPath, [scriptPath, "--dry-run", "--ids", "movie-baseline", "--max-requests", "1"], {
		cwd: rootDir,
		env: environment,
		encoding: "utf8",
	});
	assert.equal(dryRun.status, 0, dryRun.stderr);
	assert.match(dryRun.stdout, /Planned requests: 1/);
	assert.match(dryRun.stdout, /Dry run only; no TMDB requests were sent\./);
	assert.doesNotMatch(dryRun.stdout, /Authorization|Bearer/i);

	const noToken = spawnSync(process.execPath, [scriptPath, "--ids", "movie-baseline", "--max-requests", "1"], {
		cwd: rootDir,
		env: environment,
		encoding: "utf8",
	});
	assert.equal(noToken.status, 1);
	assert.match(noToken.stderr, /TMDB_BEARER_TOKEN is not set\. No requests were sent\./);

	const malformedIds = spawnSync(process.execPath, [scriptPath, "--dry-run", "--ids", "", "--max-requests", "1"], {
		cwd: rootDir,
		env: environment,
		encoding: "utf8",
	});
	assert.equal(malformedIds.status, 1);
	assert.match(malformedIds.stderr, /--ids requires a non-empty value\./);
	assert.doesNotMatch(malformedIds.stdout, /Planned requests:/);

	const invalidTokenEnvironment = { ...environment, TMDB_BEARER_TOKEN: "invalid\r\ntoken" };
	const invalidToken = spawnSync(process.execPath, [scriptPath, "--ids", "movie-baseline", "--max-requests", "1"], {
		cwd: rootDir,
		env: invalidTokenEnvironment,
		encoding: "utf8",
	});
	assert.equal(invalidToken.status, 1);
	assert.match(invalidToken.stderr, /contains invalid characters\. No requests were sent\./);
	assert.doesNotMatch(`${invalidToken.stdout}${invalidToken.stderr}`, /invalid\r?\ntoken/);

	const existingOutput = path.join(rootDir, "docs", "v2", "TMDB_DISCOVER_COMPATIBILITY.md");
	const existingContent = fs.readFileSync(existingOutput, "utf8");
	const reservedOutput = spawnSync(process.execPath, [scriptPath, "--ids", "movie-baseline", "--max-requests", "1", "--output", existingOutput], {
		cwd: rootDir,
		env: { ...environment, TMDB_BEARER_TOKEN: "test_token" },
		encoding: "utf8",
	});
	assert.equal(reservedOutput.status, 1);
	assert.match(reservedOutput.stderr, /Output file already exists; no requests were sent:/);
	assert.doesNotMatch(reservedOutput.stdout, /1\/1/);
	assert.equal(fs.readFileSync(existingOutput, "utf8"), existingContent);
});

test("only the offline checker is wired into check-all", () => {
	const checkAll = readText("scripts/check-all.mjs");
	assert.match(checkAll, /tmdb-discover-compatibility\.test\.mjs/);
	assert.doesNotMatch(checkAll, /research-tmdb-discover\.mjs/);
});
