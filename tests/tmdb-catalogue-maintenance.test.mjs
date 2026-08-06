import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	buildRepairMetadata,
	hasRepairPartialFailure,
	repairMissingLegacyRows,
	validateRepairAudit,
} from "../scripts/lib/entity-cache-repair.mjs";
import {
	CATALOGUE_COUNT_STATUSES,
	CATALOGUE_DIMENSIONS,
	parseTmdbTotalResults,
	partitionCatalogueIds,
} from "../scripts/lib/tmdb-catalogue-counts.mjs";
import { collectCatalogueSlice } from "../scripts/lib/tmdb-catalogue-collection.mjs";
import {
	CATALOGUE_RUN_KINDS,
	assertCatalogueRunPlanStillCurrent,
	buildCatalogueRunPlan,
} from "../scripts/lib/tmdb-catalogue-run-plan.mjs";
import {
	buildSnapshotFromExport,
	fingerprintExportIds,
	parseTmdbExportIds,
} from "../scripts/lib/tmdb-export-targets.mjs";
import {
	createTmdbRequestClient,
	retryDelayMs,
} from "../scripts/lib/tmdb-maintenance-request.mjs";
import {
	buildReservationReceipt,
	RESERVATION_BUCKETS,
} from "../scripts/lib/tmdb-request-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedNow = new Date("2026-08-06T09:00:00.000Z");

function buildTestReceipt(options = {}) {
	const allocations = options.allocations || { collection: 1 };
	const bindings =
		options.bindings ||
		Object.fromEntries(
			Object.entries(allocations).map(([key, allowance]) => [
				key,
				{
					request_class: `test-${key}`,
					target_dimension: "company-movie",
					approved_allowance: allowance,
				},
			]),
		);
	return buildReservationReceipt({
		date: fixedNow,
		reservationId: "test-reservation",
		workflow: "Test",
		runId: "1",
		runAttempt: "1",
		job: "reserve",
		plannedMonth: "2026-08",
		plannedUtcDate: "2026-08-06",
		...options,
		allocations,
		bindings,
	});
}

function clientBinding(receipt, allocationKey = "collection") {
	const binding = receipt.bindings[allocationKey];
	return {
		expectedWorkflow: receipt.workflow,
		expectedRunId: receipt.run_id,
		expectedRunAttempt: receipt.run_attempt,
		plannedMonth: receipt.planned_month,
		plannedUtcDate: receipt.planned_utc_date,
		requestClass: binding.request_class,
		targetDimension: binding.target_dimension,
		approvedAllowance: binding.approved_allowance,
	};
}

function jsonResponse(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function mockedFetchModule({ ids, details, counts }) {
	return `
import fs from "node:fs";
import zlib from "node:zlib";

const ids = ${JSON.stringify(ids)};
const details = ${JSON.stringify(details)};
const counts = ${JSON.stringify(counts)};
const requests = [];

process.on("exit", () => {
	fs.writeFileSync(process.env.MOCK_LOG_PATH, JSON.stringify(requests));
});

globalThis.fetch = async (input) => {
	const url = String(input);
	requests.push(url);
	if (url.includes("files.tmdb.org")) {
		const body = ids.map((id) => JSON.stringify({ id })).join("\\n") + "\\n";
		return new Response(zlib.gzipSync(Buffer.from(body)), {
			status: 200,
			headers: { "content-type": "application/gzip" },
		});
	}
	const parsed = new URL(url);
	const detailMatch = parsed.pathname.match(/\\/(?:company|network)\\/(\\d+)$/);
	if (detailMatch) {
		const value = details[detailMatch[1]];
		return value
			? new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })
			: new Response(JSON.stringify({ status_message: "missing" }), { status: 404, headers: { "content-type": "application/json" } });
	}
	const id = parsed.searchParams.get("with_companies") || parsed.searchParams.get("with_networks");
	if (id && Object.hasOwn(counts, id)) {
		return new Response(JSON.stringify({ total_results: counts[id] }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}
	return new Response(JSON.stringify({ status_message: "unexpected mock URL" }), {
		status: 500,
		headers: { "content-type": "application/json" },
	});
};
`;
}

async function runCatalogueContractFixture(context, config) {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `tmdb-${config.entityType}-contract-`));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const dataDirectory = path.join(temporary, "data");
	await fs.mkdir(dataDirectory, { recursive: true });
	await fs.writeFile(
		path.join(dataDirectory, config.minJsonName),
		JSON.stringify(config.seedRows),
	);

	const now = new Date();
	const plannedUtcDate = now.toISOString().slice(0, 10);
	const plannedMonth = plannedUtcDate.slice(0, 7);
	const reservationId = `fixture-${config.entityType}`;
	const workflow = `Fixture ${config.entityType} catalogue`;
	const runId = config.entityType === "company" ? "901" : "902";
	const allocations = { collection: 20, target_export: 7 };
	const built = buildReservationReceipt({
		date: now,
		reservationId,
		workflow,
		runId,
		runAttempt: "1",
		job: config.dimension,
		plannedMonth,
		plannedUtcDate,
		allocations,
		bindings: {
			collection: {
				request_class: config.dimension,
				target_dimension: config.dimension,
				approved_allowance: allocations.collection,
			},
			target_export: {
				request_class: "target-export",
				target_dimension: config.entityType,
				approved_allowance: allocations.target_export,
			},
		},
	});
	const reservationDirectory = path.join(
		temporary,
		"maintenance",
		"tmdb-request-budget",
		plannedUtcDate,
		"reservations",
	);
	await fs.mkdir(reservationDirectory, { recursive: true });
	const reservationPath = path.join(reservationDirectory, `${reservationId}.json`);
	await fs.writeFile(reservationPath, JSON.stringify(built.receipt));

	const preloadPath = path.join(temporary, "mock-fetch.mjs");
	const requestLogPath = path.join(temporary, "requests.json");
	await fs.writeFile(
		preloadPath,
		mockedFetchModule({
			ids: config.exportIds,
			details: config.details,
			counts: config.counts,
		}),
	);
	execFileSync(
		process.execPath,
		[
			"--import",
			pathToFileURL(preloadPath).href,
			path.join(root, "scripts", config.script),
		],
		{
			cwd: temporary,
			env: {
				...process.env,
				MODE: "collect",
				COUNT_MONTH: plannedMonth,
				SLICE_INDEX: "0",
				TOTAL_SLICES: "2",
				SCHEDULED_RUN: "false",
				REQUEST_DELAY_MS: "0",
				TMDB_BEARER_TOKEN: "fixture-token",
				TMDB_RESERVATION_ID: reservationId,
				TMDB_RESERVATION_PATH: reservationPath,
				TMDB_RESERVATION_SHA256: built.sha256,
				TMDB_RESERVATION_UTC_DATE: plannedUtcDate,
				TMDB_ALLOCATION_KEY: "collection",
				TMDB_REQUEST_CLASS: config.dimension,
				TMDB_TARGET_DIMENSION: config.dimension,
				TMDB_APPROVED_ALLOWANCE: String(allocations.collection),
				TMDB_COLLECTION_ALLOWANCE: String(allocations.collection),
				TMDB_TARGET_EXPORT_ALLOWANCE: String(allocations.target_export),
				GITHUB_WORKFLOW: workflow,
				GITHUB_RUN_ID: runId,
				GITHUB_RUN_ATTEMPT: "1",
				MOCK_LOG_PATH: requestLogPath,
			},
			encoding: "utf8",
		},
	);

	return {
		temporary,
		dataDirectory,
		plannedUtcDate,
		plannedMonth,
		reservationId,
		requests: JSON.parse(await fs.readFile(requestLogPath, "utf8")),
		usageDirectory: path.join(
			temporary,
			"maintenance",
			"tmdb-request-budget",
			plannedUtcDate,
			"usage",
		),
	};
}

test("TMDB export parsing, fingerprints, counts, and partitions stay deterministic", () => {
	assert.equal(parseTmdbTotalResults({ total_results: 0 }), 0);
	assert.equal(parseTmdbTotalResults({ total_results: 42 }), 42);
	assert.throws(() => parseTmdbTotalResults({ total_results: "42" }));
	const ids = parseTmdbExportIds(
		Buffer.from('{"id":9}\n{"id":2}\n{"id":5}\n'),
	);
	assert.deepEqual(ids, [2, 5, 9]);
	assert.throws(
		() => parseTmdbExportIds(Buffer.from('{"id":9}\n{"id":2}\n{"id":9}\n')),
		/unique/,
	);
	const snapshot = buildSnapshotFromExport({
		entityType: "company",
		month: "2026-08",
		exportData: { exportDate: "08_06_2026", ids },
		createdAt: "2026-08-06T00:00:00Z",
	});
	assert.match(snapshot.target_fingerprint, /^sha256:[a-f0-9]{64}$/);
	assert.deepEqual(partitionCatalogueIds([1, 2, 3, 4, 5], 0, 2), {
		ids: [1, 2],
		start: 0,
		end: 2,
	});
	assert.deepEqual(partitionCatalogueIds([1, 2, 3, 4, 5], 1, 2).ids, [3, 4, 5]);
});

test("Company collector preserves the exact ordinary catalogue contract for mocked inputs", async (context) => {
	const config = {
		entityType: "company",
		dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
		script: "manual-company-rebuild-from-export.mjs",
		minJsonName: "companies.min.json",
		exportIds: [4, 1, 3, 2],
		seedRows: [
			{ i: 3, n: "Preserved company", c: "GB", h: "Old HQ", l: "/old-3.png", t: 4 },
			{ i: 9, n: "Unlisted company", t: 2 },
		],
		details: {
			1: {
				id: 1,
				name: "Company One",
				headquarters: "Sydney",
				homepage: "https://one.example",
				logo_path: "/company-1.png",
				origin_country: "AU",
				parent_company: { name: "Parent One" },
			},
			2: {
				id: 2,
				name: "Company, Two",
				headquarters: "Los Angeles",
				homepage: "https://two.example",
				logo_path: "/company-2.png",
				origin_country: "US",
				parent_company: null,
			},
			3: { id: 3, name: "Must not refresh in slice zero" },
			4: { id: 4, name: "Must not refresh in slice zero" },
		},
		counts: { 1: 0, 2: 12, 3: 33, 4: 44 },
	};
	const fixture = await runCatalogueContractFixture(context, config);
	assert.deepEqual(
		JSON.parse(await fs.readFile(path.join(fixture.dataDirectory, "companies.min.json"), "utf8")),
		[
			{ i: 1, n: "Company One", p: "Parent One", c: "AU", h: "Sydney", l: "/company-1.png" },
			{ i: 2, n: "Company, Two", c: "US", h: "Los Angeles", l: "/company-2.png", t: 12 },
			{ i: 3, n: "Preserved company", c: "GB", h: "Old HQ", l: "/old-3.png", t: 4 },
			{ i: 9, n: "Unlisted company", t: 2 },
		],
	);
	const csv = await fs.readFile(path.join(fixture.dataDirectory, "companies.csv"), "utf8");
	assert.match(csv, /^id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n/);
	assert.match(csv, /1,Company One,0,Sydney,AU,https:\/\/one\.example,https:\/\/www\.themoviedb\.org\/company\/1/);
	assert.match(csv, /2,"Company, Two",12,Los Angeles,US,https:\/\/two\.example,https:\/\/www\.themoviedb\.org\/company\/2/);
	const exportMeta = JSON.parse(
		await fs.readFile(path.join(fixture.dataDirectory, "production-company-export.json"), "utf8"),
	);
	assert.equal(exportMeta.total_ids, 4);
	assert.equal(exportMeta.target_fingerprint, fingerprintExportIds([1, 2, 3, 4]));
	assert.equal(exportMeta.last_offset, 0);
	assert.equal(exportMeta.last_limit, 2);
	const dataFiles = (await fs.readdir(fixture.dataDirectory)).sort();
	assert.deepEqual(dataFiles, [
		"companies.csv",
		"companies.min.json",
		"production-company-export.json",
		"scan-meta.json",
	]);
	assert.deepEqual((await fs.readdir(fixture.usageDirectory)).sort(), [
		`${fixture.reservationId}-company-export.json`,
		`${fixture.reservationId}-company-movie.json`,
	]);
	assert.deepEqual(
		fixture.requests
			.filter((url) => /\/3\/company\/\d+$/.test(new URL(url).pathname))
			.map((url) => new URL(url).pathname),
		["/3/company/1", "/3/company/2"],
	);
	await assert.rejects(
		fs.access(path.join(fixture.temporary, "maintenance", "entity-title-counts")),
		{ code: "ENOENT" },
	);
});

test("Network collector preserves the exact ordinary catalogue contract for mocked inputs", async (context) => {
	const config = {
		entityType: "network",
		dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
		script: "fetch-tv-network-details-from-export.mjs",
		minJsonName: "tv-networks.min.json",
		exportIds: [4, 1, 3, 2],
		seedRows: [
			{ i: 3, n: "Preserved network", c: "GB", h: "Old HQ", l: "/old-3.png", t: 4 },
			{ i: 9, n: "Unlisted network", t: 2 },
		],
		details: {
			1: {
				id: 1,
				name: "Network One",
				headquarters: "Sydney",
				homepage: "https://one.example",
				logo_path: "/network-1.png",
				origin_country: "AU",
			},
			2: {
				id: 2,
				name: "Network, Two",
				headquarters: "Los Angeles",
				homepage: "https://two.example",
				logo_path: "/network-2.png",
				origin_country: "US",
			},
			3: { id: 3, name: "Must not refresh in slice zero" },
			4: { id: 4, name: "Must not refresh in slice zero" },
		},
		counts: { 1: 0, 2: 6, 3: 33, 4: 44 },
	};
	const fixture = await runCatalogueContractFixture(context, config);
	assert.deepEqual(
		JSON.parse(await fs.readFile(path.join(fixture.dataDirectory, "tv-networks.min.json"), "utf8")),
		[
			{ i: 1, n: "Network One", c: "AU", h: "Sydney", l: "/network-1.png" },
			{ i: 2, n: "Network, Two", c: "US", h: "Los Angeles", l: "/network-2.png", t: 6 },
			{ i: 3, n: "Preserved network", c: "GB", h: "Old HQ", l: "/old-3.png", t: 4 },
			{ i: 9, n: "Unlisted network", t: 2 },
		],
	);
	const csv = await fs.readFile(path.join(fixture.dataDirectory, "tv-networks.csv"), "utf8");
	assert.match(csv, /^id,name,titles_count,headquarters,origin_country,homepage,tmdb_url\n/);
	assert.match(csv, /1,Network One,0,Sydney,AU,https:\/\/one\.example,https:\/\/www\.themoviedb\.org\/network\/1/);
	assert.match(csv, /2,"Network, Two",6,Los Angeles,US,https:\/\/two\.example,https:\/\/www\.themoviedb\.org\/network\/2/);
	const exportMeta = JSON.parse(
		await fs.readFile(path.join(fixture.dataDirectory, "tv-network-export.json"), "utf8"),
	);
	assert.equal(exportMeta.total_ids, 4);
	assert.equal(exportMeta.target_fingerprint, fingerprintExportIds([1, 2, 3, 4]));
	assert.equal(exportMeta.last_offset, 0);
	assert.equal(exportMeta.last_limit, 2);
	assert.equal(exportMeta.lowest_id, 1);
	assert.equal(exportMeta.highest_id, 4);
	const dataFiles = (await fs.readdir(fixture.dataDirectory)).sort();
	assert.deepEqual(dataFiles, [
		"tv-network-export.json",
		"tv-network-scan-meta.json",
		"tv-networks.csv",
		"tv-networks.min.json",
	]);
	assert.deepEqual((await fs.readdir(fixture.usageDirectory)).sort(), [
		`${fixture.reservationId}-network-export.json`,
		`${fixture.reservationId}-network-series.json`,
	]);
	assert.deepEqual(
		fixture.requests
			.filter((url) => /\/3\/network\/\d+$/.test(new URL(url).pathname))
			.map((url) => new URL(url).pathname),
		["/3/network/1", "/3/network/2"],
	);
	await assert.rejects(
		fs.access(path.join(fixture.temporary, "maintenance", "entity-title-counts")),
		{ code: "ENOENT" },
	);
});

test("Company days 1-14 and Network days 1-2 plan ordinary catalogue collection in every month", () => {
	for (const day of [1, 7, 14]) {
		const now = new Date(`2026-09-${String(day).padStart(2, "0")}T09:00:00Z`);
		const plan = buildCatalogueRunPlan({
			kind: CATALOGUE_RUN_KINDS.COMPANY_MOVIE,
			eventName: "schedule",
			inputMaxRequests: "55000",
			now,
		});
		assert.equal(plan.mode, "collect");
		assert.equal(plan.slice_index, day - 1);
		assert.equal(plan.requires_requests, true);
		assert.equal(plan.allocations.target_export, 7);
		assertCatalogueRunPlanStillCurrent(plan, { now, kind: plan.kind });
	}
	for (const day of [1, 2]) {
		const now = new Date(`2027-01-0${day}T08:45:00Z`);
		const plan = buildCatalogueRunPlan({
			kind: CATALOGUE_RUN_KINDS.NETWORK_SERIES,
			eventName: "schedule",
			inputMaxRequests: "15000",
			now,
		});
		assert.equal(plan.slice_index, day - 1);
		assert.equal(plan.requires_requests, true);
	}
	assert.throws(
		() =>
			buildCatalogueRunPlan({
				kind: CATALOGUE_RUN_KINDS.COMPANY_MOVIE,
				eventName: "workflow_dispatch",
				inputMode: "sample",
				now: fixedNow,
			}),
		/Unknown catalogue operation mode/,
	);
});

test("audit freshness and caps remain bound to the current export without frozen state", () => {
	const audit = {
		schema_version: 1,
		parser_semantic_version: "1.0.0",
		dataset: "companies",
		export_month: "2026-08",
		export_fingerprint: `sha256:${"a".repeat(64)}`,
		audited_at: "2026-08-05T12:00:00Z",
	};
	const freshness = validateRepairAudit({
		audit,
		expectedDataset: "companies",
		expectedMonth: "2026-08",
		now: fixedNow,
		maxAgeHours: 36,
	});
	assert.equal(freshness.export_fingerprint, audit.export_fingerprint);
	assert.doesNotThrow(() =>
		validateRepairAudit({
			audit: { ...audit, audited_at: "2026-08-06T09:05:00Z" },
			expectedDataset: "companies",
			expectedMonth: "2026-08",
			now: fixedNow,
		}),
	);
	assert.throws(
		() =>
			validateRepairAudit({
				audit: { ...audit, audited_at: "2026-08-06T09:11:00Z" },
				expectedDataset: "companies",
				expectedMonth: "2026-08",
				now: fixedNow,
			}),
		/unexpectedly in the future/,
	);
	const legacyAudit = {
		...audit,
		export_month: undefined,
		export_fingerprint: undefined,
		export_target_month: "2026-08",
		export_target_fingerprint: `sha256:${"b".repeat(64)}`,
	};
	assert.equal(
		validateRepairAudit({
			audit: legacyAudit,
			expectedDataset: "companies",
			expectedMonth: "2026-08",
			now: fixedNow,
		}).export_fingerprint,
		legacyAudit.export_target_fingerprint,
	);
	const report = buildRepairMetadata({
		entityType: "company",
		mode: "collect",
		month: "2026-08",
		audit,
		maxRepairIds: 2,
		missingIds: [1, 2],
		extraIds: [3],
		startedAt: fixedNow.toISOString(),
		finishedAt: fixedNow.toISOString(),
		status: "skipped",
		reason: "max_repair_ids_exceeded",
	});
	assert.deepEqual(report.cap, { maximum: 2, requested: 3, exceeded: true });
	assert.equal("typed_counts_active" in report, false);
});

test("catalogue repair always refreshes details and the legacy title total", async () => {
	const requests = [];
	const client = {
		async request(url) {
			requests.push(url);
			return {
				response: url.includes("/discover/")
					? jsonResponse({ total_results: 0 })
					: jsonResponse({ id: 7, name: "Example" }),
				attempts: [{ at: fixedNow.toISOString() }],
			};
		},
	};
	const repair = await repairMissingLegacyRows({
		ids: [7],
		dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
		client,
		observedAt: fixedNow,
		detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
		countUrl: (id) => `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
		normalizeRow: (details, count) => ({ ...details, titles_count: count }),
	});
	assert.equal(requests.length, 2);
	assert.equal(repair.outcomes[0].result.status, CATALOGUE_COUNT_STATUSES.ZERO);
	assert.equal(repair.outcomes[0].row.titles_count, 0);
});

test("catalogue repair classifies a details 404 as not found without a discover request or partial failure", async () => {
	const requests = [];
	const repair = await repairMissingLegacyRows({
		ids: [404],
		dimension: CATALOGUE_DIMENSIONS.NETWORK_SERIES,
		client: {
			async request(url) {
				requests.push(url);
				return { response: jsonResponse({ status_message: "missing" }, 404), attempts: [] };
			},
		},
		observedAt: fixedNow,
		detailsUrl: (id) => `https://api.themoviedb.org/3/network/${id}`,
		countUrl: (id) => `https://api.themoviedb.org/3/discover/tv?with_networks=${id}`,
		normalizeRow: () => assert.fail("404 details must not produce a catalogue row"),
	});
	assert.equal(requests.length, 1);
	assert.equal(repair.outcomes[0].details_status, 404);
	assert.equal(repair.outcomes[0].result.error_code, "details_404_unconfirmed");
	assert.equal(
		hasRepairPartialFailure({ repair, requestedMissingCount: 1 }),
		false,
	);
	const report = buildRepairMetadata({
		entityType: "network",
		mode: "collect",
		month: "2026-08",
		audit: {},
		maxRepairIds: 1,
		missingIds: [404],
		extraIds: [],
		startedAt: fixedNow.toISOString(),
		finishedAt: fixedNow.toISOString(),
		status: "completed",
		outcomes: repair.outcomes,
	});
	assert.deepEqual(report.not_found, [404]);
	assert.deepEqual(report.failed, []);
});

test("catalogue collection defers failures and retries them after the ordinary slice", async () => {
	const requests = [];
	const countAttempts = new Map();
	const terminal = [];
	const client = {
		async request(url, options) {
			requests.push({ url, maxAttempts: options.maxAttempts });
			if (url.includes("/details/")) {
				const id = Number(url.split("/").at(-1));
				return { response: jsonResponse({ id, name: `Entity ${id}` }), attempts: [] };
			}
			const id = Number(new URL(url).searchParams.get("id"));
			const attempt = (countAttempts.get(id) || 0) + 1;
			countAttempts.set(id, attempt);
			return {
				response: id === 1 && attempt === 1
					? jsonResponse({}, 500)
					: jsonResponse({ total_results: id }),
				attempts: [],
			};
		},
	};
	const details = new Map();
	const results = await collectCatalogueSlice({
		ids: [1, 2],
		dimension: CATALOGUE_DIMENSIONS.COMPANY_MOVIE,
		client,
		observedAt: fixedNow,
		detailsUrl: (id) => `https://api.themoviedb.org/3/details/${id}`,
		countUrl: (id) => `https://api.themoviedb.org/3/discover/movie?id=${id}`,
		onDetails: async (id, value) => details.set(id, value),
		onTerminal: async (id) => terminal.push(id),
	});
	assert.deepEqual(results.map((result) => result.status), ["positive", "positive"]);
	assert.deepEqual(terminal, [2, 1]);
	assert.deepEqual(details.get(1), { id: 1, name: "Entity 1" });
	assert.deepEqual(requests.map(({ maxAttempts }) => maxAttempts), [1, 1, 1, 1, 4, 4]);
});

test("request reservations preserve protected commitments and hard ceilings", () => {
	const company = buildTestReceipt({
		reservationId: "company",
		bucket: RESERVATION_BUCKETS.GENERAL,
		allocations: { collection: 55_000, target_export: 7 },
	});
	assert.equal(company.receipt.projected_daily_total, 59_057);
	assert.throws(
		() => buildTestReceipt({ allocations: { collection: 86_000 } }),
		/preferred 90000/,
	);
	assert.throws(
		() =>
			buildTestReceipt({
				allocations: { collection: 96_000 },
				allowPreferredOverride: true,
				overrideReason: "test",
			}),
		/absolute 100000/,
	);
});

test("request client charges retries, enforces hosts, and writes reconciled usage", async (context) => {
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-catalogue-request-"));
	context.after(() => fs.rm(temporary, { recursive: true, force: true }));
	const built = buildTestReceipt({ allocations: { collection: 2 } });
	const receiptPath = path.join(temporary, "receipt.json");
	const usagePath = path.join(temporary, "usage.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let calls = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: built.receipt.reservation_id,
		reservationSha256: built.sha256,
		allocationKey: "collection",
		usagePath,
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		sleepImpl: async () => {},
		fetchImpl: async () => {
			calls += 1;
			return calls === 1 ? jsonResponse({}, 500) : jsonResponse({ total_results: 0 });
		},
	});
	const result = await client.requestJson("https://api.themoviedb.org/3/discover/movie");
	assert.equal(result.response.status, 200);
	assert.equal(client.usageSummary().attempts_used, 2);
	assert.equal(client.usageSummary().retries, 1);
	await assert.rejects(client.request("https://example.com/unsafe"), /Unapproved TMDB request host/);
	await client.writeUsage({ month: "2026-08" });
	assert.equal(JSON.parse(await fs.readFile(usagePath, "utf8")).attempts_used, 2);
	assert.equal(
		retryDelayMs(new Response("", { status: 429, headers: { "retry-after": "999" } }), 1),
		60_000,
	);
});

test("plan and validate modes make no TMDB request and require no token", () => {
	for (const [script, slices] of [
		["manual-company-rebuild-from-export.mjs", "14"],
		["fetch-tv-network-details-from-export.mjs", "2"],
	]) {
		const output = execFileSync(process.execPath, [path.join(root, "scripts", script)], {
			cwd: root,
			env: {
				...process.env,
				MODE: "validate",
				COUNT_MONTH: "2026-08",
				SLICE_INDEX: "0",
				TOTAL_SLICES: slices,
				TMDB_BEARER_TOKEN: "",
			},
			encoding: "utf8",
		});
		assert.match(output, /catalogue_validation/);
	}
});

test("request-usage schema covers current and historical receipt shapes", async () => {
	const schema = JSON.parse(await fs.readFile(path.join(root, "schemas", "tmdb-request-usage.schema.json"), "utf8"));
	const allowedKeys = new Set(Object.keys(schema.properties));
	const budgetRoot = path.join(root, "maintenance", "tmdb-request-budget");
	const dates = await fs.readdir(budgetRoot);
	for (const date of dates) {
		const usageDirectory = path.join(budgetRoot, date, "usage");
		let names;
		try {
			names = await fs.readdir(usageDirectory);
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		for (const name of names.filter((value) => value.endsWith(".json"))) {
			const receipt = JSON.parse(await fs.readFile(path.join(usageDirectory, name), "utf8"));
			assert.deepEqual(Object.keys(receipt).filter((key) => !allowedKeys.has(key)), [], name);
			assert.ok(schema.properties.target_dimension.enum.includes(receipt.target_dimension), name);
		}
	}
});
