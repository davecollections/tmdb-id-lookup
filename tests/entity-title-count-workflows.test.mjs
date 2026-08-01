import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	COUNT_PARSER_SEMANTIC_VERSION,
	buildTargetSnapshot,
} from "../scripts/lib/entity-title-counts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const workflowFiles = [
	".github/workflows/audit-tmdb-export-coverage.yml",
	".github/workflows/daily-repair-cache-from-audit.yml",
	".github/workflows/manual-company-rebuild-from-export.yml",
	".github/workflows/monthly-company-refresh.yml",
	".github/workflows/monthly-network-refresh.yml",
	".github/workflows/repair-cache-from-audit.yml",
	".github/workflows/update-tv-network-details-from-export.yml",
	".github/workflows/monthly-company-series-counts.yml",
];

const adaptedRequestScripts = [
	"scripts/audit-tmdb-export-coverage.mjs",
	"scripts/fetch-tv-network-details-from-export.mjs",
	"scripts/manual-company-rebuild-from-export.mjs",
	"scripts/repair-company-cache-from-audit.mjs",
	"scripts/repair-tv-network-cache-from-audit.mjs",
	"scripts/collect-company-series-counts.mjs",
	"scripts/initialize-entity-count-targets.mjs",
];

const schemaFiles = [
	"schemas/tmdb-request-reservation.schema.json",
	"schemas/entity-title-count-target.schema.json",
	"schemas/entity-title-count-progress.schema.json",
	"schemas/entity-title-count-sidecar.schema.json",
	"schemas/entity-title-count-completion.schema.json",
];

async function read(relativePath) {
	return fs.readFile(path.join(root, relativePath), "utf8");
}

function canonicalizeTextLineEndings(value) {
	return value.replace(/\r\n?/g, "\n");
}

function sha256CanonicalText(value) {
	return crypto
		.createHash("sha256")
		.update(canonicalizeTextLineEndings(value))
		.digest("hex")
		.toUpperCase();
}

function jobBlocks(yaml) {
	const lines = yaml.split(/\r?\n/);
	const jobsIndex = lines.findIndex((line) => line === "jobs:");
	assert.notEqual(jobsIndex, -1, "workflow must contain jobs");
	const blocks = new Map();
	let current = null;

	for (const line of lines.slice(jobsIndex + 1)) {
		const match = /^  ([a-zA-Z0-9_-]+):\s*$/.exec(line);
		if (match) {
			current = match[1];
			blocks.set(current, []);
			continue;
		}
		if (current) blocks.get(current).push(line);
	}

	return blocks;
}

test("monthly schedules preserve the authoritative windows", async () => {
	const company = await read(".github/workflows/monthly-company-refresh.yml");
	const network = await read(".github/workflows/monthly-network-refresh.yml");
	const series = await read(".github/workflows/monthly-company-series-counts.yml");
	const audit = await read(".github/workflows/audit-tmdb-export-coverage.yml");

	assert.match(company, /cron: "0 9 1-14 \* \*"/);
	assert.match(network, /cron: "45 8 1,2 \* \*"/);
	assert.match(series, /cron: "0 9 15-28 \* \*"/);
	assert.match(audit, /cron: "15 8 \* \* \*"/);
});

test("every workflow job declares at most one implementable concurrency group", async () => {
	for (const workflowFile of workflowFiles) {
		const yaml = await read(workflowFile);
		for (const [job, lines] of jobBlocks(yaml)) {
			const declarations = lines.filter((line) => /^    concurrency:\s*$/.test(line));
			assert.ok(
				declarations.length <= 1,
				`${workflowFile} job ${job} has multiple concurrency declarations`,
			);
		}
	}
});

test("reusable workflow callers that can commit explicitly pass contents write", async () => {
	for (const [workflowFile, job] of [
		[".github/workflows/daily-repair-cache-from-audit.yml", "repair"],
		[".github/workflows/manual-company-rebuild-from-export.yml", "company"],
		[".github/workflows/update-tv-network-details-from-export.yml", "network"],
	]) {
		const blocks = jobBlocks(await read(workflowFile));
		const source = blocks.get(job).join("\n");
		assert.match(source, /    permissions:\r?\n      contents: write/);
		assert.doesNotMatch(source, /(?:issues|actions|packages|pull-requests): write/);
	}
});

test("Company Series target validation is read-only", async () => {
	const blocks = jobBlocks(await read(".github/workflows/monthly-company-series-counts.yml"));
	const source = blocks.get("validate-company-target").join("\n");
	assert.match(source, /    permissions:\r?\n      contents: read/);
	assert.doesNotMatch(source, /contents: write/);
});

test("reusable plan and validation jobs explicitly downgrade caller tokens to read-only", async () => {
	for (const [workflowFile, jobs] of [
		[".github/workflows/monthly-company-refresh.yml", ["plan"]],
		[".github/workflows/monthly-network-refresh.yml", ["plan"]],
		[".github/workflows/repair-cache-from-audit.yml", ["plan-repair", "validate-targets"]],
	]) {
		const blocks = jobBlocks(await read(workflowFile));
		for (const job of jobs) {
			const source = blocks.get(job).join("\n");
			assert.match(source, /    permissions:\r?\n      contents: read/, `${workflowFile} ${job}`);
			assert.doesNotMatch(source, /contents: write/);
		}
	}
});

test("collectors use bounded commit/push without recovery or repeated collection wiring", async () => {
	for (const [workflowFile, collectorScripts] of [
		[".github/workflows/monthly-company-refresh.yml", ["manual-company-rebuild-from-export.mjs"]],
		[".github/workflows/monthly-network-refresh.yml", ["fetch-tv-network-details-from-export.mjs"]],
		[".github/workflows/monthly-company-series-counts.yml", ["collect-company-series-counts.mjs"]],
		[
			".github/workflows/repair-cache-from-audit.yml",
			["repair-company-cache-from-audit.mjs", "repair-tv-network-cache-from-audit.mjs"],
		],
	]) {
		const source = await read(workflowFile);
		assert.match(source, /uses: \.\/\.github\/actions\/commit-maintenance-state/);
		assert.doesNotMatch(source, /package-maintenance-recovery|upload-artifact|download-artifact|commit-only recovery/i);
		for (const collectorScript of collectorScripts) {
			assert.equal(
				source.split(collectorScript).length - 1,
				1,
				`${workflowFile} must invoke ${collectorScript} exactly once`,
			);
		}
	}
	const commitAction = await read(".github/actions/commit-maintenance-state/action.yml");
	assert.match(commitAction, /for attempt in 1 2 3/);
	for (const removedPath of [
		".github/actions/package-maintenance-recovery/action.yml",
		".github/workflows/recover-entity-count-output.yml",
		"scripts/lib/maintenance-recovery.mjs",
		"scripts/package-maintenance-recovery.mjs",
		"scripts/recover-maintenance-output.mjs",
	]) {
		await assert.rejects(fs.access(path.join(root, removedPath)), { code: "ENOENT" });
	}
});

test("every validate-mode route terminates in a read-only validation job", async () => {
	for (const [workflowFile, planJob] of [
		[".github/workflows/monthly-company-refresh.yml", "plan"],
		[".github/workflows/monthly-network-refresh.yml", "plan"],
		[".github/workflows/monthly-company-series-counts.yml", "plan"],
		[".github/workflows/repair-cache-from-audit.yml", "plan-repair"],
	]) {
		const blocks = jobBlocks(await read(workflowFile));
		const validation = blocks.get("validate-publication").join("\n");
		assert.match(validation, /outputs\.mode == 'validate'/, workflowFile);
		assert.match(validation, /    permissions:\r?\n      contents: read/);
		assert.match(validation, /VALIDATION_ONLY: "true"/);
		assert.doesNotMatch(validation, /contents: write|commit-maintenance-state/);
		assert.match(validation, new RegExp(`    needs: ${planJob}(?:\\r?\\n|$)`));

		const validationEntrants = [...blocks.entries()]
			.filter(([, lines]) => /outputs\.mode == 'validate'/.test(lines.join("\n")))
			.map(([job]) => job);
		assert.deepEqual(validationEntrants, ["validate-publication"], workflowFile);
		assert.equal(blocks.has("finalize"), false, `${workflowFile} retains a shared finalizer`);
	}
});

test("publication routes are write-capable and explicitly exclude validate mode", async () => {
	for (const workflowFile of [
		".github/workflows/monthly-company-refresh.yml",
		".github/workflows/monthly-network-refresh.yml",
		".github/workflows/monthly-company-series-counts.yml",
		".github/workflows/repair-cache-from-audit.yml",
	]) {
		const publication = jobBlocks(await read(workflowFile)).get("publish").join("\n");
		assert.match(publication, /    permissions:\r?\n      contents: write/);
		assert.match(publication, /outputs\.mode != 'validate'/);
		assert.match(publication, /VALIDATION_ONLY: "false"/);
		assert.match(publication, /uses: \.\/\.github\/actions\/commit-maintenance-state/);
	}
});

test("request reservations and dimension writers use static single-purpose groups", async () => {
	const combined = (
		await Promise.all(workflowFiles.map((workflowFile) => read(workflowFile)))
	).join("\n");
	const expectedGroups = [
		"tmdb-request-budget",
		"tmdb-count-targets",
		"tmdb-count-company-movie",
		"tmdb-count-network-series",
		"tmdb-count-company-series",
		"tmdb-count-publication",
	];

	for (const group of expectedGroups) {
		assert.match(combined, new RegExp(`group: ${group}(?:\\r?\\n|$)`));
	}
	assert.doesNotMatch(combined, /group:\s*\$\{\{/);
	assert.match(combined, /group: tmdb-request-budget\r?\n\s+cancel-in-progress: false/);
	assert.doesNotMatch(combined, /\bqueue:/);
});

test("monthly plans bind activation month and immutable UTC date before reservation", async () => {
	for (const workflowFile of [
		".github/workflows/monthly-company-refresh.yml",
		".github/workflows/monthly-network-refresh.yml",
		".github/workflows/monthly-company-series-counts.yml",
	]) {
		const workflow = await read(workflowFile);
		assert.match(workflow, /run: node scripts\/plan-entity-count-run\.mjs/);
		assert.match(workflow, /RESERVATION_PLANNED_MONTH: \$\{\{ needs\.plan\.outputs\.planned_month \}\}/);
		assert.match(workflow, /RESERVATION_PLANNED_UTC_DATE: \$\{\{ needs\.plan\.outputs\.planned_utc_date \}\}/);
		assert.match(workflow, /REQUEST_BINDINGS_JSON:/);
		assert.match(workflow, /TMDB_APPROVED_ALLOWANCE:/);
	}
	const series = await read(".github/workflows/monthly-company-series-counts.yml");
	assert.match(series, /run: node scripts\/validate-entity-count-target\.mjs/);
	assert.doesNotMatch(series, /run: node scripts\/initialize-entity-count-targets\.mjs/);
	assert.match(series, /COUNT_RUN_KIND: company-series/);
	assert.doesNotMatch(series, /target_export\":7/);
});

test("sample collection cannot initialize targets and Network bootstrap cannot finalize", async () => {
	const planSource = await read("scripts/lib/entity-count-run-plan.mjs");
	const initializer = await read("scripts/initialize-entity-count-targets.mjs");
	const network = await read(".github/workflows/monthly-network-refresh.yml");
	assert.match(planSource, /mode !== "sample"/);
	assert.match(planSource, /mode !== "network-bootstrap"/);
	assert.match(initializer, /ALLOW_TARGET_CREATE/);
	assert.match(initializer, /this mode may not create targets/);
	assert.match(network, /network-bootstrap/);
	assert.match(network, /allow_finalize == 'true'/);
	assert.match(network, /if: needs\.plan\.outputs\.allow_target_create == 'true'/);
	assert.match(network, /if: needs\.plan\.outputs\.allow_target_create != 'true'/);
	assert.match(network, /run: node scripts\/validate-entity-count-target\.mjs/);
});

test("read-only target validation fails on a missing sample target without creating files", async (context) => {
	const maintenanceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-sample-target-"));
	context.after(() => fs.rm(maintenanceRoot, { recursive: true, force: true }));
	const result = spawnSync(
		process.execPath,
		[path.join(root, "scripts", "validate-entity-count-target.mjs")],
		{
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				DATASET: "companies",
				COUNT_MONTH: "2026-09",
				ENTITY_COUNT_ROOT: maintenanceRoot,
				ALLOW_MISSING_TARGET: "false",
			},
		},
	);
	assert.notEqual(result.status, 0);
	assert.match(`${result.stdout}\n${result.stderr}`, /Missing frozen company target/);
	assert.deepEqual(await fs.readdir(maintenanceRoot), []);

	const targetPath = path.join(
		maintenanceRoot,
		"months",
		"2026-09",
		"targets",
		"companies.json",
	);
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.writeFile(
		targetPath,
		JSON.stringify(
			buildTargetSnapshot({
				entityType: "company",
				month: "2026-09",
				ids: [2, 7],
				createdAt: "2026-09-01T08:00:00Z",
			}),
		),
	);
	const before = await fs.readFile(targetPath);
	const valid = spawnSync(
		process.execPath,
		[path.join(root, "scripts", "validate-entity-count-target.mjs")],
		{
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				DATASET: "companies",
				COUNT_MONTH: "2026-09",
				ENTITY_COUNT_ROOT: maintenanceRoot,
				ALLOW_MISSING_TARGET: "false",
			},
		},
	);
	assert.equal(valid.status, 0, valid.stderr);
	assert.deepEqual(await fs.readFile(targetPath), before);
});

test("every reservation declares run-plan bindings and every collector checks them", async () => {
	const reservingWorkflows = [
		".github/workflows/audit-tmdb-export-coverage.yml",
		".github/workflows/monthly-company-refresh.yml",
		".github/workflows/monthly-network-refresh.yml",
		".github/workflows/monthly-company-series-counts.yml",
		".github/workflows/repair-cache-from-audit.yml",
	];
	for (const workflowFile of reservingWorkflows) {
		const workflow = await read(workflowFile);
		assert.match(workflow, /REQUEST_BINDINGS_JSON:/, workflowFile);
		assert.match(workflow, /RESERVATION_PLANNED_MONTH:/, workflowFile);
		assert.match(workflow, /RESERVATION_PLANNED_UTC_DATE:/, workflowFile);
	}
	const combined = (await Promise.all(reservingWorkflows.map(read))).join("\n");
	assert.match(combined, /TMDB_REQUEST_CLASS: audit-export/);
	assert.match(combined, /TMDB_REQUEST_CLASS: company-repair/);
	assert.match(combined, /TMDB_REQUEST_CLASS: network-repair/);
	assert.match(combined, /TMDB_REQUEST_CLASS: company-movie/);
	assert.match(combined, /TMDB_REQUEST_CLASS: network-series/);
	assert.match(combined, /TMDB_REQUEST_CLASS: company-series/);
});

test("adapted collectors route TMDB HTTP through the reservation-aware client", async () => {
	for (const script of adaptedRequestScripts) {
		const source = await read(script);
		assert.doesNotMatch(source, /\bfetch\s*\(/, `${script} contains a direct fetch call`);
		assert.match(
			source,
			/(createTmdbRequestClient|fetchExportTargetSnapshot)/,
			`${script} does not use the shared request infrastructure`,
		);
	}
});

test("text immutability hashing canonicalizes only line-ending representation", () => {
	const lf = "alpha\n  beta \ngamma\n";
	const crlf = "alpha\r\n  beta \r\ngamma\r\n";
	const cr = "alpha\r  beta \rgamma\r";
	const stableDigest = sha256CanonicalText(lf);

	assert.equal(sha256CanonicalText(lf), stableDigest);
	assert.equal(sha256CanonicalText(crlf), stableDigest);
	assert.equal(sha256CanonicalText(cr), stableDigest);
	assert.notEqual(sha256CanonicalText("Alpha\n  beta \ngamma\n"), stableDigest);
	assert.notEqual(sha256CanonicalText("alpha\n beta \ngamma\n"), stableDigest);
	assert.notEqual(sha256CanonicalText("alpha\n  beta\ngamma\n"), stableDigest);
	assert.notEqual(sha256CanonicalText("alpha\n  beta \ngamma\n\n"), stableDigest);
});

test("stable genre collector and workflow match their canonical text hashes", async () => {
	const workflow = await read(".github/workflows/update-genre-counts.yml");
	const collector = await read("scripts/update-genre-counts.js");

	assert.equal(
		sha256CanonicalText(workflow),
		"4E3AECDBD9E7AB7682B4B412BE9A0592D72A97184BAB40606ADB1D70350A094F",
	);
	assert.equal(
		sha256CanonicalText(collector),
		"D594522FA63FA0B513207995F4AD9AA476CBE2FB76090FFC2674858028E5BDFF",
	);
	assert.match(workflow, /cron: "30 7 \* \* \*"/);
});

test("authoritative Company and Network collectors retain legacy scan metadata fields", async () => {
	const company = await read("scripts/manual-company-rebuild-from-export.mjs");
	const network = await read("scripts/fetch-tv-network-details-from-export.mjs");
	for (const field of [
		"export_date",
		"export_total_ids",
		"offset",
		"limit",
		"actual_limit",
		"checked",
		"found",
		"missing",
		"total_cached",
		"started_at",
		"finished_at",
	]) {
		assert.match(company, new RegExp(`\\b${field}:`), `Company lost ${field}`);
		assert.match(network, new RegExp(`\\b${field}:`), `Network lost ${field}`);
	}
	assert.match(company, /mode: "manual_company_rebuild_from_export"/);
	assert.match(network, /"tmdb_export_sliced_enrichment"/);
	assert.match(network, /"tmdb_daily_export_full_enrichment"/);
	assert.match(network, /\blowest_id:/);
	assert.match(network, /\bhighest_id:/);
});

test("no-op and capped repair paths write legacy-compatible metadata without a token", async (context) => {
	const month = new Date().toISOString().slice(0, 7);
	for (const fixture of [
		{
			script: "repair-company-cache-from-audit.mjs",
			dataset: "companies",
			entityType: "company",
			audit: "company-id-audit.json",
			cache: "companies.min.json",
			meta: "company-cache-repair-meta.json",
		},
		{
			script: "repair-tv-network-cache-from-audit.mjs",
			dataset: "networks",
			entityType: "network",
			audit: "tv-network-id-audit.json",
			cache: "tv-networks.min.json",
			meta: "tv-network-cache-repair-meta.json",
		},
	]) {
		const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-repair-noop-"));
		context.after(() => fs.rm(temporary, { recursive: true, force: true }));
		const target = buildTargetSnapshot({
			entityType: fixture.entityType,
			month,
			ids: [1],
			createdAt: new Date().toISOString(),
		});
		const targetName = fixture.entityType === "company" ? "companies.json" : "networks.json";
		const targetPath = path.join(
			temporary,
			"maintenance",
			"entity-title-counts",
			"months",
			month,
			"targets",
			targetName,
		);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, JSON.stringify(target));
		await fs.mkdir(path.join(temporary, "data"), { recursive: true });
		await fs.writeFile(path.join(temporary, "data", fixture.cache), "[]");
		await fs.writeFile(
			path.join(temporary, "data", fixture.audit),
			JSON.stringify({
				schema_version: 1,
				parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
				dataset: fixture.dataset,
				audited_at: new Date().toISOString(),
				export_target_month: month,
				export_target_fingerprint: target.target_fingerprint,
				export_target_schema_version: target.schema_version,
				export_target_parser_semantic_version: target.parser_semantic_version,
				missing_from_cache: [],
				extra_in_cache: [],
			}),
		);
		const result = spawnSync(process.execPath, [path.join(root, "scripts", fixture.script)], {
			cwd: temporary,
			encoding: "utf8",
			env: { ...process.env, COUNT_MONTH: month, MODE: "collect", TMDB_BEARER_TOKEN: "" },
		});
		assert.equal(result.status, 0, result.stderr);
		const report = JSON.parse(
			await fs.readFile(path.join(temporary, "data", fixture.meta), "utf8"),
		).last_repair;
		assert.equal(report.reason, "nothing_to_repair");
		assert.equal(report.status, "skipped");
		assert.deepEqual(report.missing_requested, []);
		assert.deepEqual(report.extra_requested, []);
		assert.equal(report.total_cached, 0);
		assert.equal(await fs.stat(path.join(temporary, "data", fixture.cache)).then((entry) => entry.size), 2);
	}

	const cappedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-repair-cap-"));
	context.after(() => fs.rm(cappedRoot, { recursive: true, force: true }));
	const cappedTarget = buildTargetSnapshot({
		entityType: "company",
		month,
		ids: [2],
		createdAt: new Date().toISOString(),
	});
	const cappedTargetPath = path.join(
		cappedRoot,
		"maintenance",
		"entity-title-counts",
		"months",
		month,
		"targets",
		"companies.json",
	);
	await fs.mkdir(path.dirname(cappedTargetPath), { recursive: true });
	await fs.writeFile(cappedTargetPath, JSON.stringify(cappedTarget));
	await fs.mkdir(path.join(cappedRoot, "data"), { recursive: true });
	await fs.writeFile(path.join(cappedRoot, "data", "companies.min.json"), "[]");
	await fs.writeFile(
		path.join(cappedRoot, "data", "company-id-audit.json"),
		JSON.stringify({
			schema_version: 1,
			parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
			dataset: "companies",
			audited_at: new Date().toISOString(),
			export_target_month: month,
			export_target_fingerprint: cappedTarget.target_fingerprint,
			export_target_schema_version: cappedTarget.schema_version,
			export_target_parser_semantic_version: cappedTarget.parser_semantic_version,
			missing_from_cache: [2],
			extra_in_cache: [3],
		}),
	);
	const capped = spawnSync(
		process.execPath,
		[path.join(root, "scripts", "repair-company-cache-from-audit.mjs")],
		{
			cwd: cappedRoot,
			encoding: "utf8",
			env: {
				...process.env,
				COUNT_MONTH: month,
				MODE: "collect",
				MAX_REPAIR_IDS: "0",
				TMDB_BEARER_TOKEN: "",
			},
		},
	);
	assert.equal(capped.status, 0, capped.stderr);
	const cappedReport = JSON.parse(
		await fs.readFile(path.join(cappedRoot, "data", "company-cache-repair-meta.json"), "utf8"),
	).last_repair;
	assert.equal(cappedReport.reason, "max_repair_ids_exceeded");
	assert.deepEqual(cappedReport.missing_requested, [2]);
	assert.deepEqual(cappedReport.extra_requested, [3]);
});

test("published maintenance schemas are valid JSON and expose the fixed guardrails", async () => {
	const schemas = await Promise.all(
		schemaFiles.map(async (schemaFile) => [schemaFile, JSON.parse(await read(schemaFile))]),
	);
	for (const [schemaFile, schema] of schemas) {
		assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
		assert.ok(schema.$id, `${schemaFile} must have a stable ID`);
	}

	const sidecar = schemas.find(([name]) =>
		name.endsWith("entity-title-count-sidecar.schema.json"),
	)[1];
	const completion = schemas.find(([name]) =>
		name.endsWith("entity-title-count-completion.schema.json"),
	)[1];
	assert.equal(sidecar.properties.o.maxItems, 512);
	assert.equal(completion.properties.sidecar.properties.raw_bytes.maximum, 5 * 1024 * 1024);
	assert.equal(
		completion.properties.sidecar.properties.gzip_bytes.maximum,
		Math.floor(1.25 * 1024 * 1024),
	);
	assert.equal(
		completion.properties.sidecar.properties.company_sparse_overrides.maximum,
		25_000,
	);
});
