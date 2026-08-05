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
const LIMIT = Number(process.env.LIMIT || 1_000);
const RETRY_UNRESOLVED = process.env.RETRY_UNRESOLVED === "true";
const RUN_ID = `${
	process.env.GITHUB_RUN_ID || `local-${Date.now()}`
}-${process.env.GITHUB_RUN_ATTEMPT || "1"}-company-movie`;
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const META_PATH = `${DATA_DIR}/scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/production-company-export.json`;

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
	const rows = companies.map((company) =>
		headers.map((header) => csvEscape(company[header])).join(","),
	);
	return `${[headers.join(","), ...rows].join("\n")}\n`;
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

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10),
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-company-movie.json`,
	);
let client = null;
let target = LEGACY_ONLY
	? null
	: await loadTargetSnapshot({ month: MONTH, entityType: "company" });
if (!target) {
	if (!LEGACY_ONLY) {
		throw new Error(`Missing frozen Company target for ${MONTH}. Run target initialization first.`);
	}
	assertRunPlanStillCurrent(
		{
			kind: COUNT_DIMENSIONS.COMPANY_MOVIE,
			planned_month: MONTH,
			planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
			scheduled: process.env.SCHEDULED_RUN === "true",
		},
		{ kind: COUNT_DIMENSIONS.COMPANY_MOVIE },
	);
	const targetUsagePath = path.join(
		"maintenance",
		"tmdb-request-budget",
		process.env.TMDB_RESERVATION_UTC_DATE,
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-legacy-company-target.json`,
	);
	const targetClient = await createTmdbRequestClient({
		receiptPath: process.env.TMDB_RESERVATION_PATH,
		reservationId: process.env.TMDB_RESERVATION_ID,
		reservationSha256: process.env.TMDB_RESERVATION_SHA256,
		allocationKey: "target_export",
		usagePath: targetUsagePath,
		job: "load-legacy-company-export",
		requestClass: "target-export",
		targetDimension: "company",
		approvedAllowance: Number(process.env.TMDB_TARGET_EXPORT_ALLOWANCE),
	});
	const exportData = await fetchTmdbExportIds({
		requestClient: targetClient,
		exportPrefix: TMDB_EXPORT_DATASETS.companies.exportPrefix,
	});
	target = buildSnapshotFromExport({
		entityType: "company",
		exportData,
		month: MONTH,
	});
	await targetClient.writeUsage({ legacy_only: true, month: MONTH });
}

const state = TYPED_PROGRESS_ENABLED
	? await loadDimensionState({
			month: MONTH,
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
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
		if (!targetSet.has(id)) throw new Error(`Sample Company ${id} is not in the frozen target.`);
	}
	selection = { ids: sampleIds, start: null, end: null };
} else if (SLICE_INDEX !== null || TOTAL_SLICES !== null) {
	if (SLICE_INDEX === null || TOTAL_SLICES === null) {
		throw new Error("SLICE_INDEX and TOTAL_SLICES must be supplied together.");
	}
	selection = partitionTargetIds(target.ids, SLICE_INDEX, TOTAL_SLICES);
} else {
	if (!Number.isSafeInteger(OFFSET) || OFFSET < 0 || !Number.isSafeInteger(LIMIT) || LIMIT <= 0) {
		throw new Error("OFFSET and LIMIT must be safe nonnegative/positive integers.");
	}
	selection = {
		ids: target.ids.slice(OFFSET, OFFSET + LIMIT),
		start: OFFSET,
		end: Math.min(target.ids.length, OFFSET + LIMIT),
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

console.log(JSON.stringify({ company_movie_plan: planned }, null, 2));
if (["plan", "validate"].includes(MODE)) {
	process.exit(0);
}
assertRunPlanStillCurrent(
	{
		kind: COUNT_DIMENSIONS.COMPANY_MOVIE,
		planned_month: MONTH,
		planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
		scheduled: process.env.SCHEDULED_RUN === "true",
	},
	{ kind: COUNT_DIMENSIONS.COMPANY_MOVIE },
);
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

client ||= await createTmdbRequestClient({
	token: TOKEN,
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: process.env.TMDB_ALLOCATION_KEY || "collection",
	usagePath,
	job: "collect-company-movie",
});
const existingCompact = await readJsonFile(MIN_JSON_PATH, []);
const companyMap = new Map(
	existingCompact
		.filter((company) => company?.i)
		.map((company) => [Number(company.i), expandCompactCompany(company)]),
);
const detailsById = new Map();

const results = await collectWithDeferredRetries({
	currentIds: selection.ids,
	olderUnresolvedIds,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	client,
	observedAt: OBSERVED_AT,
	priorResults: state.resultsById,
	detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
	countUrl: (id) =>
		`https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
	requestDelayMs: REQUEST_DELAY_MS,
	onDetails: async (id, details) => detailsById.set(id, details),
	onTerminal: async (id, result) => {
		if ([COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status)) {
			const details = detailsById.get(id);
			if (!details) throw new Error(`Missing successful Company details for ${id}.`);
			companyMap.set(id, normalizeCompany(details, result.count));
		}
	},
});

const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	target_fingerprint: target.target_fingerprint,
});

let recoveryProgressPath = "";
if (results.length && !IS_SAMPLE && TYPED_PROGRESS_ENABLED) {
	const writtenProgress = await writeProgressDocument({
		month: MONTH,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
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

const companies = [...companyMap.values()].sort((left, right) => left.id - right.id);
const selectedIdSet = new Set(selection.ids);
const legacyCurrentResults = results.filter((result) => selectedIdSet.has(result.id));
if (IS_SAMPLE) {
	console.log("Sample mode completed without writing progress or legacy Company caches.");
	process.exit(0);
}
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(companies.map(compactCompany)));
await fs.writeFile(CSV_PATH, toCsv(companies));
await fs.writeFile(
	EXPORT_PATH,
	`${JSON.stringify(
		{
			export_date: target.export_date,
			total_ids: target.total_ids,
			target_fingerprint: target.target_fingerprint,
			last_offset: selection.start,
			last_limit: selection.ids.length,
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
				mode: "manual_company_rebuild_from_export",
				export_date: target.export_date,
				export_total_ids: target.total_ids,
				offset: selection.start ?? OFFSET,
				limit: selection.ids.length,
				actual_limit: selection.ids.length,
				checked: legacyCurrentResults.length,
				found: legacyCurrentResults.filter(
					(result) =>
						[COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status),
				).length,
				missing: legacyCurrentResults.filter(
					(result) => ![COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status),
				).length,
				total_cached: companies.length,
				...planned,
				mode: "manual_company_rebuild_from_export",
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

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
