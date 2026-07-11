import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(
	rootDir,
	"manual-tests",
	"nuvio-desktop",
	"addon-projection-migration",
);
const inputPath = path.join(evidenceDirectory, "builder-migrated-input.json");
const exportPath = path.join(evidenceDirectory, "nuvio-desktop-export.json");
const reportPath = path.join(evidenceDirectory, "round-trip-report.json");
const expectedInputHash = "c14d7e9f9c4c3becccb95718d5b91e94e059652adbd6f8192dbb0c5794491970";
const expectedExportHash = "6390428217959af42572038fdd818def5fc9136a98285b6e879504826a0aa7bc";
const expectedFolderIds = ["compat-legacy-movie", "compat-legacy-series", "compat-legacy-anime"];
const expectedFolderTitles = ["Legacy Movies", "Legacy Series", "Legacy Anime"];
const expectedTypes = ["movie", "series", "anime"];
const expectedGenres = [null, "Action", null];
const expectedCatalogIds = ["movie-catalog", "series-catalog", "anime-catalog"];
const sourceNullFields = [
	"tmdbSourceType",
	"title",
	"tmdbId",
	"traktListId",
	"mediaType",
	"sortBy",
	"sortHow",
	"filters",
];
const folderDefaults = {
	focusGifUrl: null,
	focusGifEnabled: true,
	coverEmoji: null,
	tileShape: "poster",
	hideTitle: false,
	heroVideoUrl: null,
};
const collectionDefaults = {
	backdropImageUrl: null,
	pinToTop: false,
	viewMode: "TABBED_GRID",
	showAllTab: true,
};
const args = process.argv.slice(2);
assert.ok(args.every((argument) => argument === "--write-report"), (
	"Usage: node scripts/check-migration-round-trip-export.mjs [--write-report]"
));
const writeReport = args.includes("--write-report");

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function readJsonEvidence(filePath) {
	const bytes = fs.readFileSync(filePath);
	return {
		bytes,
		hash: sha256(bytes),
		value: JSON.parse(bytes.toString("utf8")),
	};
}

function jsonText(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function flattenSources(collection) {
	return collection.folders.flatMap((folder) => folder.sources);
}

function flattenProjections(collection) {
	return collection.folders.flatMap((folder) => folder.catalogSources);
}

function measure(collections) {
	return {
		collections: collections.length,
		folders: collections.reduce((count, collection) => count + collection.folders.length, 0),
		sources: collections.reduce((count, collection) => (
			count + collection.folders.reduce((folderCount, folder) => folderCount + folder.sources.length, 0)
		), 0),
		catalogSources: collections.reduce((count, collection) => (
			count + collection.folders.reduce((folderCount, folder) => folderCount + folder.catalogSources.length, 0)
		), 0),
	};
}

function addonIdentity(value) {
	return {
		addonId: value.addonId,
		type: value.type,
		catalogId: value.catalogId,
		genre: value.genre,
	};
}

function arrayOrderKey(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		if (typeof value.id === "string") {
			return `id:${value.id}`;
		}
		if (typeof value.addonId === "string" && typeof value.type === "string" && typeof value.catalogId === "string") {
			return `addon:${JSON.stringify([value.addonId, value.type, value.catalogId, value.genre])}`;
		}
	}
	return `value:${JSON.stringify(value)}`;
}

function compareRecursively(input, exported, pathValue = "$", result = {
	additions: [],
	removals: [],
	changedValues: [],
	arrayLengthChanges: [],
	orderChanges: [],
}) {
	if (Array.isArray(input) && Array.isArray(exported)) {
		if (input.length !== exported.length) {
			result.arrayLengthChanges.push({ path: pathValue, inputLength: input.length, exportLength: exported.length });
		}
		const inputOrder = input.map(arrayOrderKey);
		const exportOrder = exported.map(arrayOrderKey);
		if (!isDeepEqual(inputOrder, exportOrder)) {
			result.orderChanges.push({ path: pathValue, inputOrder, exportOrder });
		}
		for (let index = 0; index < Math.min(input.length, exported.length); index += 1) {
			compareRecursively(input[index], exported[index], `${pathValue}[${index}]`, result);
		}
		return result;
	}

	if (isObject(input) && isObject(exported)) {
		for (const [key, inputValue] of Object.entries(input)) {
			const childPath = `${pathValue}.${key}`;
			if (!Object.hasOwn(exported, key)) {
				result.removals.push({ path: childPath, value: inputValue });
			} else {
				compareRecursively(inputValue, exported[key], childPath, result);
			}
		}
		for (const [key, exportValue] of Object.entries(exported)) {
			if (!Object.hasOwn(input, key)) {
				result.additions.push({ path: `${pathValue}.${key}`, value: exportValue });
			}
		}
		return result;
	}

	if (!Object.is(input, exported)) {
		result.changedValues.push({ path: pathValue, inputValue: input, exportValue: exported });
	}
	return result;
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDeepEqual(left, right) {
	try {
		assert.deepEqual(left, right);
		return true;
	} catch {
		return false;
	}
}

function expectedAdditions() {
	const additions = new Map();
	for (let folderIndex = 0; folderIndex < 3; folderIndex += 1) {
		const folderPath = `$[0].folders[${folderIndex}]`;
		for (const field of sourceNullFields) {
			additions.set(`${folderPath}.sources[0].${field}`, null);
		}
		for (const [field, value] of Object.entries(folderDefaults)) {
			additions.set(`${folderPath}.${field}`, value);
		}
	}
	additions.set("$[0].folders[0].heroBackdropUrl", null);
	additions.set("$[0].folders[0].titleLogoUrl", null);
	additions.set("$[0].folders[1].coverImageUrl", null);
	additions.set("$[0].folders[1].titleLogoUrl", null);
	additions.set("$[0].folders[2].coverImageUrl", null);
	additions.set("$[0].folders[2].heroBackdropUrl", null);
	for (const [field, value] of Object.entries(collectionDefaults)) {
		additions.set(`$[0].${field}`, value);
	}
	return additions;
}

const inputEvidence = readJsonEvidence(inputPath);
const exportEvidence = readJsonEvidence(exportPath);
assert.equal(inputEvidence.hash, expectedInputHash, "Stage A input bytes changed unexpectedly.");
assert.equal(exportEvidence.hash, expectedExportHash, "Owner export bytes do not match the supplied evidence.");

const inputCounts = measure(inputEvidence.value);
const exportCounts = measure(exportEvidence.value);
const expectedCounts = { collections: 1, folders: 3, sources: 3, catalogSources: 3 };
assert.deepEqual(inputCounts, expectedCounts);
assert.deepEqual(exportCounts, expectedCounts);

const inputCollection = inputEvidence.value[0];
const exportCollection = exportEvidence.value[0];
assert.equal(inputCollection.id, "compat-legacy-addon");
assert.equal(exportCollection.id, inputCollection.id);
assert.equal(inputCollection.title, "Sanitised Projection-Only Evidence");
assert.equal(exportCollection.title, inputCollection.title);
assert.deepEqual(exportCollection.folders.map((folder) => folder.id), expectedFolderIds);
assert.deepEqual(exportCollection.folders.map((folder) => folder.title), expectedFolderTitles);

const inputSources = flattenSources(inputCollection);
const exportSources = flattenSources(exportCollection);
const inputProjections = flattenProjections(inputCollection);
const exportProjections = flattenProjections(exportCollection);
assert.deepEqual(inputSources.map((source) => source.type), expectedTypes);
assert.deepEqual(exportSources.map((source) => source.type), expectedTypes);
assert.deepEqual(inputProjections.map((projection) => projection.type), expectedTypes);
assert.deepEqual(exportProjections.map((projection) => projection.type), expectedTypes);
assert.deepEqual(inputSources.map((source) => source.genre), expectedGenres);
assert.deepEqual(exportSources.map((source) => source.genre), expectedGenres);
assert.deepEqual(inputProjections.map((projection) => projection.genre), expectedGenres);
assert.deepEqual(exportProjections.map((projection) => projection.genre), expectedGenres);

for (let index = 0; index < 3; index += 1) {
	assert.equal(exportSources[index].provider, "addon");
	assert.equal(exportSources[index].addonId, "example.sanitised.metadata");
	assert.equal(exportSources[index].catalogId, expectedCatalogIds[index]);
	assert.deepEqual(addonIdentity(exportSources[index]), addonIdentity(exportProjections[index]));
	assert.equal(Object.hasOwn(exportProjections[index], "showInHome"), true);
	assert.equal(exportProjections[index].showInHome, false);
	for (const field of sourceNullFields) {
		assert.equal(Object.hasOwn(exportSources[index], field), true);
		assert.equal(exportSources[index][field], null);
	}
	for (const [field, value] of Object.entries(folderDefaults)) {
		assert.equal(Object.hasOwn(exportCollection.folders[index], field), true);
		assert.deepEqual(exportCollection.folders[index][field], value);
	}
}

assert.deepEqual(exportProjections[0].unknownProjectionSentinel, { preserve: true });
assert.equal(exportCollection.folders[0].coverImageUrl, "https://example.invalid/legacy-movie.jpg");
assert.equal(exportCollection.folders[1].heroBackdropUrl, "https://example.invalid/legacy-series.jpg");
assert.equal(exportCollection.folders[2].titleLogoUrl, "https://example.invalid/legacy-anime-logo.png");
assert.equal(exportCollection.folders[0].heroBackdropUrl, null);
assert.equal(exportCollection.folders[0].titleLogoUrl, null);
assert.equal(exportCollection.folders[1].coverImageUrl, null);
assert.equal(exportCollection.folders[1].titleLogoUrl, null);
assert.equal(exportCollection.folders[2].coverImageUrl, null);
assert.equal(exportCollection.folders[2].heroBackdropUrl, null);
for (const [field, value] of Object.entries(collectionDefaults)) {
	assert.equal(Object.hasOwn(exportCollection, field), true);
	assert.deepEqual(exportCollection[field], value);
}

const semanticDiff = compareRecursively(inputEvidence.value, exportEvidence.value);
const allowedAdditions = expectedAdditions();
assert.equal(allowedAdditions.size, 52);
assert.equal(semanticDiff.additions.length, allowedAdditions.size);
for (const addition of semanticDiff.additions) {
	assert.equal(allowedAdditions.has(addition.path), true, `Unexpected export addition: ${addition.path}`);
	assert.deepEqual(addition.value, allowedAdditions.get(addition.path), `Unexpected value at ${addition.path}`);
}
assert.deepEqual(semanticDiff.removals, []);
assert.deepEqual(semanticDiff.changedValues, []);
assert.deepEqual(semanticDiff.arrayLengthChanges, []);
assert.deepEqual(semanticDiff.orderChanges, []);

const canonicalValidation = validateNuvioContract(exportEvidence.value, {
	mode: "canonical-builder-output",
});
assert.equal(canonicalValidation.valid, true, JSON.stringify(canonicalValidation.errors));

const sourceIdentities = exportSources.map(addonIdentity);
const projectionIdentities = exportProjections.map(addonIdentity);
const report = {
	schemaVersion: 1,
	purpose: "Record the controlled Nuvio Desktop round trip for the sanitised builder-generated addon projection migration output.",
	issue: 38,
	evidenceStatus: "manually-confirmed-nuvio-desktop-compatibility",
	client: {
		product: "Nuvio Desktop",
		version: "0.1.11-alpha",
		build: "11",
		basedOnNuvio: "0.2.19",
		operatingSystem: "Windows",
	},
	observedUiResult: {
		importSucceeded: true,
		collectionVisible: true,
		collectionCount: 1,
		folderCount: 3,
		folderOrderCorrect: true,
		folderNames: expectedFolderTitles,
		allFoldersOpened: true,
		expectedAddonNotFoundMessageObserved: true,
		addonNotFoundId: "example.sanitised.metadata",
	},
	inputSha256: inputEvidence.hash,
	exportSha256: exportEvidence.hash,
	counts: {
		input: inputCounts,
		export: exportCounts,
	},
	sourceTypeOrder: exportSources.map((source) => source.type),
	projectionTypeOrder: exportProjections.map((projection) => projection.type),
	sourceGenreOrder: exportSources.map((source) => source.genre),
	projectionGenreOrder: exportProjections.map((projection) => projection.genre),
	preservationResults: {
		collectionId: exportCollection.id,
		collectionTitle: exportCollection.title,
		folderIds: exportCollection.folders.map((folder) => folder.id),
		folderTitles: exportCollection.folders.map((folder) => folder.title),
		sourceIdentities,
		projectionIdentities,
		orderPreserved: true,
		projectionSentinelPreserved: true,
		presentationUrlsPreserved: true,
	},
	normalizationResults: {
		sourceExplicitNullProperties: sourceNullFields,
		folderDefaults,
		completedPresentationNulls: {
			movie: ["heroBackdropUrl", "titleLogoUrl"],
			series: ["coverImageUrl", "titleLogoUrl"],
			anime: ["coverImageUrl", "heroBackdropUrl"],
		},
		collectionDefaults,
		lowercasePosterTileShape: true,
	},
	semanticDiff: {
		additions: semanticDiff.additions.length,
		removals: semanticDiff.removals.length,
		changedValues: semanticDiff.changedValues.length,
		arrayLengthChanges: semanticDiff.arrayLengthChanges.length,
		orderChanges: semanticDiff.orderChanges.length,
	},
	canonicalExportValidation: true,
	networkRequired: false,
	liveAddonResolutionExpected: false,
	liveAddonResolutionConfirmed: false,
	unexpectedDifferences: [],
};
const reportText = jsonText(report);

if (writeReport) {
	fs.writeFileSync(reportPath, reportText, "utf8");
	console.log("Wrote deterministic Nuvio Desktop migration round-trip report.");
} else {
	let committedReport;
	try {
		committedReport = fs.readFileSync(reportPath, "utf8");
	} catch {
		throw new Error("Missing generated round-trip report. Run with --write-report first.");
	}
	assert.equal(committedReport, reportText, "The committed round-trip report is stale or different.");
	console.log("Nuvio Desktop migration round trip verified: 52 additions, 0 destructive differences.");
}
