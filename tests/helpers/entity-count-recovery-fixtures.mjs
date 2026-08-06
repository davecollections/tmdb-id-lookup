import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReservationReceipt } from "../../scripts/lib/entity-count-budget.mjs";
import { createEntityCountRecoveryPackage } from "../../scripts/lib/entity-count-recovery.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_SCHEMA_VERSION,
	buildTargetSnapshot,
} from "../../scripts/lib/entity-title-counts.mjs";

export function runGit(cwd, args, { allowFailure = false, binary = false, env = {} } = {}) {
	const result = spawnSync("git", args, {
		cwd,
		encoding: binary ? null : "utf8",
		env: { ...process.env, ...env },
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFailure) {
		throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`);
	}
	return result;
}

export async function writeFixtureFile(root, relativePath, value) {
	const destination = path.join(root, ...relativePath.split("/"));
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.writeFile(destination, Buffer.isBuffer(value) ? value : String(value));
}

export async function createRecoveryGitFixture(context) {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "entity-count-recovery-git-"));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const bare = path.join(temporary, "remote.git");
	const seed = path.join(temporary, "seed");
	const writer = path.join(temporary, "writer");
	const recovery = path.join(temporary, "recovery");
	const artifacts = path.join(temporary, "artifacts");
	runGit(temporary, ["init", "--bare", bare]);
	runGit(temporary, ["init", "--initial-branch=main", seed]);
	runGit(seed, ["config", "user.name", "fixture"]);
	runGit(seed, ["config", "user.email", "fixture@example.invalid"]);
	runGit(seed, ["config", "core.autocrlf", "false"]);
	const repository = "davecollections/tmdb-id-lookup";
	const runId = "123456";
	const runAttempt = "2";
	const month = "2026-09";
	const date = "2026-09-15";
	const target = buildTargetSnapshot({
		entityType: "company",
		month,
		exportDate: date,
		ids: [1],
		createdAt: `${date}T08:00:00Z`,
	});
	const targetPath = `maintenance/entity-title-counts/months/${month}/targets/companies.json`;
	const reservationId = `${runId}-${runAttempt}-company-series`;
	const reservationPath = `maintenance/tmdb-request-budget/${date}/reservations/${reservationId}.json`;
	const usagePath = `maintenance/tmdb-request-budget/${date}/usage/${reservationId}-company-series.json`;
	const progressPath = `maintenance/entity-title-counts/months/${month}/progress/company-series/slice-01.json`;
	const reservation = buildReservationReceipt({
		date: new Date(`${date}T08:01:00Z`),
		reservationId,
		workflow: "Monthly TMDB Company Series Counts",
		runId,
		runAttempt,
		job: "company-series",
		plannedMonth: month,
		plannedUtcDate: date,
		allocations: { collection: 10, target_export: 0 },
		bindings: {
			collection: { request_class: "company-series", target_dimension: "company-series", approved_allowance: 10 },
			target_export: { request_class: "target-export", target_dimension: "company", approved_allowance: 0 },
		},
		createdAt: `${date}T08:01:00Z`,
	});
	await writeFixtureFile(seed, "README.md", "fixture base\n");
	runGit(seed, ["add", "."]);
	runGit(seed, ["commit", "-m", "fixture ancestor"]);
	const ancestorCommit = runGit(seed, ["rev-parse", "HEAD"]).stdout.trim();
	await writeFixtureFile(seed, reservationPath, `${JSON.stringify(reservation.receipt, null, 2)}\n`);
	runGit(seed, ["add", "."]);
	runGit(seed, ["commit", "-m", "fixture reservation"]);
	const reservationCommit = runGit(seed, ["rev-parse", "HEAD"]).stdout.trim();
	await writeFixtureFile(seed, targetPath, `${JSON.stringify(target, null, 2)}\n`);
	runGit(seed, ["add", "."]);
	runGit(seed, ["commit", "-m", "fixture target"]);
	const targetCommit = runGit(seed, ["rev-parse", "HEAD"]).stdout.trim();
	runGit(seed, ["remote", "add", "origin", bare]);
	runGit(seed, ["push", "-u", "origin", "main"]);
	runGit(bare, ["symbolic-ref", "HEAD", "refs/heads/main"]);
	runGit(temporary, ["clone", bare, writer]);
	runGit(writer, ["config", "core.autocrlf", "false"]);
	runGit(writer, ["reset", "--hard", "HEAD"]);
	const baseCommit = runGit(writer, ["rev-parse", "HEAD"]).stdout.trim();
	const usage = {
		schema_version: 2,
		reservation_id: reservationId,
		reservation_sha256: reservation.sha256,
		utc_date: date,
		planned_month: month,
		workflow: "Monthly TMDB Company Series Counts",
		run_id: runId,
		run_attempt: runAttempt,
		job: "collect-company-series",
		allocation_key: "collection",
		request_class: "company-series",
		target_dimension: "company-series",
		allowance: 10,
		attempts_used: 1,
		unused_allowance: 9,
		first_attempt_at: `${date}T09:00:00Z`,
		last_attempt_at: `${date}T09:00:00Z`,
		by_host: { "api.themoviedb.org": 1, "files.tmdb.org": 0 },
		by_status_or_outcome: { "200": 1 },
		retries: 0,
		month,
		dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
		target_fingerprint: target.target_fingerprint,
	};
	const progress = {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		month,
		dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
		target_fingerprint: target.target_fingerprint,
		run_id: `${runId}-${runAttempt}-company-series`,
		observed_at: `${date}T09:00:01Z`,
		slice_index: 0,
		total_slices: 14,
		request_usage: { attempts_used: 1, reservation_id: reservationId },
		results: [{ id: 1, status: "positive", count: 5 }],
	};
	await writeFixtureFile(writer, usagePath, `${JSON.stringify(usage, null, 2)}\n`);
	await writeFixtureFile(writer, progressPath, JSON.stringify(progress));
	const packaged = await createEntityCountRecoveryPackage({
		repositoryRoot: writer,
		outputRoot: artifacts,
		workload: "company-series",
		progressPath,
		usagePath,
		reservationPath,
		repository,
		writerCheckoutTrust: {
			expectedOrigin: bare,
			requireGitHubOrigin: false,
		},
		workflow: usage.workflow,
		workflowFile: ".github/workflows/monthly-company-series-counts.yml",
		event: "workflow_dispatch",
		mode: "collect",
		headRef: "refs/heads/main",
		headSha: ancestorCommit,
		runId,
		runAttempt,
		createdAt: `${date}T09:01:00Z`,
	});
	runGit(temporary, ["clone", bare, recovery]);
	runGit(recovery, ["config", "core.autocrlf", "false"]);
	runGit(recovery, ["reset", "--hard", "HEAD"]);
	const provenance = {
		repository,
		runId,
		runAttempt,
		workload: "company-series",
		writerJob: "collect-company-series",
		workflowName: "Monthly TMDB Company Series Counts",
		workflowFile: ".github/workflows/monthly-company-series-counts.yml",
		event: "workflow_dispatch",
		headRef: "refs/heads/main",
		headSha: ancestorCommit,
		baseCommit,
		baseComparisonStatus: "ahead",
		status: "completed",
		conclusion: "failure",
		artifactUploadStepName: "Persist completed typed Company Series output before push",
		artifactUploadStepStatus: "completed",
		artifactUploadStepConclusion: "success",
		artifactId: "77",
		artifactName: packaged.artifactName,
		artifactExpiresAt: "2026-12-01T00:00:00Z",
	};
	return {
		temporary, bare, seed, writer, recovery, artifacts, packaged, provenance,
		baseCommit, ancestorCommit, reservationCommit, targetCommit,
		progressPath, usagePath, targetPath, reservationPath,
	};
}

export async function cloneRacer(fixture, name) {
	const destination = path.join(fixture.temporary, name);
	runGit(fixture.temporary, ["clone", fixture.bare, destination]);
	runGit(destination, ["config", "user.name", "racer"]);
	runGit(destination, ["config", "user.email", "racer@example.invalid"]);
	runGit(destination, ["config", "core.autocrlf", "false"]);
	runGit(destination, ["reset", "--hard", "HEAD"]);
	return destination;
}
