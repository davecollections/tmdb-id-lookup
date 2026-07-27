import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	buildVerificationReport,
	evidenceDirectory,
} from "../scripts/check-builder-reordering-client-evidence.mjs";
import { isPagesPublicFilePath } from "../scripts/pages-public-paths.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = path.join("scripts", "check-builder-reordering-client-evidence.mjs");

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function snapshotEvidenceFiles() {
	return Object.fromEntries(
		fs.readdirSync(evidenceDirectory)
			.sort()
			.map((fileName) => {
				const bytes = fs.readFileSync(path.join(evidenceDirectory, fileName));
				return [fileName, { sizeBytes: bytes.length, sha256: sha256(bytes) }];
			}),
	);
}

test("issue #59 client evidence proves the bounded cross-client ordering contract", () => {
	const report = buildVerificationReport();

	assert.equal(report.evidenceStatus, "client-ordering-gate-complete");
	assert.equal(report.builderEvidence.reproduction.moveOperationsReplayed, 6);
	assert.equal(report.builderEvidence.reproduction.finalRevision, 7);
	assert.equal(report.builderEvidence.reproduction.exactFinalText, true);
	assert.equal(report.builderEvidence.secondCycle.deterministicTextEquality, true);
	assert.deepEqual(report.expectedContract.visibleCollectionOrder, [
		"issue-59-collection-c",
		"issue-59-collection-a",
		"issue-59-collection-d",
		"issue-59-collection-b",
	]);
	assert.deepEqual(report.expectedContract.folderOrderWithinRegularD, [
		"issue-59-folder-c",
		"issue-59-folder-a",
		"issue-59-folder-b",
	]);
	assert.deepEqual(report.expectedContract.sourceAndProjectionOrderWithinFolderC, [
		"issue-59-source-c",
		"issue-59-source-a",
		"issue-59-source-b",
	]);
	assert.deepEqual(report.clients.desktop.normalizationFromBuilderInput, {
		additions: 102,
		removals: 0,
		changedValues: 0,
		arrayLengthChanges: 0,
		orderChanges: 0,
	});
	assert.deepEqual(report.clients.web.normalizationFromDesktopExport, {
		additions: 4,
		removals: 130,
		changedValues: 14,
		arrayLengthChanges: 0,
		orderChanges: 0,
	});
	assert.equal(report.clients.mobile.rawArtifactAvailable, false);
	assert.equal(report.clients.mobile.rawArtifactSha256, null);
	assert.equal(report.clients.tv.independentExportAvailable, false);
	assert.equal(report.clients.tv.sourceArrayProof, "nuviotv-web-export.json");
	assert.equal(report.privacyScan.status, "passed");
	assert.equal(report.gate.nuvioClientOrderingEvidence, "complete");
	assert.equal(report.gate.pullRequest, "pending-owner-approval");
});

test("the default issue #59 evidence checker is read-only and matches the committed report", () => {
	const before = snapshotEvidenceFiles();
	const output = execFileSync(process.execPath, [checkerPath], {
		cwd: rootDir,
		encoding: "utf8",
	});
	const after = snapshotEvidenceFiles();

	assert.match(output, /Desktop, web, mobile, and TV passed/u);
	assert.deepEqual(after, before);
});

test("issue #59 client evidence remains outside the Pages public-path contract", () => {
	for (const fileName of Object.keys(snapshotEvidenceFiles())) {
		assert.equal(
			isPagesPublicFilePath(`manual-tests/nuvio-clients/issue-59-builder-reordering/${fileName}`),
			false,
			`${fileName} must remain repository-only evidence.`,
		);
	}
});
