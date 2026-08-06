import fs from "node:fs/promises";
import path from "node:path";
import { collectWithDeferredRetries } from "./lib/entity-count-collection.mjs";
import {
	loadDimensionState,
	loadTargetSnapshot,
	readJsonFile,
	writeProgressDocument,
} from "./lib/entity-count-progress.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_STATUSES,
	partitionTargetIds,
	parseStrictSampleIds,
	utcMonth,
} from "./lib/entity-title-counts.mjs";
import { assertRunPlanStillCurrent } from "./lib/entity-count-run-plan.mjs";
import {
	buildSnapshotFromExport,
	fetchTmdbExportIds,
	TMDB_EXPORT_DATASETS,
} from "./lib/tmdb-export-targets.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MODE = process.env.MODE || "collect";
const IS_SAMPLE = MODE === "sample";
const LEGACY_ONLY = process.env.LEGACY_ONLY === "true";
const TYPED_PROGRESS_ENABLED = process.env.TYPED_PROGRESS_ENABLED !== "false";
const MONTH = process.env.COUNT_MONTH || utcMonth();
const SLICE_INDEX =
	process.env.SLICE_INDEX === undefined ? null : Number(process.env.SLICE_INDEX);
const TOTAL_SLICES =
	process.env.TOTAL_SLICES === undefined ? null : Number(process.env.TOTAL_SLICES);
const OFFSET = Number(process.env.OFFSET || 0);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const RETRY_UNRESOLVED = process.env.RETRY_UNRESOLVED === "true";
const RUN_ID = `${
	process.env.GITHUB_RUN_ID || `local-${Date.now()}`
}-${process.env.GITHUB_RUN_ATTEMPT || "1"}-network-series`;
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const META_PATH = `${DATA_DIR}/tv-network-scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/tv-network-export.json`;

function csvEscape(value) {
	const text = String(value ?? "");
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(networks) {
	const headers = [
		"id",
		"name",
		"titles_count",
		"headquarters",
		"origin_country",
		"homepage",
		"tmdb_url",
	];
	const rows = networks.map((network) =>
		headers.map((header) => csvEscape(network[header])).join(","),
	);
	return `${[headers.join(","), ...rows].join("\n")}\n`;
}

function compactNetwork(network) {
	const compact = { i: network.id, n: network.name };
	if (network.origin_country) compact.c = network.origin_country;
	if (network.headquarters) compact.h = network.headquarters;
	if (network.logo_path) compact.l = network.logo_path;
	if (network.titles_count) compact.t = network.titles_count;
	return compact;
}

function expandCompactNetwork(network) {
	return {
		id: network.i,
		name: network.n || "",
		origin_country: network.c || "",
		headquarters: network.h || "",
		logo_path: network.l || "",
		titles_count: network.t || 0,
		homepage: "",
		tmdb_url: `https://www.themoviedb.org/network/${network.i}`,
	};
}

function normalizeNetwork(data, seriesCount) {
	return {
		id: data.id,
		name: data.name || "",
		headquarters: data.headquarters || "",
		homepage: data.homepage || "",
		logo_path: data.logo_path || "",
		origin_country: data.origin_country || "",
		titles_count: seriesCount,
		tmdb_url: `https://www.themoviedb.org/network/${data.id}`,
	};
}

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10),
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-network-series.json`,
	);
let client = null;
let target = LEGACY_ONLY
	? null
	: await loadTargetSnapshot({ month: MONTH, entityType: "network" });
if (!target) {
	if (!LEGACY_ONLY) {
		throw new Error(`Missing frozen Network target for ${MONTH}. Run target initialization first.`);
	}
	assertRunPlanStillCurrent(
		{
			kind: COUNT_DIMENSIONS.NETWORK_SERIES,
			planned_month: MONTH,
			planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
			scheduled: process.env.SCHEDULED_RUN === "true",
		},
		{ kind: COUNT_DIMENSIONS.NETWORK_SERIES },
	);
	const targetUsagePath = path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE,
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-legacy-network-target.json`,
	);
	const targetClient = await createTmdbRequestClient({
		receiptPath: process.env.TMDB_RESERVATION_PATH,
		reservationId: process.env.TMDB_RESERVATION_ID,
		reservationSha256: process.env.TMDB_RESERVATION_SHA256,
		allocationKey: "target_export",
		usagePath: targetUsagePath,
		job: "load-legacy-network-export",
		requestClass: "target-export",
		targetDimension: "network",
		approvedAllowance: Number(process.env.TMDB_TARGET_EXPORT_ALLOWANCE),
	});
	const exportData = await fetchTmdbExportIds({
		requestClient: targetClient,
		exportPrefix: TMDB_EXPORT_DATASETS.networks.exportPrefix,
	});
	target = buildSnapshotFromExport({
		entityType: "network",
		exportData,
		month: MONTH,
	});
	await targetClient.writeUsage({ legacy_only: true, month: MONTH });
}

const state = TYPED_PROGRESS_ENABLED
	? await loadDimensionState({
			month: MONTH,
			dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
			targetFingerprint: target.target_fingerprint,
			targetIds: target.ids,
		})
	: {
			parserSemanticVersion: COUNT_PARSER_SEMANTIC_VERSION,
			resultsById: new Map(),
		};
const sampleIds = IS_SAMPLE ? parseStrictSampleIds(process.env.SAMPLE_IDS || "") : null;
if (!IS_SAMPLE && process.env.SAMPLE_IDS) {
	throw new Error("SAMPLE_IDS is accepted only in sample mode.");
}
let selection;

if (sampleIds) {
	const targetSet = new Set(target.ids);
	for (const id of sampleIds) {
		if (!targetSet.has(id)) throw new Error(`Sample Network ${id} is not in the frozen target.`);
	}
	selection = { ids: sampleIds, start: null, end: null };
} else if (SLICE_INDEX !== null || TOTAL_SLICES !== null) {
	if (SLICE_INDEX === null || TOTAL_SLICES === null) {
		throw new Error("SLICE_INDEX and TOTAL_SLICES must be supplied together.");
	}
	selection = partitionTargetIds(target.ids, SLICE_INDEX, TOTAL_SLICES);
} else {
	if (!Number.isSafeInteger(OFFSET) || OFFSET < 0 || (LIMIT !== null && (!Number.isSafeInteger(LIMIT) || LIMIT <= 0))) {
		throw new Error("OFFSET/LIMIT must be safe nonnegative/positive integers.");
	}
	selection = {
		ids: LIMIT === null ? target.ids.slice(OFFSET) : target.ids.slice(OFFSET, OFFSET + LIMIT),
		start: OFFSET,
		end: LIMIT === null ? target.ids.length : Math.min(target.ids.length, OFFSET + LIMIT),
	};
}

const olderUnresolvedIds =
	!LEGACY_ONLY && RETRY_UNRESOLVED && selection.start !== null
		? target.ids
				.slice(0, selection.start)
				.filter((id) => !state.resultsById.get(id) || state.resultsById.get(id).status === COUNT_STATUSES.FAILED)
		: [];
const planned = {
	mode: MODE,
	month: MONTH,
	target_fingerprint: target.target_fingerprint,
	target_total_ids: target.total_ids,
	slice_index: SLICE_INDEX,
	total_slices: TOTAL_SLICES,
	current_ids: selection.ids.length,
	older_unresolved_ids: olderUnresolvedIds.length,
	base_current_requests: selection.ids.length * 2,
	max_reserved_requests: Number(process.env.TMDB_COLLECTION_ALLOWANCE || 0),
	legacy_only: LEGACY_ONLY,
	typed_progress_enabled: TYPED_PROGRESS_ENABLED,
};

console.log(JSON.stringify({ network_series_plan: planned }, null, 2));
if (["plan", "validate"].includes(MODE)) process.exit(0);
assertRunPlanStillCurrent(
	{
		kind: COUNT_DIMENSIONS.NETWORK_SERIES,
		planned_month: MONTH,
		planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
		scheduled: process.env.SCHEDULED_RUN === "true",
	},
	{ kind: COUNT_DIMENSIONS.NETWORK_SERIES },
);
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

client ||= await createTmdbRequestClient({
	token: TOKEN,
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "collection",
	usagePath,
	job: "collect-network-series",
});
const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
const networkMap = new Map(
	existingCompact
		.filter((network) => network?.i)
		.map((network) => [Number(network.i), expandCompactNetwork(network)]),
);
const detailsById = new Map();
const results = await collectWithDeferredRetries({
	currentIds: selection.ids,
	olderUnresolvedIds,
	dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
	client,
	observedAt: OBSERVED_AT,
	priorResults: state.resultsById,
	detailsUrl: (id) => `https://api.themoviedb.org/3/network/${id}`,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/tv?with_networks=${id}`,
	requestDelayMs: REQUEST_DELAY_MS,
	onDetails: async (id, details) => detailsById.set(id, details),
	onTerminal: async (id, result) => {
		if ([COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status)) {
			const details = detailsById.get(id);
			if (!details) throw new Error(`Missing successful Network details for ${id}.`);
			networkMap.set(id, normalizeNetwork(details, result.count));
		}
	},
});

const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
	target_fingerprint: target.target_fingerprint,
});
let recoveryProgressPath = "";
if (results.length && !IS_SAMPLE && TYPED_PROGRESS_ENABLED) {
	const writtenProgress = await writeProgressDocument({
		month: MONTH,
		dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
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
	recoveryProgressPath = writtenProgress.path.replaceAll("\\", "/");
}

if (process.env.GITHUB_OUTPUT) {
	await fs.appendFile(
		process.env.GITHUB_OUTPUT,
		`recovery_progress_path=${recoveryProgressPath}\nrecovery_usage_path=${usagePath.replaceAll("\\", "/")}\n`,
	);
}

const networks = [...networkMap.values()].sort((left, right) => left.id - right.id);
const selectedIdSet = new Set(selection.ids);
const legacyCurrentResults = results.filter((result) => selectedIdSet.has(result.id));
if (IS_SAMPLE) {
	console.log("Sample mode completed without writing progress or legacy Network caches.");
	process.exit(0);
}
const ids = target.ids;
const legacySlicedMode = LIMIT !== null || SLICE_INDEX !== null;
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(networks.map(compactNetwork)));
await fs.writeFile(CSV_PATH, toCsv(networks));
await fs.writeFile(
	EXPORT_PATH,
	`${JSON.stringify(
		{
			export_date: target.export_date,
			total_ids: target.total_ids,
			target_fingerprint: target.target_fingerprint,
			last_offset: selection.start,
			last_limit: selection.ids.length,
			lowest_id: ids[0] || null,
			highest_id: ids.at(-1) || null,
			updated_at: new Date().toISOString(),
		},
		null,
		2,
	)}\n`,
);
await fs.writeFile(
	META_PATH,
	`${JSON.stringify(
		{
			last_scan: {
				mode: legacySlicedMode ? "tmdb_export_sliced_enrichment" : "tmdb_daily_export_full_enrichment",
				export_date: target.export_date,
				export_total_ids: target.total_ids,
				offset: selection.start ?? OFFSET,
				limit: legacySlicedMode ? selection.ids.length : null,
				actual_limit: selection.ids.length,
				lowest_id: ids[0] || null,
				highest_id: ids.at(-1) || null,
				checked: legacyCurrentResults.length,
				found: legacyCurrentResults.filter(
					(result) =>
						[COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status),
				).length,
				missing: legacyCurrentResults.filter(
					(result) => ![COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status),
				).length,
				total_cached: networks.length,
				...planned,
				mode: legacySlicedMode ? "tmdb_export_sliced_enrichment" : "tmdb_daily_export_full_enrichment",
				results: {
					positive: results.filter((result) => result.status === COUNT_STATUSES.POSITIVE).length,
					zero: results.filter((result) => result.status === COUNT_STATUSES.ZERO).length,
					failed: results.filter((result) => result.status === COUNT_STATUSES.FAILED).length,
					unavailable: results.filter((result) => result.status === COUNT_STATUSES.UNAVAILABLE)
						.length,
				},
				requests: usage,
				started_at: OBSERVED_AT,
				finished_at: new Date().toISOString(),
			},
		},
		null,
		2,
	)}\n`,
);

console.log(`Saved ${networks.length.toLocaleString()} total cached TV networks.`);
