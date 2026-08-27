const freezePeriod = (period) => Object.freeze({
	...period,
	filters: Object.freeze({ ...period.filters }),
});

const yearPeriod = (year) => freezePeriod({
	id: `year-${year}`,
	kind: "year",
	label: String(year),
	startYear: year,
	endYear: year,
	filters: {
		releaseDateGte: `${year}-01-01`,
		releaseDateLte: `${year}-12-31`,
	},
});

const decadePreset = (startYear) => Object.freeze({
	id: `${startYear}s`,
	label: `${startYear}s`,
	startYear,
	endYear: startYear + 9,
	wholePeriod: freezePeriod({
		id: `${startYear}s`,
		kind: "decade",
		label: `${startYear}s`,
		startYear,
		endYear: startYear + 9,
		filters: {
			releaseDateGte: `${startYear}-01-01`,
			releaseDateLte: `${startYear + 9}-12-31`,
		},
	}),
});

const earlierPreset = Object.freeze({
	id: "1950s-and-earlier",
	label: "1950s & Earlier",
	startYear: null,
	endYear: 1959,
	wholePeriod: freezePeriod({
		id: "1950s-and-earlier",
		kind: "1950s-and-earlier",
		label: "1950s & Earlier",
		startYear: null,
		endYear: 1959,
		filters: { releaseDateLte: "1959-12-31" },
	}),
});

export const BEFORE_1950_PERIOD = freezePeriod({
	id: "before-1950",
	kind: "before-1950",
	label: "Before 1950",
	startYear: null,
	endYear: 1949,
	filters: { releaseDateLte: "1949-12-31" },
});

export const DECADE_PRESETS = Object.freeze([
	earlierPreset,
	...Array.from({ length: 7 }, (_, index) => decadePreset(1960 + (index * 10))),
]);

export const DECADE_PRESET_IDS = Object.freeze(DECADE_PRESETS.map((preset) => preset.id));

const exactYearPeriods = Object.freeze(Array.from({ length: 80 }, (_, index) => yearPeriod(1950 + index)));

export const DECADE_SOURCE_PERIOD_GROUPS = Object.freeze([
	Object.freeze({
		id: "canonical-periods",
		label: "Periods",
		periods: Object.freeze([
			...DECADE_PRESETS.map((preset) => preset.wholePeriod),
			BEFORE_1950_PERIOD,
		]),
	}),
	Object.freeze({
		id: "exact-years",
		label: "Exact years",
		periods: exactYearPeriods,
	}),
]);

export const DECADE_SOURCE_PERIODS = Object.freeze(DECADE_SOURCE_PERIOD_GROUPS.flatMap((group) => group.periods));

const sourcePeriodsById = new Map(DECADE_SOURCE_PERIODS.map((period) => [period.id, period]));

export function decadeSourcePeriodById(id) {
	return sourcePeriodsById.get(id) ?? null;
}

export const DECADE_CURRENT_YEAR_MODES = Object.freeze([
	Object.freeze({ id: "through-current-year", label: "Through current year" }),
	Object.freeze({ id: "current-year-only", label: "Current year only" }),
	Object.freeze({ id: "full-decade", label: "Full decade" }),
]);

export const DEFAULT_DECADE_CURRENT_YEAR_MODE = DECADE_CURRENT_YEAR_MODES[0].id;

const presetsById = new Map(DECADE_PRESETS.map((preset) => [preset.id, preset]));

export function decadePresetById(id) {
	return presetsById.get(id) ?? null;
}

export function currentDecadePreset(currentYear) {
	if (!Number.isInteger(currentYear)) return null;
	return DECADE_PRESETS.find((preset) => (
		preset.startYear !== null
		&& currentYear >= preset.startYear
		&& currentYear <= preset.endYear
	)) ?? null;
}

export function decadeIndividualPeriods(presetId, {
	currentYear,
	currentYearMode = DEFAULT_DECADE_CURRENT_YEAR_MODE,
} = {}) {
	const preset = decadePresetById(presetId);
	if (preset === null) return null;
	if (preset.startYear === null) {
		return Object.freeze([
			BEFORE_1950_PERIOD,
			...Array.from({ length: 10 }, (_, index) => yearPeriod(1950 + index)),
		]);
	}

	let years = Array.from({ length: 10 }, (_, index) => preset.startYear + index);
	if (currentDecadePreset(currentYear)?.id === preset.id) {
		if (currentYearMode === "through-current-year") years = years.filter((year) => year <= currentYear);
		else if (currentYearMode === "current-year-only") years = years.filter((year) => year === currentYear);
		else if (currentYearMode !== "full-decade") return null;
	}
	return Object.freeze(years.map(yearPeriod));
}

export function decadeSourcePeriodChoices(presetId) {
	const preset = decadePresetById(presetId);
	if (preset === null) return Object.freeze([]);
	return Object.freeze([
		preset.wholePeriod,
		...decadeIndividualPeriods(presetId, { currentYearMode: "full-decade" }),
	]);
}

export function toggleDecadeSourcePeriodSelection(presetId, selectedPeriodIds, toggledPeriodId) {
	const choices = decadeSourcePeriodChoices(presetId);
	if (choices.length === 0 || !choices.some((period) => period.id === toggledPeriodId)) return Object.freeze([]);
	const wholePeriodId = choices[0].id;
	if (toggledPeriodId === wholePeriodId) return Object.freeze([wholePeriodId]);
	const selectedIndividuals = new Set((Array.isArray(selectedPeriodIds) ? selectedPeriodIds : []).filter((periodId) => periodId !== wholePeriodId));
	if (selectedIndividuals.has(toggledPeriodId)) selectedIndividuals.delete(toggledPeriodId);
	else selectedIndividuals.add(toggledPeriodId);
	if (selectedIndividuals.size === 0) return Object.freeze([wholePeriodId]);
	return Object.freeze(choices.filter((period) => selectedIndividuals.has(period.id)).map((period) => period.id));
}

function hasMeaningfulDate(value) {
	return value !== null && value !== undefined && value !== "";
}

export function classifyCanonicalDecadePeriod(filters) {
	if (filters === null || typeof filters !== "object" || Array.isArray(filters)) return null;
	const releaseDateGte = filters.releaseDateGte;
	const releaseDateLte = filters.releaseDateLte;
	const hasGte = hasMeaningfulDate(releaseDateGte);
	const hasLte = hasMeaningfulDate(releaseDateLte);

	if (!hasGte && releaseDateLte === BEFORE_1950_PERIOD.filters.releaseDateLte) return BEFORE_1950_PERIOD;
	if (!hasGte && releaseDateLte === earlierPreset.wholePeriod.filters.releaseDateLte) return earlierPreset.wholePeriod;
	if (!hasGte || !hasLte || typeof releaseDateGte !== "string" || typeof releaseDateLte !== "string") return null;

	const yearMatch = /^(\d{4})-01-01$/.exec(releaseDateGte);
	const yearEndMatch = /^(\d{4})-12-31$/.exec(releaseDateLte);
	if (!yearMatch || !yearEndMatch) return null;
	const startYear = Number(yearMatch[1]);
	const endYear = Number(yearEndMatch[1]);
	if (startYear === endYear && startYear >= 1950 && startYear <= 2029) return yearPeriod(startYear);
	const preset = DECADE_PRESETS.find((entry) => entry.startYear === startYear && entry.endYear === endYear);
	return preset?.wholePeriod ?? null;
}
