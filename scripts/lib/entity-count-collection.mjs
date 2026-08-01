import {
	COUNT_STATUSES,
	parseTmdbTotalResults,
	shouldConfirmUnavailable,
	statusForKnownCount,
	truncateToUtcSecond,
	UNAVAILABLE_REASONS,
} from "./entity-title-counts.mjs";

function errorResult({ id, dimension, observedAt, error, attempts = [] }) {
	return {
		id,
		dimension,
		status: COUNT_STATUSES.FAILED,
		count: null,
		observed_at: truncateToUtcSecond(observedAt),
		error_code: error.code || "request_failed",
		error: error.message,
		attempts,
	};
}

async function readJsonResponse(response, label) {
	const contentType = response.headers.get("content-type") || "";
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

export async function collectEntityCount({
	id,
	dimension,
	client,
	observedAt,
	detailsUrl = null,
	countUrl,
	priorResult = null,
	inheritedUnavailable = null,
	maxAttempts = 1,
	onDetails = async () => {},
}) {
	const currentObservedAt = truncateToUtcSecond(observedAt);
	const allAttempts =
		priorResult?.observed_at === currentObservedAt &&
		Array.isArray(priorResult.attempts)
			? [...priorResult.attempts]
			: [];

	if (inheritedUnavailable) {
		return {
			id,
			dimension,
			status: COUNT_STATUSES.UNAVAILABLE,
			count: null,
			observed_at: truncateToUtcSecond(observedAt),
			unavailable_reason: inheritedUnavailable.unavailable_reason,
			evidence: inheritedUnavailable.evidence || [],
			attempts: [],
		};
	}

	try {
		if (detailsUrl) {
			const detailsRequest = await client.request(detailsUrl(id), { maxAttempts });
			allAttempts.push(...detailsRequest.attempts);

			if (detailsRequest.response.status === 404) {
				if (
					shouldConfirmUnavailable({
						priorResult,
						currentObservedAt: observedAt,
					})
				) {
					return {
						id,
						dimension,
						status: COUNT_STATUSES.UNAVAILABLE,
						count: null,
						observed_at: truncateToUtcSecond(observedAt),
						unavailable_reason: UNAVAILABLE_REASONS.ENTITY_NOT_FOUND_CONFIRMED,
						evidence: [
							{
								kind: "details_404",
								observed_at: priorResult.observed_at,
							},
							{
								kind: "details_404",
								observed_at: truncateToUtcSecond(observedAt),
							},
						],
						attempts: allAttempts,
					};
				}

				return {
					id,
					dimension,
					status: COUNT_STATUSES.FAILED,
					count: null,
					observed_at: truncateToUtcSecond(observedAt),
					error_code: "details_404_unconfirmed",
					error: "Entity details returned HTTP 404 without corroborating evidence.",
					attempts: allAttempts,
					evidence: [
						{
							kind: "details_404",
							observed_at: truncateToUtcSecond(observedAt),
						},
					],
				};
			}

			if (!detailsRequest.response.ok) {
				throw Object.assign(
					new Error(`Entity details failed with HTTP ${detailsRequest.response.status}.`),
					{ code: `details_http_${detailsRequest.response.status}` },
				);
			}

			const details = await readJsonResponse(detailsRequest.response, "Entity details");
			await onDetails(details);
		}

		const countRequest = await client.request(countUrl(id), { maxAttempts });
		allAttempts.push(...countRequest.attempts);

		if (!countRequest.response.ok) {
			throw Object.assign(
				new Error(`Discover count failed with HTTP ${countRequest.response.status}.`),
				{ code: `count_http_${countRequest.response.status}` },
			);
		}

		const payload = await readJsonResponse(countRequest.response, "Discover count");
		const count = parseTmdbTotalResults(payload);

		return {
			id,
			dimension,
			status: statusForKnownCount(count),
			count,
			observed_at: truncateToUtcSecond(observedAt),
			attempts: allAttempts,
		};
	} catch (error) {
		if (error?.stopCollection) {
			throw error;
		}

		return errorResult({
			id,
			dimension,
			observedAt,
			error,
			attempts: [
				...allAttempts,
				...(Array.isArray(error.requestAttempts) ? error.requestAttempts : []),
			],
		});
	}
}

export async function collectWithDeferredRetries({
	currentIds,
	olderUnresolvedIds = [],
	dimension,
	client,
	observedAt,
	priorResults,
	detailsUrl,
	countUrl,
	inheritedUnavailableById = new Map(),
	onDetails,
	onTerminal = async () => {},
	requestDelayMs = 0,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
	const results = new Map();
	const currentFailures = [];
	let allocationStopped = false;

	for (const id of currentIds) {
		const existing = priorResults.get(id);
		if (existing && existing.status !== COUNT_STATUSES.FAILED) {
			continue;
		}

		let result;
		try {
			result = await collectEntityCount({
				id,
				dimension,
				client,
				observedAt,
				detailsUrl,
				countUrl,
				priorResult: existing,
				inheritedUnavailable: inheritedUnavailableById.get(id),
				maxAttempts: 1,
				onDetails: async (details) => onDetails(id, details),
			});
		} catch (error) {
			if (!error?.stopCollection) throw error;
			allocationStopped = true;
			break;
		}
		results.set(id, result);

		if (result.status === COUNT_STATUSES.FAILED) {
			currentFailures.push(id);
		} else {
			await onTerminal(id, result);
		}

		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}

	const currentIdSet = new Set(currentIds);
	const retryIds = [
		...olderUnresolvedIds.filter((id) => !currentIdSet.has(id)),
		...currentFailures,
	];

	for (const id of allocationStopped ? [] : retryIds) {
		const existing = results.get(id) || priorResults.get(id);
		let result;
		try {
			result = await collectEntityCount({
				id,
				dimension,
				client,
				observedAt,
				detailsUrl,
				countUrl,
				priorResult: existing,
				inheritedUnavailable: inheritedUnavailableById.get(id),
				maxAttempts: 4,
				onDetails: async (details) => onDetails(id, details),
			});
		} catch (error) {
			if (!error?.stopCollection) throw error;
			break;
		}
		results.set(id, result);

		if (result.status !== COUNT_STATUSES.FAILED) {
			await onTerminal(id, result);
		}

		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}

	return [...results.values()].sort((left, right) => left.id - right.id);
}
