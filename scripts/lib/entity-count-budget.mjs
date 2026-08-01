import crypto from "node:crypto";

export const TMDB_PREFERRED_DAILY_LIMIT = 90_000;
export const TMDB_ABSOLUTE_DAILY_LIMIT = 100_000;
export const TMDB_FIXED_GENRE_COMMITMENT = 36;
export const TMDB_PROTECTED_AUDIT_COMMITMENT = 14;
export const TMDB_PROTECTED_REPAIR_COMMITMENT = 4_000;

export const RESERVATION_BUCKETS = Object.freeze({
	GENERAL: "general",
	AUDIT: "audit",
	REPAIR: "repair",
});

export function utcDate(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new TypeError("UTC date input must be valid.");
	}

	return date.toISOString().slice(0, 10);
}

export function validateUtcDate(value, label = "UTC date") {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new TypeError(`${label} must use YYYY-MM-DD.`);
	}
	const parsed = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		throw new TypeError(`${label} must be a real calendar date.`);
	}
	return value;
}

export function canonicalJson(value) {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}

	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
			.join(",")}}`;
	}

	return JSON.stringify(value);
}

export function sha256Json(value) {
	return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function assertAllowance(value, label) {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new TypeError(`${label} must be a nonnegative safe integer.`);
	}

	return value;
}

export function sumReservationAllowances(receipt) {
	const allocations = receipt?.allocations;

	if (!allocations || typeof allocations !== "object" || Array.isArray(allocations)) {
		throw new TypeError("Reservation allocations must be an object.");
	}

	return Object.entries(allocations).reduce(
		(total, [key, value]) => total + assertAllowance(value, `allocation ${key}`),
		0,
	);
}

export function calculateReservedTotal(existingReceipts) {
	if (!Array.isArray(existingReceipts)) {
		throw new TypeError("existingReceipts must be an array.");
	}

	let auditReserved = 0;
	let repairReserved = 0;
	let generalReserved = 0;

	for (const receipt of existingReceipts) {
		const allowance = sumReservationAllowances(receipt);

		if (receipt.bucket === RESERVATION_BUCKETS.AUDIT) {
			auditReserved += allowance;
		} else if (receipt.bucket === RESERVATION_BUCKETS.REPAIR) {
			repairReserved += allowance;
		} else {
			generalReserved += allowance;
		}
	}

	return {
		auditReserved,
		repairReserved,
		generalReserved,
		protectedAuditUnclaimed: Math.max(0, TMDB_PROTECTED_AUDIT_COMMITMENT - auditReserved),
		protectedRepairUnclaimed: Math.max(0, TMDB_PROTECTED_REPAIR_COMMITMENT - repairReserved),
		total:
			TMDB_FIXED_GENRE_COMMITMENT +
			Math.max(auditReserved, TMDB_PROTECTED_AUDIT_COMMITMENT) +
			Math.max(repairReserved, TMDB_PROTECTED_REPAIR_COMMITMENT) +
			generalReserved,
	};
}

export function planReservation({
	date = new Date(),
	bucket = RESERVATION_BUCKETS.GENERAL,
	allocations,
	existingReceipts = [],
	allowPreferredOverride = false,
}) {
	if (!Object.values(RESERVATION_BUCKETS).includes(bucket)) {
		throw new TypeError(`Unknown reservation bucket: ${bucket}`);
	}

	const requested = sumReservationAllowances({ allocations });
	const before = calculateReservedTotal(existingReceipts);
	const projectedReceipts = [
		...existingReceipts,
		{
			bucket,
			allocations,
		},
	];
	const after = calculateReservedTotal(projectedReceipts);

	if (after.total > TMDB_ABSOLUTE_DAILY_LIMIT) {
		throw new RangeError(
			`TMDB reservation would reach ${after.total}, above the absolute ${TMDB_ABSOLUTE_DAILY_LIMIT} limit.`,
		);
	}

	if (after.total > TMDB_PREFERRED_DAILY_LIMIT && !allowPreferredOverride) {
		throw new RangeError(
			`TMDB reservation would reach ${after.total}, above the preferred ${TMDB_PREFERRED_DAILY_LIMIT} limit.`,
		);
	}

	return {
		utc_date: utcDate(date),
		requested,
		before,
		after,
		preferred_override_used: after.total > TMDB_PREFERRED_DAILY_LIMIT,
	};
}

export function buildReservationReceipt({
	date = new Date(),
	reservationId,
	workflow,
	runId,
	runAttempt,
	job,
	plannedMonth,
	plannedUtcDate,
	bucket = RESERVATION_BUCKETS.GENERAL,
	allocations,
	bindings,
	existingReceipts = [],
	allowPreferredOverride = false,
	overrideReason = "",
	createdAt = new Date().toISOString(),
}) {
	if (!reservationId || !workflow || !runId || !runAttempt || !job) {
		throw new TypeError("Reservation identity fields are required.");
	}
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(plannedMonth || "")) {
		throw new TypeError("Reservation plannedMonth must use a valid YYYY-MM value.");
	}
	validateUtcDate(plannedUtcDate, "Reservation plannedUtcDate");
	if (plannedUtcDate.slice(0, 7) !== plannedMonth) {
		throw new TypeError("Reservation planned month and UTC date disagree.");
	}
	validateReservationBindings({ allocations, bindings });

	const plan = planReservation({
		date,
		bucket,
		allocations,
		existingReceipts,
		allowPreferredOverride,
	});

	if (plan.preferred_override_used && !String(overrideReason).trim()) {
		throw new TypeError("Preferred-limit override requires a reason.");
	}

	if (plan.utc_date !== plannedUtcDate) {
		throw new Error(
			`Reservation execution date ${plan.utc_date} does not match planned UTC date ${plannedUtcDate}.`,
		);
	}

	const receipt = {
		schema_version: 2,
		reservation_id: reservationId,
		utc_date: plan.utc_date,
		workflow,
		run_id: String(runId),
		run_attempt: String(runAttempt),
		job,
		planned_month: plannedMonth,
		planned_utc_date: plannedUtcDate,
		bucket,
		allocations,
		bindings,
		total_allowance: plan.requested,
		projected_daily_total: plan.after.total,
		preferred_daily_limit: TMDB_PREFERRED_DAILY_LIMIT,
		absolute_daily_limit: TMDB_ABSOLUTE_DAILY_LIMIT,
		fixed_genre_commitment: TMDB_FIXED_GENRE_COMMITMENT,
		protected_audit_commitment: TMDB_PROTECTED_AUDIT_COMMITMENT,
		protected_repair_commitment: TMDB_PROTECTED_REPAIR_COMMITMENT,
		preferred_override_used: plan.preferred_override_used,
		override_reason: plan.preferred_override_used ? String(overrideReason).trim() : null,
		created_at: createdAt,
	};

	return {
		receipt,
		sha256: sha256Json(receipt),
		plan,
	};
}

export function validateReservationBindings(receipt) {
	const { allocations, bindings } = receipt || {};
	if (!allocations || typeof allocations !== "object" || Array.isArray(allocations)) {
		throw new TypeError("Reservation allocations must be an object.");
	}
	if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
		throw new TypeError("Reservation bindings must be an object.");
	}
	const allocationKeys = Object.keys(allocations).sort();
	const bindingKeys = Object.keys(bindings).sort();
	if (!allocationKeys.length) {
		throw new TypeError("Reservation must contain at least one allocation.");
	}
	if (canonicalJson(allocationKeys) !== canonicalJson(bindingKeys)) {
		throw new TypeError("Reservation bindings must exactly match allocation keys.");
	}
	for (const key of allocationKeys) {
		const binding = bindings[key];
		if (
			!binding ||
			typeof binding.request_class !== "string" ||
			!binding.request_class ||
			typeof binding.target_dimension !== "string" ||
			!binding.target_dimension
		) {
			throw new TypeError(`Reservation binding ${key} is incomplete.`);
		}
		if (binding.approved_allowance !== allocations[key]) {
			throw new TypeError(`Reservation binding ${key} allowance does not match allocation.`);
		}
	}
	return bindings;
}

export function validateReservationReceipt(receipt) {
	if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
		throw new TypeError("Reservation receipt must be an object.");
	}

	if (receipt.schema_version !== 2) {
		throw new TypeError(`Unsupported reservation schema version: ${receipt.schema_version}`);
	}

	validateUtcDate(receipt.utc_date, "Reservation utc_date");
	if (receipt.planned_utc_date !== receipt.utc_date) {
		throw new TypeError("Reservation planned_utc_date must match utc_date.");
	}
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(receipt.planned_month || "")) {
		throw new TypeError("Reservation planned_month must use a valid YYYY-MM value.");
	}
	if (receipt.planned_utc_date.slice(0, 7) !== receipt.planned_month) {
		throw new TypeError("Reservation planned month and UTC date disagree.");
	}
	for (const field of ["reservation_id", "workflow", "run_id", "run_attempt", "job"]) {
		if (typeof receipt[field] !== "string" || !receipt[field]) {
			throw new TypeError(`Reservation ${field} is required.`);
		}
	}

	if (!Object.values(RESERVATION_BUCKETS).includes(receipt.bucket)) {
		throw new TypeError(`Unknown reservation bucket: ${receipt.bucket}`);
	}

	const total = sumReservationAllowances(receipt);
	validateReservationBindings(receipt);
	if (receipt.total_allowance !== total) {
		throw new TypeError("Reservation total_allowance does not match allocations.");
	}

	if (
		!Number.isSafeInteger(receipt.projected_daily_total) ||
		receipt.projected_daily_total < total ||
		receipt.projected_daily_total > TMDB_ABSOLUTE_DAILY_LIMIT
	) {
		throw new TypeError("Reservation projected daily total is unsafe.");
	}
	if (
		receipt.preferred_daily_limit !== TMDB_PREFERRED_DAILY_LIMIT ||
		receipt.absolute_daily_limit !== TMDB_ABSOLUTE_DAILY_LIMIT ||
		receipt.fixed_genre_commitment !== TMDB_FIXED_GENRE_COMMITMENT ||
		receipt.protected_audit_commitment !== TMDB_PROTECTED_AUDIT_COMMITMENT ||
		receipt.protected_repair_commitment !== TMDB_PROTECTED_REPAIR_COMMITMENT ||
		typeof receipt.preferred_override_used !== "boolean"
	) {
		throw new TypeError("Reservation limits/commitments are incompatible.");
	}
	if (
		(receipt.preferred_override_used &&
			(typeof receipt.override_reason !== "string" || !receipt.override_reason.trim())) ||
		(!receipt.preferred_override_used && receipt.override_reason !== null)
	) {
		throw new TypeError("Reservation preferred-limit override metadata is invalid.");
	}
	if (
		(receipt.projected_daily_total > TMDB_PREFERRED_DAILY_LIMIT) !==
			receipt.preferred_override_used ||
		Number.isNaN(Date.parse(receipt.created_at))
	) {
		throw new TypeError("Reservation override state or creation timestamp is invalid.");
	}

	return receipt;
}
