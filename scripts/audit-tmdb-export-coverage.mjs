import fs from "node:fs/promises";
import path from "node:path";
import {
	loadTargetSnapshot,
	readJsonFile,
	writeFrozenTargetSnapshot,
} from "./lib/entity-count-progress.mjs";
import {
	COUNT_SCHEMA_VERSION,
	COUNT_PARSER_SEMANTIC_VERSION,
	TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH,
	compareUtcMonths,
	utcMonth,
} from "./lib/entity-title-counts.mjs";
import {
	buildSnapshotFromExport,
	fetchTmdbExportIds,
	TMDB_EXPORT_DATASETS,
} from "./lib/tmdb-export-targets.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const DATA_DIR = "data";
const requestedDataset = process.env.DATASET || "all";
const month = process.env.COUNT_MONTH || utcMonth();
const typedCountsActive =
	compareUtcMonths(month, TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH) >= 0;
const reservationId = process.env.TMDB_RESERVATION_ID;
const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10),
		"usage",
		`${reservationId}-audit.json`,
	);

const DATASETS = {
	companies: {
		label: "Production Companies",
		cachePath: `${DATA_DIR}/companies.min.json`,
		auditPath: `${DATA_DIR}/company-id-audit.json`,
		...TMDB_EXPORT_DATASETS.companies,
	},
	networks: {
		label: "TV Networks",
		cachePath: `${DATA_DIR}/tv-networks.min.json`,
		auditPath: `${DATA_DIR}/tv-network-id-audit.json`,
		...TMDB_EXPORT_DATASETS.networks,
	},
};

function extractCachedIds(cacheData) {
	if (!Array.isArray(cacheData)) {
		return [];
	}

	return cacheData
		.map((item) => Number(item.i ?? item.id))
		.filter((id) => Number.isSafeInteger(id) && id > 0)
		.sort((left, right) => left - right);
}

function difference(leftIds, rightSet) {
	return leftIds.filter((id) => !rightSet.has(id));
}

function duplicateIds(ids) {
	const seen = new Set();
	const duplicates = new Set();

	for (const id of ids) {
		if (seen.has(id)) duplicates.add(id);
		seen.add(id);
	}

	return [...duplicates].sort((left, right) => left - right);
}

function idRange(ids) {
	return ids.length
		? { lowest: ids[0], highest: ids.at(-1) }
		: { lowest: null, highest: null };
}

const client = await createTmdbRequestClient({
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "audit_export",
	usagePath,
	job: "audit-and-initialize-targets",
});

async function auditDataset(key, config) {
	console.log(`\n===== AUDITING ${config.label.toUpperCase()} =====`);
	const exportData = await fetchTmdbExportIds({
		requestClient: client,
		exportPrefix: config.exportPrefix,
	});
	const exportSnapshot = buildSnapshotFromExport({
		entityType: config.entityType,
		exportData,
		month,
	});
	const existingTarget = await loadTargetSnapshot({
		month,
		entityType: config.entityType,
	});
	const targetResult = existingTarget
		? { created: false, snapshot: existingTarget }
		: typedCountsActive
			? await writeFrozenTargetSnapshot({ snapshot: exportSnapshot })
			: { created: false, snapshot: exportSnapshot };
	const cacheData = await readJsonFile(config.cachePath, []);
	const cachedIds = extractCachedIds(cacheData);
	const exportSet = new Set(exportData.ids);
	const cachedSet = new Set(cachedIds);
	const missingFromCache = difference(exportData.ids, cachedSet);
	const extraInCache = difference(cachedIds, exportSet);
	const duplicateCachedIds = duplicateIds(cachedIds);
	const matchedCount = exportData.ids.length - missingFromCache.length;
	const coveragePercent = exportData.ids.length
		? Number(((matchedCount / exportData.ids.length) * 100).toFixed(4))
		: 0;
	const exportRange = idRange(exportData.ids);
	const cachedRange = idRange(cachedIds);

	const audit = {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		dataset: key,
		label: config.label,
		export_date: exportData.exportDate,
		export_total_ids: exportData.ids.length,
		export_target_month: month,
		export_target_fingerprint: targetResult.snapshot.target_fingerprint,
		export_target_schema_version: targetResult.snapshot.schema_version,
		export_target_parser_semantic_version:
			targetResult.snapshot.parser_semantic_version,
		export_target_created: targetResult.created,
		export_fingerprint: exportSnapshot.target_fingerprint,
		export_matches_frozen_target:
			exportSnapshot.target_fingerprint === targetResult.snapshot.target_fingerprint,
		cached_total_ids: cachedIds.length,
		cached_unique_ids: cachedSet.size,
		matched_count: matchedCount,
		coverage_percent: coveragePercent,
		missing_from_cache_count: missingFromCache.length,
		extra_in_cache_count: extraInCache.length,
		duplicate_cached_ids_count: duplicateCachedIds.length,
		lowest_export_id: exportRange.lowest,
		highest_export_id: exportRange.highest,
		lowest_cached_id: cachedRange.lowest,
		highest_cached_id: cachedRange.highest,
		missing_from_cache: missingFromCache,
		extra_in_cache: extraInCache,
		duplicate_cached_ids: duplicateCachedIds,
		audited_at: new Date().toISOString(),
	};

	await fs.writeFile(config.auditPath, `${JSON.stringify(audit, null, 2)}\n`);
	console.log(`Export IDs        : ${audit.export_total_ids.toLocaleString()}`);
	console.log(`Cached IDs        : ${audit.cached_total_ids.toLocaleString()}`);
	console.log(`Coverage          : ${audit.coverage_percent}%`);
	console.log(`Target fingerprint: ${audit.export_target_fingerprint}`);
	console.log(`Saved audit       : ${config.auditPath}`);
	return audit;
}

await fs.mkdir(DATA_DIR, { recursive: true });

const datasetKeys = requestedDataset === "all" ? Object.keys(DATASETS) : [requestedDataset];
const audits = [];

for (const key of datasetKeys) {
	const config = DATASETS[key];
	if (!config) {
		throw new Error(`Unknown DATASET: ${key}. Use all, companies, or networks.`);
	}
	audits.push(await auditDataset(key, config));
}

const summary = {
	schema_version: COUNT_SCHEMA_VERSION,
	parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
	audited_at: new Date().toISOString(),
	datasets: audits.map((audit) => ({
		dataset: audit.dataset,
		label: audit.label,
		export_date: audit.export_date,
		export_total_ids: audit.export_total_ids,
		export_target_month: audit.export_target_month,
		export_target_fingerprint: audit.export_target_fingerprint,
		export_fingerprint: audit.export_fingerprint,
		export_matches_frozen_target: audit.export_matches_frozen_target,
		cached_total_ids: audit.cached_total_ids,
		cached_unique_ids: audit.cached_unique_ids,
		matched_count: audit.matched_count,
		coverage_percent: audit.coverage_percent,
		missing_from_cache_count: audit.missing_from_cache_count,
		extra_in_cache_count: audit.extra_in_cache_count,
		duplicate_cached_ids_count: audit.duplicate_cached_ids_count,
	})),
};

await fs.writeFile(
	`${DATA_DIR}/id-audit-summary.json`,
	`${JSON.stringify(summary, null, 2)}\n`,
);
await client.writeUsage({
	datasets: datasetKeys,
	targets: Object.fromEntries(
		audits.map((audit) => [audit.dataset, audit.export_target_fingerprint]),
	),
});

console.log("\n===== AUDIT SUMMARY =====");
for (const audit of summary.datasets) {
	console.log(
		`${audit.label}: ${audit.coverage_percent}% coverage ` +
			`(${audit.matched_count.toLocaleString()}/${audit.export_total_ids.toLocaleString()})`,
	);
}
console.log(`Saved summary: ${DATA_DIR}/id-audit-summary.json`);
console.log("=========================\n");
