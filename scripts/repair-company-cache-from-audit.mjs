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
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const AUDIT_PATH = `${DATA_DIR}/company-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/company-cache-repair-meta.json`;

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
	if (Number.isSafeInteger(company.titles_count) && company.titles_count >= 0) compact.t = company.titles_count;
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

if (!["collect", "plan", "validate"].includes(MODE)) {
	throw new TypeError(`Unsupported Company repair mode: ${MODE}`);
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
		expectedDataset: "companies",
		expectedMonth: MONTH,
		maxAgeHours: Number(process.env.MAX_AUDIT_AGE_HOURS || 36),
	});
} catch (error) {
	if (MODE === "collect") {
		await writeRepairMetadata(
			buildRepairMetadata({
				entityType: "company",
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

const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
if (requestedRepairCount === 0) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "company",
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
	console.log("Nothing to repair. Skipping Company cache update.");
	process.exit(0);
}
if (MAX_REPAIR_IDS !== null && requestedRepairCount > MAX_REPAIR_IDS) {
	await writeRepairMetadata(
		buildRepairMetadata({
			entityType: "company",
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
	dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
	client,
	observedAt: OBSERVED_AT,
	detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
	normalizeRow: normalizeCompany,
	requestDelayMs: REQUEST_DELAY_MS,
});
for (const outcome of repair.outcomes) {
	if (outcome.row) companyMap.set(outcome.id, outcome.row);
}
const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
	target_fingerprint: auditFreshness.export_fingerprint,
});
const companies = [...companyMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(companies.map(compactCompany)));
await fs.writeFile(CSV_PATH, toCsv(companies));
const partialFailure = hasRepairPartialFailure({
	repair,
	requestedMissingCount: missingIds.length,
});
await writeRepairMetadata(
	buildRepairMetadata({
		entityType: "company",
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
		totalCached: companies.length,
	}),
);
console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
