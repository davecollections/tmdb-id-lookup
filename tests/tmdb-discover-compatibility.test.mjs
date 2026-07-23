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

const matrixText = readText(MATRIX_PATH);
const matrix = JSON.parse(matrixText);
const manifest = readJson("manual-tests/tmdb-discover/fixture-manifest.json");
const directPlan = readJson("manual-tests/tmdb-discover/direct-tmdb-test-plan.json");

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
	assert.equal(matrix.counts.issue47ControlledManualFilterEffects, 0);
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
	for (const fixtureEntry of manifest.fixtures) {
		const fixturePath = path.join(manualDir, fixtureEntry.path);
		const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
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
	assert.equal(manifest.fixtures.flatMap((fixture) => fixture.sources).filter((source) => source.priority === "essential").length, manifest.essentialSourceCount);
});

test("results template represents every fixture source exactly once", () => {
	const template = readText("manual-tests/tmdb-discover/RESULTS_TEMPLATE.md").replaceAll("\\|", "|");
	const titles = manifest.fixtures.flatMap((fixture) => fixture.sources.map((source) => source.title));
	for (const title of titles) {
		assert.equal(template.split(title).length - 1, 1, title);
	}
	assert.equal(new Set(titles).size, titles.length);
});

test("direct TMDB plan is bounded, deterministic, and covers required research cases", () => {
	assert.equal(directPlan.plannedRequestCount, directPlan.cases.length);
	assert.equal(directPlan.plannedRequestCount, 58);
	assert.equal(directPlan.hardRequestCap, 60);
	assert.ok(directPlan.plannedRequestCount <= directPlan.hardRequestCap);
	assert.equal(new Set(directPlan.cases.map((item) => item.id)).size, directPlan.cases.length);
	assert.equal(directPlan.baselines.movie.language, "en-US");
	assert.equal(directPlan.baselines.tv.language, "en-US");
	assert.match(directPlan.baselines.movie["primary_release_date.gte"], /^\d{4}-\d{2}-\d{2}$/);
	assert.match(directPlan.baselines.tv["first_air_date.gte"], /^\d{4}-\d{2}-\d{2}$/);

	const categories = new Set(directPlan.cases.map((item) => item.category));
	for (const category of ["baseline", "and-or", "range", "exclusion", "people", "certification", "release-type", "status-type", "vote-maximum", "date-field", "client-divergence", "invalid-input", "sort"]) {
		assert.ok(categories.has(category), category);
	}

	const plannedSorts = directPlan.cases
		.filter((item) => item.category === "sort" || item.category === "baseline")
		.map((item) => `${item.media}:${item.query.sort_by ?? directPlan.baselines[item.media].sort_by}`);
	const matrixSorts = matrix.entries.filter((item) => item.recordType === "sort-value").map((item) => `${item.media}:${item.officialSortValue}`);
	assert.deepEqual(sorted(plannedSorts), sorted(matrixSorts));

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
		"scripts/research-tmdb-discover.mjs",
		"scripts/generate-tmdb-discover-compatibility.mjs",
		"scripts/lib/tmdb-discover-compatibility.mjs",
		"tests/tmdb-discover-compatibility.test.mjs",
		"docs/v2/BUILDER_KNOWLEDGE.md",
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
