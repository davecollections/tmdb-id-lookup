import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import {
	buildReservationReceipt,
	RESERVATION_BUCKETS,
} from "../scripts/lib/entity-count-budget.mjs";
import {
	buildRepairMetadata,
	repairMissingLegacyRows,
} from "../scripts/lib/entity-cache-repair.mjs";
import {
	buildEntityCountPublication,
	validateCompletionManifest,
	writePublicationFiles,
} from "../scripts/lib/entity-count-publication.mjs";
import { validateRepairAuditBinding } from "../scripts/lib/entity-count-repair-binding.mjs";
import {
	COUNT_RUN_KINDS,
	assertRunPlanStillCurrent,
	buildEntityCountRunPlan,
} from "../scripts/lib/entity-count-run-plan.mjs";
import {
	loadDimensionState,
	reduceCountResults,
	writeProgressDocument,
} from "../scripts/lib/entity-count-progress.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_STATUSES,
	buildTargetSnapshot,
	canonicalizeTargetIds,
	parseTmdbTotalResults,
	partitionTargetIds,
	parseStrictSampleIds,
	validateAuditFreshness,
	validateCountResult,
	validateTargetSnapshot,
} from "../scripts/lib/entity-title-counts.mjs";
import {
	createTmdbRequestClient,
	retryDelayMs,
} from "../scripts/lib/tmdb-maintenance-request.mjs";
import { parseTmdbExportIds } from "../scripts/lib/tmdb-export-targets.mjs";

const fixedNow = new Date("2026-08-15T09:00:00.000Z");

function buildTestReceipt(options = {}) {
	const allocations = options.allocations || { collection: 1 };
	const bindings =
		options.bindings ||
		Object.fromEntries(
			Object.entries(allocations).map(([key, allowance]) => [
				key,
				{
					request_class: `test-${key}`,
					target_dimension: "test-dimension",
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
		plannedUtcDate: "2026-08-15",
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

function permutations(values) {
	if (values.length <= 1) return [values];
	return values.flatMap((value, index) =>
		permutations(values.filter((_, candidate) => candidate !== index)).map((rest) => [
			value,
			...rest,
		]),
	);
}

test("strict count parser accepts positive and exact zero", () => {
	assert.equal(parseTmdbTotalResults({ total_results: 12 }), 12);
	assert.equal(parseTmdbTotalResults({ total_results: 0 }), 0);
});

test("numeric entity IDs use the positive safe-integer contract in schemas and runtime", async () => {
	const targetSchema = JSON.parse(
		await fs.readFile("schemas/entity-title-count-target.schema.json", "utf8"),
	);
	const progressSchema = JSON.parse(
		await fs.readFile("schemas/entity-title-count-progress.schema.json", "utf8"),
	);
	const sidecarSchema = JSON.parse(
		await fs.readFile("schemas/entity-title-count-sidecar.schema.json", "utf8"),
	);
	const definitions = [
		targetSchema.properties.ids.items,
		progressSchema.properties.results.items.properties.id,
		...sidecarSchema.$defs.ranges.items.prefixItems.slice(0, 2),
	];
	for (const definition of definitions) {
		assert.equal(definition.type, "integer");
		assert.equal(definition.minimum, 1);
		assert.equal(definition.maximum, Number.MAX_SAFE_INTEGER);
	}
	for (const value of [1, Number.MAX_SAFE_INTEGER]) {
		assert.doesNotThrow(() => canonicalizeTargetIds([value]));
		assert.doesNotThrow(() =>
			validateCountResult({
				id: value,
				dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
				status: COUNT_STATUSES.ZERO,
				count: 0,
				observed_at: "2026-09-01T09:00:00Z",
			}),
		);
	}
	for (const value of ["1", "001", "1.0"]) {
		assert.throws(() => canonicalizeTargetIds([value]), /positive safe integer/);
	}
	for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => canonicalizeTargetIds([value]));
		assert.throws(() =>
			validateCountResult({
				id: value,
				dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
				status: COUNT_STATUSES.ZERO,
				count: 0,
				observed_at: "2026-09-01T09:00:00Z",
			}),
		);
	}
});

test("strict count parser rejects missing, null, strings, fractions, negative and unsafe values", () => {
	for (const value of [
		{},
		{ total_results: null },
		{ total_results: "0" },
		{ total_results: -1 },
		{ total_results: 1.5 },
		{ total_results: Number.MAX_SAFE_INTEGER + 1 },
	]) {
		assert.throws(() => parseTmdbTotalResults(value), /nonnegative safe integer/);
	}
});

test("export parser canonicalizes IDs and rejects an empty successful export", () => {
	assert.deepEqual(
		parseTmdbExportIds(Buffer.from('{"id":7}\n{"id":2}\n')),
		[2, 7],
	);
	assert.throws(() => parseTmdbExportIds(Buffer.from("")), /at least one entity ID/);
});

test("target snapshots are canonical and deterministic", () => {
	const first = buildTargetSnapshot({
		entityType: "company",
		month: "2026-08",
		exportDate: "08_15_2026",
		ids: [11, 2, 7],
		createdAt: fixedNow.toISOString(),
	});
	const second = buildTargetSnapshot({
		entityType: "company",
		month: "2026-08",
		exportDate: "08_15_2026",
		ids: [2, 7, 11],
		createdAt: fixedNow.toISOString(),
	});

	assert.deepEqual(first.ids, [2, 7, 11]);
	assert.equal(first.target_fingerprint, second.target_fingerprint);
	assert.equal(first.parser_semantic_version, COUNT_PARSER_SEMANTIC_VERSION);
	assert.throws(
		() => validateTargetSnapshot({ ...first, parser_semantic_version: undefined }),
		/parser semantic version/,
	);
	assert.throws(
		() =>
			buildTargetSnapshot({
				entityType: "company",
				month: "2026-08",
				ids: [2, 2],
				createdAt: fixedNow.toISOString(),
			}),
		/unique/,
	);
});

test("floor-boundary partitions cover every target exactly once", () => {
	const ids = Array.from({ length: 101 }, (_, index) => index + 1);
	const partitions = Array.from({ length: 14 }, (_, sliceIndex) =>
		partitionTargetIds(ids, sliceIndex, 14),
	);
	const flattened = partitions.flatMap((partition) => partition.ids);

	assert.deepEqual(flattened, ids);
	assert.equal(new Set(flattened).size, ids.length);
	assert.ok(partitions.every((partition) => [7, 8].includes(partition.ids.length)));
});

test("strict sample parsing rejects empty, mixed, duplicate, unsafe and oversized input", () => {
	assert.deepEqual(parseStrictSampleIds("2, 7,11"), [2, 7, 11]);
	assert.throws(() => parseStrictSampleIds(""), /at least one/);
	assert.throws(() => parseStrictSampleIds("2,nope,7"), /sample token 2/);
	assert.throws(() => parseStrictSampleIds("2,,7"), /sample token 2/);
	assert.throws(() => parseStrictSampleIds("2,2"), /duplicate/);
	assert.throws(() => parseStrictSampleIds(`${Number.MAX_SAFE_INTEGER + 1}`), /safe integer/);
	assert.throws(() => parseStrictSampleIds("1,2,3", { maximum: 2 }), /at most 2/);
});

test("September activation skips August production before reservation but preserves explicit bootstrap/sample modes", () => {
	for (const [kind, date] of [
		[COUNT_RUN_KINDS.COMPANY_MOVIE, "2026-08-01T09:00:00Z"],
		[COUNT_RUN_KINDS.NETWORK_SERIES, "2026-08-01T08:45:00Z"],
	]) {
		const augustPlan = buildEntityCountRunPlan({
			kind,
			eventName: "schedule",
			now: new Date(date),
		});
		assert.equal(augustPlan.skip, false);
		assert.equal(augustPlan.requires_requests, true);
		assert.equal(augustPlan.legacy_only, true);
		assert.equal(augustPlan.typed_progress_enabled, false);
		assert.equal(augustPlan.allow_target_create, false);
		assert.equal(augustPlan.allow_finalize, false);
	}
	const augustSeries = buildEntityCountRunPlan({
		kind: COUNT_RUN_KINDS.COMPANY_SERIES,
		eventName: "schedule",
		now: new Date("2026-08-15T09:00:00Z"),
	});
	assert.equal(augustSeries.skip, true);
	assert.equal(augustSeries.requires_requests, false);
	assert.deepEqual(augustSeries.allocations, {});

	const septemberSeries = buildEntityCountRunPlan({
		kind: COUNT_RUN_KINDS.COMPANY_SERIES,
		eventName: "schedule",
		now: new Date("2026-09-15T09:00:00Z"),
	});
	assert.equal(septemberSeries.skip, false);
	assert.equal(septemberSeries.planned_month, "2026-09");
	assert.equal(septemberSeries.slice_index, 0);
	assert.equal(septemberSeries.allocations.target_export, 0);

	const bootstrap = buildEntityCountRunPlan({
		kind: COUNT_RUN_KINDS.NETWORK_SERIES,
		eventName: "workflow_dispatch",
		inputMode: "network-bootstrap",
		inputSliceIndex: "1",
		inputMaxRequests: "1000",
		now: new Date("2026-08-01T08:00:00Z"),
	});
	assert.equal(bootstrap.requires_requests, true);
	assert.equal(bootstrap.allow_target_create, true);
	assert.equal(bootstrap.allow_finalize, false);

	const sample = buildEntityCountRunPlan({
		kind: COUNT_RUN_KINDS.COMPANY_MOVIE,
		eventName: "workflow_dispatch",
		inputMode: "sample",
		inputSampleIds: "2,7",
		inputMaxRequests: "10",
		now: new Date("2026-08-01T08:00:00Z"),
	});
	assert.equal(sample.allow_target_create, false);
	assert.equal(sample.allow_finalize, false);
	assert.equal(sample.allocations.target_export, 0);
});

test("delayed queued plans expire instead of changing UTC date or month", () => {
	const plan = buildEntityCountRunPlan({
		kind: COUNT_RUN_KINDS.COMPANY_SERIES,
		eventName: "schedule",
		now: new Date("2026-09-28T23:59:00Z"),
	});
	assert.throws(
		() => assertRunPlanStillCurrent(plan, { now: new Date("2026-09-29T00:01:00Z") }),
		/expired before execution/,
	);
	assert.throws(
		() =>
			buildEntityCountRunPlan({
				kind: COUNT_RUN_KINDS.COMPANY_MOVIE,
				eventName: "workflow_dispatch",
				inputMode: "collect",
				inputMonth: "2026-08",
				now: new Date("2026-09-01T09:00:00Z"),
			}),
		/must match planning UTC month/,
	);
	assert.equal(
		buildEntityCountRunPlan({
			kind: COUNT_RUN_KINDS.COMPANY_MOVIE,
			eventName: "workflow_dispatch",
			inputMode: "validate",
			inputMonth: "2026-08",
			now: new Date("2026-09-01T09:00:00Z"),
		}).allow_finalize,
		true,
	);
});

test("repair freshness allows Actions delay but rejects stale audit evidence", () => {
	const delayed = validateAuditFreshness({
		auditedAt: "2026-08-01T08:15:00Z",
		now: new Date("2026-08-02T18:00:00Z"),
	});
	assert.ok(delayed.age_hours > 33);
	assert.throws(
		() =>
			validateAuditFreshness({
				auditedAt: "2026-08-01T08:15:00Z",
				now: new Date("2026-08-02T21:00:00Z"),
			}),
		/maximum is 36 hours/,
	);
});

test("confirmed unavailable requires corroborating 404 evidence on separate UTC dates", () => {
	const base = {
		id: 2,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		status: COUNT_STATUSES.UNAVAILABLE,
		count: null,
		observed_at: "2026-08-02T09:00:00Z",
		unavailable_reason: "entity_not_found_confirmed",
	};
	assert.throws(
		() =>
			validateCountResult({
				...base,
				evidence: [
					{ kind: "details_404", observed_at: "2026-08-02T08:00:00Z" },
					{ kind: "details_404", observed_at: "2026-08-02T09:00:00Z" },
				],
			}),
		/two UTC dates/,
	);
	assert.doesNotThrow(() =>
		validateCountResult({
			...base,
			evidence: [
				{ kind: "details_404", observed_at: "2026-08-01T09:00:00Z" },
				{ kind: "details_404", observed_at: "2026-08-02T09:00:00Z" },
			],
		}),
	);
});

test("a later transient failure cannot erase a terminal success", () => {
	const base = {
		id: 2,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	};
	const state = reduceCountResults([
		{
			...base,
			status: COUNT_STATUSES.POSITIVE,
			count: 12,
			observed_at: "2026-08-01T09:00:00Z",
		},
		{
			...base,
			status: COUNT_STATUSES.FAILED,
			count: null,
			error_code: "timeout",
			error: "request timed out",
			observed_at: "2026-08-02T09:00:00Z",
		},
	]);

	assert.equal(state.get(2).status, COUNT_STATUSES.POSITIVE);
	assert.equal(state.get(2).count, 12);
});

test("terminal precedence and timestamp selection are independent of input order", () => {
	const base = { id: 2, dimension: COUNT_DIMENSIONS.COMPANY_MOVIE };
	const failure = {
		...base,
		status: COUNT_STATUSES.FAILED,
		count: null,
		error_code: "timeout",
		error: "request timed out",
		observed_at: "2026-09-03T09:00:00Z",
	};
	const terminals = [
		{
			...base,
			status: COUNT_STATUSES.POSITIVE,
			count: 12,
			observed_at: "2026-09-01T09:00:00Z",
		},
		{
			...base,
			status: COUNT_STATUSES.ZERO,
			count: 0,
			observed_at: "2026-09-01T09:00:00Z",
		},
		{
			...base,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: "2026-09-02T09:00:00Z",
			unavailable_reason: "entity_not_found_confirmed",
			evidence: [
				{ kind: "details_404", observed_at: "2026-09-01T09:00:00Z" },
				{ kind: "details_404", observed_at: "2026-09-02T09:00:00Z" },
			],
		},
	];
	for (const terminal of terminals) {
		for (const records of [
			[terminal, failure],
			[failure, terminal],
		]) {
			assert.deepEqual(reduceCountResults(records).get(2), terminal);
		}
	}

	const evidence = [
		terminals[0],
		{ ...terminals[0], count: 18, observed_at: "2026-09-02T09:00:00Z" },
		failure,
		{
			id: 1,
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
			status: COUNT_STATUSES.ZERO,
			count: 0,
			observed_at: "2026-09-02T09:00:00Z",
		},
	];
	const reduced = permutations(evidence).map((records) =>
		JSON.stringify([...reduceCountResults(records)]),
	);
	assert.equal(new Set(reduced).size, 1);
	assert.equal(reduceCountResults(evidence).get(2).count, 18);
	const equivalent = [
		{ ...terminals[0], _source_path: "z.json", attempt_window: ["2026-09-01T09:00:02Z", 1] },
		{ ...terminals[0], _source_path: "a.json", attempt_window: ["2026-09-01T09:00:01Z", 1] },
	];
	assert.equal(
		JSON.stringify([...reduceCountResults(equivalent)]),
		JSON.stringify([...reduceCountResults([...equivalent].reverse())]),
	);
});

test("legacy repair always fetches details and reuses only safe typed counts", async () => {
	const observedAt = "2026-09-04T09:00:00Z";
	const dimension = COUNT_DIMENSIONS.COMPANY_MOVIE;
	const priorResults = new Map([
		[1, { id: 1, dimension, status: COUNT_STATUSES.POSITIVE, count: 9, observed_at: "2026-09-01T09:00:00Z" }],
		[2, { id: 2, dimension, status: COUNT_STATUSES.ZERO, count: 0, observed_at: "2026-09-01T09:00:00Z" }],
		[3, {
			id: 3,
			dimension,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: "2026-09-02T09:00:00Z",
			unavailable_reason: "entity_not_found_confirmed",
			evidence: [
				{ kind: "details_404", observed_at: "2026-09-01T09:00:00Z" },
				{ kind: "details_404", observed_at: "2026-09-02T09:00:00Z" },
			],
		}],
		[4, {
			id: 4,
			dimension,
			status: COUNT_STATUSES.FAILED,
			count: null,
			error_code: "timeout",
			error: "timeout",
			observed_at: "2026-09-03T09:00:00Z",
		}],
		[7, {
			id: 7,
			dimension,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: "2026-09-02T09:00:00Z",
			unavailable_reason: "entity_not_found_confirmed",
			evidence: [
				{ kind: "details_404", observed_at: "2026-09-01T09:00:00Z" },
				{ kind: "details_404", observed_at: "2026-09-02T09:00:00Z" },
			],
		}],
	]);
	const requested = [];
	const client = {
		async request(url) {
			requested.push(url);
			const id = Number(/\/(\d+)(?:\?|$)/.exec(url)?.[1] || /companies=(\d+)/.exec(url)?.[1]);
			if (url.includes("/company/6")) {
				return { response: jsonResponse({ status: "broken" }, 500), attempts: [{ at: observedAt }] };
			}
			if (url.includes("/company/7")) {
				return { response: jsonResponse({ status: "missing" }, 404), attempts: [{ at: observedAt }] };
			}
			if (url.includes("/company/")) {
				return { response: jsonResponse({ id, name: `Company ${id}` }), attempts: [{ at: observedAt }] };
			}
			return { response: jsonResponse({ total_results: id * 2 }), attempts: [{ at: observedAt }] };
		},
	};
	const repair = await repairMissingLegacyRows({
		ids: [1, 2, 3, 4, 5, 6, 7],
		dimension,
		client,
		observedAt,
		priorResults,
		targetIds: [1, 2, 3, 4, 6, 7],
		detailsUrl: (id) => `https://api.themoviedb.org/3/company/${id}`,
		countUrl: (id) => `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
		normalizeRow: (details, count) => ({ ...details, titles_count: count }),
	});
	const byId = new Map(repair.outcomes.map((outcome) => [outcome.id, outcome]));
	assert.equal(byId.get(1).row.titles_count, 9);
	assert.equal(byId.get(2).row.titles_count, 0);
	assert.equal(byId.get(1).typed_count_reused, true);
	assert.equal(byId.get(2).typed_count_reused, true);
	assert.equal(requested.filter((url) => url.includes("with_companies=1")).length, 0);
	assert.equal(requested.filter((url) => url.includes("with_companies=2")).length, 0);
	assert.equal(requested.filter((url) => url.includes("with_companies=3")).length, 1);
	assert.equal(requested.filter((url) => url.includes("with_companies=4")).length, 1);
	assert.equal(byId.get(3).row.titles_count, 6);
	assert.equal(byId.get(4).row.titles_count, 8);
	assert.equal(byId.get(5).cache_restored, true);
	assert.equal(byId.get(5).progress_result, null, "outside-target repair must remain legacy-only");
	assert.equal(byId.get(6).cache_restored, false);
	assert.equal(byId.get(6).progress_result.status, COUNT_STATUSES.FAILED);
	assert.equal(requested.filter((url) => url.includes("with_companies=6")).length, 0);
	assert.equal(byId.get(7).cache_restored, false);
	assert.equal(byId.get(7).progress_result.status, COUNT_STATUSES.UNAVAILABLE);
	assert.equal(requested.filter((url) => url.includes("with_companies=7")).length, 0);
});

test("repair metadata preserves no-op, cap, success, partial and binding-failure shapes", () => {
	const common = {
		mode: "collect",
		month: "2026-09",
		audit: { audited_at: "2026-09-04T08:00:00Z" },
		typedCountsActive: true,
		maxRepairIds: 200,
		missingIds: [1],
		extraIds: [9],
		startedAt: "2026-09-04T09:00:00Z",
		finishedAt: "2026-09-04T09:01:00Z",
	};
	for (const entityType of ["company", "network"]) {
		const successful = buildRepairMetadata({
			...common,
			entityType,
			status: "completed",
			outcomes: [{ id: 1, cache_restored: true, typed_count_reused: true, progress_result: null }],
			removed: [9],
			totalCached: 20,
		});
		assert.equal(successful.operation, `${entityType}_cache_repair`);
		assert.equal(successful.added_count, 1);
		assert.equal(successful.removed_count, 1);
		assert.equal(successful.total_cached, 20);
	}
	const noOp = buildRepairMetadata({
		...common,
		entityType: "company",
		missingIds: [],
		extraIds: [],
		status: "skipped",
		reason: "nothing_to_repair",
	});
	assert.equal(noOp.skipped, true);
	assert.equal(noOp.reason, "nothing_to_repair");
	const capped = buildRepairMetadata({
		...common,
		entityType: "company",
		maxRepairIds: 1,
		status: "skipped",
		reason: "max_repair_ids_exceeded",
	});
	assert.equal(capped.cap.exceeded, true);
	assert.deepEqual(capped.missing_requested, [1]);
	assert.deepEqual(capped.extra_requested, [9]);
	const partial = buildRepairMetadata({
		...common,
		entityType: "network",
		status: "partial_failure",
		outcomes: [{
			id: 1,
			cache_restored: false,
			progress_result: {
				status: COUNT_STATUSES.FAILED,
				error_code: "timeout",
				error: "timeout",
			},
		}],
	});
	assert.equal(partial.failed_count, 1);
	const binding = buildRepairMetadata({
		...common,
		entityType: "company",
		status: "failed",
		reason: "typed_binding_mismatch",
		bindingError: "fingerprint mismatch",
	});
	assert.equal(binding.binding_error, "fingerprint mismatch");
});

test("equal-timestamp semantic conflicts and duplicate progress IDs fail closed", async (context) => {
	const base = {
		id: 2,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		observed_at: "2026-09-01T09:00:00Z",
	};
	assert.throws(
		() =>
			reduceCountResults([
				{ ...base, status: COUNT_STATUSES.ZERO, count: 0 },
				{ ...base, status: COUNT_STATUSES.POSITIVE, count: 4 },
			]),
		/conflicting count observations/i,
	);

	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-duplicate-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	await assert.rejects(
		writeProgressDocument({
			root,
			month: "2026-09",
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
			targetFingerprint: `sha256:${"a".repeat(64)}`,
			runId: "duplicate",
			observedAt: base.observed_at,
			results: [
				{ ...base, status: COUNT_STATUSES.ZERO, count: 0 },
				{ ...base, status: COUNT_STATUSES.ZERO, count: 0 },
			],
		}),
		/duplicate ID 2/,
	);
});

test("mixed parser-semantic progress blocks cannot be reduced or published", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-mixed-parser-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const targetFingerprint = `sha256:${"a".repeat(64)}`;
	const directory = path.join(root, "months", "2026-09", "progress", COUNT_DIMENSIONS.COMPANY_MOVIE);
	await fs.mkdir(directory, { recursive: true });
	const base = {
		schema_version: 1,
		month: "2026-09",
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		target_fingerprint: targetFingerprint,
		run_id: "mixed",
		observed_at: "2026-09-01T09:00:00Z",
		slice_index: 0,
		total_slices: 14,
		request_usage: null,
		results: [{ id: 2, status: COUNT_STATUSES.ZERO, count: 0 }],
	};
	await fs.writeFile(
		path.join(directory, "slice-01.json"),
		JSON.stringify({ ...base, parser_semantic_version: "2.0.0" }),
	);
	await assert.rejects(
		loadDimensionState({
			root,
			month: "2026-09",
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
			targetFingerprint,
			targetIds: [2],
		}),
		/parser semantic version mismatch/,
	);
	await fs.writeFile(
		path.join(directory, "slice-01.json"),
		JSON.stringify({
			...base,
			parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
			results: [{ id: 3, status: COUNT_STATUSES.ZERO, count: 0 }],
		}),
	);
	await assert.rejects(
		loadDimensionState({
			root,
			month: "2026-09",
			dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
			targetFingerprint,
			targetIds: [2],
		}),
		/outside the frozen target/,
	);
});

test("repair evidence is bound to dataset, month, target fingerprint and parser contract", () => {
	const target = buildTargetSnapshot({
		entityType: "company",
		month: "2026-09",
		ids: [2, 7],
		createdAt: "2026-09-01T08:00:00Z",
	});
	const audit = {
		schema_version: 1,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		dataset: "companies",
		export_target_month: "2026-09",
		export_target_fingerprint: target.target_fingerprint,
		export_target_schema_version: target.schema_version,
		export_target_parser_semantic_version: target.parser_semantic_version,
		audited_at: "2026-09-01T08:15:00Z",
	};
	assert.doesNotThrow(() =>
		validateRepairAuditBinding({
			audit,
			target,
			expectedDataset: "companies",
			expectedMonth: "2026-09",
			now: new Date("2026-09-02T18:00:00Z"),
		}),
	);
	assert.throws(
		() =>
			validateRepairAuditBinding({
				audit,
				target: null,
				expectedDataset: "companies",
				expectedMonth: "2026-09",
			}),
		/Target snapshot must be an object/,
	);
	assert.throws(
		() =>
			validateRepairAuditBinding({
				audit,
				target: { ...target, parser_semantic_version: undefined },
				expectedDataset: "companies",
				expectedMonth: "2026-09",
			}),
		/parser semantic version/,
	);
	for (const changed of [
		{ dataset: "networks" },
		{ export_target_month: "2026-08" },
		{ export_target_fingerprint: `sha256:${"b".repeat(64)}` },
		{ export_target_schema_version: 99 },
		{ parser_semantic_version: "2.0.0" },
	]) {
		assert.throws(
			() =>
				validateRepairAuditBinding({
					audit: { ...audit, ...changed },
					target,
					expectedDataset: "companies",
					expectedMonth: "2026-09",
					now: new Date("2026-09-02T18:00:00Z"),
				}),
		);
	}
	const octoberTarget = buildTargetSnapshot({
		entityType: "company",
		month: "2026-10",
		ids: [2, 7],
		createdAt: "2026-10-01T00:01:00Z",
	});
	assert.throws(
		() =>
			validateRepairAuditBinding({
				audit: { ...audit, audited_at: "2026-09-30T23:50:00Z" },
				target: octoberTarget,
				expectedDataset: "companies",
				expectedMonth: "2026-10",
				now: new Date("2026-10-01T00:10:00Z"),
			}),
		/audit month .* does not match 2026-10/,
	);
});

test("immutable progress stores exact per-ID attempt windows without duplicating run fields", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-progress-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const targetFingerprint = `sha256:${"a".repeat(64)}`;
	const result = {
		id: 2,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		status: COUNT_STATUSES.ZERO,
		count: 0,
		observed_at: "2026-08-01T09:00:00Z",
		attempts: [
			{
				at: "2026-08-01T09:00:01.123Z",
				host: "api.themoviedb.org",
				path: "/3/company/2",
				attempt: 1,
				status: 200,
				outcome: "response",
			},
		],
	};
	const written = await writeProgressDocument({
		root,
		month: "2026-08",
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		targetFingerprint,
		runId: "test-run",
		observedAt: "2026-08-01T09:00:00Z",
		results: [result],
		sliceIndex: 0,
		totalSlices: 14,
	});
	const raw = await fs.readFile(written.path, "utf8");
	assert.doesNotMatch(raw, /\n/);
	const stored = JSON.parse(raw).results[0];
	assert.deepEqual(stored.attempt_window, ["2026-08-01T09:00:01.123Z", 1]);
	assert.equal(stored.dimension, undefined);
	assert.equal(stored.observed_at, undefined);
	const loaded = await loadDimensionState({
		root,
		month: "2026-08",
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		targetFingerprint,
	});
	assert.equal(loaded.resultsById.get(2).count, 0);
});

test("reservation planning protects genre, audit and repair commitments", () => {
	const company = buildTestReceipt({
		date: fixedNow,
		reservationId: "company",
		workflow: "Monthly Company",
		runId: "1",
		job: "reserve",
		bucket: RESERVATION_BUCKETS.GENERAL,
		allocations: {
			collection: 55_000,
			target_export: 7,
		},
		existingReceipts: [],
	});
	assert.equal(company.receipt.projected_daily_total, 59_057);

	const network = buildTestReceipt({
		date: fixedNow,
		reservationId: "network",
		workflow: "Monthly Network",
		runId: "2",
		job: "reserve",
		bucket: RESERVATION_BUCKETS.GENERAL,
		allocations: {
			collection: 15_000,
			target_export: 7,
		},
		existingReceipts: [company.receipt],
	});
	assert.equal(network.receipt.projected_daily_total, 74_064);
});

test("reservation planning rejects preferred and absolute over-allocation", () => {
	assert.throws(
		() =>
			buildTestReceipt({
				date: fixedNow,
				reservationId: "unsafe",
				workflow: "Manual",
				runId: "1",
				job: "reserve",
				allocations: { collection: 86_000 },
			}),
		/preferred 90000/,
	);

	assert.throws(
		() =>
			buildTestReceipt({
				date: fixedNow,
				reservationId: "absolute",
				workflow: "Manual",
				runId: "1",
				job: "reserve",
				allocations: { collection: 96_000 },
				allowPreferredOverride: true,
				overrideReason: "test",
			}),
		/absolute 100000/,
	);
});

test("exact 90000 preferred ceiling passes without override and 90001 requires it", () => {
	const exact = buildTestReceipt({
		reservationId: "preferred-exact",
		allocations: { collection: 85_950 },
	});
	assert.equal(exact.receipt.projected_daily_total, 90_000);
	assert.equal(exact.receipt.preferred_override_used, false);
	assert.throws(
		() => buildTestReceipt({ reservationId: "preferred-over", allocations: { collection: 85_951 } }),
		/preferred 90000/,
	);
});

test("exact 100000 hard ceiling passes only with preferred override and 100001 always fails", () => {
	assert.throws(
		() => buildTestReceipt({ reservationId: "absolute-no-override", allocations: { collection: 95_950 } }),
		/preferred 90000/,
	);
	const exact = buildTestReceipt({
		reservationId: "absolute-exact",
		allocations: { collection: 95_950 },
		allowPreferredOverride: true,
		overrideReason: "exact hard-limit boundary test",
	});
	assert.equal(exact.receipt.projected_daily_total, 100_000);
	assert.equal(exact.receipt.preferred_override_used, true);
	assert.throws(
		() => buildTestReceipt({
			reservationId: "absolute-over",
			allocations: { collection: 95_951 },
			allowPreferredOverride: true,
			overrideReason: "must still fail",
		}),
		/absolute 100000/,
	);
});

test("reservation creation refuses an expired or internally inconsistent plan", () => {
	assert.throws(
		() => buildTestReceipt({ plannedUtcDate: "2026-08-14" }),
		/execution date .* does not match planned UTC date/,
	);
	assert.throws(
		() => buildTestReceipt({ plannedMonth: "2026-07" }),
		/planned month and UTC date disagree/,
	);
});

test("request client counts initial attempts and retries against one allowance", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-request-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		date: fixedNow,
		reservationId: "request-test",
		workflow: "Test",
		runId: "1",
		job: "reserve",
		allocations: { collection: 2 },
	});
	const receiptPath = path.join(root, "receipt.json");
	const usagePath = path.join(root, "usage.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let calls = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "request-test",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		usagePath,
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		sleepImpl: async () => {},
		fetchImpl: async () => {
			calls += 1;
			return new Response(
				JSON.stringify({ total_results: calls === 1 ? null : 0 }),
				{
					status: calls === 1 ? 500 : 200,
					headers: { "content-type": "application/json" },
				},
			);
		},
	});
	const result = await client.requestJson(
		"https://api.themoviedb.org/3/discover/movie?with_companies=2",
	);

	assert.equal(result.response.status, 200);
	assert.equal(calls, 2);
	assert.equal(client.usageSummary().attempts_used, 2);
	assert.equal(client.usageSummary().retries, 1);
	await client.writeUsage();
	assert.equal(JSON.parse(await fs.readFile(usagePath, "utf8")).attempts_used, 2);
});

test("request client refuses a receipt from a different UTC date", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-date-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		date: fixedNow,
		reservationId: "date-test",
		workflow: "Test",
		runId: "1",
		job: "reserve",
		allocations: { collection: 1 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));

	await assert.rejects(
		createTmdbRequestClient({
			receiptPath,
			reservationId: "date-test",
			reservationSha256: built.sha256,
			allocationKey: "collection",
			job: "collect",
			...clientBinding(built.receipt),
			now: () => new Date("2026-08-16T00:00:00Z"),
		}),
		/current UTC date/,
	);
});

test("request client stops cleanly when its immutable allocation is exhausted", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-exhaustion-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		date: fixedNow,
		reservationId: "exhaustion-test",
		workflow: "Test",
		runId: "1",
		job: "reserve",
		allocations: { collection: 1 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let calls = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "exhaustion-test",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		fetchImpl: async () => {
			calls += 1;
			return new Response("{}", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	});

	await client.request("https://api.themoviedb.org/3/company/2", { maxAttempts: 1 });
	await assert.rejects(
		client.request("https://api.themoviedb.org/3/company/3", { maxAttempts: 1 }),
		(error) =>
			error.stopCollection === true &&
			error.code === "reservation_allocation_exhausted",
	);
	assert.equal(calls, 1);
	assert.equal(client.usageSummary().attempts_used, 1);
});

test("request client stops after one authentication failure without retry expansion", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-auth-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		date: fixedNow,
		reservationId: "auth-test",
		workflow: "Test",
		runId: "1",
		job: "reserve",
		allocations: { collection: 5 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let calls = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "auth-test",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		fetchImpl: async () => {
			calls += 1;
			return new Response("{}", {
				status: 401,
				headers: { "content-type": "application/json" },
			});
		},
	});

	await assert.rejects(
		client.request("https://api.themoviedb.org/3/company/2"),
		(error) =>
			error.stopCollection === true &&
			error.code === "tmdb_auth_or_permission_error",
	);
	assert.equal(calls, 1);
	assert.equal(client.usageSummary().attempts_used, 1);
});

test("retry delay caps Retry-After and treats malformed or negative values safely", () => {
	assert.equal(
		retryDelayMs(new Response("", { status: 429, headers: { "retry-after": "9999" } }), 1),
		60_000,
	);
	assert.equal(
		retryDelayMs(new Response("", { status: 429, headers: { "retry-after": "-1" } }), 1),
		5_000,
	);
	assert.equal(
		retryDelayMs(new Response("", { status: 429, headers: { "retry-after": "later" } }), 1),
		5_000,
	);
});

test("request timeout covers a stalled response body and charges exactly one attempt", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-body-timeout-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		reservationId: "body-timeout",
		allocations: { collection: 1 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let sleeps = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "body-timeout",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		timeoutMs: 15,
		maxAttempts: 1,
		sleepImpl: async () => {
			sleeps += 1;
		},
		fetchImpl: async () =>
			new Response(new ReadableStream({ pull() {} }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
	});
	await assert.rejects(
		client.request("https://api.themoviedb.org/3/company/2"),
		/timed out after 15ms/,
	);
	assert.equal(client.usageSummary().attempts_used, 1);
	assert.equal(client.usageSummary().by_status_or_outcome.timeout, 1);
	assert.equal(sleeps, 0);
});

test("retry does not sleep when the immutable allowance has no next attempt", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-no-retry-sleep-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		reservationId: "no-retry-sleep",
		allocations: { collection: 1 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let sleeps = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "no-retry-sleep",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		sleepImpl: async () => {
			sleeps += 1;
		},
		fetchImpl: async () => new Response("{}", { status: 500 }),
	});
	await assert.rejects(
		client.request("https://api.themoviedb.org/3/company/2"),
		(error) => error.code === "reservation_allocation_exhausted",
	);
	assert.equal(client.usageSummary().attempts_used, 1);
	assert.equal(sleeps, 0);
});

test("retry rechecks UTC date before sleeping", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-retry-date-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		reservationId: "retry-date",
		allocations: { collection: 2 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let current = fixedNow;
	let sleeps = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "retry-date",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => current,
		sleepImpl: async () => {
			sleeps += 1;
		},
		fetchImpl: async () => {
			current = new Date("2026-08-16T00:00:00Z");
			return new Response("{}", { status: 500 });
		},
	});
	await assert.rejects(
		client.request("https://api.themoviedb.org/3/company/2"),
		(error) => error.code === "reservation_utc_date_changed",
	);
	assert.equal(client.usageSummary().attempts_used, 1);
	assert.equal(sleeps, 0);
});

test("final permitted response does not sleep and completed bodies clean up timeout aborts", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-timeout-cleanup-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		reservationId: "timeout-cleanup",
		allocations: { collection: 2 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	let sleeps = 0;
	let aborts = 0;
	let calls = 0;
	const client = await createTmdbRequestClient({
		receiptPath,
		reservationId: "timeout-cleanup",
		reservationSha256: built.sha256,
		allocationKey: "collection",
		job: "collect",
		...clientBinding(built.receipt),
		now: () => fixedNow,
		timeoutMs: 20,
		sleepImpl: async () => {
			sleeps += 1;
		},
		fetchImpl: async (_url, options) => {
			options.signal.addEventListener("abort", () => {
				aborts += 1;
			});
			calls += 1;
			return new Response("{}", { status: calls === 1 ? 500 : 200 });
		},
	});
	const final = await client.request("https://api.themoviedb.org/3/company/2", {
		maxAttempts: 1,
	});
	assert.equal(final.response.status, 500);
	assert.equal(sleeps, 0);
	const success = await client.request("https://api.themoviedb.org/3/company/3", {
		maxAttempts: 1,
	});
	assert.equal(success.response.status, 200);
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.equal(aborts, 0);
	assert.equal(client.usageSummary().attempts_used, 2);
});

test("a valid reservation hash cannot be repurposed by another run or dimension", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-binding-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const built = buildTestReceipt({
		reservationId: "binding-test",
		allocations: { collection: 2 },
	});
	const receiptPath = path.join(root, "receipt.json");
	await fs.writeFile(receiptPath, JSON.stringify(built.receipt));
	await assert.rejects(
		createTmdbRequestClient({
			receiptPath,
			reservationId: "binding-test",
			reservationSha256: built.sha256,
			allocationKey: "collection",
			job: "collect",
			...clientBinding(built.receipt),
			expectedRunId: "different-run",
			now: () => fixedNow,
		}),
		/run ID binding mismatch/,
	);
	await assert.rejects(
		createTmdbRequestClient({
			receiptPath,
			reservationId: "binding-test",
			reservationSha256: built.sha256,
			allocationKey: "collection",
			job: "collect",
			...clientBinding(built.receipt),
			targetDimension: "network-series",
			now: () => fixedNow,
		}),
		/target dimension binding mismatch/,
	);
	await assert.rejects(
		createTmdbRequestClient({
			receiptPath,
			reservationId: "binding-test",
			reservationSha256: built.sha256,
			allocationKey: "collection",
			job: "collect",
			...clientBinding(built.receipt),
			expectedRunAttempt: "2",
			now: () => fixedNow,
		}),
		/run attempt binding mismatch/,
	);
});

function stateFor(dimension, entries) {
	return {
		schemaVersion: 1,
		parserSemanticVersion: COUNT_PARSER_SEMANTIC_VERSION,
		resultsById: new Map(
			entries.map(([id, status, count, observedAt = "2026-08-01T09:00:00Z", reason]) => [
				id,
				{
					id,
					dimension,
					status,
					count,
					observed_at: observedAt,
					...(status === COUNT_STATUSES.FAILED
						? { error_code: "test_failure", error: "test transient failure" }
						: {}),
					...(reason
						? {
								unavailable_reason: reason,
								evidence: [
									{ kind: "details_404", observed_at: "2026-08-14T09:00:00Z" },
									{ kind: "details_404", observed_at: observedAt },
								],
							}
						: {}),
				},
			]),
		),
	};
}

test("publisher rejects pending and transient failed dimensions", () => {
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month: "2026-08",
		ids: [1, 2],
		createdAt: fixedNow.toISOString(),
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month: "2026-08",
		ids: [3],
		createdAt: fixedNow.toISOString(),
	});
	const publication = buildEntityCountPublication({
		month: "2026-08",
		companyTarget,
		networkTarget,
		companyMovieState: stateFor(COUNT_DIMENSIONS.COMPANY_MOVIE, [
			[1, COUNT_STATUSES.POSITIVE, 2],
		]),
		companySeriesState: stateFor(COUNT_DIMENSIONS.COMPANY_SERIES, [
			[1, COUNT_STATUSES.ZERO, 0],
			[2, COUNT_STATUSES.FAILED, null],
		]),
		networkSeriesState: stateFor(COUNT_DIMENSIONS.NETWORK_SERIES, [
			[3, COUNT_STATUSES.ZERO, 0],
		]),
	});

	assert.equal(publication.complete, false);
	assert.deepEqual(publication.blockers[COUNT_DIMENSIONS.COMPANY_MOVIE], {
		pending: 1,
		failed: 0,
	});
	assert.deepEqual(publication.blockers[COUNT_DIMENSIONS.COMPANY_SERIES], {
		pending: 0,
		failed: 1,
	});
});

test("publisher coalesces contiguous target positions and preserves dimension unavailability", () => {
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month: "2026-08",
		ids: [2, 7, 11, 19],
		createdAt: fixedNow.toISOString(),
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month: "2026-08",
		ids: [3, 8],
		createdAt: fixedNow.toISOString(),
	});
	const unavailableReason = "entity_not_found_confirmed";
	const companyMovie = stateFor(COUNT_DIMENSIONS.COMPANY_MOVIE, [
		[2, COUNT_STATUSES.POSITIVE, 12],
		[7, COUNT_STATUSES.ZERO, 0],
		[11, COUNT_STATUSES.POSITIVE, 4],
		[19, COUNT_STATUSES.POSITIVE, 9],
	]);
	const companySeries = stateFor(COUNT_DIMENSIONS.COMPANY_SERIES, [
		[2, COUNT_STATUSES.ZERO, 0, "2026-08-15T09:00:00Z"],
		[7, COUNT_STATUSES.POSITIVE, 3, "2026-08-15T09:00:00Z"],
		[11, COUNT_STATUSES.UNAVAILABLE, null, "2026-08-16T09:00:00Z", unavailableReason],
		[19, COUNT_STATUSES.POSITIVE, 2, "2026-08-17T09:00:00Z"],
	]);
	const networkSeries = stateFor(COUNT_DIMENSIONS.NETWORK_SERIES, [
		[3, COUNT_STATUSES.POSITIVE, 5],
		[8, COUNT_STATUSES.ZERO, 0],
	]);
	const first = buildEntityCountPublication({
		month: "2026-08",
		companyTarget,
		networkTarget,
		companyMovieState: companyMovie,
		companySeriesState: companySeries,
		networkSeriesState: networkSeries,
		publishedAt: "2026-08-28T10:00:00Z",
	});
	const second = buildEntityCountPublication({
		month: "2026-08",
		companyTarget,
		networkTarget,
		companyMovieState: companyMovie,
		companySeriesState: companySeries,
		networkSeriesState: networkSeries,
		publishedAt: "2026-08-28T10:00:00Z",
	});

	assert.equal(first.complete, true);
	assert.deepEqual(first.sidecar.c["2"], [12, 0]);
	assert.deepEqual(first.sidecar.c["7"], [0, 3]);
	assert.equal(first.sidecar.c["11"][1], null);
	assert.equal(first.sidecar.c["7"][0], 0);
	assert.equal(first.sidecar.n["3"], 5);
	assert.equal(first.sidecar.n["8"], 0);
	assert.ok(first.sidecar.r.cm.some(([firstId, lastId]) => firstId === 2 && lastId === 19));
	assert.equal(first.sidecarJson, second.sidecarJson);
	assert.ok(first.completion.sidecar.raw_bytes < 5 * 1024 * 1024);
	assert.ok(first.completion.sidecar.gzip_bytes < 1.25 * 1024 * 1024);
});

test("publisher rejects missing or mixed parser semantic versions across dimensions", () => {
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month: "2026-09",
		ids: [2],
		createdAt: "2026-09-01T08:00:00Z",
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month: "2026-09",
		ids: [3],
		createdAt: "2026-09-01T08:00:00Z",
	});
	const movie = stateFor(COUNT_DIMENSIONS.COMPANY_MOVIE, [
		[2, COUNT_STATUSES.ZERO, 0, "2026-09-01T09:00:00Z"],
	]);
	const series = stateFor(COUNT_DIMENSIONS.COMPANY_SERIES, [
		[2, COUNT_STATUSES.ZERO, 0, "2026-09-15T09:00:00Z"],
	]);
	const network = stateFor(COUNT_DIMENSIONS.NETWORK_SERIES, [
		[3, COUNT_STATUSES.ZERO, 0, "2026-09-01T08:45:00Z"],
	]);
	for (const parserSemanticVersion of [undefined, "2.0.0"]) {
		assert.throws(
			() =>
				buildEntityCountPublication({
					month: "2026-09",
					companyTarget,
					networkTarget,
					companyMovieState: { ...movie, parserSemanticVersion },
					companySeriesState: series,
					networkSeriesState: network,
				}),
			/incompatible parser\/schema contract/,
		);
	}
});

test("publisher refuses more than 512 deduplicated observations", () => {
	const companyIds = Array.from({ length: 513 }, (_, index) => index + 1);
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month: "2026-08",
		ids: companyIds,
		createdAt: fixedNow.toISOString(),
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month: "2026-08",
		ids: [1],
		createdAt: fixedNow.toISOString(),
	});
	const movie = stateFor(
		COUNT_DIMENSIONS.COMPANY_MOVIE,
		companyIds.map((id, index) => [
			id,
			COUNT_STATUSES.ZERO,
			0,
			new Date(Date.UTC(2026, 7, 1, 9, 0, index)).toISOString(),
		]),
	);
	const series = stateFor(
		COUNT_DIMENSIONS.COMPANY_SERIES,
		companyIds.map((id) => [id, COUNT_STATUSES.ZERO, 0]),
	);
	const network = stateFor(COUNT_DIMENSIONS.NETWORK_SERIES, [
		[1, COUNT_STATUSES.ZERO, 0],
	]);

	assert.throws(
		() =>
			buildEntityCountPublication({
				month: "2026-08",
				companyTarget,
				networkTarget,
				companyMovieState: movie,
				companySeriesState: series,
				networkSeriesState: network,
			}),
		/maximum is 512/,
	);
});

function completePublication(month, publishedAt = `${month}-28T10:00:00Z`) {
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month,
		ids: [2, 7],
		createdAt: `${month}-01T08:00:00Z`,
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month,
		ids: [3],
		createdAt: `${month}-01T08:00:00Z`,
	});
	return buildEntityCountPublication({
		month,
		companyTarget,
		networkTarget,
		companyMovieState: stateFor(COUNT_DIMENSIONS.COMPANY_MOVIE, [
			[2, COUNT_STATUSES.POSITIVE, 2, `${month}-01T09:00:00Z`],
			[7, COUNT_STATUSES.ZERO, 0, `${month}-01T09:00:00Z`],
		]),
		companySeriesState: stateFor(COUNT_DIMENSIONS.COMPANY_SERIES, [
			[2, COUNT_STATUSES.ZERO, 0, `${month}-15T09:00:00Z`],
			[7, COUNT_STATUSES.POSITIVE, 3, `${month}-15T09:00:00Z`],
		]),
		networkSeriesState: stateFor(COUNT_DIMENSIONS.NETWORK_SERIES, [
			[3, COUNT_STATUSES.POSITIVE, 4, `${month}-01T08:45:00Z`],
		]),
		publishedAt,
	});
}

test("published sidecar validation rejects unsafe numeric property IDs without changing key encoding", () => {
	const publication = completePublication("2026-09");
	const unsafe = structuredClone(publication.sidecar);
	unsafe.c[String(Number.MAX_SAFE_INTEGER + 1)] = unsafe.c["2"];
	delete unsafe.c["2"];
	const sidecarJson = JSON.stringify(unsafe);
	const completion = structuredClone(publication.completion);
	completion.sidecar.sha256 = crypto.createHash("sha256").update(sidecarJson).digest("hex");
	completion.sidecar.raw_bytes = Buffer.byteLength(sidecarJson);
	completion.sidecar.gzip_bytes = zlib.gzipSync(sidecarJson, { level: 9 }).length;
	assert.throws(
		() => validateCompletionManifest(completion, sidecarJson),
		/unsafe entity ID/,
	);
});

test("publisher preserves newer data, is idempotent for identical months and accepts later complete months", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-publish-order-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const sidecarPath = path.join(root, "sidecar.json");
	const completionPath = path.join(root, "completion.json");
	const september = completePublication("2026-09");
	assert.deepEqual(
		await writePublicationFiles({ publication: september, sidecarPath, completionPath }),
		{ published: true, reason: "first_publication" },
	);
	const septemberBytes = await fs.readFile(sidecarPath);
	assert.deepEqual(
		await writePublicationFiles({ publication: completePublication("2026-08"), sidecarPath, completionPath }),
		{ published: false, reason: "newer_month_already_published" },
	);
	assert.deepEqual(await fs.readFile(sidecarPath), septemberBytes);
	assert.deepEqual(
		await writePublicationFiles({ publication: september, sidecarPath, completionPath }),
		{ published: false, reason: "already_current" },
	);
	assert.deepEqual(
		await writePublicationFiles({ publication: completePublication("2026-10"), sidecarPath, completionPath }),
		{ published: true, reason: "newer_complete_month" },
	);
	assert.equal(JSON.parse(await fs.readFile(completionPath, "utf8")).month, "2026-10");
});

test("publication writer restores both files when the second rename fails", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-publish-rollback-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const sidecarPath = path.join(root, "sidecar.json");
	const completionPath = path.join(root, "completion.json");
	await writePublicationFiles({
		publication: completePublication("2026-09"),
		sidecarPath,
		completionPath,
	});
	const originalSidecar = await fs.readFile(sidecarPath);
	const originalCompletion = await fs.readFile(completionPath);
	let temporaryRenames = 0;
	const fsOps = {
		...fs,
		async rename(source, destination) {
			if (source.endsWith(".tmp")) {
				temporaryRenames += 1;
				if (temporaryRenames === 2) throw new Error("injected second rename failure");
			}
			return fs.rename(source, destination);
		},
	};
	await assert.rejects(
		writePublicationFiles({
			publication: completePublication("2026-10"),
			sidecarPath,
			completionPath,
			fsOps,
			nonceFactory: () => "second-rename",
		}),
		/injected second rename failure/,
	);
	assert.deepEqual(await fs.readFile(sidecarPath), originalSidecar);
	assert.deepEqual(await fs.readFile(completionPath), originalCompletion);
	assert.deepEqual(
		(await fs.readdir(root)).filter((name) => /\.(?:tmp|bak)$/.test(name)),
		[],
	);
});

test("publication writer preserves originals on first-rename failure and surfaces rollback failure", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-publish-failures-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const sidecarPath = path.join(root, "sidecar.json");
	const completionPath = path.join(root, "completion.json");
	await writePublicationFiles({
		publication: completePublication("2026-09"),
		sidecarPath,
		completionPath,
	});
	const originalSidecar = await fs.readFile(sidecarPath);
	const originalCompletion = await fs.readFile(completionPath);
	await assert.rejects(
		writePublicationFiles({
			publication: completePublication("2026-10"),
			sidecarPath,
			completionPath,
			fsOps: {
				...fs,
				async rename(source, destination) {
					if (source.endsWith(".tmp")) throw new Error("injected first rename failure");
					return fs.rename(source, destination);
				},
			},
			nonceFactory: () => "first-rename",
		}),
		/injected first rename failure/,
	);
	assert.deepEqual(await fs.readFile(sidecarPath), originalSidecar);
	assert.deepEqual(await fs.readFile(completionPath), originalCompletion);
	assert.deepEqual(
		(await fs.readdir(root)).filter((name) => /\.(?:tmp|bak)$/.test(name)),
		[],
	);

	let temporaryRenames = 0;
	await assert.rejects(
		writePublicationFiles({
			publication: completePublication("2026-10"),
			sidecarPath,
			completionPath,
			fsOps: {
				...fs,
				async rename(source, destination) {
					if (source.endsWith(".tmp")) {
						temporaryRenames += 1;
						if (temporaryRenames === 2) throw new Error("injected replacement failure");
					}
					if (source.endsWith(".bak")) throw new Error("injected rollback failure");
					return fs.rename(source, destination);
				},
			},
			nonceFactory: () => "rollback-failure",
		}),
		/rollback restoration failed.*Backups were retained/,
	);
	assert.ok((await fs.readdir(root)).some((name) => name.endsWith(".bak")));
});

test("same-month no-op and older-month rejection perform no filesystem writes", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-publish-no-touch-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const sidecarPath = path.join(root, "sidecar.json");
	const completionPath = path.join(root, "completion.json");
	const current = completePublication("2026-09");
	await writePublicationFiles({ publication: current, sidecarPath, completionPath });
	let mutations = 0;
	const fsOps = {
		...fs,
		async writeFile(...args) {
			mutations += 1;
			return fs.writeFile(...args);
		},
		async rename(...args) {
			mutations += 1;
			return fs.rename(...args);
		},
		async rm(...args) {
			mutations += 1;
			return fs.rm(...args);
		},
	};
	assert.deepEqual(
		await writePublicationFiles({ publication: current, sidecarPath, completionPath, fsOps }),
		{ published: false, reason: "already_current" },
	);
	assert.deepEqual(
		await writePublicationFiles({
			publication: completePublication("2026-08"),
			sidecarPath,
			completionPath,
			fsOps,
		}),
		{ published: false, reason: "newer_month_already_published" },
	);
	assert.equal(mutations, 0);
});

test("malformed existing completion and conflicting same-month publication fail closed", async (context) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-count-publish-guard-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const sidecarPath = path.join(root, "sidecar.json");
	const completionPath = path.join(root, "completion.json");
	const publication = completePublication("2026-09");
	await writePublicationFiles({ publication, sidecarPath, completionPath });
	const originalSidecar = await fs.readFile(sidecarPath);

	const conflicting = structuredClone(publication);
	conflicting.sidecar.c["2"][0] = 99;
	conflicting.sidecarJson = JSON.stringify(conflicting.sidecar);
	conflicting.completion.sidecar.sha256 = crypto
		.createHash("sha256")
		.update(conflicting.sidecarJson)
		.digest("hex");
	conflicting.completion.sidecar.raw_bytes = Buffer.byteLength(conflicting.sidecarJson);
	conflicting.completion.sidecar.gzip_bytes = zlib.gzipSync(conflicting.sidecarJson, { level: 9 }).length;
	await assert.rejects(
		writePublicationFiles({ publication: conflicting, sidecarPath, completionPath }),
		/different complete sidecar/,
	);
	assert.deepEqual(await fs.readFile(sidecarPath), originalSidecar);

	await fs.writeFile(completionPath, "{not-json");
	await assert.rejects(
		writePublicationFiles({ publication: completePublication("2026-10"), sidecarPath, completionPath }),
		/malformed JSON/,
	);
	assert.deepEqual(await fs.readFile(sidecarPath), originalSidecar);
});
