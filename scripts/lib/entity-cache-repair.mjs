import {
	CATALOGUE_COUNT_STATUSES,
	CATALOGUE_PARSER_SEMANTIC_VERSION,
	CATALOGUE_SCHEMA_VERSION,
	parseTmdbTotalResults,
	statusForKnownCount,
	truncateToUtcSecond,
	validateAuditFreshness,
} from "./tmdb-catalogue-counts.mjs";

export function parseRepairBatchLimit(value = "200", maximum = 5000) {
	if (!/^\d+$/.test(String(value))) {
		throw new TypeError(`Repair batch limit must be an integer from 0 through ${maximum}.`);
	}
	const limit = Number(value);
	if (!Number.isSafeInteger(limit) || limit > maximum) {
		throw new RangeError(`Repair batch limit must be 0 through ${maximum}.`);
	}
	return limit;
}

function validateIds(ids, label) {
	if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
		new Set(ids).size !== ids.length) {
		throw new TypeError(`${label} must contain unique positive integer IDs.`);
	}
	return ids;
}

// Reconcile a fresh audit with the checkout, then walk pending IDs cyclically.
// The cursor lives in the existing repair metadata and survives daily audits;
// failed/404 IDs are revisited without blocking every ID behind them.
export function planRepairBatch({ missingIds, extraIds, cachedIds, maxRepairIds = 200, afterId = 0 }) {
	const limit = parseRepairBatchLimit(maxRepairIds);
	validateIds(missingIds, "Missing IDs");
	validateIds(extraIds, "Extra IDs");
	const cached = new Set(validateIds(cachedIds, "Cached IDs"));
	const extras = new Set(extraIds);
	if (missingIds.some((id) => extras.has(id))) {
		throw new TypeError("Repair audit cannot mark an ID both missing and extra.");
	}
	const pendingMissing = missingIds.filter((id) => !cached.has(id));
	const pendingExtra = extraIds.filter((id) => cached.has(id));
	const pending = [...pendingMissing, ...pendingExtra].sort((a, b) => a - b);
	const cursor = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
	const ordered = [...pending.filter((id) => id > cursor), ...pending.filter((id) => id <= cursor)];
	const selected = ordered.slice(0, limit);
	return {
		maximum: limit,
		pending_missing: pendingMissing,
		pending_extra: pendingExtra,
		pending_count: pending.length,
		already_resolved_count: missingIds.length + extraIds.length - pending.length,
		selected_missing: selected.filter((id) => !extras.has(id)),
		selected_extra: selected.filter((id) => extras.has(id)),
		selected_count: selected.length,
		deferred_count: pending.length - selected.length,
		last_selected_id: selected.at(-1) ?? cursor,
	};
}

export function assertRepairBatchCompleted(repair, requestedMissingCount) {
	if (repair.allocationStopped || repair.outcomes.length !== requestedMissingCount) {
		throw new Error("Repair exhausted its request allocation before completing the selected batch; catalogue files were not written.");
	}
}

export function formatRepairSummary(report) {
	const batch = report.batch;
	return [
		`### ${report.operation === "company_cache_repair" ? "Company" : "Network"} cache repair`,
		"",
		`- Result: ${report.status}${report.reason ? ` (${report.reason})` : ""}`,
		`- Audit changes: ${report.requested_repair_count}`,
		...(batch ? [
			`- Pending before this batch: ${batch.pending_count}; selected: ${batch.selected_count}; deferred: ${batch.deferred_count}`,
			`- Remaining audit changes after this batch: ${batch.remaining_count}`,
		] : []),
		`- Added: ${report.added_count}; removed: ${report.removed_count}; not found: ${report.not_found_count}; failed: ${report.failed_count}`,
		`- TMDB attempts: ${report.requests?.attempts_used ?? 0} / ${report.requests?.allowance ?? 0}`,
		...(report.network_count_retry ? [
			`- Unknown Network counts: ${report.network_count_retry.selected} selected; ${report.network_count_retry.deferred} deferred`,
		] : []),
		"", "",
	].join("\n");
}

function failedResult({ id, dimension, observedAt, error, attempts = [], code }) {
	return {
		id,
		dimension,
		status: CATALOGUE_COUNT_STATUSES.FAILED,
		count: null,
		observed_at: truncateToUtcSecond(observedAt),
		error_code: code || error?.code || "request_failed",
		error: error?.message || String(error),
		attempts,
	};
}

async function readJsonResponse(response, label) {
	const contentType = response.headers?.get?.("content-type") || "";
	if (!contentType.toLowerCase().includes("application/json")) {
		throw Object.assign(new Error(`${label} response is not JSON.`), {
			code: "invalid_content_type",
		});
	}
	try {
		return await response.json();
	} catch (error) {
		throw Object.assign(new Error(`${label} response contains malformed JSON: ${error.message}`), {
			code: "malformed_json",
		});
	}
}

export function validateRepairAudit({
	audit,
	expectedDataset,
	expectedMonth,
	now = new Date(),
	maxAgeHours = 36,
}) {
	if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
		throw new TypeError("Repair audit must be an object.");
	}
	if (audit.schema_version !== CATALOGUE_SCHEMA_VERSION) {
		throw new TypeError(`Unsupported repair audit schema version: ${audit.schema_version}`);
	}
	if (audit.parser_semantic_version !== CATALOGUE_PARSER_SEMANTIC_VERSION) {
		throw new TypeError(
			`Unsupported repair audit parser semantic version: ${audit.parser_semantic_version}`,
		);
	}
	if (audit.dataset !== expectedDataset) {
		throw new TypeError(`Expected ${expectedDataset} audit, received ${audit.dataset}.`);
	}
	const exportMonth = audit.export_month ?? audit.export_target_month;
	if (exportMonth !== expectedMonth) {
		throw new TypeError(`Repair audit month ${exportMonth} does not match ${expectedMonth}.`);
	}
	const fingerprint = audit.export_fingerprint ?? audit.export_target_fingerprint;
	if (typeof fingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(fingerprint)) {
		throw new TypeError("Repair audit export fingerprint is invalid.");
	}
	return {
		...validateAuditFreshness({ auditedAt: audit.audited_at, now, maxAgeHours }),
		export_month: exportMonth,
		export_fingerprint: fingerprint,
	};
}

export async function repairMissingLegacyRows({
	ids,
	dimension,
	client,
	observedAt,
	detailsUrl,
	countUrl,
	normalizeRow,
	requestDelayMs = 0,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
	if (!Array.isArray(ids) || typeof normalizeRow !== "function") {
		throw new TypeError("Repair IDs and normalizeRow are required.");
	}
	const outcomes = [];
	let allocationStopped = false;
	for (const id of ids) {
		const attempts = [];
		let row = null;
		let result = null;
		let detailsStatus = null;
		try {
			const detailsRequest = await client.request(detailsUrl(id), { maxAttempts: 5 });
			attempts.push(...detailsRequest.attempts);
			detailsStatus = detailsRequest.response.status;
			if (detailsStatus === 404) {
				result = failedResult({
					id,
					dimension,
					observedAt,
					attempts,
					code: "details_404_unconfirmed",
					error: new Error(
						"Entity details returned HTTP 404 without corroborating evidence.",
					),
				});
			} else if (!detailsRequest.response.ok) {
				throw Object.assign(
					new Error(`Entity details failed with HTTP ${detailsStatus}.`),
					{ code: `details_http_${detailsStatus}` },
				);
			} else {
				const details = await readJsonResponse(detailsRequest.response, "Entity details");
				const countRequest = await client.request(countUrl(id), { maxAttempts: 5 });
				attempts.push(...countRequest.attempts);
				if (!countRequest.response.ok) {
					throw Object.assign(
						new Error(`Discover count failed with HTTP ${countRequest.response.status}.`),
						{ code: `count_http_${countRequest.response.status}` },
					);
				}
				const count = parseTmdbTotalResults(
					await readJsonResponse(countRequest.response, "Discover count"),
				);
				result = {
					id,
					dimension,
					status: statusForKnownCount(count),
					count,
					observed_at: truncateToUtcSecond(observedAt),
					attempts,
				};
				row = normalizeRow(details, count);
			}
		} catch (error) {
			if (error?.stopCollection) {
				allocationStopped = true;
				break;
			}
			result = failedResult({
				id,
				dimension,
				observedAt,
				error,
				attempts: [
					...attempts,
					...(Array.isArray(error.requestAttempts) ? error.requestAttempts : []),
				],
			});
		}
		outcomes.push({
			id,
			cache_restored: Boolean(row),
			row,
			count_source: row ? "discover" : null,
			details_status: detailsStatus,
			result,
		});
		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}
	return { outcomes, allocationStopped };
}

export function hasRepairPartialFailure({ repair, requestedMissingCount }) {
	if (
		!repair ||
		!Array.isArray(repair.outcomes) ||
		!Number.isSafeInteger(requestedMissingCount) ||
		requestedMissingCount < 0
	) {
		throw new TypeError("Repair result and requested missing count are required.");
	}
	return (
		Boolean(repair.allocationStopped) ||
		repair.outcomes.length !== requestedMissingCount ||
		repair.outcomes.some(
			(outcome) =>
				outcome.details_status !== 404 &&
				outcome.result?.status === CATALOGUE_COUNT_STATUSES.FAILED,
		)
	);
}

export function buildRepairMetadata({
	entityType,
	mode,
	month,
	audit,
	auditFreshness = null,
	maxRepairIds,
	missingIds,
	extraIds,
	startedAt,
	finishedAt,
	status,
	reason = null,
	bindingError = null,
	outcomes = [],
	removed = [],
	usage = null,
	requestPlan = null,
	totalCached = null,
	batch = null,
}) {
	const added = outcomes.filter((outcome) => outcome.cache_restored).map((outcome) => outcome.id);
	const notFound = outcomes
		.filter((outcome) => outcome.details_status === 404)
		.map((outcome) => outcome.id);
	const failed = outcomes
		.filter(
			(outcome) =>
				outcome.details_status !== 404 &&
				outcome.result?.status === CATALOGUE_COUNT_STATUSES.FAILED,
		)
		.map((outcome) => ({ id: outcome.id, error: outcome.result.error }));
	const requestedRepairCount = missingIds.length + extraIds.length;
	const addedSet = new Set(added);
	const removedSet = new Set(removed);
	const remainingMissingCount = batch?.pending_missing.filter((id) => !addedSet.has(id)).length;
	const remainingExtraCount = batch?.pending_extra.filter((id) => !removedSet.has(id)).length;
	const remainingCount = (remainingMissingCount ?? 0) + (remainingExtraCount ?? 0);
	return {
		operation: `${entityType}_cache_repair`,
		mode,
		status: status === "completed" && remainingCount > 0 ? "backlog_remaining" : status,
		reason,
		source_audit_date: audit?.audited_at || "",
		audit_freshness: auditFreshness,
		month,
		export_fingerprint:
			audit?.export_fingerprint ?? audit?.export_target_fingerprint ?? null,
		parser_semantic_version: audit?.parser_semantic_version ?? null,
		binding_error: bindingError,
		max_repair_ids: maxRepairIds,
		cap: {
			maximum: maxRepairIds,
			requested: requestedRepairCount,
			exceeded: maxRepairIds !== null && requestedRepairCount > maxRepairIds,
		},
		requested_repair_count: requestedRepairCount,
		missing_requested: missingIds,
		missing_requested_count: missingIds.length,
		extra_requested: extraIds,
		extra_requested_count: extraIds.length,
		processed_missing: outcomes.map((outcome) => outcome.id),
		processed_missing_count: outcomes.length,
		processed_repair_count: outcomes.length + removed.length,
		added,
		added_count: added.length,
		removed,
		removed_count: removed.length,
		not_found: notFound,
		not_found_count: notFound.length,
		failed,
		failed_count: failed.length,
		request_plan: requestPlan,
		requests: usage,
		total_cached: totalCached,
		...(batch ? {
			batch: {
				maximum: batch.maximum,
				pending_count: batch.pending_count,
				already_resolved_count: batch.already_resolved_count,
				selected_missing: batch.selected_missing,
				selected_extra: batch.selected_extra,
				selected_count: batch.selected_count,
				deferred_count: batch.deferred_count,
				last_selected_id: batch.last_selected_id,
				remaining_missing_count: remainingMissingCount,
				remaining_extra_count: remainingExtraCount,
				remaining_count: remainingCount,
			},
		} : {}),
		skipped: status === "skipped",
		started_at: startedAt,
		finished_at: finishedAt,
	};
}
