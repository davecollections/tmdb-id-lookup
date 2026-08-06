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
const TOTAL_SLICES = Number(process.env.TOTAL_SLICES ?? 14);
const OBSERVED_AT = new Date().toISOString();

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const META_PATH = `${DATA_DIR}/scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/production-company-export.json`;

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

if (!["collect", "plan", "validate"].includes(MODE)) {
	throw new TypeError(`Unsupported Company catalogue mode: ${MODE}`);
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
				company_catalogue_validation: {
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
		kind: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
		planned_month: MONTH,
		planned_utc_date: process.env.TMDB_RESERVATION_UTC_DATE,
		scheduled: process.env.SCHEDULED_RUN === "true",
	},
	{ kind: CATALOGUE_DIMENSIONS.COMPANY_MOVIE },
);
if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

const budgetDate =
	process.env.TMDB_RESERVATION_UTC_DATE || new Date().toISOString().slice(0, 10);
const exportUsagePath = path.join(
	"maintenance",
	"tmdb-request-budget",
	budgetDate,
	"usage",
	`${process.env.TMDB_RESERVATION_ID}-company-export.json`,
);
const exportClient = await createTmdbRequestClient({
	receiptPath: process.env.TMDB_RESERVATION_PATH,
	reservationId: process.env.TMDB_RESERVATION_ID,
	reservationSha256: process.env.TMDB_RESERVATION_SHA256,
	allocationKey: "target_export",
	usagePath: exportUsagePath,
	job: "load-company-export",
	requestClass: "target-export",
	targetDimension: "company",
	approvedAllowance: Number(process.env.TMDB_TARGET_EXPORT_ALLOWANCE),
});
const exportData = await fetchTmdbExportIds({
	requestClient: exportClient,
	exportPrefix: TMDB_EXPORT_DATASETS.companies.exportPrefix,
});
const snapshot = buildSnapshotFromExport({
	entityType: "company",
	exportData,
	month: MONTH,
});
await exportClient.writeUsage({
	month: MONTH,
	datasets: ["companies"],
	targets: { companies: snapshot.target_fingerprint },
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
console.log(JSON.stringify({ company_catalogue_plan: planned }, null, 2));

const usagePath =
	process.env.TMDB_USAGE_PATH ||
	path.join(
		"maintenance",
		"tmdb-request-budget",
		budgetDate,
		"usage",
		`${process.env.TMDB_RESERVATION_ID}-company-movie.json`,
	);
const client = await createTmdbRequestClient({
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
const results = await collectCatalogueSlice({
	ids: selection.ids,
	dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
	client,
	observedAt: OBSERVED_AT,
	detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
	countUrl: (id) => `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
	requestDelayMs: REQUEST_DELAY_MS,
	onDetails: async (id, details) => detailsById.set(id, details),
	onTerminal: async (id, result) => {
		if (
			[CATALOGUE_COUNT_STATUSES.POSITIVE, CATALOGUE_COUNT_STATUSES.ZERO].includes(
				result.status,
			)
		) {
			const details = detailsById.get(id);
			if (!details) throw new Error(`Missing successful Company details for ${id}.`);
			companyMap.set(id, normalizeCompany(details, result.count));
		}
	},
});

const usage = client.usageSummary();
await client.writeUsage({
	month: MONTH,
	dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
	target_fingerprint: snapshot.target_fingerprint,
});
const companies = [...companyMap.values()].sort((left, right) => left.id - right.id);
await fs.writeFile(MIN_JSON_PATH, JSON.stringify(companies.map(compactCompany)));
await fs.writeFile(CSV_PATH, toCsv(companies));
await fs.writeFile(
	EXPORT_PATH,
	`${JSON.stringify(
		{
			export_date: snapshot.export_date,
			total_ids: snapshot.total_ids,
			target_fingerprint: snapshot.target_fingerprint,
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
				export_date: snapshot.export_date,
				export_total_ids: snapshot.total_ids,
				offset: selection.start,
				limit: selection.ids.length,
				actual_limit: selection.ids.length,
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
				total_cached: companies.length,
				...planned,
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

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
