import { utcDate } from "./tmdb-request-budget.mjs";
import { utcMonth, validateUtcMonth } from "./tmdb-catalogue-counts.mjs";

export const CATALOGUE_RUN_KINDS = Object.freeze({
	COMPANY_MOVIE: "company-movie",
	NETWORK_SERIES: "network-series",
});

const CONFIG = Object.freeze({
	[CATALOGUE_RUN_KINDS.COMPANY_MOVIE]: {
		entityType: "company",
		totalSlices: 14,
		firstDay: 1,
		lastDay: 14,
		maximumRequests: 55_000,
		defaultRequests: 55_000,
	},
	[CATALOGUE_RUN_KINDS.NETWORK_SERIES]: {
		entityType: "network",
		totalSlices: 2,
		firstDay: 1,
		lastDay: 2,
		maximumRequests: 15_000,
		defaultRequests: 15_000,
	},
});

const MODES = new Set(["plan", "collect", "validate"]);

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

export function buildCatalogueRunPlan({
	kind,
	eventName,
	inputMode = "plan",
	inputSliceIndex = "0",
	inputMaxRequests,
	inputMonth = "",
	now = new Date(),
}) {
	const config = CONFIG[kind];
	if (!config) throw new TypeError(`Unknown catalogue run kind: ${kind}`);
	const plannedUtcDate = utcDate(now);
	const actualMonth = utcMonth(now);
	const plannedMonth = inputMonth ? validateUtcMonth(inputMonth) : actualMonth;
	const scheduled = eventName === "schedule";
	const mode = scheduled ? "collect" : String(inputMode || "plan");
	if (!MODES.has(mode)) throw new TypeError(`Unknown catalogue operation mode: ${mode}`);
	if (mode === "collect" && plannedMonth !== actualMonth) {
		throw new Error(
			`Requested month ${plannedMonth} must match planning UTC month ${actualMonth}.`,
		);
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
		skip: false,
		skip_reason: null,
	};
	if (scheduled && (currentDay < config.firstDay || currentDay > config.lastDay)) {
		return {
			...base,
			skip: true,
			skip_reason: `UTC day ${currentDay} is outside the ${config.firstDay}-${config.lastDay} catalogue window.`,
			requires_requests: false,
			allocations: {},
			request_bindings: {},
		};
	}
	if (mode !== "collect") {
		return {
			...base,
			requires_requests: false,
			allocations: {},
			request_bindings: {},
		};
	}

	const collectionAllowance = parseBoundedInteger(
		inputMaxRequests ?? config.defaultRequests,
		"max_requests",
		1,
		config.maximumRequests,
	);
	const targetExportAllowance = 7;
	return {
		...base,
		requires_requests: true,
		allocations: {
			collection: collectionAllowance,
			target_export: targetExportAllowance,
		},
		request_bindings: {
			collection: {
				request_class: kind,
				target_dimension: kind,
				approved_allowance: collectionAllowance,
			},
			target_export: {
				request_class: "target-export",
				target_dimension: config.entityType,
				approved_allowance: targetExportAllowance,
			},
		},
	};
}

export function assertCatalogueRunPlanStillCurrent(plan, { now = new Date(), kind } = {}) {
	if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
		throw new TypeError("Catalogue run plan must be an object.");
	}
	if (kind && plan.kind !== kind) {
		throw new Error(`Run plan kind ${plan.kind} does not match ${kind}.`);
	}
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
