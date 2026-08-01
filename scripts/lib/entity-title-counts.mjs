import crypto from "node:crypto";

export const COUNT_SCHEMA_VERSION = 1;
export const COUNT_PARSER_SEMANTIC_VERSION = "1.0.0";
export const TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH = "2026-09";
export const MAX_SAMPLE_IDS = 100;

export const COUNT_DIMENSIONS = Object.freeze({
	COMPANY_MOVIE: "company-movie",
	COMPANY_SERIES: "company-series",
	NETWORK_SERIES: "network-series",
});

export const COUNT_STATUSES = Object.freeze({
	POSITIVE: "positive",
	ZERO: "zero",
	FAILED: "failed",
	UNAVAILABLE: "unavailable",
});

export const TERMINAL_COUNT_STATUSES = new Set([
	COUNT_STATUSES.POSITIVE,
	COUNT_STATUSES.ZERO,
	COUNT_STATUSES.UNAVAILABLE,
]);

export const UNAVAILABLE_REASONS = Object.freeze({
	ENTITY_NOT_FOUND_CONFIRMED: "entity_not_found_confirmed",
	ENTITY_REMOVED_AND_NOT_FOUND: "entity_removed_and_not_found",
});

export function assertPositiveSafeInteger(value, label = "value") {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new TypeError(`${label} must be a positive safe integer.`);
	}

	return value;
}

export function validateUtcMonth(value, label = "month") {
	if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
		throw new TypeError(`${label} must use a valid YYYY-MM value.`);
	}

	return value;
}

export function compareUtcMonths(left, right) {
	return validateUtcMonth(left, "left month").localeCompare(
		validateUtcMonth(right, "right month"),
	);
}

export function parseStrictSampleIds(raw, { maximum = MAX_SAMPLE_IDS } = {}) {
	if (typeof raw !== "string" || !raw.trim()) {
		throw new TypeError("sample_ids must contain at least one ID.");
	}
	if (!Number.isSafeInteger(maximum) || maximum <= 0) {
		throw new TypeError("sample ID maximum must be a positive safe integer.");
	}

	const tokens = raw.split(",");
	if (tokens.length > maximum) {
		throw new RangeError(`sample_ids may contain at most ${maximum} IDs.`);
	}

	const ids = tokens.map((token, index) => {
		const trimmed = token.trim();
		if (!/^[1-9]\d*$/.test(trimmed)) {
			throw new TypeError(
				`Invalid sample token ${index + 1} (${JSON.stringify(token)}); expected a positive safe integer.`,
			);
		}
		const id = Number(trimmed);
		return assertPositiveSafeInteger(id, `sample token ${index + 1}`);
	});

	if (new Set(ids).size !== ids.length) {
		throw new TypeError("sample_ids must not contain duplicate IDs.");
	}

	return ids;
}

export function parseTmdbTotalResults(payload) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new TypeError("TMDB count response must be a JSON object.");
	}

	const value = payload.total_results;

	if (!Number.isSafeInteger(value) || value < 0) {
		throw new TypeError("TMDB total_results must be a nonnegative safe integer.");
	}

	return value;
}

export function statusForKnownCount(count) {
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new TypeError("Known count must be a nonnegative safe integer.");
	}

	return count === 0 ? COUNT_STATUSES.ZERO : COUNT_STATUSES.POSITIVE;
}

export function canonicalizeTargetIds(ids) {
	if (!Array.isArray(ids)) {
		throw new TypeError("Target IDs must be an array.");
	}

	const normalized = ids.map((id, index) =>
		assertPositiveSafeInteger(id, `target ID at index ${index}`),
	);
	const unique = [...new Set(normalized)].sort((left, right) => left - right);

	if (unique.length !== normalized.length) {
		throw new TypeError("Target IDs must be unique.");
	}

	return unique;
}

export function fingerprintTargetIds(ids) {
	const canonicalIds = canonicalizeTargetIds(ids);
	return `sha256:${crypto
		.createHash("sha256")
		.update(canonicalIds.join("\n"))
		.digest("hex")}`;
}

export function buildTargetSnapshot({
	entityType,
	month,
	exportDate,
	ids,
	createdAt,
}) {
	if (!["company", "network"].includes(entityType)) {
		throw new TypeError("entityType must be company or network.");
	}

	validateUtcMonth(month);

	const canonicalIds = canonicalizeTargetIds(ids);

	return {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		entity_type: entityType,
		month,
		export_date: exportDate || null,
		target_fingerprint: fingerprintTargetIds(canonicalIds),
		total_ids: canonicalIds.length,
		created_at: createdAt,
		ids: canonicalIds,
	};
}

export function validateTargetSnapshot(snapshot, expected = {}) {
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
		throw new TypeError("Target snapshot must be an object.");
	}

	if (snapshot.schema_version !== COUNT_SCHEMA_VERSION) {
		throw new TypeError(`Unsupported target schema version: ${snapshot.schema_version}`);
	}

	if (snapshot.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION) {
		throw new TypeError(
			`Unsupported target parser semantic version: ${snapshot.parser_semantic_version}`,
		);
	}

	validateUtcMonth(snapshot.month, "target month");

	if (expected.entityType && snapshot.entity_type !== expected.entityType) {
		throw new TypeError(
			`Expected ${expected.entityType} target, received ${snapshot.entity_type}.`,
		);
	}

	if (expected.month && snapshot.month !== expected.month) {
		throw new TypeError(`Expected target month ${expected.month}, received ${snapshot.month}.`);
	}

	const ids = canonicalizeTargetIds(snapshot.ids);
	const fingerprint = fingerprintTargetIds(ids);

	if (snapshot.total_ids !== ids.length) {
		throw new TypeError("Target total_ids does not match IDs.");
	}

	if (snapshot.target_fingerprint !== fingerprint) {
		throw new TypeError("Target fingerprint does not match canonical IDs.");
	}

	return snapshot;
}

export function partitionTargetIds(ids, sliceIndex, totalSlices) {
	const canonicalIds = canonicalizeTargetIds(ids);

	if (!Number.isInteger(sliceIndex) || sliceIndex < 0) {
		throw new TypeError("sliceIndex must be a nonnegative integer.");
	}

	if (!Number.isInteger(totalSlices) || totalSlices <= 0) {
		throw new TypeError("totalSlices must be a positive integer.");
	}

	if (sliceIndex >= totalSlices) {
		throw new RangeError("sliceIndex must be less than totalSlices.");
	}

	const start = Math.floor((canonicalIds.length * sliceIndex) / totalSlices);
	const end = Math.floor((canonicalIds.length * (sliceIndex + 1)) / totalSlices);

	return {
		sliceIndex,
		totalSlices,
		start,
		end,
		ids: canonicalIds.slice(start, end),
	};
}

export function utcMonth(date = new Date()) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		throw new TypeError("date must be valid.");
	}

	return date.toISOString().slice(0, 7);
}

export function truncateToUtcSecond(value) {
	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new TypeError("Timestamp must be valid.");
	}

	date.setUTCMilliseconds(0);
	return date.toISOString().replace(".000Z", "Z");
}

export function validateAuditFreshness({
	auditedAt,
	now = new Date(),
	maxAgeHours = 36,
	futureToleranceMinutes = 10,
}) {
	const audited = new Date(auditedAt);
	const current = now instanceof Date ? now : new Date(now);

	if (
		Number.isNaN(audited.getTime()) ||
		Number.isNaN(current.getTime()) ||
		!Number.isFinite(maxAgeHours) ||
		maxAgeHours <= 0
	) {
		throw new TypeError("Audit freshness inputs must be valid.");
	}

	const ageMs = current.getTime() - audited.getTime();
	const maxAgeMs = maxAgeHours * 60 * 60 * 1_000;
	const futureToleranceMs = futureToleranceMinutes * 60 * 1_000;

	if (ageMs < -futureToleranceMs) {
		throw new Error("Audit timestamp is unexpectedly in the future.");
	}
	if (ageMs > maxAgeMs) {
		throw new Error(
			`Audit is ${Math.floor(ageMs / 3_600_000)} hours old; maximum is ${maxAgeHours} hours.`,
		);
	}

	return {
		audited_at: audited.toISOString(),
		age_hours: ageMs / 3_600_000,
		max_age_hours: maxAgeHours,
	};
}

export function isDifferentUtcDate(left, right) {
	return new Date(left).toISOString().slice(0, 10) !== new Date(right).toISOString().slice(0, 10);
}

export function validateCountResult(result, expected = {}) {
	if (!result || typeof result !== "object" || Array.isArray(result)) {
		throw new TypeError("Count result must be an object.");
	}

	assertPositiveSafeInteger(result.id, "result ID");

	if (expected.dimension && result.dimension !== expected.dimension) {
		throw new TypeError(`Unexpected result dimension: ${result.dimension}`);
	}

	if (!Object.values(COUNT_DIMENSIONS).includes(result.dimension)) {
		throw new TypeError(`Unknown count dimension: ${result.dimension}`);
	}

	if (!Object.values(COUNT_STATUSES).includes(result.status)) {
		throw new TypeError(`Unknown count status: ${result.status}`);
	}

	if ([COUNT_STATUSES.POSITIVE, COUNT_STATUSES.ZERO].includes(result.status)) {
		const expectedStatus = statusForKnownCount(result.count);
		if (expectedStatus !== result.status) {
			throw new TypeError("Known count and status disagree.");
		}
	} else if (Object.hasOwn(result, "count") && result.count !== null) {
		throw new TypeError("Failed and unavailable results cannot carry a count.");
	}

	if (result.status === COUNT_STATUSES.FAILED) {
		if (
			typeof result.error_code !== "string" ||
			!result.error_code ||
			typeof result.error !== "string" ||
			!result.error
		) {
			throw new TypeError("Failed result requires error_code and error.");
		}
	}

	if (result.status === COUNT_STATUSES.UNAVAILABLE) {
		if (!Object.values(UNAVAILABLE_REASONS).includes(result.unavailable_reason)) {
			throw new TypeError("Confirmed unavailable result requires an approved reason.");
		}

		if (!Array.isArray(result.evidence)) {
			throw new TypeError("Confirmed unavailable result requires evidence.");
		}

		const evidenceKinds = new Set(result.evidence.map((entry) => entry?.kind));
		const details404Dates = new Set(
			result.evidence
				.filter((entry) => entry?.kind === "details_404")
				.map((entry) => new Date(entry.observed_at).toISOString().slice(0, 10)),
		);

		if (
			result.unavailable_reason === UNAVAILABLE_REASONS.ENTITY_NOT_FOUND_CONFIRMED &&
			details404Dates.size < 2
		) {
			throw new TypeError(
				"Confirmed not-found result requires details 404 evidence on two UTC dates.",
			);
		}

		if (
			result.unavailable_reason === UNAVAILABLE_REASONS.ENTITY_REMOVED_AND_NOT_FOUND &&
			(!evidenceKinds.has("export_absence") || !evidenceKinds.has("details_404"))
		) {
			throw new TypeError(
				"Removed not-found result requires export absence and details 404 evidence.",
			);
		}
	}

	truncateToUtcSecond(result.observed_at);

	return result;
}

export function isTerminalCountResult(result) {
	return TERMINAL_COUNT_STATUSES.has(result?.status);
}

export function shouldConfirmUnavailable({
	priorResult,
	currentObservedAt,
	absentFromLaterExport = false,
}) {
	if (absentFromLaterExport) {
		return true;
	}

	return Boolean(
		priorResult?.error_code === "details_404_unconfirmed" &&
			priorResult?.observed_at &&
			isDifferentUtcDate(priorResult.observed_at, currentObservedAt),
	);
}
