export const CATALOGUE_SCHEMA_VERSION = 1;
export const CATALOGUE_PARSER_SEMANTIC_VERSION = "1.0.0";

export const CATALOGUE_DIMENSIONS = Object.freeze({
	COMPANY_MOVIE: "company-movie",
	NETWORK_SERIES: "network-series",
});

export const CATALOGUE_COUNT_STATUSES = Object.freeze({
	POSITIVE: "positive",
	ZERO: "zero",
	FAILED: "failed",
	UNAVAILABLE: "unavailable",
});

export function validateUtcMonth(value, label = "month") {
	if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
		throw new TypeError(`${label} must use a valid YYYY-MM value.`);
	}
	return value;
}

export function utcMonth(date = new Date()) {
	const value = new Date(date);
	if (Number.isNaN(value.getTime())) throw new TypeError("Invalid date value.");
	return value.toISOString().slice(0, 7);
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
		throw new TypeError("Count must be a nonnegative safe integer.");
	}
	return count === 0
		? CATALOGUE_COUNT_STATUSES.ZERO
		: CATALOGUE_COUNT_STATUSES.POSITIVE;
}

export function partitionCatalogueIds(ids, sliceIndex, totalSlices) {
	if (!Array.isArray(ids) || ids.length === 0) {
		throw new TypeError("Catalogue IDs must be a non-empty array.");
	}
	const normalized = ids.map(Number);
	if (
		normalized.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
		new Set(normalized).size !== normalized.length
	) {
		throw new TypeError("Catalogue IDs must be unique positive safe integers.");
	}
	if (!Number.isInteger(totalSlices) || totalSlices <= 0) {
		throw new TypeError("totalSlices must be a positive integer.");
	}
	if (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= totalSlices) {
		throw new RangeError("sliceIndex must identify one configured slice.");
	}
	const start = Math.floor((normalized.length * sliceIndex) / totalSlices);
	const end = Math.floor((normalized.length * (sliceIndex + 1)) / totalSlices);
	return { ids: normalized.slice(start, end), start, end };
}

export function truncateToUtcSecond(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new TypeError("Invalid observation timestamp.");
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
	const current = new Date(now);
	if (
		Number.isNaN(audited.getTime()) ||
		Number.isNaN(current.getTime()) ||
		!Number.isFinite(maxAgeHours) ||
		maxAgeHours <= 0 ||
		!Number.isFinite(futureToleranceMinutes) ||
		futureToleranceMinutes < 0
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
