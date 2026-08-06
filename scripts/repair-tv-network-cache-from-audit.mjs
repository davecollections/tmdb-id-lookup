import fs from "node:fs/promises";
import path from "node:path";
import {
	buildRepairMetadata,
	hasRepairPartialFailure,
	repairMissingLegacyRows,
	validateRepairAudit,
} from "./lib/entity-cache-repair.mjs";
import {
	CATALOGUE_DIMENSIONS,
	utcMonth,
} from "./lib/tmdb-catalogue-counts.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MAX_REPAIR_IDS = process.env.MAX_REPAIR_IDS ? Number(process.env.MAX_REPAIR_IDS) : null;
const MODE = process.env.MODE || "collect";
const MONTH = process.env.COUNT_MONTH || utcMonth();
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const AUDIT_PATH = `${DATA_DIR}/tv-network-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/tv-network-cache-repair-meta.json`;

async function readJsonFile(filePath, fallback) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
		throw error;
	}
}

async function writeRepairMetadata(report) {
	await fs.writeFile(REPAIR_META_PATH, `${JSON.stringify({ last_repair: report }, null, 2)}\n`);
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

function compactNetwork(network) {
	const compact = { i: network.id, n: network.name };
	if (network.origin_country) compact.c = network.origin_country;
	if (network.headquarters) compact.h = network.headquarters;
	if (network.logo_path) compact.l = network.logo_path;
	if (network.titles_count) compact.t = network.titles_count;
	return compact;
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
	return `${[
		headers.join(","),
		...networks.map((network) =>
			headers.map((header) => csvEscape(network[header])).join(","),
		),
	].join("\n")}\n`;
}

if (!["collect", "plan", "validate"].includes(MODE)) {
	throw new TypeError(`Unsupported Network repair mode: ${MODE}`);
}
const audit = await readJsonFile(AUDIT_PATH);
if (!audit) throw new Error(`Missing audit file: ${AUDIT_PATH}. Run the audit first.`);
const missingIds = Array.isArray(audit.missing_from_cache)
	? audit.missing_from_cache.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
	: [];
const extraIds = Array.isArray(audit.extra_in_cache)
	? audit.extra_in_cache.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
	: [];
const requestedRepairCount = missingIds.length + extraIds.length;
let auditFreshness;
try {
	auditFreshness = validateRepairAudit({
		audit,
		expectedDataset: "networks",
		expectedMonth: MONTH,
		maxAgeHours: Number(process.env.MAX_AUDIT_AGE_HOURS || 36),
	});
} catch (error) {
	if (MODE === "collect") {
		await writeRepairMetadata(
			buildRepairMetadata({
				entityType: "network",
				mode: MODE,
				month: MONTH,
				audit,
				maxRepairIds: MAX_REPAIR_IDS,
				missingIds,
				extraIds,
				startedAt: OBSERVED_AT,
				finishedAt: new Date().toISOString(),
				status: "failed",
				reason: "audit_binding_mismatch",
				bindingError: error.message,
			}),
		);
	}
	throw error;
}

const requestPlan = {
	details_requests: missingIds.length,
	discover_requests: missingIds.length,
	base_requests: missingIds.length * 2,
};
console.log(
	JSON.stringify(
		{
			network_repair_plan: {
				mode: MODE,
				month: MONTH,
				audit_freshness: auditFreshness,
				missing_ids: missingIds.length,
				extra_ids: extraIds.length,
				...requestPlan,
			},
		},
		null,
		2,
	),
);
if (["plan", "validate"].includes(MODE)) process.exit(0);

const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
if (requestedRepairCount === 0) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "network",
			mode: MODE,
			month: MONTH,
			audit,
			auditFreshness,
			maxRepairIds: MAX_REPAIR_IDS,
			missingIds,
			extraIds,
			startedAt: OBSERVED_AT,
			finishedAt: new Date().toISOString(),
			status: "skipped",
			reason: "nothing_to_repair",
			totalCached: existingCompact.length,
		}),
	);
	console.log("Nothing to repair. Skipping Network cache update.");
	process.exit(0);
}
if (MAX_REPAIR_IDS !== null && requestedRepairCount > MAX_REPAIR_IDS) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "network",
			mode: MODE,
			month: MONTH,
			audit,
			auditFreshness,
			maxRepairIds: MAX_REPAIR_IDS,
			missingIds,
			extraIds,
			startedAt: OBSERVED_AT,
			finishedAt: new Date().toISOString(),
			status: "skipped",
			reason: "max_repair_ids_exceeded",
			totalCached: existingCompact.length,
		}),
	);
	console.log(`Repair skipped: ${requestedRepairCount} exceeds MAX_REPAIR_IDS=${MAX_REPAIR_IDS}.`);
	process.exit(0);
}
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10),
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-network-repair.json`,
	);
const client = await createTmdbRequestClient({
	token: TOKEN,
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "network_repair",
	usagePath,
	job: "repair-network",
});
const networkMap = new Map(
	existingCompact
		.filter((network) => network?.i)
		.map((network) => [Number(network.i), expandCompactNetwork(network)]),
);
const removed = [];
for (const id of extraIds) {
	if (networkMap.delete(id)) removed.push(id);
}
const repair = await repairMissingLegacyRows({
	ids: missingIds,
	dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
	client,
	observedAt: OBSERVED_AT,
	detailsUrl: (id) => `https://api.themoviedb.org/3/network/${id}`,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/tv?with_networks=${id}`,
	normalizeRow: normalizeNetwork,
	requestDelayMs: REQUEST_DELAY_MS,
});
for (const outcome of repair.outcomes) {
	if (outcome.row) networkMap.set(outcome.id, outcome.row);
}
const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
	target_fingerprint: auditFreshness.export_fingerprint,
});
const networks = [...networkMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(networks.map(compactNetwork)));
await fs.writeFile(CSV_PATH, toCsv(networks));
const partialFailure = hasRepairPartialFailure({
	repair,
	requestedMissingCount: missingIds.length,
});
await writeRepairMetadata(
	buildRepairMetadata({
		entityType: "network",
		mode: MODE,
		month: MONTH,
		audit,
		auditFreshness,
		maxRepairIds: MAX_REPAIR_IDS,
		missingIds,
		extraIds,
		startedAt: OBSERVED_AT,
		finishedAt: new Date().toISOString(),
		status: partialFailure ? "partial_failure" : "completed",
		reason: repair.allocationStopped ? "request_allowance_exhausted" : null,
		outcomes: repair.outcomes,
		removed,
		usage,
		requestPlan,
		totalCached: networks.length,
	}),
);
console.log(`Saved ${networks.length.toLocaleString()} total cached TV networks.`);
