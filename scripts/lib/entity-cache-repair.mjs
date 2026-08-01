import {
	COUNT_STATUSES,
	UNAVAILABLE_REASONS,
	parseTmdbTotalResults,
	shouldConfirmUnavailable,
	statusForKnownCount,
	truncateToUtcSecond,
} from "./entity-title-counts.mjs";

function failedResult({ id, dimension, observedAt, error, attempts = [], code }) {
	return {
		id,
		dimension,
		status: COUNT_STATUSES.FAILED,
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

function unavailableAfter404({ id, dimension, observedAt, priorResult, attempts }) {
	const currentObservedAt = truncateToUtcSecond(observedAt);
	if (priorResult?.status === COUNT_STATUSES.UNAVAILABLE) {
		const evidence = [
			...(priorResult.evidence || []),
			{ kind: "details_404", observed_at: currentObservedAt },
		].filter(
			(entry, index, entries) =>
				entries.findIndex(
					(candidate) =>
						candidate.kind === entry.kind && candidate.observed_at === entry.observed_at,
				) === index,
		);
		return {
			id,
			dimension,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: currentObservedAt,
			unavailable_reason: priorResult.unavailable_reason,
			evidence,
			attempts,
		};
	}
	if (shouldConfirmUnavailable({ priorResult, currentObservedAt })) {
		return {
			id,
			dimension,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: currentObservedAt,
			unavailable_reason: UNAVAILABLE_REASONS.ENTITY_NOT_FOUND_CONFIRMED,
			evidence: [
				{ kind: "details_404", observed_at: priorResult.observed_at },
				{ kind: "details_404", observed_at: currentObservedAt },
			],
			attempts,
		};
	}
	return {
		...failedResult({
			id,
			dimension,
			observedAt,
			attempts,
			code: "details_404_unconfirmed",
			error: new Error("Entity details returned HTTP 404 without corroborating evidence."),
		}),
		evidence: [{ kind: "details_404", observed_at: currentObservedAt }],
	};
}

export async function repairMissingLegacyRows({
	ids,
	dimension,
	client,
	observedAt,
	priorResults = new Map(),
	targetIds = null,
	detailsUrl,
	countUrl,
	normalizeRow,
	requestDelayMs = 0,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
	if (!Array.isArray(ids) || typeof normalizeRow !== "function") {
		throw new TypeError("Repair IDs and normalizeRow are required.");
	}
	const targetSet = targetIds ? new Set(targetIds) : null;
	const outcomes = [];
	let allocationStopped = false;

	for (const id of ids) {
		const priorResult = priorResults.get(id) || null;
		const attempts = [];
		let details;
		let progressResult = null;
		let row = null;
		let countSource = null;
		let detailsStatus = null;
		try {
			const detailsRequest = await client.request(detailsUrl(id), { maxAttempts: 5 });
			attempts.push(...detailsRequest.attempts);
			detailsStatus = detailsRequest.response.status;
			if (detailsStatus === 404) {
				progressResult = unavailableAfter404({
					id,
					dimension,
					observedAt,
					priorResult,
					attempts,
				});
			} else {
				if (!detailsRequest.response.ok) {
					throw Object.assign(
						new Error(`Entity details failed with HTTP ${detailsStatus}.`),
						{ code: `details_http_${detailsStatus}` },
					);
				}
				details = await readJsonResponse(detailsRequest.response, "Entity details");
				if ([COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(priorResult?.status)) {
					row = normalizeRow(details, priorResult.count);
					countSource = "typed_progress";
				} else {
					const countRequest = await client.request(countUrl(id), { maxAttempts: 5 });
					attempts.push(...countRequest.attempts);
					if (!countRequest.response.ok) {
						throw Object.assign(
							new Error(`Discover count failed with HTTP ${countRequest.response.status}.`),
							{ code: `count_http_${countRequest.response.status}` },
						);
					}
					const payload = await readJsonResponse(countRequest.response, "Discover count");
					const count = parseTmdbTotalResults(payload);
					progressResult = {
						id,
						dimension,
						status: statusForKnownCount(count),
						count,
						observed_at: truncateToUtcSecond(observedAt),
						attempts,
					};
					row = normalizeRow(details, count);
					countSource = "discover";
				}
			}
		} catch (error) {
			if (error?.stopCollection) {
				allocationStopped = true;
				break;
			}
			progressResult = failedResult({
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
			count_source: countSource,
			typed_count_reused: countSource === "typed_progress",
			details_status: detailsStatus,
			progress_result:
				progressResult && (!targetSet || targetSet.has(id)) ? progressResult : null,
		});
		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}

	return { outcomes, allocationStopped };
}

export function buildRepairMetadata({
	entityType,
	mode,
	month,
	audit,
	auditFreshness = null,
	target = null,
	typedCountsActive,
	maxRepairIds,
	missingIds,
	extraIds,
	outsideTargetMissingIds = [],
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
				outcome.progress_result?.status === COUNT_STATUSES.FAILED &&
				outcome.progress_result.error_code !== "details_404_unconfirmed",
		)
		.map((outcome) => ({ id: outcome.id, error: outcome.progress_result.error }));
	const unavailable = outcomes
		.filter((outcome) => outcome.progress_result?.status === COUNT_STATUSES.UNAVAILABLE)
		.map((outcome) => outcome.id);
	const typedProgressWritten = outcomes
		.filter((outcome) => outcome.progress_result)
		.map((outcome) => outcome.id);
	const typedCountReused = outcomes
		.filter((outcome) => outcome.typed_count_reused)
		.map((outcome) => outcome.id);
	const requestedRepairCount = missingIds.length + extraIds.length;
	return {
		operation: `${entityType}_cache_repair`,
		mode,
		status,
		reason,
		source_audit_date: audit?.audited_at || "",
		audit_freshness: auditFreshness,
		month,
		typed_counts_active: Boolean(typedCountsActive),
		target_fingerprint: target?.target_fingerprint || null,
		parser_semantic_version: target?.parser_semantic_version || null,
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
		missing_outside_frozen_target: outsideTargetMissingIds,
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
		unavailable,
		unavailable_count: unavailable.length,
		typed_count_reused: typedCountReused,
		typed_progress_written: typedProgressWritten,
		request_plan: requestPlan,
		requests: usage,
		total_cached: totalCached,
		skipped: status === "skipped",
		started_at: startedAt,
		finished_at: finishedAt,
	};
}
