import {
	CATALOGUE_COUNT_STATUSES,
	CATALOGUE_PARSER_SEMANTIC_VERSION,
	CATALOGUE_SCHEMA_VERSION,
	parseTmdbTotalResults,
	statusForKnownCount,
	truncateToUtcSecond,
	validateAuditFreshness,
} from "./tmdb-catalogue-counts.mjs";

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
	return {
		operation: `${entityType}_cache_repair`,
		mode,
		status,
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
		skipped: status === "skipped",
		started_at: startedAt,
		finished_at: finishedAt,
	};
}
