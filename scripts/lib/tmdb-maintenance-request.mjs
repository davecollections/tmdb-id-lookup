import fs from "node:fs/promises";
import path from "node:path";
import {
	canonicalJson,
	sha256Json,
	utcDate,
	validateReservationReceipt,
} from "./tmdb-request-budget.mjs";

const ALLOWED_TMDB_HOSTS = new Set(["api.themoviedb.org", "files.tmdb.org"]);
export const MAX_RETRY_AFTER_SECONDS = 60;

function stopCollectionError(message, code) {
	return Object.assign(new Error(message), {
		code,
		stopCollection: true,
	});
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryDelayMs(response, attempt) {
	if (response?.status === 429) {
		const raw = response.headers.get("retry-after");
		const parsed = Number(raw);
		const seconds =
			raw !== null && Number.isFinite(parsed) && parsed >= 0
				? Math.min(parsed, MAX_RETRY_AFTER_SECONDS)
				: 5;
		return seconds * 1_000;
	}

	return Math.min(attempt * 2_000, MAX_RETRY_AFTER_SECONDS * 1_000);
}

function expectedReservationIdentity(options) {
	const approvedRaw =
		options.approvedAllowance ?? process.env.TMDB_APPROVED_ALLOWANCE;
	const identity = {
		workflow: options.expectedWorkflow ?? process.env.GITHUB_WORKFLOW,
		runId: String(options.expectedRunId ?? process.env.GITHUB_RUN_ID ?? ""),
		runAttempt: String(
			options.expectedRunAttempt ?? process.env.GITHUB_RUN_ATTEMPT ?? "",
		),
		plannedMonth: options.plannedMonth ?? process.env.COUNT_MONTH,
		plannedUtcDate:
			options.plannedUtcDate ?? process.env.TMDB_RESERVATION_UTC_DATE,
		requestClass: options.requestClass ?? process.env.TMDB_REQUEST_CLASS,
		targetDimension:
			options.targetDimension ?? process.env.TMDB_TARGET_DIMENSION,
		approvedAllowance:
			approvedRaw === undefined || approvedRaw === "" ? NaN : Number(approvedRaw),
	};

	for (const [key, value] of Object.entries(identity)) {
		if (key === "approvedAllowance") continue;
		if (!value) throw new Error(`Expected reservation ${key} is required.`);
	}
	if (!Number.isSafeInteger(identity.approvedAllowance) || identity.approvedAllowance < 0) {
		throw new Error("Expected reservation approvedAllowance is required.");
	}
	return identity;
}

export async function loadReservation({
	receiptPath,
	expectedId,
	expectedSha256,
	allocationKey,
	expectedIdentity,
	now = new Date(),
}) {
	if (!receiptPath) {
		throw new Error("TMDB_RESERVATION_PATH is required before network access.");
	}

	const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
	validateReservationReceipt(receipt);

	if (expectedId && receipt.reservation_id !== expectedId) {
		throw new Error("Reservation ID does not match committed receipt.");
	}

	const actualSha256 = sha256Json(receipt);
	if (expectedSha256 && actualSha256 !== expectedSha256) {
		throw new Error("Reservation receipt SHA-256 does not match.");
	}

	if (receipt.utc_date !== utcDate(now)) {
		throw new Error(
			`Reservation is for ${receipt.utc_date}; current UTC date is ${utcDate(now)}.`,
		);
	}

	if (expectedIdentity) {
		const binding = receipt.bindings[allocationKey];
		const comparisons = [
			["workflow", receipt.workflow, expectedIdentity.workflow],
			["run ID", receipt.run_id, expectedIdentity.runId],
			["run attempt", receipt.run_attempt, expectedIdentity.runAttempt],
			["planned month", receipt.planned_month, expectedIdentity.plannedMonth],
			["planned UTC date", receipt.planned_utc_date, expectedIdentity.plannedUtcDate],
			["request class", binding?.request_class, expectedIdentity.requestClass],
			["target dimension", binding?.target_dimension, expectedIdentity.targetDimension],
			["approved allowance", binding?.approved_allowance, expectedIdentity.approvedAllowance],
		];
		for (const [label, actual, expected] of comparisons) {
			if (actual !== expected) {
				throw new Error(
					`Reservation ${label} binding mismatch: expected ${expected}, received ${actual}.`,
				);
			}
		}
	}

	return {
		receipt,
		sha256: actualSha256,
		path: receiptPath,
	};
}

async function fetchBufferedResponse({ fetchImpl, url, fetchOptions, timeoutMs }) {
	const controller = new AbortController();
	const externalSignal = fetchOptions.signal;
	let response;
	let timeoutTriggered = false;
	let rejectAbort;
	const abortPromise = new Promise((_, reject) => {
		rejectAbort = reject;
	});
	const abort = (reason) => {
		controller.abort(reason);
		void response?.body?.cancel(reason).catch(() => {});
		rejectAbort(reason);
	};
	const onExternalAbort = () =>
		abort(externalSignal.reason || Object.assign(new Error("Request aborted."), { name: "AbortError" }));
	if (externalSignal?.aborted) onExternalAbort();
	else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
	const timeout = setTimeout(() => {
		timeoutTriggered = true;
		abort(Object.assign(new Error(`TMDB request timed out after ${timeoutMs}ms.`), { name: "AbortError" }));
	}, timeoutMs);

	const operation = (async () => {
		response = await fetchImpl(url, { ...fetchOptions, signal: controller.signal });
		const body = await response.arrayBuffer();
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	})();
	operation.catch(() => {});

	try {
		return await Promise.race([operation, abortPromise]);
	} catch (error) {
		if (timeoutTriggered && error?.name !== "AbortError") {
			throw Object.assign(new Error(`TMDB request timed out after ${timeoutMs}ms.`), {
				name: "AbortError",
			});
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener("abort", onExternalAbort);
	}
}

export async function createTmdbRequestClient({
	token,
	receiptPath,
	reservationId,
	reservationSha256,
	allocationKey,
	usagePath,
	job,
	fetchImpl = globalThis.fetch,
	now = () => new Date(),
	sleepImpl = sleep,
	timeoutMs = 30_000,
	maxAttempts = 5,
	logger = console,
	...bindingOptions
}) {
	if (typeof fetchImpl !== "function") {
		throw new TypeError("fetch implementation is required.");
	}

	const identity = expectedReservationIdentity(bindingOptions);
	const loaded = await loadReservation({
		receiptPath,
		expectedId: reservationId,
		expectedSha256: reservationSha256,
		allocationKey,
		expectedIdentity: identity,
		now: now(),
	});
	const allowance = loaded.receipt.allocations[allocationKey];

	if (!Number.isSafeInteger(allowance) || allowance < 0) {
		throw new Error(`Reservation does not contain allocation ${allocationKey}.`);
	}

	const attempts = [];

	function assertMayRequest(url, signal) {
		const parsed = new URL(url);
		if (!ALLOWED_TMDB_HOSTS.has(parsed.hostname)) {
			throw new Error(`Unapproved TMDB request host: ${parsed.hostname}`);
		}
		if (signal?.aborted) {
			throw stopCollectionError("TMDB collection was aborted.", "collection_aborted");
		}
		const currentDate = utcDate(now());
		if (currentDate !== loaded.receipt.utc_date) {
			throw stopCollectionError(
				`UTC date changed to ${currentDate}; reservation is for ${loaded.receipt.utc_date}.`,
				"reservation_utc_date_changed",
			);
		}
		if (attempts.length >= allowance) {
			throw stopCollectionError(
				`TMDB request allocation ${allocationKey} is exhausted.`,
				"reservation_allocation_exhausted",
			);
		}
		return parsed;
	}

	async function waitForRetry(response, attempt, attemptLimit, signal) {
		if (attempt >= attemptLimit) return false;
		assertMayRequest(response?.url || "https://api.themoviedb.org/", signal);
		const waitMs = retryDelayMs(response, attempt);
		logger.log(`TMDB retry wait ${waitMs}ms before attempt ${attempt + 1}/${attemptLimit}.`);
		await sleepImpl(waitMs);
		assertMayRequest(response?.url || "https://api.themoviedb.org/", signal);
		return true;
	}

	async function request(url, options = {}) {
		const requestAttempts = [];
		const attemptLimit = options.maxAttempts ?? maxAttempts;
		if (!Number.isInteger(attemptLimit) || attemptLimit < 1) {
			throw new TypeError("maxAttempts must be a positive integer.");
		}

		for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
			const parsed = assertMayRequest(url, options.signal);
			const at = now().toISOString();
			let response;
			try {
				response = await fetchBufferedResponse({
					fetchImpl,
					url,
					timeoutMs: options.timeoutMs ?? timeoutMs,
					fetchOptions: {
						...options,
						maxAttempts: undefined,
						timeoutMs: undefined,
						auth: undefined,
						accept: undefined,
						headers: {
							accept: options.accept || "application/json",
							...(options.auth === false || !token
								? {}
								: { Authorization: `Bearer ${token}` }),
							...(options.headers || {}),
						},
					},
				});

				const event = {
					at,
					host: parsed.hostname,
					path: parsed.pathname,
					attempt,
					status: response.status,
					outcome: "response",
				};
				attempts.push(event);
				requestAttempts.push(event);

				if ([401, 403].includes(response.status)) {
					throw Object.assign(new Error(`TMDB auth/permission error HTTP ${response.status}.`), {
						code: "tmdb_auth_or_permission_error",
						terminal: true,
						stopCollection: true,
					});
				}

				if (response.status === 429 || response.status >= 500) {
					if (await waitForRetry(response, attempt, attemptLimit, options.signal)) continue;
				}

				return { response, attempts: requestAttempts };
			} catch (error) {
				if (error?.terminal || error?.stopCollection) {
					error.requestAttempts ||= requestAttempts;
					throw error;
				}
				if (!response) {
					const event = {
						at,
						host: parsed.hostname,
						path: parsed.pathname,
						attempt,
						status: null,
						outcome: error?.name === "AbortError" ? "timeout" : "network_error",
					};
					attempts.push(event);
					requestAttempts.push(event);
				}
				if (attempt >= attemptLimit) {
					throw Object.assign(
						new Error(`TMDB request failed after ${attempt} attempt(s): ${error.message}`),
						{ requestAttempts },
					);
				}
				if (await waitForRetry(null, attempt, attemptLimit, options.signal)) continue;
			}
		}

		throw new Error("Unreachable TMDB request state.");
	}

	async function requestJson(url, options = {}) {
		const result = await request(url, options);
		const contentType = result.response.headers.get("content-type") || "";
		if (!contentType.toLowerCase().includes("application/json")) {
			throw Object.assign(new Error(`TMDB response is not JSON: ${contentType || "missing"}`), {
				requestAttempts: result.attempts,
			});
		}
		let data;
		try {
			data = await result.response.json();
		} catch (error) {
			throw Object.assign(new Error(`TMDB response contains malformed JSON: ${error.message}`), {
				requestAttempts: result.attempts,
			});
		}
		return { ...result, data };
	}

	function usageSummary() {
		const statusCounts = new Map();
		for (const attempt of attempts) {
			const key = attempt.status === null ? attempt.outcome : String(attempt.status);
			statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
		}
		return {
			schema_version: 2,
			reservation_id: loaded.receipt.reservation_id,
			reservation_sha256: loaded.sha256,
			utc_date: loaded.receipt.utc_date,
			planned_month: loaded.receipt.planned_month,
			workflow: loaded.receipt.workflow,
			run_id: loaded.receipt.run_id,
			run_attempt: loaded.receipt.run_attempt,
			job,
			allocation_key: allocationKey,
			request_class: identity.requestClass,
			target_dimension: identity.targetDimension,
			allowance,
			attempts_used: attempts.length,
			unused_allowance: allowance - attempts.length,
			first_attempt_at: attempts[0]?.at || null,
			last_attempt_at: attempts.at(-1)?.at || null,
			by_host: Object.fromEntries(
				[...ALLOWED_TMDB_HOSTS].map((host) => [
					host,
					attempts.filter((attempt) => attempt.host === host).length,
				]),
			),
			by_status_or_outcome: Object.fromEntries([...statusCounts].sort()),
			retries: attempts.filter((attempt) => attempt.attempt > 1).length,
		};
	}

	async function writeUsage(extra = {}) {
		if (!usagePath) return null;
		const usage = { ...usageSummary(), ...extra };
		await fs.mkdir(path.dirname(usagePath), { recursive: true });
		await fs.writeFile(usagePath, `${JSON.stringify(usage, null, 2)}\n`, { flag: "wx" });
		return usage;
	}

	return {
		receipt: loaded.receipt,
		request,
		requestJson,
		usageSummary,
		writeUsage,
		serializeUsage: () => canonicalJson(usageSummary()),
	};
}
