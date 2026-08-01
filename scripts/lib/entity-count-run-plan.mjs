import {
	COUNT_DIMENSIONS,
	TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH,
	compareUtcMonths,
	parseStrictSampleIds,
	utcMonth,
	validateUtcMonth,
} from "./entity-title-counts.mjs";
import { utcDate } from "./entity-count-budget.mjs";

export const COUNT_RUN_KINDS = Object.freeze({
	COMPANY_MOVIE: COUNT_DIMENSIONS.COMPANY_MOVIE,
	NETWORK_SERIES: COUNT_DIMENSIONS.NETWORK_SERIES,
	COMPANY_SERIES: COUNT_DIMENSIONS.COMPANY_SERIES,
});

const CONFIG = Object.freeze({
	[COUNT_RUN_KINDS.COMPANY_MOVIE]: {
		entityType: "company",
		totalSlices: 14,
		firstDay: 1,
		lastDay: 14,
		maximumRequests: 55_000,
		defaultRequests: 55_000,
	},
	[COUNT_RUN_KINDS.NETWORK_SERIES]: {
		entityType: "network",
		totalSlices: 2,
		firstDay: 1,
		lastDay: 2,
		maximumRequests: 15_000,
		defaultRequests: 15_000,
	},
	[COUNT_RUN_KINDS.COMPANY_SERIES]: {
		entityType: "company",
		totalSlices: 14,
		firstDay: 15,
		lastDay: 28,
		maximumRequests: 70_000,
		defaultRequests: 70_000,
	},
});

const MANUAL_MODES = new Set([
	"plan",
	"collect",
	"sample",
	"retry",
	"validate",
	"publish",
	"network-bootstrap",
]);

function parseBoundedInteger(raw, label, minimum, maximum) {
	if (!/^\d+$/.test(String(raw))) {
		throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
	}
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new RangeError(`${label} must be ${minimum} through ${maximum}.`);
	}
	return value;
}

function skipPlan(base, reason) {
	return {
		...base,
		skip: true,
		skip_reason: reason,
		requires_requests: false,
		allow_target_create: false,
		allow_finalize: false,
		typed_progress_enabled: false,
		legacy_only: false,
		allocations: {},
		request_bindings: {},
	};
}

export function buildEntityCountRunPlan({
	kind,
	eventName,
	inputMode = "plan",
	inputSliceIndex = "0",
	inputSampleIds = "",
	inputMaxRequests,
	inputMonth = "",
	now = new Date(),
}) {
	const config = CONFIG[kind];
	if (!config) throw new TypeError(`Unknown count run kind: ${kind}`);
	const plannedUtcDate = utcDate(now);
	const actualMonth = utcMonth(now);
	const plannedMonth = inputMonth ? validateUtcMonth(inputMonth) : actualMonth;
	const scheduled = eventName === "schedule";
	let mode = scheduled ? "collect" : String(inputMode || "plan");
	if (plannedMonth !== actualMonth && !["plan", "validate", "publish"].includes(mode)) {
		throw new Error(
			`Requested month ${plannedMonth} must match planning UTC month ${actualMonth}.`,
		);
	}

	if (!MANUAL_MODES.has(mode)) throw new TypeError(`Unknown operation mode: ${mode}`);
	if (mode === "network-bootstrap" && kind !== COUNT_RUN_KINDS.NETWORK_SERIES) {
		throw new TypeError("network-bootstrap is available only to the Network Series workflow.");
	}

	const currentDay = Number(plannedUtcDate.slice(8, 10));
	const sliceIndex = scheduled
		? currentDay - config.firstDay
		: parseBoundedInteger(inputSliceIndex, "slice_index", 0, config.totalSlices - 1);
	const base = {
		kind,
		entity_type: config.entityType,
		mode,
		scheduled,
		planned_month: plannedMonth,
		planned_utc_date: plannedUtcDate,
		slice_index: sliceIndex,
		total_slices: config.totalSlices,
		sample_ids: "",
		skip: false,
		skip_reason: null,
	};

	if (scheduled && (currentDay < config.firstDay || currentDay > config.lastDay)) {
		return skipPlan(base, `UTC day ${currentDay} is outside the ${config.firstDay}-${config.lastDay} collection window.`);
	}

	const beforeActivation =
		compareUtcMonths(plannedMonth, TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH) < 0;
	if (beforeActivation && scheduled && kind === COUNT_RUN_KINDS.COMPANY_SERIES) {
		return skipPlan(
			base,
			`Typed production collection activates in ${TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH}; ${plannedMonth} remains on the legacy pipeline.`,
		);
	}
	if (beforeActivation && !scheduled && ["collect", "retry"].includes(mode)) {
		return skipPlan(
			base,
			`Typed production collection activates in ${TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH}; use plan/sample or the explicit Network bootstrap control.`,
		);
	}
	const legacyOnly =
		beforeActivation &&
		scheduled &&
		[COUNT_RUN_KINDS.COMPANY_MOVIE, COUNT_RUN_KINDS.NETWORK_SERIES].includes(kind);

	const requestMode = ["collect", "sample", "retry", "network-bootstrap"].includes(mode);
	if (!requestMode) {
		return {
			...base,
			requires_requests: false,
			allow_target_create: false,
			allow_finalize: ["validate", "publish"].includes(mode),
			typed_progress_enabled: false,
			legacy_only: false,
			allocations: {},
			request_bindings: {},
		};
	}

	const maximumRequests = parseBoundedInteger(
		inputMaxRequests ?? config.defaultRequests,
		"max_requests",
		1,
		config.maximumRequests,
	);
	const sampleIds = mode === "sample" ? parseStrictSampleIds(inputSampleIds).join(",") : "";
	const canCreateTarget =
		mode !== "sample" &&
		!legacyOnly &&
		(kind === COUNT_RUN_KINDS.COMPANY_MOVIE ||
			kind === COUNT_RUN_KINDS.NETWORK_SERIES);
	const targetAllowance = canCreateTarget || legacyOnly ? 7 : 0;
	const allocations = { collection: maximumRequests, target_export: targetAllowance };
	const requestBindings = {
		collection: {
			request_class: kind,
			target_dimension: kind,
			approved_allowance: maximumRequests,
		},
		target_export: {
			request_class: "target-export",
			target_dimension: config.entityType,
			approved_allowance: targetAllowance,
		},
	};

	return {
		...base,
		sample_ids: sampleIds,
		requires_requests: true,
		allow_target_create: canCreateTarget,
		allow_finalize:
			!legacyOnly && mode !== "sample" && mode !== "network-bootstrap",
		typed_progress_enabled: !legacyOnly && mode !== "sample",
		legacy_only: legacyOnly,
		allocations,
		request_bindings: requestBindings,
	};
}

export function assertRunPlanStillCurrent(plan, { now = new Date(), kind } = {}) {
	if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
		throw new TypeError("Count run plan must be an object.");
	}
	if (kind && plan.kind !== kind) throw new Error(`Run plan kind ${plan.kind} does not match ${kind}.`);
	validateUtcMonth(plan.planned_month, "planned month");
	if (plan.planned_utc_date !== utcDate(now)) {
		throw new Error(
			`Planned UTC date ${plan.planned_utc_date} expired before execution on ${utcDate(now)}.`,
		);
	}
	if (plan.planned_month !== utcMonth(now)) {
		throw new Error(`Planned month ${plan.planned_month} expired before execution.`);
	}
	const config = CONFIG[plan.kind];
	const day = Number(plan.planned_utc_date.slice(8, 10));
	if (plan.scheduled && (!config || day < config.firstDay || day > config.lastDay)) {
		throw new Error(`Planned UTC date is outside the ${plan.kind} scheduled window.`);
	}
	return plan;
}
