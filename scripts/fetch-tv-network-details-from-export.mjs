import fs from "node:fs/promises";
import path from "node:path";
import { collectCatalogueSlice } from "./lib/tmdb-catalogue-collection.mjs";
import {
	CATALOGUE_COUNT_STATUSES,
	CATALOGUE_DIMENSIONS,
	partitionCatalogueIds,
	utcMonth,
} from "./lib/tmdb-catalogue-counts.mjs";
import { assertCatalogueRunPlanStillCurrent } from "./lib/tmdb-catalogue-run-plan.mjs";
import {
	buildSnapshotFromExport,
	fetchTmdbExportIds,
	TMDB_EXPORT_DATASETS,
} from "./lib/tmdb-export-targets.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MODE = process.env.MODE || "collect";
const MONTH = process.env.COUNT_MONTH || utcMonth();
const SLICE_INDEX = Number(process.env.SLICE_INDEX ?? 0);
const TOTAL_SLICES = Number(process.env.TOTAL_SLICES ?? 2);
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const META_PATH = `${DATA_DIR}/tv-network-scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/tv-network-export.json`;

async function readJsonFile(filePath, fallback) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") return fallback;
		throw error;
	}
}

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

if (!["collect", "plan", "validate"].includes(MODE)) {
	throw new TypeError(`Unsupported Network catalogue mode: ${MODE}`);
}
if (
	!Number.isSafeInteger(SLICE_INDEX) ||
	!Number.isSafeInteger(TOTAL_SLICES) ||
	TOTAL_SLICES <= 0 ||
	SLICE_INDEX < 0 ||
	SLICE_INDEX >= TOTAL_SLICES
) {
	throw new TypeError("SLICE_INDEX and TOTAL_SLICES must identify one valid partition.");
}
if (MODE !== "collect") {
	console.log(
		JSON.stringify(
			{
				network_catalogue_validation: {
					mode: MODE,
					month: MONTH,
					slice_index: SLICE_INDEX,
					total_slices: TOTAL_SLICES,
				},
			},
			null,
			2,
		),
	);
	process.exit(0);
}

assertCatalogueRunPlanStillCurrent(
	{
		kind: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
		planned_month: MONTH,
		planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
		scheduled: process.env.SCHEDULED_RUN === "true",
	},
	{ kind: CATALOGUE_DIMENSIONS.NETWORK_SERIES },
);
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

const budgetDate =
	process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10);
const exportUsagePath = path.join(
	"maintenance",
	"tmdb-request-budget",
	budgetDate,
	"usage",
	`${process.env.TMDB_RESERVATION_ID}-network-export.json`,
);
const exportClient = await createTmdbRequestClient({
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: "target_export",
	usagePath: exportUsagePath,
	job: "load-network-export",
	requestClass: "target-export",
	targetDimension: "network",
	approvedAllowance: Number(process.env.TMDB_TARGET_EXPORT_ALLOWANCE),
});
const exportData = await fetchTmdbExportIds({
	requestClient: exportClient,
	exportPrefix: TMDB_EXPORT_DATASETS.networks.exportPrefix,
});
const snapshot = buildSnapshotFromExport({
	entityType: "network",
	exportData,
	month: MONTH,
});
await exportClient.writeUsage({
	month: MONTH,
	datasets: ["networks"],
	targets: { networks: snapshot.target_fingerprint },
});

const selection = partitionCatalogueIds(snapshot.ids, SLICE_INDEX, TOTAL_SLICES);
const planned = {
	mode: MODE,
	month: MONTH,
	export_fingerprint: snapshot.target_fingerprint,
	export_total_ids: snapshot.total_ids,
	slice_index: SLICE_INDEX,
	total_slices: TOTAL_SLICES,
	current_ids: selection.ids.length,
	base_current_requests: selection.ids.length * 2,
	max_reserved_requests: Number(process.env.TMDB_COLLECTION_ALLOWANCE || 0),
};
console.log(JSON.stringify({ network_catalogue_plan: planned }, null, 2));

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		budgetDate,
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-network-series.json`,
	);
const client = await createTmdbRequestClient({
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
const results = await collectCatalogueSlice({
	ids: selection.ids,
	dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
	client,
	observedAt: OBSERVED_AT,
	detailsUrl: (id) => `https://api.themoviedb.org/3/network/${id}`,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/tv?with_networks=${id}`,
	requestDelayMs: REQUEST_DELAY_MS,
	onDetails: async (id, details) => detailsById.set(id, details),
	onTerminal: async (id, result) => {
		if (
			[CATALOGUE_COUNT_STATUSES.POSITIVE, CATALOGUE_COUNT_STATUSES.ZERO].includes(
				result.status,
			)
		) {
			const details = detailsById.get(id);
			if (!details) throw new Error(`Missing successful Network details for ${id}.`);
			networkMap.set(id, normalizeNetwork(details, result.count));
		}
	},
});

const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
	target_fingerprint: snapshot.target_fingerprint,
});
const networks = [...networkMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(networks.map(compactNetwork)));
await fs.writeFile(CSV_PATH, toCsv(networks));
await fs.writeFile(
	EXPORT_PATH,
	`${JSON.stringify(
		{
			export_date: snapshot.export_date,
			total_ids: snapshot.total_ids,
			target_fingerprint: snapshot.target_fingerprint,
			last_offset: selection.start,
			last_limit: selection.ids.length,
			lowest_id: snapshot.ids[0] || null,
			highest_id: snapshot.ids.at(-1) || null,
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
				mode: "tmdb_export_sliced_enrichment",
				export_date: snapshot.export_date,
				export_total_ids: snapshot.total_ids,
				offset: selection.start,
				limit: selection.ids.length,
				actual_limit: selection.ids.length,
				lowest_id: snapshot.ids[0] || null,
				highest_id: snapshot.ids.at(-1) || null,
				checked: results.length,
				found: results.filter((result) =>
					[CATALOGUE_COUNT_STATUSES.POSITIVE, CATALOGUE_COUNT_STATUSES.ZERO].includes(
						result.status,
					),
				).length,
				missing: results.filter(
					(result) =>
						![CATALOGUE_COUNT_STATUSES.POSITIVE, CATALOGUE_COUNT_STATUSES.ZERO].includes(
							result.status,
						),
				).length,
				total_cached: networks.length,
				...planned,
				mode: "tmdb_export_sliced_enrichment",
				results: {
					positive: results.filter(
						(result) => result.status === CATALOGUE_COUNT_STATUSES.POSITIVE,
					).length,
					zero: results.filter(
						(result) => result.status === CATALOGUE_COUNT_STATUSES.ZERO,
					).length,
					failed: results.filter(
						(result) => result.status === CATALOGUE_COUNT_STATUSES.FAILED,
					).length,
					unavailable: 0,
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
