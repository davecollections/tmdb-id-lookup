import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildReservationReceipt,
	canonicalJson,
} from "../scripts/lib/entity-count-budget.mjs";
import { buildRepairMetadata } from "../scripts/lib/entity-cache-repair.mjs";
import {
	createEntityCountRecoveryPackage,
	entityCountRecoveryArtifactName,
	inspectEntityCountRecoveryPackage,
	recoverEntityCountPackage,
	sha256Bytes,
	validateTmdbRequestUsageReceipt,
} from "../scripts/lib/entity-count-recovery.mjs";
import {
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_SCHEMA_VERSION,
	buildTargetSnapshot,
} from "../scripts/lib/entity-title-counts.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "davecollections/tmdb-id-lookup";

function runGit(cwd, args, { allowFailure = false, binary = false } = {}) {
	const result = spawnSync("git", args, { cwd, encoding: binary ? null : "utf8", maxBuffer: 64 * 1024 * 1024 });
	if (result.status !== 0 && !allowFailure) {
		throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`);
	}
	return result;
}

async function write(root, relativePath, value) {
	const destination = path.join(root, ...relativePath.split("/"));
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.writeFile(destination, Buffer.isBuffer(value) ? value : String(value));
}

async function read(root, relativePath) {
	return fs.readFile(path.join(root, ...relativePath.split("/")));
}

async function exists(root, relativePath) {
	return fs.access(path.join(root, ...relativePath.split("/"))).then(() => true, () => false);
}

function workloadConfig(workload) {
	if (workload === "company-series") {
		return {
			workflow: "Monthly TMDB Company Series Counts",
			date: "2026-09-15",
			month: "2026-09",
			entityType: "company",
			dimension: "company-series",
			reservationJob: "company-series",
			usageJob: "collect-company-series",
			allocationKey: "collection",
			requestClass: "company-series",
			runSuffix: "company-series",
			usageSuffix: "company-series",
			progressDirectory: "progress/company-series",
			totalSlices: 14,
			legacy: null,
		};
	}
	if (workload === "network-series") {
		return {
			workflow: "Monthly TMDB Network Refresh",
			date: "2026-09-01",
			month: "2026-09",
			entityType: "network",
			dimension: "network-series",
			reservationJob: "network-series",
			usageJob: "collect-network-series",
			allocationKey: "collection",
			requestClass: "network-series",
			runSuffix: "network-series",
			usageSuffix: "network-series",
			progressDirectory: "progress/network-series",
			totalSlices: 2,
			legacy: {
				paths: [
					"data/tv-networks.min.json",
					"data/tv-networks.csv",
					"data/tv-network-scan-meta.json",
					"data/tv-network-export.json",
				],
			},
		};
	}
	if (workload === "company-movie") {
		return {
			workflow: "Monthly TMDB Company Refresh",
			date: "2026-09-01",
			month: "2026-09",
			entityType: "company",
			dimension: "company-movie",
			reservationJob: "company-movie",
			usageJob: "collect-company-movie",
			allocationKey: "collection",
			requestClass: "company-movie",
			runSuffix: "company-movie",
			usageSuffix: "company-movie",
			progressDirectory: "progress/company-movie",
			totalSlices: 14,
			legacy: {
				paths: [
					"data/companies.min.json",
					"data/companies.csv",
					"data/scan-meta.json",
					"data/production-company-export.json",
				],
			},
		};
	}
	if (["company-repair", "network-repair"].includes(workload)) {
		const company = workload === "company-repair";
		return {
			workflow: "Repair Cache From Audit",
			date: "2026-09-03",
			month: "2026-09",
			entityType: company ? "company" : "network",
			dimension: company ? "company-movie" : "network-series",
			reservationJob: "cache-repair",
			usageJob: company ? "repair-company" : "repair-network",
			allocationKey: company ? "company_repair" : "network_repair",
			requestClass: company ? "company-repair" : "network-repair",
			runSuffix: company ? "company-repair" : "network-repair",
			usageSuffix: company ? "company-repair" : "network-repair",
			progressDirectory: company ? "patches/company-movie" : "patches/network-series",
			totalSlices: null,
			legacy: {
				paths: company
					? ["data/companies.min.json", "data/companies.csv", "data/company-cache-repair-meta.json"]
					: ["data/tv-networks.min.json", "data/tv-networks.csv", "data/tv-network-cache-repair-meta.json"],
			},
		};
	}
	throw new Error(`Unsupported test workload: ${workload}`);
}

function workflowFileFor(workload) {
	if (workload === "company-movie") return ".github/workflows/monthly-company-refresh.yml";
	if (workload === "company-series") return ".github/workflows/monthly-company-series-counts.yml";
	if (workload === "network-series") return ".github/workflows/monthly-network-refresh.yml";
	return ".github/workflows/repair-cache-from-audit.yml";
}

function compactCompany({ name = "Studio", count = 5 } = {}) {
	return JSON.stringify([{ i: 1, n: name, t: count }]);
}

function companyCsv({ name = "Studio", count = 5 } = {}) {
	return `id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n1,${name},${count},,,,https://www.themoviedb.org/company/1\n`;
}

function compactNetwork({ name = "Network", count = 5 } = {}) {
	return JSON.stringify([{ i: 1, n: name, t: count }]);
}

function networkCsv({ name = "Network", count = 5 } = {}) {
	return `id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n1,${name},${count},,,,https://www.themoviedb.org/network/1\n`;
}

async function createFixture(context, { workload = "company-series", attemptsUsed = 1 } = {}) {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "entity-count-recovery-test-"));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const writerRoot = path.join(temporary, "writer");
	const latestRoot = path.join(temporary, "latest");
	const outputRoot = path.join(temporary, "artifacts");
	await fs.mkdir(writerRoot, { recursive: true });
	await fs.mkdir(latestRoot, { recursive: true });
	const config = workloadConfig(workload);
	const runId = "123456";
	const runAttempt = "2";
	const reservationId = `${runId}-${runAttempt}-${config.reservationJob}`;
	const target = buildTargetSnapshot({
		entityType: config.entityType,
		month: config.month,
		exportDate: config.date,
		ids: workload.endsWith("-repair") ? [1, 2] : [1],
		createdAt: `${config.date}T08:00:00Z`,
	});
	const targetPath = `maintenance/entity-title-counts/months/${config.month}/targets/${config.entityType === "company" ? "companies" : "networks"}.json`;
	const reservationPath = `maintenance/tmdb-request-budget/${config.date}/reservations/${reservationId}.json`;
	const usagePath = `maintenance/tmdb-request-budget/${config.date}/usage/${reservationId}-${config.usageSuffix}.json`;
	const progressPath = config.totalSlices === null
		? `maintenance/entity-title-counts/months/${config.month}/${config.progressDirectory}/${runId}-${runAttempt}-${config.runSuffix}.json`
		: `maintenance/entity-title-counts/months/${config.month}/${config.progressDirectory}/slice-01.json`;
	const allowance = 10;
	const allocations = config.reservationJob === "cache-repair"
		? { company_repair: 10, network_repair: 10 }
		: { collection: allowance, target_export: 0 };
	const bindings = config.reservationJob === "cache-repair"
		? {
			company_repair: {
				request_class: "company-repair",
				target_dimension: "company-movie",
				approved_allowance: 10,
			},
			network_repair: {
				request_class: "network-repair",
				target_dimension: "network-series",
				approved_allowance: 10,
			},
		}
		: {
			collection: {
				request_class: config.requestClass,
				target_dimension: config.dimension,
				approved_allowance: allowance,
			},
			target_export: {
				request_class: "target-export",
				target_dimension: config.entityType,
				approved_allowance: 0,
			},
		};
	const reservation = buildReservationReceipt({
		date: new Date(`${config.date}T08:01:00Z`),
		reservationId,
		workflow: config.workflow,
		runId,
		runAttempt,
		job: config.reservationJob,
		plannedMonth: config.month,
		plannedUtcDate: config.date,
		allocations,
		bindings,
		createdAt: `${config.date}T08:01:00Z`,
	});
	const usage = {
		schema_version: 2,
		reservation_id: reservationId,
		reservation_sha256: reservation.sha256,
		utc_date: config.date,
		planned_month: config.month,
		workflow: config.workflow,
		run_id: runId,
		run_attempt: runAttempt,
		job: config.usageJob,
		allocation_key: config.allocationKey,
		request_class: config.requestClass,
		target_dimension: config.dimension,
		allowance,
		attempts_used: attemptsUsed,
		unused_allowance: allowance - attemptsUsed,
		first_attempt_at: attemptsUsed ? `${config.date}T09:00:00Z` : null,
		last_attempt_at: attemptsUsed ? `${config.date}T09:00:00Z` : null,
		by_host: { "api.themoviedb.org": attemptsUsed, "files.tmdb.org": 0 },
		by_status_or_outcome: attemptsUsed ? { "200": attemptsUsed } : {},
		retries: 0,
		month: config.month,
		dimension: config.dimension,
		target_fingerprint: target.target_fingerprint,
	};
	const observedAt = `${config.date}T09:00:01Z`;
	const progress = {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		month: config.month,
		dimension: config.dimension,
		target_fingerprint: target.target_fingerprint,
		run_id: `${runId}-${runAttempt}-${config.runSuffix}`,
		observed_at: observedAt,
		slice_index: config.totalSlices === null ? null : 0,
		total_slices: config.totalSlices,
		request_usage: { attempts_used: attemptsUsed, reservation_id: reservationId },
		results: [{ id: 1, status: "positive", count: 5 }],
	};
	for (const root of [writerRoot, latestRoot]) {
		await write(root, targetPath, `${JSON.stringify(target, null, 2)}\n`);
		await write(root, reservationPath, `${JSON.stringify(reservation.receipt, null, 2)}\n`);
	}
	await write(writerRoot, usagePath, `${JSON.stringify(usage, null, 2)}\n`);
	await write(writerRoot, progressPath, JSON.stringify(progress));

	const baseFiles = new Map();
	const outputFiles = new Map();
	if (config.legacy) {
		const company = config.entityType === "company";
		const cachePath = company ? "data/companies.min.json" : "data/tv-networks.min.json";
		const csvPath = company ? "data/companies.csv" : "data/tv-networks.csv";
		const markerPath = config.legacy.paths.find((candidate) => candidate.endsWith("meta.json"));
		const markerKey = markerPath.includes("repair") ? "last_repair" : "last_scan";
		const exportPath = config.legacy.paths.find((candidate) => candidate.endsWith("export.json"));
		const base = {
			[cachePath]: company
				? compactCompany({ name: "Base Studio", count: 4 })
				: compactNetwork({ name: "Base Network", count: 4 }),
			[csvPath]: company
				? companyCsv({ name: "Base Studio", count: 4 })
				: networkCsv({ name: "Base Network", count: 4 }),
			[markerPath]: `${JSON.stringify({
				[markerKey]: {
					month: config.month,
					target_fingerprint: target.target_fingerprint,
					total_cached: 1,
					finished_at: `${config.date}T08:30:00Z`,
				},
			}, null, 2)}\n`,
			...(exportPath ? { [exportPath]: `${JSON.stringify({
				target_fingerprint: target.target_fingerprint,
				total_ids: 1,
				updated_at: `${config.date}T08:30:00Z`,
			}, null, 2)}\n` } : {}),
		};
		const output = {
			[cachePath]: company ? compactCompany() : compactNetwork(),
			[csvPath]: company ? companyCsv() : networkCsv(),
			[markerPath]: `${JSON.stringify({
				[markerKey]: {
					month: config.month,
					target_fingerprint: target.target_fingerprint,
					total_cached: 1,
					finished_at: observedAt,
				},
			}, null, 2)}\n`,
			...(exportPath ? { [exportPath]: `${JSON.stringify({
				target_fingerprint: target.target_fingerprint,
				total_ids: 1,
				updated_at: observedAt,
			}, null, 2)}\n` } : {}),
		};
		for (const legacyPath of config.legacy.paths) {
			baseFiles.set(legacyPath, Buffer.from(base[legacyPath]));
			outputFiles.set(legacyPath, Buffer.from(output[legacyPath]));
			await write(latestRoot, legacyPath, base[legacyPath]);
			await write(writerRoot, legacyPath, output[legacyPath]);
		}
	}

	const usageBytes = await read(writerRoot, usagePath);
	const progressBytes = await read(writerRoot, progressPath);
	await fs.rm(path.join(writerRoot, ...usagePath.split("/")));
	await fs.rm(path.join(writerRoot, ...progressPath.split("/")));
	await fs.rm(path.join(writerRoot, ...targetPath.split("/")));
	await fs.rm(path.join(writerRoot, ...reservationPath.split("/")));
	for (const relativePath of baseFiles.keys()) {
		await fs.rm(path.join(writerRoot, ...relativePath.split("/")));
	}
	runGit(writerRoot, ["init", "--initial-branch=main"]);
	runGit(writerRoot, ["config", "user.name", "fixture"]);
	runGit(writerRoot, ["config", "user.email", "fixture@example.invalid"]);
	runGit(writerRoot, ["config", "core.autocrlf", "false"]);
	runGit(writerRoot, ["remote", "add", "origin", `https://github.com/${REPOSITORY}.git`]);
	await write(writerRoot, "README.md", "workflow trigger\n");
	runGit(writerRoot, ["add", "."]);
	runGit(writerRoot, ["commit", "-m", "fixture workflow trigger"]);
	const ancestorCommit = runGit(writerRoot, ["rev-parse", "HEAD"]).stdout.trim();
	await write(writerRoot, reservationPath, `${JSON.stringify(reservation.receipt, null, 2)}\n`);
	runGit(writerRoot, ["add", "."]);
	runGit(writerRoot, ["commit", "-m", "fixture reservation"]);
	const reservationCommit = runGit(writerRoot, ["rev-parse", "HEAD"]).stdout.trim();
	await write(writerRoot, targetPath, `${JSON.stringify(target, null, 2)}\n`);
	for (const [relativePath, bytes] of baseFiles) await write(writerRoot, relativePath, bytes);
	runGit(writerRoot, ["add", "."]);
	runGit(writerRoot, ["commit", "-m", "fixture target and writer base"]);
	const baseCommit = runGit(writerRoot, ["rev-parse", "HEAD"]).stdout.trim();
	await write(writerRoot, usagePath, usageBytes);
	await write(writerRoot, progressPath, progressBytes);
	for (const [relativePath, bytes] of outputFiles) await write(writerRoot, relativePath, bytes);

	const packaged = await createEntityCountRecoveryPackage({
		repositoryRoot: writerRoot,
		outputRoot,
		workload,
		progressPath,
		usagePath,
		reservationPath,
		repository: REPOSITORY,
		workflow: config.workflow,
		workflowFile: workflowFileFor(workload),
		event: "workflow_dispatch",
		mode: "collect",
		headRef: "refs/heads/main",
		headSha: ancestorCommit,
		runId,
		runAttempt,
		createdAt: `${config.date}T09:01:00Z`,
	});
	return {
		temporary,
		writerRoot,
		latestRoot,
		outputRoot,
		config,
		runId,
		runAttempt,
		target,
		targetPath,
		reservationPath,
		usagePath,
		progressPath,
		usage,
		progress,
		packaged,
		baseCommit,
		ancestorCommit,
		reservationCommit,
	};
}

function recoveryOptions(fixture) {
	return {
		artifactRoot: fixture.packaged.artifactRoot,
		repositoryRoot: fixture.latestRoot,
		expectedRepository: REPOSITORY,
		expectedRunId: fixture.runId,
		expectedRunAttempt: fixture.runAttempt,
		expectedWorkload: fixture.packaged.manifest.workload,
	};
}

async function writeCompleteNewerScanCohort(fixture, mutate = () => {}) {
	const { month: ignoredMonth, dimension: ignoredDimension, target_fingerprint: ignoredFingerprint, ...requests } = fixture.usage;
	requests.utc_date = "2026-09-02";
	requests.first_attempt_at = "2026-09-02T09:10:00Z";
	requests.last_attempt_at = "2026-09-02T09:20:00Z";
	const report = {
		mode: "manual_company_rebuild_from_export",
		export_date: fixture.target.export_date,
		export_total_ids: fixture.target.total_ids,
		offset: 0,
		limit: 1,
		actual_limit: 1,
		checked: 1,
		found: 1,
		missing: 0,
		total_cached: 2,
		month: fixture.target.month,
		target_fingerprint: fixture.target.target_fingerprint,
		target_total_ids: fixture.target.total_ids,
		slice_index: 0,
		total_slices: 14,
		current_ids: 1,
		older_unresolved_ids: 0,
		base_current_requests: 2,
		max_reserved_requests: 10,
		legacy_only: false,
		typed_progress_enabled: true,
		results: { positive: 1, zero: 0, failed: 0, unavailable: 0 },
		requests,
		started_at: "2026-09-02T09:00:00Z",
		finished_at: "2026-09-02T10:00:00Z",
	};
	const snapshot = {
		export_date: fixture.target.export_date,
		total_ids: fixture.target.total_ids,
		target_fingerprint: fixture.target.target_fingerprint,
		last_offset: 0,
		last_limit: 1,
		updated_at: "2026-09-02T09:30:00Z",
	};
	const cohort = {
		cache: [
			{ i: 1, n: "Newer Studio", t: 6 },
			{ i: 2, n: "Newly Exported Studio", t: 1 },
		],
		csv:
			"id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n" +
			"1,Newer Studio,6,,,,https://www.themoviedb.org/company/1\n" +
			"2,Newly Exported Studio,1,,,,https://www.themoviedb.org/company/2\n",
		report,
		snapshot,
	};
	mutate(cohort);
	await write(fixture.latestRoot, "data/companies.min.json", JSON.stringify(cohort.cache));
	await write(fixture.latestRoot, "data/companies.csv", cohort.csv);
	await write(fixture.latestRoot, "data/scan-meta.json", `${JSON.stringify({ last_scan: cohort.report }, null, 2)}\n`);
	if (cohort.snapshot !== null) {
		await write(fixture.latestRoot, "data/production-company-export.json", `${JSON.stringify(cohort.snapshot, null, 2)}\n`);
	} else {
		await fs.rm(path.join(fixture.latestRoot, "data", "production-company-export.json"), { force: true });
	}
}

async function writeCompleteNewerRepairCohort(fixture, mutate = () => {}) {
	const audit = {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		dataset: "companies",
		audited_at: "2026-09-02T09:00:00.000Z",
		export_target_month: "2026-09",
		export_target_fingerprint: fixture.target.target_fingerprint,
		export_target_schema_version: fixture.target.schema_version,
		export_target_parser_semantic_version: fixture.target.parser_semantic_version,
		missing_from_cache: [2],
		extra_in_cache: [],
	};
	const { month: ignoredMonth, dimension: ignoredDimension, target_fingerprint: ignoredFingerprint, ...requestSummary } = fixture.usage;
	requestSummary.utc_date = "2026-09-02";
	requestSummary.first_attempt_at = "2026-09-02T09:40:00Z";
	requestSummary.last_attempt_at = "2026-09-02T09:50:00Z";
	const report = buildRepairMetadata({
		entityType: "company",
		mode: "collect",
		month: "2026-09",
		audit,
		auditFreshness: { audited_at: audit.audited_at, age_hours: 1, max_age_hours: 36 },
		target: fixture.target,
		typedCountsActive: true,
		maxRepairIds: 4000,
		missingIds: [2],
		extraIds: [],
		startedAt: "2026-09-02T09:30:00Z",
		finishedAt: "2026-09-02T10:00:00Z",
		status: "completed",
		outcomes: [{
			id: 2,
			cache_restored: true,
			details_status: 200,
			typed_count_reused: false,
			progress_result: { status: "positive" },
		}],
		usage: {
			...requestSummary,
			workflow: "Repair Cache From Audit",
			job: "repair-company",
			allocation_key: "company_repair",
			request_class: "company-repair",
		},
		requestPlan: {
			details_requests: 1,
			discover_requests: 1,
			typed_count_reuse: 0,
			base_requests: 2,
		},
		totalCached: 2,
	});
	const cohort = {
		cache: [
			{ i: 1, n: "Newer Studio", t: 6 },
			{ i: 2, n: "Newly Exported Studio", t: 1 },
		],
		csv:
			"id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n" +
			"1,Newer Studio,6,,,,https://www.themoviedb.org/company/1\n" +
			"2,Newly Exported Studio,1,,,,https://www.themoviedb.org/company/2\n",
		audit,
		report,
	};
	mutate(cohort);
	await write(fixture.latestRoot, "data/companies.min.json", JSON.stringify(cohort.cache));
	await write(fixture.latestRoot, "data/companies.csv", cohort.csv);
	if (cohort.audit) {
		await write(fixture.latestRoot, "data/company-id-audit.json", `${JSON.stringify(cohort.audit, null, 2)}\n`);
	} else await fs.rm(path.join(fixture.latestRoot, "data", "company-id-audit.json"), { force: true });
	if (cohort.report) {
		await write(
			fixture.latestRoot,
			"data/company-cache-repair-meta.json",
			`${JSON.stringify({ last_repair: cohort.report }, null, 2)}\n`,
		);
	} else await fs.rm(path.join(fixture.latestRoot, "data", "company-cache-repair-meta.json"), { force: true });
}

function setZeroAttemptSummary(summary) {
	summary.attempts_used = 0;
	summary.unused_allowance = summary.allowance;
	summary.first_attempt_at = null;
	summary.last_attempt_at = null;
	summary.by_host = { "api.themoviedb.org": 0, "files.tmdb.org": 0 };
	summary.by_status_or_outcome = {};
	summary.retries = 0;
}

async function rewriteManifest(artifactRoot, mutate) {
	const manifestPath = path.join(artifactRoot, "manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
	await mutate(manifest);
	await fs.writeFile(manifestPath, canonicalJson(manifest));
	return manifest;
}

test("package is canonical, outside the checkout, hash-bound, and statically inventoried", async (context) => {
	const fixture = await createFixture(context);
	assert.equal(fixture.packaged.ready, true);
	assert.equal(path.relative(fixture.writerRoot, fixture.packaged.artifactRoot).startsWith(".."), true);
	const manifestBytes = await read(fixture.packaged.artifactRoot, "manifest.json");
	const manifest = JSON.parse(manifestBytes);
	assert.equal(manifest.status, "ready");
	assert.equal(manifest.workflow_file, ".github/workflows/monthly-company-series-counts.yml");
	assert.equal(manifest.event, "workflow_dispatch");
	assert.equal(manifest.mode, "collect");
	assert.equal(manifest.head_ref, "refs/heads/main");
	assert.equal(manifest.head_sha, fixture.ancestorCommit);
	assert.equal(manifest.base_commit, fixture.baseCommit);
	assert.notEqual(manifest.base_commit, manifest.head_sha);
	assert.equal(manifestBytes.toString("utf8"), canonicalJson(manifest));
	assert.equal(
		manifest.artifact_name,
		entityCountRecoveryArtifactName({
			runId: fixture.runId,
			runAttempt: fixture.runAttempt,
			workload: "company-series",
		}),
	);
	assert.deepEqual(manifest.files.map((file) => file.role).sort(), ["typed-progress", "usage"]);
	for (const file of manifest.files) {
		assert.equal(file.base_sha256, null);
		assert.equal(sha256Bytes(await read(fixture.packaged.artifactRoot, `payload/${file.path}`)), file.sha256);
	}
});

test("packaging rejects a caller base claim that differs from the actual writer checkout", async (context) => {
	const fixture = await createFixture(context);
	const outputRoot = path.join(fixture.temporary, "mismatched-base-package");
	await assert.rejects(
		createEntityCountRecoveryPackage({
			repositoryRoot: fixture.writerRoot,
			outputRoot,
			workload: "company-series",
			progressPath: fixture.progressPath,
			usagePath: fixture.usagePath,
			reservationPath: fixture.reservationPath,
			baseCommit: "b".repeat(40),
			repository: REPOSITORY,
			workflow: fixture.config.workflow,
			workflowFile: fixture.packaged.manifest.workflow_file,
			event: fixture.packaged.manifest.event,
			mode: "collect",
			headRef: "refs/heads/main",
			headSha: fixture.baseCommit,
			runId: fixture.runId,
			runAttempt: fixture.runAttempt,
		}),
		(error) => error?.code === "base_commit_mismatch",
	);
	assert.equal(await exists(fixture.temporary, "mismatched-base-package"), false);
});

test("offline package inspection accepts distinct syntactically valid head and base commits", async (context) => {
	const fixture = await createFixture(context);
	await rewriteManifest(fixture.packaged.artifactRoot, (manifest) => {
		manifest.base_commit = "b".repeat(40);
	});
	const inspected = await inspectEntityCountRecoveryPackage(recoveryOptions(fixture));
	assert.equal(inspected.manifest.base_commit, "b".repeat(40));
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
});

test("package creation rejects an output root inside the checkout before writing", async (context) => {
	const fixture = await createFixture(context);
	const forbiddenOutput = path.join(fixture.writerRoot, "recovery-output");
	await assert.rejects(
		createEntityCountRecoveryPackage({
			repositoryRoot: fixture.writerRoot,
			outputRoot: forbiddenOutput,
			workload: "company-series",
			progressPath: fixture.progressPath,
			usagePath: fixture.usagePath,
			reservationPath: fixture.reservationPath,
			repository: REPOSITORY,
			workflow: fixture.config.workflow,
			workflowFile: workflowFileFor("company-series"),
			event: "workflow_dispatch",
			mode: "collect",
			headRef: "refs/heads/main",
			headSha: fixture.baseCommit,
			runId: fixture.runId,
			runAttempt: fixture.runAttempt,
			createdAt: `${fixture.config.date}T09:01:00Z`,
		}),
		(error) => error?.code === "output_inside_repository",
	);
	assert.equal(await exists(fixture.writerRoot, "recovery-output"), false);
});

test("all five workload contracts package, inspect, and restore their exact owned paths", async (context) => {
	for (const workload of [
		"company-movie",
		"company-series",
		"network-series",
		"company-repair",
		"network-repair",
	]) {
		const fixture = await createFixture(context, { workload });
		assert.equal(fixture.packaged.ready, true, workload);
		const inspected = await inspectEntityCountRecoveryPackage(recoveryOptions(fixture));
		assert.equal(inspected.manifest.workload, workload);
		assert.equal(inspected.manifest.head_sha, fixture.ancestorCommit, workload);
		assert.equal(inspected.manifest.base_commit, fixture.baseCommit, workload);
		assert.equal(inspected.manifest.files.filter((file) => file.role === "usage").length, 1);
		assert.equal(inspected.manifest.files.filter((file) => file.role === "typed-progress").length, 1);
		assert.deepEqual(
			inspected.manifest.files.filter((file) => file.role === "legacy").map((file) => file.path).sort(),
			[...(fixture.config.legacy?.paths || [])].sort(),
		);
		for (const file of inspected.manifest.files.filter((entry) => entry.role === "legacy")) {
			const baseBytes = runGit(
				fixture.writerRoot,
				["show", `${fixture.baseCommit}:${file.path}`],
				{ binary: true },
			).stdout;
			assert.equal(file.base_sha256, sha256Bytes(baseBytes), `${workload} ${file.path}`);
		}
		const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
		assert.equal(recovered.changed, true, workload);
		assert.equal(await exists(fixture.latestRoot, fixture.progressPath), true, workload);
		assert.equal(await exists(fixture.latestRoot, fixture.usagePath), true, workload);
	}
});

test("synthetic interruption restores exact usage and progress, then repeats as a no-op", async (context) => {
	const fixture = await createFixture(context);
	const first = await recoverEntityCountPackage(recoveryOptions(fixture));
	assert.equal(first.changed, true);
	assert.deepEqual(first.paths, [fixture.progressPath, fixture.usagePath].sort());
	assert.deepEqual(await read(fixture.latestRoot, fixture.progressPath), await read(fixture.writerRoot, fixture.progressPath));
	assert.deepEqual(await read(fixture.latestRoot, fixture.usagePath), await read(fixture.writerRoot, fixture.usagePath));
	const second = await recoverEntityCountPackage(recoveryOptions(fixture));
	assert.equal(second.changed, false);
	assert.deepEqual(second.paths, []);
});

test("a conflicting immutable path fails before either usage or progress is written", async (context) => {
	const fixture = await createFixture(context);
	await write(fixture.latestRoot, fixture.usagePath, "conflict\n");
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), /conflict/i);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal((await read(fixture.latestRoot, fixture.usagePath)).toString(), "conflict\n");
});

test("partial transactional copy failure rolls back every recovered path", async (context) => {
	const fixture = await createFixture(context);
	await assert.rejects(
		recoverEntityCountPackage({
			...recoveryOptions(fixture),
			transactionHooks: {
				beforeReplace: ({ index }) => {
					if (index === 1) throw new Error("synthetic second replacement failure");
				},
			},
		}),
		/synthetic second replacement failure/,
	);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
});

test("altered payload, noncanonical manifest, and unexpected members fail closed", async (context) => {
	for (const kind of ["payload", "manifest", "unexpected"]) {
		const fixture = await createFixture(context);
		if (kind === "payload") {
			await write(fixture.packaged.artifactRoot, `payload/${fixture.progressPath}`, "{}\n");
		} else if (kind === "manifest") {
			const manifestPath = path.join(fixture.packaged.artifactRoot, "manifest.json");
			const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
			await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
		} else await write(fixture.packaged.artifactRoot, "unexpected.txt", "nope");
		await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)));
		assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
		assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
	}
});

test("wrong run, attempt, repository, workload, workflow, and reservation bindings are rejected", async (context) => {
	const fixture = await createFixture(context);
	for (const [field, value] of [
		["expectedRunId", "999"],
		["expectedRunAttempt", "3"],
		["expectedRepository", "other/repository"],
		["expectedWorkload", "network-series"],
	]) {
		await assert.rejects(
			inspectEntityCountRecoveryPackage({ ...recoveryOptions(fixture), [field]: value }),
		);
	}
	const manifestFixture = await createFixture(context);
	await rewriteManifest(manifestFixture.packaged.artifactRoot, (manifest) => {
		manifest.workflow = "Wrong workflow";
	});
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(manifestFixture)), /usage.*workflow/i);

	const reservationFixture = await createFixture(context);
	const reservation = JSON.parse(await read(reservationFixture.latestRoot, reservationFixture.reservationPath));
	reservation.run_attempt = "9";
	await write(reservationFixture.latestRoot, reservationFixture.reservationPath, JSON.stringify(reservation));
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(reservationFixture)), /reservation/i);
});

test("traversal, absolute paths, duplicates, case collisions, and unexpected inventory fail", async (context) => {
	for (const mutation of ["traversal", "absolute", "duplicate", "case", "missing"]) {
		const fixture = await createFixture(context);
		await rewriteManifest(fixture.packaged.artifactRoot, (manifest) => {
			if (mutation === "traversal") manifest.files[0].path = "../outside.json";
			else if (mutation === "absolute") manifest.files[0].path = "/tmp/outside.json";
			else if (mutation === "duplicate") manifest.files.push({ ...manifest.files[0] });
			else if (mutation === "case") manifest.files.push({ ...manifest.files[0], path: manifest.files[0].path.toUpperCase() });
			else manifest.files.pop();
			manifest.files.sort((left, right) => left.path.localeCompare(right.path));
			manifest.payload_inventory_sha256 = sha256Bytes(Buffer.from(canonicalJson(manifest.files)));
		});
		await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)));
		assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	}
});

test("links in the downloaded artifact are rejected when the platform permits creating one", async (context) => {
	const fixture = await createFixture(context);
	const linkPath = path.join(fixture.packaged.artifactRoot, "forbidden-link");
	try {
		await fs.symlink(path.join(fixture.packaged.artifactRoot, "manifest.json"), linkPath, "file");
	} catch (error) {
		if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
			context.skip(`Platform did not permit a test symlink: ${error.code}`);
			return;
		}
		throw error;
	}
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), /link/i);
});

test("zero-consumption typed output is validated but no recovery-ready artifact is created", async (context) => {
	const fixture = await createFixture(context, { attemptsUsed: 0 });
	assert.equal(fixture.packaged.ready, false);
	assert.equal(fixture.packaged.reason, "zero-consumption");
	assert.equal(await fs.access(fixture.outputRoot).then(() => true, () => false), false);
});

test("usage receipt validation reconciles every total and rejects identity drift", async (context) => {
	const fixture = await createFixture(context);
	assert.equal(validateTmdbRequestUsageReceipt(fixture.usage), fixture.usage);
	for (const mutate of [
		(value) => { value.unused_allowance -= 1; },
		(value) => { value.by_host["api.themoviedb.org"] = 0; },
		(value) => { value.by_status_or_outcome = {}; },
		(value) => { value.target_fingerprint = "sha256:" + "0".repeat(64); },
		(value) => { value.workflow = "other"; },
	]) {
		const altered = structuredClone(fixture.usage);
		mutate(altered);
		if (altered.target_fingerprint !== fixture.usage.target_fingerprint) {
			assert.equal(validateTmdbRequestUsageReceipt(altered), altered);
		} else if (altered.workflow === "other") {
			assert.throws(() => validateTmdbRequestUsageReceipt(altered, { workflow: fixture.usage.workflow }));
		} else assert.throws(() => validateTmdbRequestUsageReceipt(altered));
	}
});

test("legacy recovery restores the exact base-relative cohort with usage and progress", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
	assert.equal(recovered.legacyDecision, "restore");
	assert.deepEqual(recovered.paths, [fixture.progressPath, fixture.usagePath, ...fixture.config.legacy.paths].sort());
	for (const legacyPath of fixture.config.legacy.paths) {
		assert.deepEqual(await read(fixture.latestRoot, legacyPath), await read(fixture.writerRoot, legacyPath));
	}
});

test("an incorrect base_sha256 is rejected against the exact writer-base cohort", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	await rewriteManifest(fixture.packaged.artifactRoot, (manifest) => {
		const legacy = manifest.files.find((file) => file.role === "legacy");
		legacy.base_sha256 = "f".repeat(64);
		manifest.payload_inventory_sha256 = sha256Bytes(Buffer.from(canonicalJson(manifest.files)));
	});
	await assert.rejects(
		recoverEntityCountPackage(recoveryOptions(fixture)),
		/base state|base hash|not provably newer/i,
	);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
});

test("complete validated newer legacy cohort is preserved while missing immutable state is restored", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	await writeCompleteNewerRepairCohort(fixture);
	const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
	assert.equal(recovered.legacyDecision, "preserve-newer");
	assert.deepEqual(recovered.paths, [fixture.progressPath, fixture.usagePath].sort());
	assert.match((await read(fixture.latestRoot, "data/companies.min.json")).toString(), /Newer Studio/);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), true);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), true);
});

test("incomplete or incoherent newest repair cohorts fail without immutable writes", async (context) => {
	for (const [label, mutate] of [
		["missing audit", (cohort) => { cohort.audit = null; }],
		["incomplete status", (cohort) => { cohort.report.status = "partial_failure"; }],
		["fingerprint mismatch", (cohort) => { cohort.report.target_fingerprint = `sha256:${"0".repeat(64)}`; }],
		["count mismatch", (cohort) => { cohort.report.total_cached = 1; }],
		["month mismatch", (cohort) => { cohort.report.month = "2026-10"; }],
		["timestamp mismatch", (cohort) => { cohort.report.started_at = "2026-09-02T11:00:00Z"; }],
		["audit list mismatch", (cohort) => { cohort.audit.missing_from_cache = [1]; }],
		["cache and CSV title-count mismatch", (cohort) => {
			cohort.csv = cohort.csv.replace("1,Newer Studio,6,", "1,Newer Studio,7,");
		}],
	]) {
		const fixture = await createFixture(context, { workload: "company-movie" });
		await writeCompleteNewerRepairCohort(fixture, mutate);
		await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), undefined, label);
		assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false, label);
		assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false, label);
	}
});

test("complete newer scan cohort is preserved while typed progress and usage are restored", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	await writeCompleteNewerScanCohort(fixture);
	const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
	assert.equal(recovered.legacyDecision, "preserve-newer");
	assert.deepEqual(recovered.paths, [fixture.progressPath, fixture.usagePath].sort());
	assert.match((await read(fixture.latestRoot, "data/companies.min.json")).toString(), /Newer Studio/);
});

test("scan and repair profiles accept request attempts bounded by their producer window", async (context) => {
	for (const [profile, writeCohort] of [
		["scan", writeCompleteNewerScanCohort],
		["repair", writeCompleteNewerRepairCohort],
	]) {
		const fixture = await createFixture(context, { workload: "company-movie" });
		await writeCohort(fixture);
		const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
		assert.equal(recovered.legacyDecision, "preserve-newer", profile);
	}
});

test("scan and repair profiles reject out-of-window request attempts before recovered writes", async (context) => {
	for (const [profile, writeCohort] of [
		["scan", writeCompleteNewerScanCohort],
		["repair", writeCompleteNewerRepairCohort],
	]) {
		for (const [label, mutateRequests] of [
			["first before start", (requests) => {
				requests.first_attempt_at = "2026-09-02T08:50:00Z";
				requests.last_attempt_at = "2026-09-02T09:20:00Z";
			}],
			["last before start", (requests) => {
				requests.first_attempt_at = "2026-09-02T08:40:00Z";
				requests.last_attempt_at = "2026-09-02T08:50:00Z";
			}],
			["first after finish", (requests) => {
				requests.first_attempt_at = "2026-09-02T10:10:00Z";
				requests.last_attempt_at = "2026-09-02T10:20:00Z";
			}],
			["last after finish", (requests) => {
				requests.first_attempt_at = "2026-09-02T09:50:00Z";
				requests.last_attempt_at = "2026-09-02T10:10:00Z";
			}],
			["inverted range", (requests) => {
				requests.first_attempt_at = "2026-09-02T09:50:00Z";
				requests.last_attempt_at = "2026-09-02T09:40:00Z";
			}],
			["missing first", (requests) => { requests.first_attempt_at = null; }],
			["missing last", (requests) => { requests.last_attempt_at = null; }],
			["another producer window", (requests) => {
				requests.first_attempt_at = "2026-09-03T09:10:00Z";
				requests.last_attempt_at = "2026-09-03T09:20:00Z";
			}],
		]) {
			const fixture = await createFixture(context, { workload: "company-movie" });
			await writeCohort(fixture, (cohort) => mutateRequests(cohort.report.requests));
			await assert.rejects(
				recoverEntityCountPackage(recoveryOptions(fixture)),
				undefined,
				`${profile}: ${label}`,
			);
			assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false, `${profile}: ${label}`);
			assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false, `${profile}: ${label}`);
		}
	}
});

test("scan and repair profiles preserve the valid zero-attempt receipt representation", async (context) => {
	for (const [profile, writeCohort] of [
		["scan", writeCompleteNewerScanCohort],
		["repair", writeCompleteNewerRepairCohort],
	]) {
		const fixture = await createFixture(context, { workload: "company-movie" });
		await writeCohort(fixture, (cohort) => setZeroAttemptSummary(cohort.report.requests));
		const recovered = await recoverEntityCountPackage(recoveryOptions(fixture));
		assert.equal(recovered.legacyDecision, "preserve-newer", profile);
	}
});

test("incomplete or incoherent newest scan cohorts fail without immutable writes", async (context) => {
	for (const [label, mutate] of [
		["missing export", (cohort) => { cohort.snapshot = null; }],
		["incomplete marker", (cohort) => { delete cohort.report.requests; }],
		["fingerprint mismatch", (cohort) => { cohort.snapshot.target_fingerprint = `sha256:${"0".repeat(64)}`; }],
		["count mismatch", (cohort) => { cohort.report.total_cached = 1; }],
		["cache and CSV title-count mismatch", (cohort) => {
			cohort.csv = cohort.csv.replace("1,Newer Studio,6,", "1,Newer Studio,7,");
		}],
		["month mismatch", (cohort) => { cohort.report.month = "2026-10"; }],
		["timestamp mismatch", (cohort) => { cohort.snapshot.updated_at = "2026-09-02T11:00:00Z"; }],
	]) {
		const fixture = await createFixture(context, { workload: "company-movie" });
		await writeCompleteNewerScanCohort(fixture, mutate);
		await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), undefined, label);
		assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false, label);
		assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false, label);
	}
});

test("mixed or ambiguous legacy state fails before immutable files are restored", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	await write(fixture.latestRoot, "data/companies.min.json", compactCompany({ name: "Mixed Studio", count: 9 }));
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), /legacy/i);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
});

test("equally new scan and repair producer markers are ambiguous and never mixed", async (context) => {
	const fixture = await createFixture(context, { workload: "company-movie" });
	await writeCompleteNewerScanCohort(fixture);
	await write(
		fixture.latestRoot,
		"data/company-cache-repair-meta.json",
		`${JSON.stringify({ last_repair: { month: "2026-09", finished_at: "2026-09-02T10:00:00Z" } }, null, 2)}\n`,
	);
	await assert.rejects(recoverEntityCountPackage(recoveryOptions(fixture)), /ambiguous/i);
	assert.equal(await exists(fixture.latestRoot, fixture.progressPath), false);
	assert.equal(await exists(fixture.latestRoot, fixture.usagePath), false);
});

test("recovery workflow is manual, zero-secret, static-concurrency, and publishes from latest main", async () => {
	const workflow = await fs.readFile(path.join(sourceRoot, ".github/workflows/recover-entity-count-output.yml"), "utf8");
	const action = await fs.readFile(path.join(sourceRoot, ".github/actions/recover-entity-count-output/action.yml"), "utf8");
	assert.match(workflow, /workflow_dispatch:/);
	assert.doesNotMatch(workflow, /\bschedule:|TMDB_BEARER_TOKEN|collect-company-series-counts|manual-company-rebuild-from-export|fetch-tv-network-details-from-export|repair-company-cache-from-audit|repair-tv-network-cache-from-audit/);
	for (const group of [
		"tmdb-count-company-movie",
		"tmdb-count-company-series",
		"tmdb-count-network-series",
		"tmdb-count-publication",
	]) assert.match(workflow, new RegExp(`group: ${group}`));
	assert.doesNotMatch(workflow, /group:\s*\$\{\{/);
	assert.match(workflow, /COUNT_MONTH:.*planned_month/);
	assert.match(workflow, /node scripts\/publish-entity-title-counts\.mjs/);
	assert.match(action, /actions\/download-artifact@[a-f0-9]{40} # v8\.0\.1/);
	assert.match(action, /node scripts\/resolve-entity-count-recovery-provenance\.mjs/);
	assert.match(action, /node scripts\/authenticate-entity-count-recovery-base\.mjs/);
	assert.match(action, /artifact-ids:/);
	assert.match(action, /uses: \.\/\.github\/actions\/commit-recovered-entity-count-output/);
	assert.doesNotMatch(action, /commit-maintenance-state|\brebase\b/);
});

test("all five typed writer paths persist before their first output commit", async () => {
	const workflows = [
		[".github/workflows/monthly-company-refresh.yml", 1, [{ name: "collect-company-movie", needs: ["reserve-requests", "ensure-company-target"] }]],
		[".github/workflows/monthly-network-refresh.yml", 1, [{ name: "collect-network-series", needs: ["reserve-requests", "ensure-network-target"] }]],
		[".github/workflows/monthly-company-series-counts.yml", 1, [{ name: "collect-company-series", needs: ["reserve-requests", "validate-company-target"] }]],
		[".github/workflows/repair-cache-from-audit.yml", 2, [
			{ name: "repair-company", needs: ["reserve-repair-requests", "validate-targets"] },
			{ name: "repair-network", needs: ["reserve-repair-requests", "validate-targets"] },
		]],
	];
	for (const [relativePath, expected, writerJobs] of workflows) {
		const source = await fs.readFile(path.join(sourceRoot, relativePath), "utf8");
		assert.equal(source.split("uses: ./.github/actions/package-entity-count-recovery").length - 1, expected);
		for (const writerJob of writerJobs) {
			assert.match(
				source,
				new RegExp(`${writerJob.name}:\\s[\\s\\S]*?actions/checkout@v4[\\s\\S]*?ref: main[\\s\\S]*?fetch-depth: 0[\\s\\S]*?uses: \\.\\/\\.github\\/actions\\/package-entity-count-recovery`),
				`${relativePath} ${writerJob.name}`,
			);
			const jobStart = source.indexOf(`  ${writerJob.name}:`);
			const stepsStart = source.indexOf("    steps:", jobStart);
			const jobHeader = source.slice(jobStart, stepsStart);
			for (const dependency of writerJob.needs) assert.match(jobHeader, new RegExp(`\\b${dependency}\\b`));
		}
		let cursor = 0;
		for (let index = 0; index < expected; index += 1) {
			const packageIndex = source.indexOf("uses: ./.github/actions/package-entity-count-recovery", cursor);
			const commitIndex = source.indexOf("uses: ./.github/actions/commit-maintenance-state", packageIndex);
			assert.ok(packageIndex >= 0 && commitIndex > packageIndex, `${relativePath} persistence order`);
			cursor = commitIndex + 1;
		}
	}
	const action = await fs.readFile(path.join(sourceRoot, ".github/actions/package-entity-count-recovery/action.yml"), "utf8");
	assert.match(action, /actions\/upload-artifact@[a-f0-9]{40} # v7\.0\.1/);
	assert.match(action, /if-no-files-found: error/);
	assert.match(action, /retention-days: 90/);
	assert.match(action, /overwrite: false/);
	const packageScript = await fs.readFile(path.join(sourceRoot, "scripts/package-entity-count-recovery.mjs"), "utf8");
	const packageCore = await fs.readFile(path.join(sourceRoot, "scripts/lib/entity-count-recovery.mjs"), "utf8");
	const writerCheckout = await fs.readFile(path.join(sourceRoot, "scripts/lib/entity-count-recovery-writer-checkout.mjs"), "utf8");
	assert.doesNotMatch(packageScript, /baseCommit|baseFileReader|HEAD:/);
	assert.match(packageScript, /headSha: process\.env\.GITHUB_SHA/);
	assert.match(packageCore, /resolveEntityCountRecoveryWriterCheckout/);
	assert.match(writerCheckout, /\["rev-parse", "--verify", "HEAD"\]/);
	assert.match(writerCheckout, /\["merge-base", "--is-ancestor", headSha, baseCommit\]/);
	assert.doesNotMatch(packageCore, /baseCommit\s*!==\s*headSha|base_commit\s*!==\s*manifest\.head_sha/);
});

test("recovery schemas are strict draft 2020-12 documents", async () => {
	for (const relativePath of [
		"schemas/entity-count-recovery-manifest.schema.json",
		"schemas/tmdb-request-usage.schema.json",
	]) {
		const schema = JSON.parse(await fs.readFile(path.join(sourceRoot, relativePath), "utf8"));
		assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
		assert.equal(schema.additionalProperties, false);
		assert.ok(schema.$id);
	}
});
