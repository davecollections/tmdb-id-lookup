import {
	CATALOGUE_COUNT_STATUSES,
	parseTmdbTotalResults,
	statusForKnownCount,
	truncateToUtcSecond,
} from "./tmdb-catalogue-counts.mjs";

function failedResult({ id, dimension, observedAt, error, attempts = [] }) {
	return {
		id,
		dimension,
		status: CATALOGUE_COUNT_STATUSES.FAILED,
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

export async function collectCatalogueCount({
	id,
	dimension,
	client,
	observedAt,
	detailsUrl,
	countUrl,
	maxAttempts = 1,
	onDetails = async () => {},
}) {
	const attempts = [];
	try {
		const detailsRequest = await client.request(detailsUrl(id), { maxAttempts });
		attempts.push(...detailsRequest.attempts);
		if (!detailsRequest.response.ok) {
			throw Object.assign(
				new Error(`Entity details failed with HTTP ${detailsRequest.response.status}.`),
				{ code: `details_http_${detailsRequest.response.status}` },
			);
		}
		const details = await readJsonResponse(detailsRequest.response, "Entity details");
		await onDetails(details);

		const countRequest = await client.request(countUrl(id), { maxAttempts });
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
		return {
			id,
			dimension,
			status: statusForKnownCount(count),
			count,
			observed_at: truncateToUtcSecond(observedAt),
			attempts,
		};
	} catch (error) {
		if (error?.stopCollection) throw error;
		return failedResult({
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
}

export async function collectCatalogueSlice({
	ids,
	dimension,
	client,
	observedAt,
	detailsUrl,
	countUrl,
	onDetails,
	onTerminal = async () => {},
	requestDelayMs = 0,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
	const results = new Map();
	const failures = [];
	let allocationStopped = false;

	for (const id of ids) {
		try {
			const result = await collectCatalogueCount({
				id,
				dimension,
				client,
				observedAt,
				detailsUrl,
				countUrl,
				maxAttempts: 1,
				onDetails: async (details) => onDetails(id, details),
			});
			results.set(id, result);
			if (result.status === CATALOGUE_COUNT_STATUSES.FAILED) failures.push(id);
			else await onTerminal(id, result);
		} catch (error) {
			if (!error?.stopCollection) throw error;
			allocationStopped = true;
			break;
		}
		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}

	for (const id of allocationStopped ? [] : failures) {
		try {
			const result = await collectCatalogueCount({
				id,
				dimension,
				client,
				observedAt,
				detailsUrl,
				countUrl,
				maxAttempts: 4,
				onDetails: async (details) => onDetails(id, details),
			});
			results.set(id, result);
			if (result.status !== CATALOGUE_COUNT_STATUSES.FAILED) {
				await onTerminal(id, result);
			}
		} catch (error) {
			if (!error?.stopCollection) throw error;
			break;
		}
		if (requestDelayMs > 0) await sleep(requestDelayMs);
	}

	return [...results.values()].sort((left, right) => left.id - right.id);
}
