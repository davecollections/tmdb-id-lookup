import fs from "node:fs/promises";
import path from "node:path";
import { collectWithDeferredRetries } from "./lib/entity-count-collection.mjs";
import {
	loadDimensionState,
	loadTargetSnapshot,
	writeProgressDocument,
} from "./lib/entity-count-progress.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_STATUSES,
	partitionTargetIds,
	parseStrictSampleIds,
	utcMonth,
} from "./lib/entity-title-counts.mjs";
import { assertRunPlanStillCurrent } from "./lib/entity-count-run-plan.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MODE = process.env.MODE || "collect";
const IS_SAMPLE = MODE === "sample";
const MONTH = process.env.COUNT_MONTH || utcMonth();
const SLICE_INDEX =
	process.env.SLICE_INDEX === undefined ? null : Number(process.env.SLICE_INDEX);
const TOTAL_SLICES = Number(process.env.TOTAL_SLICES || 14);
const RETRY_UNRESOLVED = process.env.RETRY_UNRESOLVED !== "false";
const RUN_ID = `${
	process.env.GITHUB_RUN_ID || `local-${Date.now()}`
}-${process.env.GITHUB_RUN_ATTEMPT || "1"}-company-series`;
const OBSERVED_AT = new Date().toISOString();

const target = await loadTargetSnapshot({
	month: MONTH,
	entityType: "company",
});
if (!target) {
	throw new Error(`Missing frozen Company target for ${MONTH}.`);
}

const seriesState = await loadDimensionState({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
	targetFingerprint: target.target_fingerprint,
	targetIds: target.ids,
});
const movieState = await loadDimensionState({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	targetFingerprint: target.target_fingerprint,
	targetIds: target.ids,
});
const sampleIds = IS_SAMPLE ? parseStrictSampleIds(process.env.SAMPLE_IDS || "") : null;
if (!IS_SAMPLE && process.env.SAMPLE_IDS) {
	throw new Error("SAMPLE_IDS is accepted only in sample mode.");
}
let selection;

if (sampleIds) {
	const targetSet = new Set(target.ids);
	for (const id of sampleIds) {
		if (!targetSet.has(id)) throw new Error(`Sample Company ${id} is not in the frozen target.`);
	}
	selection = { ids: sampleIds, start: null, end: null };
} else {
	if (SLICE_INDEX === null) {
		throw new Error("SLICE_INDEX is required outside sample mode.");
	}
	selection = partitionTargetIds(target.ids, SLICE_INDEX, TOTAL_SLICES);
}

const olderUnresolvedIds =
	RETRY_UNRESOLVED && selection.start !== null
		? target.ids
				.slice(0, selection.start)
				.filter(
					(id) =>
						!seriesState.resultsById.get(id) ||
						seriesState.resultsById.get(id).status === COUNT_STATUSES.FAILED,
				)
		: [];
const plan = {
	mode: MODE,
	month: MONTH,
	target_fingerprint: target.target_fingerprint,
	target_total_ids: target.total_ids,
	slice_index: SLICE_INDEX,
	total_slices: TOTAL_SLICES,
	current_ids: selection.ids.length,
	older_unresolved_ids: olderUnresolvedIds.length,
	base_current_requests: selection.ids.length,
	max_reserved_requests: Number(process.env.TMDB_COLLECTION_ALLOWANCE || 0),
};

console.log(JSON.stringify({ company_series_plan: plan }, null, 2));
if (["plan", "validate"].includes(MODE)) process.exit(0);
assertRunPlanStillCurrent(
	{
		kind: COUNT_DIMENSIONS.COMPANY_SERIES,
		planned_month: MONTH,
		planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
		scheduled: process.env.SCHEDULED_RUN === "true",
	},
	{ kind: COUNT_DIMENSIONS.COMPANY_SERIES },
);
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10),
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-company-series.json`,
	);
const client = await createTmdbRequestClient({
	token: TOKEN,
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "collection",
	usagePath,
	job: "collect-company-series",
});
const inheritedUnavailableById = new Map(
	[...movieState.resultsById]
		.filter(([, result]) => result.status === COUNT_STATUSES.UNAVAILABLE)
		.map(([id, result]) => [id, result]),
);
const results = await collectWithDeferredRetries({
	currentIds: selection.ids,
	olderUnresolvedIds,
	dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
	client,
	observedAt: OBSERVED_AT,
	priorResults: seriesState.resultsById,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/tv?with_companies=${id}`,
	inheritedUnavailableById,
	requestDelayMs: REQUEST_DELAY_MS,
});
const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
	target_fingerprint: target.target_fingerprint,
});
if (results.length && !IS_SAMPLE) {
	await writeProgressDocument({
		month: MONTH,
		dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
		targetFingerprint: target.target_fingerprint,
		runId: RUN_ID,
		observedAt: OBSERVED_AT,
		results,
		sliceIndex: sampleIds ? null : SLICE_INDEX,
		totalSlices: sampleIds ? null : TOTAL_SLICES,
		requestUsage: {
			attempts_used: usage.attempts_used,
			reservation_id: usage.reservation_id,
		},
	});
}

console.log(
	JSON.stringify(
		{
			company_series_result: {
				...plan,
				positive: results.filter((result) => result.status === COUNT_STATUSES.POSITIVE).length,
				zero: results.filter((result) => result.status === COUNT_STATUSES.ZERO).length,
				failed: results.filter((result) => result.status === COUNT_STATUSES.FAILED).length,
				unavailable: results.filter((result) => result.status === COUNT_STATUSES.UNAVAILABLE)
					.length,
				requests: usage,
			},
		},
		null,
		2,
	),
);

if (process.env.GITHUB_STEP_SUMMARY) {
	const summary = [
		"## Company Series collection",
		"",
		`- Month: \`${MONTH}\``,
		`- Slice: ${SLICE_INDEX === null ? "sample" : `${SLICE_INDEX + 1} of ${TOTAL_SLICES}`}`,
		`- Current slice IDs: ${selection.ids.length.toLocaleString()}`,
		`- Earlier unresolved considered: ${olderUnresolvedIds.length.toLocaleString()}`,
		`- Positive: ${results.filter((result) => result.status === COUNT_STATUSES.POSITIVE).length.toLocaleString()}`,
		`- Zero: ${results.filter((result) => result.status === COUNT_STATUSES.ZERO).length.toLocaleString()}`,
		`- Confirmed unavailable: ${results.filter((result) => result.status === COUNT_STATUSES.UNAVAILABLE).length.toLocaleString()}`,
		`- Transient failed: ${results.filter((result) => result.status === COUNT_STATUSES.FAILED).length.toLocaleString()}`,
		`- TMDB attempts: ${usage.attempts_used.toLocaleString()} of ${usage.allowance.toLocaleString()} reserved`,
	];
	await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
}
