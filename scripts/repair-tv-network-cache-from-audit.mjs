import fs from "node:fs/promises";
import path from "node:path";
import {
	buildRepairMetadata,
	repairMissingLegacyRows,
} from "./lib/entity-cache-repair.mjs";
import {
	loadDimensionState,
	loadTargetSnapshot,
	readJsonFile,
	writeProgressDocument,
} from "./lib/entity-count-progress.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_STATUSES,
	TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH,
	compareUtcMonths,
	utcMonth,
} from "./lib/entity-title-counts.mjs";
import { validateRepairAuditBinding } from "./lib/entity-count-repair-binding.mjs";
import { createTmdbRequestClient } from "./lib/tmdb-maintenance-request.mjs";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MAX_REPAIR_IDS = process.env.MAX_REPAIR_IDS ? Number(process.env.MAX_REPAIR_IDS) : null;
const MODE = process.env.MODE || "collect";
const MONTH = process.env.COUNT_MONTH || utcMonth();
const typedCountsActive =
	compareUtcMonths(MONTH, TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH) >= 0;
const RUN_ID = `${
	process.env.GITHUB_RUN_ID || `local-${Date.now()}`
}-${process.env.GITHUB_RUN_ATTEMPT || "1"}-network-repair`;
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const AUDIT_PATH = `${DATA_DIR}/tv-network-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/tv-network-cache-repair-meta.json`;

async function writeRepairMetadata(report) {
	await fs.writeFile(
		REPAIR_META_PATH,
		`${JSON.stringify({ last_repair: report }, null, 2)}\n`,
	);
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

const audit = await readJsonFile(AUDIT_PATH);
if (!audit) throw new Error(`Missing audit file: ${AUDIT_PATH}. Run the audit first.`);
const missingIds = Array.isArray(audit.missing_from_cache)
	? audit.missing_from_cache.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
	: [];
const extraIds = Array.isArray(audit.extra_in_cache)
	? audit.extra_in_cache.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
	: [];
const requestedRepairCount = missingIds.length + extraIds.length;
let target = null;
let auditFreshness = null;
try {
	target = await loadTargetSnapshot({ month: MONTH, entityType: "network" });
	if (typedCountsActive && !target) throw new Error(`Missing frozen Network target for ${MONTH}.`);
	auditFreshness = validateRepairAuditBinding({
		audit,
		target,
		expectedDataset: "networks",
		expectedMonth: MONTH,
		maxAgeHours: Number(process.env.MAX_AUDIT_AGE_HOURS || 36),
		requireTypedTarget: typedCountsActive,
	});
} catch (error) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "network",
			mode: MODE,
			month: MONTH,
			audit,
			target,
			typedCountsActive,
			maxRepairIds: MAX_REPAIR_IDS,
			missingIds,
			extraIds,
			startedAt: OBSERVED_AT,
			finishedAt: new Date().toISOString(),
			status: "failed",
			reason: "typed_binding_mismatch",
			bindingError: error.message,
		}),
	);
	throw error;
}

const targetSet = new Set(target?.ids || []);
const outsideTargetMissingIds = typedCountsActive
	? missingIds.filter((id) => !targetSet.has(id))
	: [];

if (missingIds.length === 0 && extraIds.length === 0) {
	const existing = await readJsonFile(MIN_JSON_PATH, []);
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "network",
			mode: MODE,
			month: MONTH,
			audit,
			auditFreshness,
			target,
			typedCountsActive,
			maxRepairIds: MAX_REPAIR_IDS,
			missingIds,
			extraIds,
			outsideTargetMissingIds,
			startedAt: OBSERVED_AT,
			finishedAt: new Date().toISOString(),
			status: "skipped",
			reason: "nothing_to_repair",
			totalCached: existing.length,
		}),
	);
	console.log("Nothing to repair. Skipping Network cache update.");
	process.exit(0);
}

if (MAX_REPAIR_IDS !== null && requestedRepairCount > MAX_REPAIR_IDS) {
	const existing = await readJsonFile(MIN_JSON_PATH, []);
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "network",
			mode: MODE,
			month: MONTH,
			audit,
			auditFreshness,
			target,
			typedCountsActive,
			maxRepairIds: MAX_REPAIR_IDS,
			missingIds,
			extraIds,
			outsideTargetMissingIds,
			startedAt: OBSERVED_AT,
			finishedAt: new Date().toISOString(),
			status: "skipped",
			reason: "max_repair_ids_exceeded",
			totalCached: existing.length,
		}),
	);
	console.log(`Repair skipped: ${requestedRepairCount} exceeds MAX_REPAIR_IDS=${MAX_REPAIR_IDS}.`);
	process.exit(0);
}

const state = typedCountsActive
	? await loadDimensionState({
			month: MONTH,
			dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
			targetFingerprint: target.target_fingerprint,
			targetIds: target.ids,
		})
	: { resultsById: new Map() };
const reusableTypedCountIds = missingIds.filter((id) =>
	[COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(state.resultsById.get(id)?.status),
);
const requestPlan = {
	details_requests: missingIds.length,
	discover_requests: missingIds.length - reusableTypedCountIds.length,
	typed_count_reuse: reusableTypedCountIds.length,
	base_requests: missingIds.length * 2 - reusableTypedCountIds.length,
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
const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
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
	dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
	client,
	observedAt: OBSERVED_AT,
	priorResults: state.resultsById,
	targetIds: typedCountsActive ? target.ids : null,
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
	dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
	target_fingerprint: target?.target_fingerprint || null,
});
const typedResults = typedCountsActive
	? repair.outcomes
			.map((outcome) => outcome.progress_result)
			.filter(Boolean)
	: [];
if (typedResults.length) {
	await writeProgressDocument({
		month: MONTH,
		dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
		targetFingerprint: target.target_fingerprint,
		runId: RUN_ID,
		observedAt: OBSERVED_AT,
		results: typedResults,
		requestUsage: {
			attempts_used: usage.attempts_used,
			reservation_id: usage.reservation_id,
		},
	});
}

const networks = [...networkMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(networks.map(compactNetwork)));
await fs.writeFile(CSV_PATH, toCsv(networks));
const partialFailure =
	repair.allocationStopped ||
	repair.outcomes.length !== missingIds.length ||
	repair.outcomes.some(
		(outcome) =>
			outcome.progress_result?.status === COUNT_STATUSES.FAILED &&
			outcome.progress_result.error_code !== "details_404_unconfirmed",
	);
await writeRepairMetadata(
	buildRepairMetadata({
		entityType: "network",
		mode: MODE,
		month: MONTH,
		audit,
		auditFreshness,
		target,
		typedCountsActive,
		maxRepairIds: MAX_REPAIR_IDS,
		missingIds,
		extraIds,
		outsideTargetMissingIds,
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
