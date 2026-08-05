import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	ENTITY_COUNT_RECOVERY_PROVENANCE,
	authenticateEntityCountRecoveryBaseProvenance,
	resolveEntityCountRecoveryProvenance,
	validateResolvedEntityCountRecoveryProvenance,
} from "../scripts/lib/entity-count-recovery-provenance.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = "davecollections/tmdb-id-lookup";
const runId = "123456";
const runAttempt = "2";
const headSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const artifactName = `maintenance-recovery-v1-${runId}-${runAttempt}-collect-company-movie`;

function responses() {
	return {
		[`/repos/${repository}/actions/runs/${runId}`]: {
			id: Number(runId),
			run_attempt: Number(runAttempt),
			status: "completed",
			conclusion: "failure",
			name: "Monthly TMDB Company Refresh",
			event: "workflow_dispatch",
			path: ".github/workflows/monthly-company-refresh.yml",
			head_branch: "main",
			head_sha: headSha,
			repository: { full_name: repository },
			head_repository: { full_name: repository },
		},
		[`/repos/${repository}/commits/${headSha}`]: { sha: headSha },
		[`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`]: {
			jobs: [{
				id: 1,
				name: "collect-company-movie",
				status: "completed",
				conclusion: "failure",
				steps: [{
					name: "Persist completed typed Company Movie output before push",
					status: "completed",
					conclusion: "success",
				}],
			}],
		},
		[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]: {
			artifacts: [{
				id: 77,
				name: artifactName,
				expired: false,
				expires_at: "2026-12-01T00:00:00Z",
				workflow_run: { id: Number(runId) },
			}],
		},
	};
}

function apiFor(values) {
	return async (endpoint) => {
		if (!(endpoint in values)) throw new Error(`Unexpected mocked endpoint: ${endpoint}`);
		return structuredClone(values[endpoint]);
	};
}

async function resolve(values = responses(), overrides = {}) {
	return resolveEntityCountRecoveryProvenance({
		api: apiFor(values), repository, runId, runAttempt, workload: "company-movie", ...overrides,
	});
}

function manifestFor(baseCommit = baseSha) {
	return {
		status: "ready",
		mode: "collect",
		repository,
		run_id: runId,
		run_attempt: runAttempt,
		workload: "company-movie",
		writer_job: "collect-company-movie",
		workflow: "Monthly TMDB Company Refresh",
		workflow_file: ".github/workflows/monthly-company-refresh.yml",
		event: "workflow_dispatch",
		head_ref: "refs/heads/main",
		head_sha: headSha,
		base_commit: baseCommit,
		artifact_name: artifactName,
	};
}

function baseAuthenticationResponses(baseCommit, status) {
	return {
		[`/repos/${repository}/commits/${baseCommit}`]: { sha: baseCommit },
		[`/repos/${repository}/compare/${headSha}...${baseCommit}`]: {
			status,
			ahead_by: status === "identical" ? 0 : 2,
			base_commit: { sha: headSha },
			merge_base_commit: { sha: headSha },
		},
	};
}

test("approved completed source run resolves one exact non-expired artifact", async () => {
	const result = await resolve();
	assert.equal(result.artifactId, "77");
	assert.equal(result.artifactName, artifactName);
	assert.equal(result.workflowFile, ".github/workflows/monthly-company-refresh.yml");
	assert.equal(result.headSha, headSha);
	assert.equal(result.artifactUploadStepName, "Persist completed typed Company Movie output before push");
	assert.equal(result.artifactUploadStepStatus, "completed");
	assert.equal(result.artifactUploadStepConclusion, "success");
});

test("every approved workflow, event, workload, and writer combination resolves", async () => {
	for (const [workload, writerJob, uploadStep, workflowFile, event] of [
		["company-movie", "collect-company-movie", "Persist completed typed Company Movie output before push", ".github/workflows/monthly-company-refresh.yml", "schedule"],
		["company-movie", "collect-company-movie", "Persist completed typed Company Movie output before push", ".github/workflows/monthly-company-refresh.yml", "workflow_dispatch"],
		["company-movie", "collect-company-movie", "Persist completed typed Company Movie output before push", ".github/workflows/manual-company-rebuild-from-export.yml", "workflow_dispatch"],
		["company-series", "collect-company-series", "Persist completed typed Company Series output before push", ".github/workflows/monthly-company-series-counts.yml", "schedule"],
		["company-series", "collect-company-series", "Persist completed typed Company Series output before push", ".github/workflows/monthly-company-series-counts.yml", "workflow_dispatch"],
		["network-series", "collect-network-series", "Persist completed typed Network Series output before push", ".github/workflows/monthly-network-refresh.yml", "schedule"],
		["network-series", "collect-network-series", "Persist completed typed Network Series output before push", ".github/workflows/monthly-network-refresh.yml", "workflow_dispatch"],
		["network-series", "collect-network-series", "Persist completed typed Network Series output before push", ".github/workflows/update-tv-network-details-from-export.yml", "workflow_dispatch"],
		["company-repair", "repair-company", "Persist typed Company repair output before push", ".github/workflows/repair-cache-from-audit.yml", "workflow_dispatch"],
		["company-repair", "repair-company", "Persist typed Company repair output before push", ".github/workflows/daily-repair-cache-from-audit.yml", "workflow_dispatch"],
		["company-repair", "repair-company", "Persist typed Company repair output before push", ".github/workflows/daily-repair-cache-from-audit.yml", "workflow_run"],
		["network-repair", "repair-network", "Persist typed Network repair output before push", ".github/workflows/repair-cache-from-audit.yml", "workflow_dispatch"],
		["network-repair", "repair-network", "Persist typed Network repair output before push", ".github/workflows/daily-repair-cache-from-audit.yml", "workflow_dispatch"],
		["network-repair", "repair-network", "Persist typed Network repair output before push", ".github/workflows/daily-repair-cache-from-audit.yml", "workflow_run"],
	]) {
		const values = responses();
		const run = values[`/repos/${repository}/actions/runs/${runId}`];
		run.path = workflowFile;
		run.event = event;
		run.name = workflowFile.split("/").at(-1);
		const writer = values[`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`].jobs[0];
		writer.name = `caller / ${writerJob}`;
		writer.steps[0].name = uploadStep;
		values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]
			.artifacts[0].name = `maintenance-recovery-v1-${runId}-${runAttempt}-${writerJob}`;
		const result = await resolve(values, { workload });
		assert.equal(result.workflowFile, workflowFile);
		assert.equal(result.event, event);
		assert.equal(result.writerJob, writerJob);
		assert.equal(result.artifactUploadStepName, uploadStep);
	}
});

test("the closed provenance allowlist names the exact protected writer upload steps", async () => {
	for (const [workload, workflowFile] of [
		["company-movie", ".github/workflows/monthly-company-refresh.yml"],
		["company-series", ".github/workflows/monthly-company-series-counts.yml"],
		["network-series", ".github/workflows/monthly-network-refresh.yml"],
		["company-repair", ".github/workflows/repair-cache-from-audit.yml"],
		["network-repair", ".github/workflows/repair-cache-from-audit.yml"],
	]) {
		const contract = ENTITY_COUNT_RECOVERY_PROVENANCE[workload];
		const source = await fs.readFile(path.join(sourceRoot, workflowFile), "utf8");
		assert.match(
			source,
			new RegExp(`id: recovery-package\\r?\\n\\s+name: ${contract.artifactUploadStep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
			workload,
		);
	}
});

test("active, successful, wrong-repository, wrong-workflow, wrong-event, wrong-ref, wrong-attempt, and wrong-SHA runs fail closed", async () => {
	for (const mutate of [
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].status = "in_progress"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].conclusion = "success"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].head_repository.full_name = "other/repo"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].path = ".github/workflows/update-genre-counts.yml"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].event = "pull_request"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].head_branch = "feature"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].run_attempt = 3; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}`].head_sha = "bad"; },
		(values) => { values[`/repos/${repository}/commits/${headSha}`].sha = "b".repeat(40); },
	]) {
		const values = responses();
		mutate(values);
		await assert.rejects(resolve(values));
	}
});

test("only one exact successful upload step in the approved writer job is accepted", async () => {
	const jobsEndpoint = `/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`;
	const exactName = "Persist completed typed Company Movie output before push";
	for (const [label, mutate] of [
		["missing", (jobs) => { jobs[0].steps = []; }],
		["failed", (jobs) => { jobs[0].steps[0].conclusion = "failure"; }],
		["cancelled", (jobs) => { jobs[0].steps[0].conclusion = "cancelled"; }],
		["skipped", (jobs) => { jobs[0].steps[0].conclusion = "skipped"; }],
		["neutral", (jobs) => { jobs[0].steps[0].conclusion = "neutral"; }],
		["not completed", (jobs) => { jobs[0].steps[0].status = "in_progress"; }],
		["duplicate", (jobs) => { jobs[0].steps.push({ ...jobs[0].steps[0] }); }],
		["wrong identity", (jobs) => { jobs[0].steps[0].name = `${exactName} copy`; }],
		["right step in another job", (jobs) => {
			jobs[0].steps = [];
			jobs.push({
				id: 2,
				name: "publish",
				status: "completed",
				conclusion: "failure",
				steps: [{ name: exactName, status: "completed", conclusion: "success" }],
			});
		}],
	]) {
		const values = responses();
		mutate(values[jobsEndpoint].jobs);
		await assert.rejects(resolve(values), /artifact-upload step/i, label);
	}
});

test("missing, expired, duplicate, wrong-name, wrong-run artifacts and job mismatch fail closed", async () => {
	for (const mutate of [
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`].artifacts = []; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`].artifacts[0].expired = true; },
		(values) => { const artifacts = values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`].artifacts; artifacts.push({ ...artifacts[0], id: 78 }); },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`].artifacts[0].name = "forged"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`].artifacts[0].workflow_run.id = 9; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`].jobs[0].name = "publish"; },
		(values) => { values[`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`].jobs[0].status = "in_progress"; },
	]) {
		const values = responses();
		mutate(values);
		await assert.rejects(resolve(values));
	}
});

test("GitHub API authentication accepts both a later writer base and an identical trigger checkout", async () => {
	const provenance = await resolve();
	for (const [baseCommit, status] of [[baseSha, "ahead"], [headSha, "identical"]]) {
		const manifest = manifestFor(baseCommit);
		const authenticated = await authenticateEntityCountRecoveryBaseProvenance({
			api: apiFor(baseAuthenticationResponses(baseCommit, status)),
			manifest,
			provenance,
		});
		assert.equal(authenticated.baseCommit, baseCommit);
		assert.equal(authenticated.baseComparisonStatus, status);
		assert.equal(validateResolvedEntityCountRecoveryProvenance({ manifest, provenance: authenticated }), manifest);
	}
});

test("GitHub API authentication rejects behind, diverged, unrelated, and mismatched base commits", async () => {
	const provenance = await resolve();
	for (const status of ["behind", "diverged", "unrelated"]) {
		await assert.rejects(
			authenticateEntityCountRecoveryBaseProvenance({
				api: apiFor(baseAuthenticationResponses(baseSha, status)),
				manifest: manifestFor(),
				provenance,
			}),
			(error) => error?.code === "base_commit_ancestry",
			status,
		);
	}
	const mismatched = baseAuthenticationResponses(baseSha, "ahead");
	mismatched[`/repos/${repository}/commits/${baseSha}`].sha = "c".repeat(40);
	await assert.rejects(
		authenticateEntityCountRecoveryBaseProvenance({
			api: apiFor(mismatched), manifest: manifestFor(), provenance,
		}),
		(error) => error?.code === "base_commit",
	);
});

test("API provenance rejects a coherent manifest self-claim from an unapproved identity", async () => {
	const provenance = await resolve();
	const manifest = manifestFor();
	const authenticated = await authenticateEntityCountRecoveryBaseProvenance({
		api: apiFor(baseAuthenticationResponses(baseSha, "ahead")), manifest, provenance,
	});
	assert.equal(validateResolvedEntityCountRecoveryProvenance({ manifest, provenance: authenticated }), manifest);
	for (const [field, value] of [
		["workflow", "Forged workflow name"],
		["workflow_file", ".github/workflows/update-genre-counts.yml"],
		["event", "pull_request"],
		["head_sha", "b".repeat(40)],
		["base_commit", "c".repeat(40)],
		["artifact_name", "forged"],
		["writer_job", "publish"],
	]) {
		await assert.rejects(async () => validateResolvedEntityCountRecoveryProvenance({
			manifest: { ...manifest, [field]: value }, provenance: authenticated,
		}));
	}
	for (const field of [
		"artifactUploadStepName",
		"artifactUploadStepStatus",
		"artifactUploadStepConclusion",
	]) {
		await assert.rejects(async () => validateResolvedEntityCountRecoveryProvenance({
			manifest,
			provenance: { ...authenticated, [field]: "forged" },
		}));
	}
});
