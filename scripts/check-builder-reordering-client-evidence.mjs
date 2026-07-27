import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilderController } from "../builder/src/application/index.js";
import { importNuvioCollections } from "../builder/src/import/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { validateNuvioContract } from "../tests/helpers/nuvio-contract-validator.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const evidenceDirectory = path.join(
	rootDir,
	"manual-tests",
	"nuvio-clients",
	"issue-59-builder-reordering",
);
const reportPath = path.join(evidenceDirectory, "verification-report.json");
const sourceCommit = "326efe0bf78ee095f1d9efd5420b18d509d5c14f";
const addonId = "example.sanitised.issue59.ordering";
const rawCollectionOrder = [
	"issue-59-collection-d",
	"issue-59-collection-b",
	"issue-59-collection-c",
	"issue-59-collection-a",
];
const visibleCollectionOrder = [
	"issue-59-collection-c",
	"issue-59-collection-a",
	"issue-59-collection-d",
	"issue-59-collection-b",
];
const folderOrderWithinRegularD = [
	"issue-59-folder-c",
	"issue-59-folder-a",
	"issue-59-folder-b",
];
const sourceOrderWithinFolderC = [
	"issue-59-source-c",
	"issue-59-source-a",
	"issue-59-source-b",
];
const expectedPinValues = {
	"issue-59-collection-d": false,
	"issue-59-collection-b": false,
	"issue-59-collection-c": true,
	"issue-59-collection-a": true,
};
const expectedCounts = {
	collections: 4,
	folders: 6,
	sources: 8,
	catalogSources: 8,
};
const immutableArtifactContract = {
	"builder-reordered-input.json": {
		bytes: 8545,
		sha256: "64b980782f72aa742359b57dbfe9eac9e1baa5f2ee6c284de3a4dcf86d1d4c0c",
	},
	"seed-profile.json": {
		bytes: 8545,
		sha256: "a829b4b125d90e299f5d714f0b781bb72b583ee8412f1c894777d20f86485a33",
	},
	"expected-order.json": {
		bytes: 5938,
		sha256: "969e731453745c61670de13a41844968502aab05247a949360cebb67ce5d77dd",
	},
	"generation-report.json": {
		bytes: 11398,
		sha256: "ad65c837da393decf494e078d27e1dc45812c9c686af5e8fa744017ec97706e1",
	},
	"nuvio-desktop-export.json": {
		bytes: 7157,
		sha256: "da1c093936c3034bdfd06db20673c264919d3f166cd16be79b7e26d1b1f2ea7b",
	},
	"nuviotv-web-export.json": {
		bytes: 6674,
		sha256: "3c9f2f107f23b582ed2e17b60012e9c973086f7b891b5a29e833a59c68c946c9",
	},
};
const reportSourceFiles = [
	"README.md",
	"builder-reordered-input.json",
	"completed-evidence.md",
	"expected-order.json",
	"generation-report.json",
	"mobile-owner-evidence.json",
	"nuvio-desktop-export.json",
	"nuviotv-web-export.json",
	"seed-profile.json",
	"tv-owner-evidence.json",
];
const sourceOptionalNullFields = [
	"sortBy",
	"tmdbId",
	"filters",
	"sortHow",
	"mediaType",
	"traktListId",
	"tmdbSourceType",
];
const desktopFolderDefaults = {
	coverEmoji: null,
	focusGifUrl: null,
	heroVideoUrl: null,
	titleLogoUrl: null,
	coverImageUrl: null,
	focusGifEnabled: true,
	heroBackdropUrl: null,
};

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function jsonText(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function readEvidence(fileName, expected = null) {
	const filePath = path.join(evidenceDirectory, fileName);
	const bytes = fs.readFileSync(filePath);
	const evidence = {
		fileName,
		filePath,
		bytes,
		sizeBytes: bytes.length,
		sha256: sha256(bytes),
	};

	if (expected !== null) {
		assert.equal(evidence.sizeBytes, expected.bytes, `${fileName} size changed unexpectedly.`);
		assert.equal(evidence.sha256, expected.sha256, `${fileName} bytes changed unexpectedly.`);
	}

	return evidence;
}

function readJsonEvidence(fileName, expected = null) {
	const evidence = readEvidence(fileName, expected);
	return {
		...evidence,
		value: JSON.parse(evidence.bytes.toString("utf8")),
	};
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
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

function sourceKey(source) {
	return `${source.addonId}|${source.type}|${source.catalogId}|${source.genre ?? ""}`;
}

function catalogIdOrder(entries) {
	return entries.map((entry) => entry.catalogId);
}

function visibleIds(collections) {
	return [
		...collections.filter((collection) => collection.pinToTop === true),
		...collections.filter((collection) => collection.pinToTop !== true),
	].map((collection) => collection.id);
}

function indexProfile(collections) {
	const collectionById = new Map();
	const folderById = new Map();
	const sourceByCatalogId = new Map();
	const projectionByCatalogId = new Map();

	for (const collection of collections) {
		collectionById.set(collection.id, collection);
		for (const folder of collection.folders) {
			folderById.set(folder.id, folder);
			for (const source of folder.sources) {
				sourceByCatalogId.set(source.catalogId, source);
			}
			for (const projection of folder.catalogSources) {
				projectionByCatalogId.set(projection.catalogId, projection);
			}
		}
	}

	return { collectionById, folderById, sourceByCatalogId, projectionByCatalogId };
}

function assertCanonicalProfile(collections, label) {
	const validation = validateNuvioContract(collections, { mode: "canonical-builder-output" });
	assert.equal(validation.valid, true, `${label} is not canonical: ${JSON.stringify(validation.errors)}`);
}

function assertFinalProfile(collections, expectedOrder, label) {
	assert.ok(Array.isArray(collections), `${label} root must be an array.`);
	assert.deepEqual(measure(collections), expectedCounts, `${label} counts changed.`);
	assert.deepEqual(collections.map((collection) => collection.id), rawCollectionOrder, `${label} raw collection order changed.`);
	assert.deepEqual(visibleIds(collections), visibleCollectionOrder, `${label} visible collection order changed.`);
	assert.deepEqual(
		Object.fromEntries(collections.map((collection) => [collection.id, collection.pinToTop])),
		expectedPinValues,
		`${label} pin values changed.`,
	);

	const indexed = indexProfile(collections);
	assert.equal(indexed.collectionById.size, expectedCounts.collections, `${label} collection IDs are not unique.`);
	assert.equal(indexed.folderById.size, expectedCounts.folders, `${label} folder IDs are not unique.`);
	assert.equal(indexed.sourceByCatalogId.size, expectedCounts.sources, `${label} source identities are not unique.`);
	assert.equal(indexed.projectionByCatalogId.size, expectedCounts.catalogSources, `${label} projection identities are not unique.`);

	for (const [collectionId, expectedFolderIds] of Object.entries(expectedOrder.parentRelationships.collections)) {
		const collection = indexed.collectionById.get(collectionId);
		assert.ok(collection, `${label} is missing ${collectionId}.`);
		assert.deepEqual(
			collection.folders.map((folder) => folder.id),
			expectedFolderIds,
			`${label} folder order changed for ${collectionId}.`,
		);
	}

	for (const [folderId, expectedSourceKeys] of Object.entries(expectedOrder.parentRelationships.folders)) {
		const folder = indexed.folderById.get(folderId);
		assert.ok(folder, `${label} is missing ${folderId}.`);
		assert.deepEqual(
			folder.sources.map(sourceKey),
			expectedSourceKeys,
			`${label} source order or parent changed for ${folderId}.`,
		);
		assert.deepEqual(
			folder.catalogSources.map(sourceKey),
			expectedSourceKeys,
			`${label} projection order or identity changed for ${folderId}.`,
		);
	}

	const regularD = indexed.collectionById.get("issue-59-collection-d");
	assert.deepEqual(regularD.folders.map((folder) => folder.id), folderOrderWithinRegularD);
	const folderC = indexed.folderById.get("issue-59-folder-c");
	assert.deepEqual(catalogIdOrder(folderC.sources), sourceOrderWithinFolderC);
	assert.deepEqual(catalogIdOrder(folderC.catalogSources), sourceOrderWithinFolderC);
	assert.ok(folderC.sources.every((source) => source.addonId === addonId));
	assert.ok(folderC.catalogSources.every((source) => source.addonId === addonId));
	assertCanonicalProfile(collections, label);

	return indexed;
}

function assertSeedProfile(collections) {
	assert.ok(Array.isArray(collections));
	assert.deepEqual(measure(collections), expectedCounts);
	assert.deepEqual(collections.map((collection) => collection.id), [
		"issue-59-collection-b",
		"issue-59-collection-a",
		"issue-59-collection-d",
		"issue-59-collection-c",
	]);
	assert.deepEqual(visibleIds(collections), [
		"issue-59-collection-a",
		"issue-59-collection-c",
		"issue-59-collection-b",
		"issue-59-collection-d",
	]);
	const indexed = indexProfile(collections);
	assert.deepEqual(
		indexed.collectionById.get("issue-59-collection-d").folders.map((folder) => folder.id),
		["issue-59-folder-b", "issue-59-folder-a", "issue-59-folder-c"],
	);
	assert.deepEqual(
		catalogIdOrder(indexed.folderById.get("issue-59-folder-c").sources),
		["issue-59-source-b", "issue-59-source-a", "issue-59-source-c"],
	);
	for (const folder of indexed.folderById.values()) {
		assert.deepEqual(folder.sources.map(sourceKey), folder.catalogSources.map(sourceKey));
	}
	assertCanonicalProfile(collections, "Seed profile");
}

function assertSentinels(referenceCollections, clientCollections, policy, label) {
	const reference = indexProfile(referenceCollections);
	const client = indexProfile(clientCollections);
	const layers = [
		["collectionById", "issue59CollectionSentinel"],
		["folderById", "issue59FolderSentinel"],
		["sourceByCatalogId", "issue59SourceSentinel"],
		["projectionByCatalogId", "issue59ProjectionSentinel"],
	];

	for (const [mapName, field] of layers) {
		for (const [identity, referenceEntry] of reference[mapName]) {
			const clientEntry = client[mapName].get(identity);
			assert.ok(clientEntry, `${label} is missing ${identity}.`);
			if (policy[mapName] === "preserved") {
				assert.deepEqual(clientEntry[field], referenceEntry[field], `${label} changed ${field} for ${identity}.`);
			} else {
				assert.equal(Object.hasOwn(clientEntry, field), false, `${label} unexpectedly retained ${field} for ${identity}.`);
			}
		}
	}
}

function arrayOrderKey(value) {
	if (isObject(value)) {
		if (typeof value.id === "string") {
			return `id:${value.id}`;
		}
		if (
			typeof value.addonId === "string" &&
			typeof value.type === "string" &&
			typeof value.catalogId === "string"
		) {
			return `addon:${sourceKey(value)}`;
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
			result.arrayLengthChanges.push({
				path: pathValue,
				inputLength: input.length,
				exportLength: exported.length,
			});
		}
		const inputOrder = input.map(arrayOrderKey);
		const exportOrder = exported.map(arrayOrderKey);
		if (JSON.stringify(inputOrder) !== JSON.stringify(exportOrder)) {
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

function mapEntry(pathValue, value) {
	return [pathValue, JSON.stringify(value)];
}

function mapChange(pathValue, inputValue, exportValue) {
	return [pathValue, JSON.stringify({ inputValue, exportValue })];
}

function assertDiffEntries(actual, expected, kind, label) {
	const actualMap = new Map(actual.map((entry) => (
		kind === "changedValues"
			? mapChange(entry.path, entry.inputValue, entry.exportValue)
			: mapEntry(entry.path, entry.value)
	)));
	assert.equal(actualMap.size, actual.length, `${label} contains duplicate ${kind} paths.`);
	assert.deepEqual(
		[...actualMap.entries()].sort(([left], [right]) => left.localeCompare(right)),
		[...expected.entries()].sort(([left], [right]) => left.localeCompare(right)),
		`${label} ${kind} changed.`,
	);
}

function expectedDesktopDiff(inputCollections) {
	const additions = new Map();
	for (let collectionIndex = 0; collectionIndex < inputCollections.length; collectionIndex += 1) {
		const collection = inputCollections[collectionIndex];
		const collectionPath = `$[${collectionIndex}]`;
		additions.set(`${collectionPath}.backdropImageUrl`, JSON.stringify(null));
		for (let folderIndex = 0; folderIndex < collection.folders.length; folderIndex += 1) {
			const folder = collection.folders[folderIndex];
			const folderPath = `${collectionPath}.folders[${folderIndex}]`;
			for (const [field, value] of Object.entries(desktopFolderDefaults)) {
				additions.set(`${folderPath}.${field}`, JSON.stringify(value));
			}
			for (let sourceIndex = 0; sourceIndex < folder.sources.length; sourceIndex += 1) {
				for (const field of sourceOptionalNullFields) {
					additions.set(`${folderPath}.sources[${sourceIndex}].${field}`, JSON.stringify(null));
				}
			}
		}
	}
	return {
		additions,
		removals: new Map(),
		changedValues: new Map(),
	};
}

function expectedWebDiff(desktopCollections) {
	const additions = new Map();
	const removals = new Map();
	const changedValues = new Map();
	const removableFolderFields = Object.keys(desktopFolderDefaults).filter((field) => field !== "focusGifEnabled");

	for (let collectionIndex = 0; collectionIndex < desktopCollections.length; collectionIndex += 1) {
		const collection = desktopCollections[collectionIndex];
		const collectionPath = `$[${collectionIndex}]`;
		additions.set(`${collectionPath}.focusGlowEnabled`, JSON.stringify(false));
		for (const field of ["backdropImageUrl", "issue59CollectionSentinel"]) {
			removals.set(`${collectionPath}.${field}`, JSON.stringify(collection[field]));
		}

		for (let folderIndex = 0; folderIndex < collection.folders.length; folderIndex += 1) {
			const folder = collection.folders[folderIndex];
			const folderPath = `${collectionPath}.folders[${folderIndex}]`;
			for (const field of [...removableFolderFields, "issue59FolderSentinel"]) {
				removals.set(`${folderPath}.${field}`, JSON.stringify(folder[field]));
			}
			changedValues.set(
				`${folderPath}.focusGifEnabled`,
				JSON.stringify({ inputValue: true, exportValue: false }),
			);

			for (let sourceIndex = 0; sourceIndex < folder.sources.length; sourceIndex += 1) {
				const sourcePath = `${folderPath}.sources[${sourceIndex}]`;
				for (const field of sourceOptionalNullFields) {
					removals.set(`${sourcePath}.${field}`, JSON.stringify(null));
				}
				changedValues.set(
					`${sourcePath}.genre`,
					JSON.stringify({ inputValue: null, exportValue: "" }),
				);
			}

			for (let projectionIndex = 0; projectionIndex < folder.catalogSources.length; projectionIndex += 1) {
				const projection = folder.catalogSources[projectionIndex];
				const projectionPath = `${folderPath}.catalogSources[${projectionIndex}]`;
				for (const field of ["genre", "showInHome", "issue59ProjectionSentinel"]) {
					removals.set(`${projectionPath}.${field}`, JSON.stringify(projection[field]));
				}
			}
		}
	}

	return { additions, removals, changedValues };
}

function summarizeDiff(diff) {
	return {
		additions: diff.additions.length,
		removals: diff.removals.length,
		changedValues: diff.changedValues.length,
		arrayLengthChanges: diff.arrayLengthChanges.length,
		orderChanges: diff.orderChanges.length,
	};
}

function assertExpectedOrderArtifact(expectedOrder) {
	assert.equal(expectedOrder.schemaVersion, 1);
	assert.equal(expectedOrder.issue, 59);
	assert.deepEqual(expectedOrder.expectedCounts, expectedCounts);
	assert.deepEqual(
		expectedOrder.finalOrders.rawSerializedCollectionOrder.map((entry) => entry.id),
		rawCollectionOrder,
	);
	assert.deepEqual(
		expectedOrder.finalOrders.visibleCollectionOrder.map((entry) => entry.id),
		visibleCollectionOrder,
	);
	assert.deepEqual(
		expectedOrder.finalOrders.folderOrderWithinRegularD.map((entry) => entry.id),
		folderOrderWithinRegularD,
	);
	assert.deepEqual(
		expectedOrder.finalOrders.sourceOrderWithinFolderC.map((entry) => entry.identity.catalogId),
		sourceOrderWithinFolderC,
	);
	assert.deepEqual(expectedOrder.pinGroups.pinned, [
		"Issue 59 C - Pinned first",
		"Issue 59 A - Pinned second",
	]);
	assert.deepEqual(expectedOrder.pinGroups.ordinary, [
		"Issue 59 D - Regular first",
		"Issue 59 B - Regular second",
	]);
}

function findProjectNode(project, operation) {
	for (const collection of project.collections) {
		if (operation.nodeType === "collection" && collection.editable.id === operation.publicId) {
			return collection;
		}
		for (const folder of collection.folders) {
			if (operation.nodeType === "folder" && folder.editable.id === operation.publicId) {
				return folder;
			}
			for (const source of folder.sources) {
				if (operation.nodeType === "source" && source.editable.catalogId === operation.publicId) {
					return source;
				}
			}
		}
	}
	return null;
}

function sequenceIdFactory(prefix) {
	let index = 0;
	return () => `${prefix}-${++index}`;
}

function reproduceFinalInput(seed, input, expectedInputText, generationReport) {
	const controller = createBuilderController({
		idFactory: sequenceIdFactory("issue-59-evidence"),
		nuvioIdFactory: sequenceIdFactory("issue-59-nuvio"),
		initialProjectTitle: "Issue 59 evidence verification",
	});
	assert.equal(controller.getState().revision, generationReport.revisionEvidence.afterControllerConstruction);
	const imported = controller.importValue(seed, { projectTitle: "Issue 59 evidence verification" });
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	assert.equal(controller.getState().revision, generationReport.revisionEvidence.afterImport);

	for (const operation of generationReport.moveOperations) {
		assert.equal(controller.getState().revision, operation.revisionBefore);
		const node = findProjectNode(controller.getState().project, operation);
		assert.ok(node, `Could not resolve generation move ${operation.sequence}.`);
		const moved = controller.moveNode(node.internalId, operation.targetRawIndex);
		assert.equal(moved.ok, true, JSON.stringify(moved.errors));
		assert.equal(controller.getState().revision, operation.revisionAfter);
	}

	const serialized = controller.stringifyProject({ space: 2 });
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.value, input);
	assert.equal(`${serialized.json}\n`, expectedInputText);
	return {
		seedImport: "passed",
		moveOperationsReplayed: generationReport.moveOperations.length,
		finalRevision: controller.getState().revision,
		exactFinalValue: true,
		exactFinalText: true,
	};
}

function verifySecondCycle(input, expectedInputText) {
	const imported = importNuvioCollections(input, {
		idFactory: sequenceIdFactory("issue-59-second-cycle"),
	});
	assert.equal(imported.ok, true, JSON.stringify(imported.errors));
	const serialized = serializeNuvioProject(imported.project);
	assert.equal(serialized.ok, true, JSON.stringify(serialized.errors));
	assert.deepEqual(serialized.value, input);
	return {
		import: "passed",
		serialization: "passed",
		semanticEquality: true,
		deterministicTextEquality: jsonText(serialized.value) === expectedInputText,
	};
}

function assertMobileEvidence(mobile) {
	assert.equal(mobile.schemaVersion, 1);
	assert.equal(mobile.issue, 59);
	assert.equal(mobile.testDate, "2026-07-27");
	assert.equal(mobile.evidenceStatus, "passed-owner-visual-and-export-text-raw-artifact-unavailable");
	assert.equal(mobile.rawArtifact.available, false);
	assert.equal(mobile.rawArtifact.filename, null);
	assert.equal(mobile.rawArtifact.sizeBytes, null);
	assert.equal(mobile.rawArtifact.sha256, null);
	assert.deepEqual(mobile.observations.visibleCollectionOrder, visibleCollectionOrder);
	assert.deepEqual(mobile.observations.rawCollectionOrder, rawCollectionOrder);
	assert.deepEqual(mobile.observations.pinValues, expectedPinValues);
	assert.deepEqual(mobile.observations.folderOrderWithinRegularD, folderOrderWithinRegularD);
	assert.deepEqual(mobile.observations.sourceOrderWithinFolderC, sourceOrderWithinFolderC);
	assert.deepEqual(mobile.observations.projectionOrderWithinFolderC, sourceOrderWithinFolderC);
	for (const field of [
		"collectionAndFolderIdsPreserved",
		"parentRelationshipsPreserved",
		"collectionSentinelsPreserved",
		"folderSentinelsPreserved",
		"sourceSentinelsPreserved",
		"projectionSentinelsPreserved",
		"sourceGenreNullPreserved",
		"explicitNullAndDefaultArtworkSourcePropertiesAdded",
		"folderFocusGifEnabled",
	]) {
		assert.equal(mobile.observations[field], true, `Mobile evidence does not confirm ${field}.`);
	}
	assert.equal(mobile.observations.meaningfulHierarchyOrOrderLossObserved, false);
	assert.equal(mobile.client.version, null);
	assert.equal(mobile.client.operatingSystem, null);
	assert.equal(mobile.client.device, null);
}

function assertTvEvidence(tv) {
	assert.equal(tv.schemaVersion, 1);
	assert.equal(tv.issue, 59);
	assert.equal(tv.testDate, "2026-07-27");
	assert.equal(tv.evidenceStatus, "passed-owner-visual-and-synced-verified-web-profile");
	assert.equal(tv.rawArtifact.available, false);
	assert.equal(tv.rawArtifact.sha256, null);
	assert.deepEqual(tv.observations.visibleCollectionOrder, visibleCollectionOrder);
	assert.equal(tv.observations.pinGroupsVisible, true);
	assert.deepEqual(tv.observations.folderOrderWithinRegularD, folderOrderWithinRegularD);
	assert.deepEqual(tv.observations.sourceOrderWithinFolderCFromSyncedWebExport, sourceOrderWithinFolderC);
	assert.deepEqual(tv.observations.projectionOrderWithinFolderCFromSyncedWebExport, sourceOrderWithinFolderC);
	assert.equal(tv.observations.independentTvSourceArrayExportAvailable, false);
	assert.equal(tv.observations.meaningfulHierarchyOrOrderLossObserved, false);
	assert.equal(tv.client.version, null);
	assert.equal(tv.client.operatingSystem, null);
	assert.equal(tv.client.device, null);
}

function scanForSensitiveData(evidenceFiles) {
	const patterns = [
		{ name: "email-address", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
		{ name: "bearer-token", expression: /\bBearer\s+[A-Za-z0-9._~-]{8,}/u },
		{ name: "jwt", expression: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/u },
		{ name: "local-absolute-path", expression: /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/u },
		{ name: "local-or-lan-url", expression: /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/iu },
		{ name: "assigned-secret", expression: /"(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)"\s*:\s*"(?!example|sanitised)[^"]+"/iu },
	];
	const findings = [];

	for (const evidence of evidenceFiles) {
		const text = evidence.bytes.toString("utf8");
		for (const pattern of patterns) {
			if (pattern.expression.test(text)) {
				findings.push({ file: evidence.fileName, pattern: pattern.name });
			}
		}
	}

	assert.deepEqual(findings, [], `Sensitive-data scan failed: ${JSON.stringify(findings)}`);
	return {
		status: "passed",
		filesScanned: evidenceFiles.length,
		findings,
	};
}

export function buildVerificationReport() {
	const artifacts = new Map();
	for (const fileName of reportSourceFiles) {
		const expected = immutableArtifactContract[fileName] ?? null;
		artifacts.set(fileName, readEvidence(fileName, expected));
	}

	const inputEvidence = readJsonEvidence(
		"builder-reordered-input.json",
		immutableArtifactContract["builder-reordered-input.json"],
	);
	const seedEvidence = readJsonEvidence("seed-profile.json", immutableArtifactContract["seed-profile.json"]);
	const expectedOrderEvidence = readJsonEvidence(
		"expected-order.json",
		immutableArtifactContract["expected-order.json"],
	);
	const generationEvidence = readJsonEvidence(
		"generation-report.json",
		immutableArtifactContract["generation-report.json"],
	);
	const desktopEvidence = readJsonEvidence(
		"nuvio-desktop-export.json",
		immutableArtifactContract["nuvio-desktop-export.json"],
	);
	const webEvidence = readJsonEvidence(
		"nuviotv-web-export.json",
		immutableArtifactContract["nuviotv-web-export.json"],
	);
	const mobileEvidence = readJsonEvidence("mobile-owner-evidence.json");
	const tvEvidence = readJsonEvidence("tv-owner-evidence.json");

	assertExpectedOrderArtifact(expectedOrderEvidence.value);
	assertSeedProfile(seedEvidence.value);
	const inputIndex = assertFinalProfile(
		inputEvidence.value,
		expectedOrderEvidence.value,
		"Builder-reordered input",
	);
	assert.equal(inputIndex.collectionById.size, 4);
	assertSentinels(inputEvidence.value, inputEvidence.value, {
		collectionById: "preserved",
		folderById: "preserved",
		sourceByCatalogId: "preserved",
		projectionByCatalogId: "preserved",
	}, "Builder-reordered input");

	const generationReport = generationEvidence.value;
	assert.equal(generationReport.schemaVersion, 1);
	assert.equal(generationReport.issue, 59);
	assert.equal(generationReport.sourceCommit, sourceCommit);
	assert.equal(generationReport.hashes.seedProfileSha256, seedEvidence.sha256);
	assert.equal(generationReport.hashes.finalInputSha256, inputEvidence.sha256);
	assert.equal(generationReport.hashes.expectedOrderSha256, expectedOrderEvidence.sha256);
	assert.deepEqual(generationReport.counts, expectedCounts);
	assert.equal(generationReport.validationResult.canonicalBuilderOutput, true);
	assert.equal(generationReport.secondCycleResult.semanticEqual, true);
	assert.equal(generationReport.secondCycleResult.jsonTextEqual, true);

	const reproduction = reproduceFinalInput(
		seedEvidence.value,
		inputEvidence.value,
		inputEvidence.bytes.toString("utf8"),
		generationReport,
	);
	const secondCycle = verifySecondCycle(
		inputEvidence.value,
		inputEvidence.bytes.toString("utf8"),
	);
	assert.equal(secondCycle.deterministicTextEquality, true);

	assertFinalProfile(desktopEvidence.value, expectedOrderEvidence.value, "Nuvio Desktop export");
	assertSentinels(inputEvidence.value, desktopEvidence.value, {
		collectionById: "preserved",
		folderById: "preserved",
		sourceByCatalogId: "preserved",
		projectionByCatalogId: "preserved",
	}, "Nuvio Desktop export");
	const desktopDiff = compareRecursively(inputEvidence.value, desktopEvidence.value);
	const desktopExpected = expectedDesktopDiff(inputEvidence.value);
	assertDiffEntries(desktopDiff.additions, desktopExpected.additions, "additions", "Desktop normalization");
	assertDiffEntries(desktopDiff.removals, desktopExpected.removals, "removals", "Desktop normalization");
	assertDiffEntries(desktopDiff.changedValues, desktopExpected.changedValues, "changedValues", "Desktop normalization");
	assert.deepEqual(desktopDiff.arrayLengthChanges, []);
	assert.deepEqual(desktopDiff.orderChanges, []);

	assertFinalProfile(webEvidence.value, expectedOrderEvidence.value, "nuvio.tv/web export");
	assertSentinels(inputEvidence.value, webEvidence.value, {
		collectionById: "dropped",
		folderById: "dropped",
		sourceByCatalogId: "preserved",
		projectionByCatalogId: "dropped",
	}, "nuvio.tv/web export");
	const webDiff = compareRecursively(desktopEvidence.value, webEvidence.value);
	const webExpected = expectedWebDiff(desktopEvidence.value);
	assertDiffEntries(webDiff.additions, webExpected.additions, "additions", "Web normalization");
	assertDiffEntries(webDiff.removals, webExpected.removals, "removals", "Web normalization");
	assertDiffEntries(webDiff.changedValues, webExpected.changedValues, "changedValues", "Web normalization");
	assert.deepEqual(webDiff.arrayLengthChanges, []);
	assert.deepEqual(webDiff.orderChanges, []);

	assertMobileEvidence(mobileEvidence.value);
	assertTvEvidence(tvEvidence.value);

	const privacyScan = scanForSensitiveData([...artifacts.values()]);
	const artifactInventory = [...artifacts.values()]
		.map((artifact) => ({
			file: artifact.fileName,
			sizeBytes: artifact.sizeBytes,
			sha256: artifact.sha256,
		}))
		.sort((left, right) => left.file.localeCompare(right.file));

	return {
		schemaVersion: 1,
		issue: 59,
		evidenceDate: "2026-07-27",
		checker: "scripts/check-builder-reordering-client-evidence.mjs",
		sourceCommit,
		evidenceStatus: "client-ordering-gate-complete",
		networkRequired: false,
		artifactInventory,
		reportHashNote: "verification-report.json is excluded from its own inventory and hash calculation.",
		expectedContract: {
			counts: expectedCounts,
			rawCollectionOrder,
			visibleCollectionOrder,
			pinValues: expectedPinValues,
			folderOrderWithinRegularD,
			sourceAndProjectionOrderWithinFolderC: sourceOrderWithinFolderC,
		},
		builderEvidence: {
			status: "passed",
			reproduction,
			secondCycle,
			canonicalValidation: true,
			sentinelsPreserved: true,
			parentRelationshipsPreserved: true,
		},
		clients: {
			desktop: {
				status: "passed",
				evidenceMethod: "owner visual plus exact raw export",
				client: {
					product: "Nuvio Desktop",
					version: "0.1.11-alpha",
					build: "11",
					basedOnNuvio: "0.2.19",
					operatingSystem: "Windows 11",
				},
				rawExport: {
					file: desktopEvidence.fileName,
					sizeBytes: desktopEvidence.sizeBytes,
					sha256: desktopEvidence.sha256,
				},
				orderAndHierarchyPreserved: true,
				allSentinelLevelsPreserved: true,
				normalizationFromBuilderInput: summarizeDiff(desktopDiff),
				addonNotFoundAcceptable: true,
			},
			web: {
				status: "passed-with-normalization",
				evidenceMethod: "owner visual plus exact raw export",
				client: {
					product: "nuvio.tv/web",
					version: null,
					build: null,
					browser: null,
				},
				rawExport: {
					file: webEvidence.fileName,
					sizeBytes: webEvidence.sizeBytes,
					sha256: webEvidence.sha256,
				},
				orderAndHierarchyPreserved: true,
				sourceSentinelsPreserved: true,
				collectionFolderAndProjectionSentinelsDropped: true,
				normalizationFromDesktopExport: summarizeDiff(webDiff),
				knownNormalization: {
					sourceGenreNullToEmptyString: true,
					optionalNullPropertiesOmitted: true,
					folderFocusGifEnabledTrueToFalse: true,
					collectionFocusGlowEnabledFalseAdded: true,
				},
			},
			mobile: {
				status: "passed-with-raw-artifact-limitation",
				evidenceMethod: "owner visual plus owner-supplied exported JSON text",
				rawArtifactAvailable: false,
				rawArtifactSha256: null,
				orderHierarchyParentsIdsAndSentinelsPreserved: true,
				versionBuildOsDevice: null,
			},
			tv: {
				status: "passed-with-no-independent-export",
				evidenceMethod: "owner visual plus synced profile backed by exact web export",
				independentExportAvailable: false,
				sourceArrayProof: "nuviotv-web-export.json",
				versionBuildOsDevice: null,
			},
		},
		privacyScan,
		pagesBoundary: {
			status: "repository-only-evidence",
			expectedInPagesArtifact: false,
		},
		gate: {
			nuvioClientOrderingEvidence: "complete",
			pullRequest: "pending-owner-approval",
		},
	};
}

function run() {
	const args = process.argv.slice(2);
	assert.ok(
		args.length === 0 || (args.length === 1 && args[0] === "--write-report"),
		"Usage: node scripts/check-builder-reordering-client-evidence.mjs [--write-report]",
	);
	const writeReport = args[0] === "--write-report";
	const report = buildVerificationReport();
	const expectedReportText = jsonText(report);

	if (writeReport) {
		fs.writeFileSync(reportPath, expectedReportText, "utf8");
		console.log("Wrote deterministic issue #59 Nuvio client-evidence verification report.");
		return;
	}

	const committedReportText = fs.readFileSync(reportPath, "utf8");
	assert.equal(
		committedReportText,
		expectedReportText,
		"The issue #59 client-evidence verification report is stale. Regenerate it with --write-report.",
	);
	console.log("Issue #59 Nuvio client evidence verified: Desktop, web, mobile, and TV passed.");
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	try {
		run();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
