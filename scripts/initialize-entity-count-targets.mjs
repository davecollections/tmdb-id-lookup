import path from "node:path";
import {
	loadTargetSnapshot,
	targetPathFor,
	writeFrozenTargetSnapshot,
} from "./lib/entity-count-progress.mjs";
import { utcMonth } from "./lib/entity-title-counts.mjs";
import {
	buildSnapshotFromExport,
	fetchTmdbExportIds,
	TMDB_EXPORT_DATASETS,
} from "./lib/tmdb-export-targets.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const datasetKey = process.env.DATASET || "companies";
const config = TMDB_EXPORT_DATASETS[datasetKey];
const month = process.env.COUNT_MONTH || utcMonth();
const root = process.env.ENTITY_COUNT_ROOT;
const allowTargetCreate = process.env.ALLOW_TARGET_CREATE === "true";

if (!config) {
	throw new Error(`Unknown DATASET ${datasetKey}. Use companies or networks.`);
}

let target = await loadTargetSnapshot({
	root,
	month,
	entityType: config.entityType,
});

if (!target) {
	if (!allowTargetCreate) {
		throw new Error(
			`Missing frozen ${config.entityType} target for ${month}; this mode may not create targets.`,
		);
	}
	const receiptPath = process.env.TMDB_RESERVATION_PATH;
	const reservationId = process.env.TMDB_RESERVATION_ID;
	const usagePath =
		process.env.TMDB_USAGE_PATH ||
		path.join(
			"maintenance",
			"tmdb-request-budget",
			process.env.TMDB_RESERVATION_UTC_DATE || month,
			"usage",
			`${reservationId}-target-${datasetKey}.json`,
		);
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId,
		reservationSha256: process.env.TMDB_RESERVATION_SHA256,
		allocationKey: process.env.TMDB_ALLOCATION_KEY || "target_export",
		usagePath,
		job: `ensure-${datasetKey}-target`,
	});
	const exportData = await fetchTmdbExportIds({
		requestClient: client,
		exportPrefix: config.exportPrefix,
	});
	const result = await writeFrozenTargetSnapshot({
		root,
		snapshot: buildSnapshotFromExport({
			entityType: config.entityType,
			exportData,
			month,
		}),
	});
	target = result.snapshot;
	await client.writeUsage({
		target_path: result.path.replaceAll("\\", "/"),
		target_fingerprint: target.target_fingerprint,
	});
}

const output = {
	target_path: targetPathFor({
		root,
		month,
		entityType: config.entityType,
	}).replaceAll("\\", "/"),
	target_fingerprint: target.target_fingerprint,
	target_total_ids: target.total_ids,
	month,
};

console.log(JSON.stringify(output, null, 2));

if (process.env.GITHUB_OUTPUT) {
	const { appendFile } = await import("node:fs/promises");
	await appendFile(
		process.env.GITHUB_OUTPUT,
		Object.entries(output)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n") + "\n",
	);
}
