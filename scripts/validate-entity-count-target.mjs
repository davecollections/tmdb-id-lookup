import { appendFile } from "node:fs/promises";
import {
	loadTargetSnapshot,
	targetPathFor,
} from "./lib/entity-count-progress.mjs";
import { utcMonth } from "./lib/entity-title-counts.mjs";
import { TMDB_EXPORT_DATASETS } from "./lib/tmdb-export-targets.mjs";

const datasetKey = process.env.DATASET || "companies";
const config = TMDB_EXPORT_DATASETS[datasetKey];
const month = process.env.COUNT_MONTH || utcMonth();
const root = process.env.ENTITY_COUNT_ROOT;
const allowMissingTarget = process.env.ALLOW_MISSING_TARGET === "true";

if (!config) throw new Error(`Unknown DATASET ${datasetKey}. Use companies or networks.`);

const target = await loadTargetSnapshot({ root, month, entityType: config.entityType });
if (!target && !allowMissingTarget) {
	throw new Error(`Missing frozen ${config.entityType} target for ${month}.`);
}

const output = target
	? {
			target_path: targetPathFor({ root, month, entityType: config.entityType }).replaceAll("\\", "/"),
			target_fingerprint: target.target_fingerprint,
			target_total_ids: target.total_ids,
			month,
			missing_allowed: false,
		}
	: {
			target_path: null,
			target_fingerprint: null,
			target_total_ids: 0,
			month,
			missing_allowed: true,
		};

console.log(JSON.stringify(output, null, 2));
if (process.env.GITHUB_OUTPUT) {
	await appendFile(
		process.env.GITHUB_OUTPUT,
		Object.entries(output)
			.map(([key, value]) => `${key}=${value ?? ""}`)
			.join("\n") + "\n",
	);
}
