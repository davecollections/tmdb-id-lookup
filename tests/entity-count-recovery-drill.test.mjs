import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	createFixtureOnlyDrillArtifact,
	inspectFixtureOnlyDrillArtifact,
	runFixtureOnlyRecoveryDrill,
} from "../scripts/entity-count-recovery-drill.mjs";

test("fixture-only drill artifact is exact, isolated, and repeatable without requests", async (context) => {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "entity-count-drill-test-"));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const created = await createFixtureOnlyDrillArtifact({ outputRoot: temporary, runId: "73", runAttempt: "1" });
	assert.equal(created.manifest.mode, "fixture-only");
	assert.equal(created.manifest.path, "fixture-output/output.json");
	assert.equal(created.manifest.zero_tmdb_requests, true);
	const inspected = await inspectFixtureOnlyDrillArtifact(created.artifactRoot);
	assert.deepEqual(inspected.manifest, created.manifest);
	const result = await runFixtureOnlyRecoveryDrill(created.artifactRoot);
	assert.equal(result.exact, true);
	assert.equal(result.repeatedNoop, true);
	assert.equal(result.corruptRejected, true);
	assert.equal(result.traversalRejected, true);
	assert.equal(result.symlinkTested, process.platform !== "win32");
	assert.equal(result.networkRequestAttempts, 0);
	assert.equal(result.tmdbRequestAttempts, 0);
});

test("fixture-only drill format cannot name a production recovery path", async (context) => {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "entity-count-drill-path-"));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const created = await createFixtureOnlyDrillArtifact({ outputRoot: temporary, runId: "73", runAttempt: "2" });
	const manifestPath = path.join(created.artifactRoot, "drill-manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
	manifest.path = "data/companies.min.json";
	await fs.writeFile(manifestPath, JSON.stringify(manifest));
	await assert.rejects(inspectFixtureOnlyDrillArtifact(created.artifactRoot), /fixture-only path/);
});
