import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
	try {
		await fs.access(path.join(root, relativePath));
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

async function read(relativePath) {
	return fs.readFile(path.join(root, relativePath), "utf8");
}

async function trackedSourceFiles(directory = root) {
	const results = [];
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		if ([".git", "node_modules", "dist", ".pages-site"].includes(entry.name)) continue;
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) results.push(...(await trackedSourceFiles(absolute)));
		else results.push(absolute);
	}
	return results;
}

test("retired global state, collector, publication, and recovery files stay absent", async () => {
	const retired = [
		["maintenance", "entity-title-counts"].join("/"),
		["data", "entity-title-counts.min.json"].join("/"),
		["data", "entity-title-counts-completion.json"].join("/"),
		[".github", "actions", "commit-recovered-entity-count-output", "action.yml"].join("/"),
		[".github", "actions", "package-entity-count-recovery", "action.yml"].join("/"),
		[".github", "actions", "recover-entity-count-output", "action.yml"].join("/"),
		[".github", "workflows", "entity-count-recovery-drill-producer.yml"].join("/"),
		[".github", "workflows", "entity-count-recovery-drill.yml"].join("/"),
		[".github", "workflows", "monthly-company-series-counts.yml"].join("/"),
		[".github", "workflows", "recover-entity-count-output.yml"].join("/"),
		["scripts", "authenticate-entity-count-recovery-base.mjs"].join("/"),
		["scripts", "collect-company-series-counts.mjs"].join("/"),
		["scripts", "commit-recovered-entity-count-output.mjs"].join("/"),
		["scripts", "entity-count-recovery-drill.mjs"].join("/"),
		["scripts", "initialize-entity-count-targets.mjs"].join("/"),
		["scripts", "package-entity-count-recovery.mjs"].join("/"),
		["scripts", "publish-entity-title-counts.mjs"].join("/"),
		["scripts", "recover-entity-count-output.mjs"].join("/"),
		["scripts", "resolve-entity-count-recovery-provenance.mjs"].join("/"),
		["scripts", "validate-entity-count-repair-targets.mjs"].join("/"),
		["scripts", "validate-entity-count-target.mjs"].join("/"),
		["scripts", "verify-entity-count-recovery-integrity.mjs"].join("/"),
		["scripts", "lib", "entity-count-progress.mjs"].join("/"),
		["scripts", "lib", "entity-count-publication.mjs"].join("/"),
		["scripts", "lib", "entity-count-recovery-git.mjs"].join("/"),
		["scripts", "lib", "entity-count-recovery-provenance.mjs"].join("/"),
		["scripts", "lib", "entity-count-recovery-writer-checkout.mjs"].join("/"),
		["scripts", "lib", "entity-count-recovery.mjs"].join("/"),
		["scripts", "lib", "entity-count-repair-binding.mjs"].join("/"),
		["scripts", "lib", "entity-title-counts.mjs"].join("/"),
		["schemas", "entity-count-recovery-manifest.schema.json"].join("/"),
		["schemas", "entity-title-count-target.schema.json"].join("/"),
		["schemas", "entity-title-count-progress.schema.json"].join("/"),
		["schemas", "entity-title-count-completion.schema.json"].join("/"),
		["schemas", "entity-title-count-sidecar.schema.json"].join("/"),
	];
	for (const relativePath of retired) {
		assert.equal(await exists(relativePath), false, relativePath);
	}
});

test("shared maintenance commits expose no typed recovery integrity hook", async () => {
	const action = await read(".github/actions/commit-maintenance-state/action.yml");
	assert.doesNotMatch(action, /integrity-manifest|RECOVERY_INTEGRITY|entity-count-recovery/);
});

test("production routes cannot recreate retired global typed state", async () => {
	const retiredMarkers = [
		["entity", "title", "counts"].join("-"),
		["2026", "09"].join("-"),
		"TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH",
		"typed_progress",
		"typed_counts_active",
		"allow_target_create",
		"allow_finalize",
		"writeProgressDocument",
		"loadDimensionState",
		"loadTargetSnapshot",
		"package-entity-count-recovery",
		"recover-entity-count-output",
		"integrity-manifest",
		"company-series",
	];
	const candidates = (await trackedSourceFiles()).filter((absolute) => {
		const relative = path.relative(root, absolute).replaceAll("\\", "/");
		return (
			(relative.startsWith(".github/") || relative.startsWith("scripts/")) &&
			!relative.endsWith("global-count-precache-retirement.test.mjs")
		);
	});
	for (const absolute of candidates) {
		const source = await fs.readFile(absolute, "utf8");
		for (const marker of retiredMarkers) {
			assert.equal(
				source.includes(marker),
				false,
				`${marker}: ${path.relative(root, absolute)}`,
			);
		}
	}
});

test("ordinary catalogue, audit, repair, and Pages redeployment routes remain", async () => {
	const company = await read(".github/workflows/monthly-company-refresh.yml");
	const companyWrapper = await read(
		".github/workflows/manual-company-rebuild-from-export.yml",
	);
	const network = await read(".github/workflows/monthly-network-refresh.yml");
	const networkWrapper = await read(
		".github/workflows/update-tv-network-details-from-export.yml",
	);
	const audit = await read(".github/workflows/audit-tmdb-export-coverage.yml");
	const auditScript = await read("scripts/audit-tmdb-export-coverage.mjs");
	const repair = await read(".github/workflows/repair-cache-from-audit.yml");
	const deploy = await read(".github/workflows/deploy-pages.yml");
	assert.match(company, /cron: "0 9 1-14 \* \*"/);
	assert.match(company, /data\/companies\.min\.json/);
	assert.match(company, /data\/companies\.csv/);
	assert.match(company, /manual-company-rebuild-from-export\.mjs/);
	assert.match(company, /validate-company-catalogue:/);
	assert.match(network, /cron: "45 8 1,2 \* \*"/);
	assert.match(network, /data\/tv-networks\.min\.json/);
	assert.match(network, /data\/tv-networks\.csv/);
	assert.match(network, /fetch-tv-network-details-from-export\.mjs/);
	assert.match(network, /validate-network-catalogue:/);
	for (const workflow of [company, companyWrapper, network, networkWrapper, repair]) {
		assert.match(workflow, /options: \[plan, collect, validate\]/);
		assert.doesNotMatch(workflow, /sample_ids|network-bootstrap|\bretry\b|\bpublish\b/);
	}
	assert.match(audit, /audit-tmdb-export-coverage\.mjs/);
	assert.match(audit, /actions\/github-script@v7/);
	assert.match(audit, /TMDB Cache Audit Reports/);
	assert.match(auditScript, /companies\.min\.json/);
	assert.match(auditScript, /tv-networks\.min\.json/);
	assert.match(repair, /MAX_REPAIR_IDS/);
	assert.match(repair, /tmdb-request-budget/);
	assert.match(repair, /validate-repair:/);
	assert.match(repair, /repair-company-cache-from-audit\.mjs/);
	assert.match(repair, /repair-tv-network-cache-from-audit\.mjs/);
	assert.match(repair, /data\/company-cache-repair-meta\.json/);
	assert.match(repair, /data\/tv-network-cache-repair-meta\.json/);
	assert.match(deploy, /Monthly TMDB Company Refresh/);
	assert.match(deploy, /Monthly TMDB Network Refresh/);
	assert.match(deploy, /Daily Capped Repair Cache From Audit/);
});
