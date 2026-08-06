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
}-${process.env.GITHUB_RUN_ATTEMPT || "1"}-company-repair`;
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const AUDIT_PATH = `${DATA_DIR}/company-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/company-cache-repair-meta.json`;

async function writeRepairMetadata(report) {
	await fs.writeFile(
		REPAIR_META_PATH,
		`${JSON.stringify({ last_repair: report }, null, 2)}\n`,
	);
}

function expandCompactCompany(company) {
	return {
		id: company.i,
		name: company.n || "",
		parent_company: company.p || "",
		origin_country: company.c || "",
		headquarters: company.h || "",
		logo_path: company.l || "",
		titles_count: company.t || 0,
		homepage: "",
		tmdb_url: `https://www.themoviedb.org/company/${company.i}`,
	};
}

function normalizeCompany(data, movieCount) {
	return {
		id: data.id,
		name: data.name || "",
		headquarters: data.headquarters || "",
		homepage: data.homepage || "",
		logo_path: data.logo_path || "",
		origin_country: data.origin_country || "",
		parent_company: data.parent_company?.name || "",
		titles_count: movieCount,
		tmdb_url: `https://www.themoviedb.org/company/${data.id}`,
	};
}

function compactCompany(company) {
	const compact = { i: company.id, n: company.name };
	if (company.parent_company) compact.p = company.parent_company;
	if (company.origin_country) compact.c = company.origin_country;
	if (company.headquarters) compact.h = company.headquarters;
	if (company.logo_path) compact.l = company.logo_path;
	if (company.titles_count) compact.t = company.titles_count;
	return compact;
}

function csvEscape(value) {
	const text = String(value ?? "");
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(companies) {
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
		...companies.map((company) =>
			headers.map((header) => csvEscape(company[header])).join(","),
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
	target = await loadTargetSnapshot({ month: MONTH, entityType: "company" });
	if (typedCountsActive && !target) throw new Error(`Missing frozen Company target for ${MONTH}.`);
	auditFreshness = validateRepairAuditBinding({
		audit,
		target,
		expectedDataset: "companies",
		expectedMonth: MONTH,
		maxAgeHours: Number(process.env.MAX_AUDIT_AGE_HOURS || 36),
		requireTypedTarget: typedCountsActive,
	});
} catch (error) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "company",
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
			entityType: "company",
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
	console.log("Nothing to repair. Skipping Company cache update.");
	process.exit(0);
}

if (MAX_REPAIR_IDS !== null && requestedRepairCount > MAX_REPAIR_IDS) {
	const existing = await readJsonFile(MIN_JSON_PATH, []);
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "company",
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
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
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
			company_repair_plan: {
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
		`${process.env.TMDB_RESERVATION_ID}-company-repair.json`,
	);
const client = await createTmdbRequestClient({
	token: TOKEN,
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "company_repair",
	usagePath,
	job: "repair-company",
});
const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
const companyMap = new Map(
	existingCompact
		.filter((company) => company?.i)
		.map((company) => [Number(company.i), expandCompactCompany(company)]),
);
const removed = [];
for (const id of extraIds) {
	if (companyMap.delete(id)) removed.push(id);
}
const repair = await repairMissingLegacyRows({
	ids: missingIds,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	client,
	observedAt: OBSERVED_AT,
	priorResults: state.resultsById,
	targetIds: typedCountsActive ? target.ids : null,
	detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
	countUrl: (id) =>
		`https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
	normalizeRow: normalizeCompany,
	requestDelayMs: REQUEST_DELAY_MS,
});
for (const outcome of repair.outcomes) {
	if (outcome.row) companyMap.set(outcome.id, outcome.row);
}
const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	target_fingerprint: target?.target_fingerprint || null,
});
const typedResults = typedCountsActive
	? repair.outcomes
			.map((outcome) => outcome.progress_result)
			.filter(Boolean)
	: [];
let recoveryProgressPath = "";
if (typedResults.length) {
	const writtenProgress = await writeProgressDocument({
		month: MONTH,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		targetFingerprint: target.target_fingerprint,
		runId: RUN_ID,
		observedAt: OBSERVED_AT,
		results: typedResults,
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

const companies = [...companyMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(companies.map(compactCompany)));
await fs.writeFile(CSV_PATH, toCsv(companies));
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
		entityType: "company",
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
		totalCached: companies.length,
	}),
);
console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
