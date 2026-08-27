import { buildDecadesSourceDrafts } from "./decades-source.js";
import { currentDecadePreset } from "./decades-catalogue.js";

export const DECADES_REPRESENTATIVE_SAMPLE_MAX_BUCKETS = 10;

const contentRank = Object.freeze({
	"whole-decade": 0,
	"individual-year": 1,
	"genre-breakdown": 2,
});

function logicalKey(entry) {
	if (entry.contentKind === "genre-breakdown") return `${entry.contentKind}|${entry.period.id}|${entry.genreName}`;
	return `${entry.contentKind}|${entry.period.id}`;
}

function rowLabel(entry) {
	if (entry.contentKind === "whole-decade") return `All ${entry.period.label}`;
	if (entry.contentKind === "individual-year") return entry.period.label;
	return `${entry.period.label} · ${entry.genreName}`;
}

function kindLabel(contentKind) {
	if (contentKind === "whole-decade") return "Decade overview";
	if (contentKind === "individual-year") return "Individual year";
	return "Genre breakdown";
}

export function selectEvenlyDistributed(values, limit) {
	if (!Array.isArray(values) || !Number.isSafeInteger(limit) || limit < 0) return Object.freeze([]);
	if (values.length <= limit) return Object.freeze([...values]);
	if (limit === 0) return Object.freeze([]);
	if (limit === 1) return Object.freeze([values[0]]);
	const lastIndex = values.length - 1;
	return Object.freeze(Array.from({ length: limit }, (_, index) => values[Math.round((index * lastIndex) / (limit - 1))]));
}

export function decadesRepresentativeItems(items) {
	return selectEvenlyDistributed(items, DECADES_REPRESENTATIVE_SAMPLE_MAX_BUCKETS);
}

function representativeAdvanced(configuration, decadeId) {
	const advanced = configuration.advanced;
	return Object.freeze({
		minimumRating: advanced.minimumRating,
		maximumRating: advanced.maximumRating,
		minimumVotes: advanced.minimumVotes,
		originalLanguage: advanced.originalLanguage,
		originCountry: advanced.originCountry,
		ordinaryExcludedGenres: Object.freeze([...(advanced.ordinaryExcludedGenresByDecade?.[decadeId] ?? advanced.ordinaryExcludedGenres)]),
	});
}

function representativeConfiguration(configuration, decadeId) {
	const currentPreset = currentDecadePreset(configuration.currentYear);
	return Object.freeze({
		selectedDecadeIds: Object.freeze([decadeId]),
		mediaMode: configuration.mediaMode,
		content: Object.freeze({ wholeDecade: false, individualYears: true, genreBreakdown: false }),
		currentYear: configuration.currentYear,
		...(currentPreset?.id === decadeId ? { currentYearMode: "through-current-year" } : {}),
		sortOptionId: configuration.sortOptionId,
		genreNames: Object.freeze([]),
		decadeOrder: "oldest-first",
		yearOrder: "oldest-first",
		sourceGrouping: configuration.sourceGrouping,
		advanced: representativeAdvanced(configuration, decadeId),
	});
}

function buildRepresentativeSample(configuration, decadeId, decadeLabel) {
	const built = buildDecadesSourceDrafts(representativeConfiguration(configuration, decadeId));
	if (!built.ok) return Object.freeze({ ok: false, errors: built.errors });
	const requests = built.groups.map((group) => {
		const entries = selectEvenlyDistributed(group.sources, DECADES_REPRESENTATIVE_SAMPLE_MAX_BUCKETS);
		return Object.freeze({
			mediaType: group.mediaType,
			bucketLabels: Object.freeze(entries.map((entry) => entry.period.label)),
			drafts: Object.freeze(entries.map((entry) => entry.draft)),
		});
	});
	const period = decadeId === "1950s-and-earlier";
	return Object.freeze({
		ok: true,
		choice: Object.freeze({
			key: `representative-sample|${decadeId}`,
			label: period ? "Period sample" : "Decade sample",
			selectorLabel: period ? "Period sample" : "Decade sample",
			kind: "representative-sample",
			helper: period
				? "A representative mix across the period using your current sort and filters."
				: "A representative mix across the decade using your current sort and filters.",
			decadeLabel,
			requests: Object.freeze(requests),
		}),
		errors: Object.freeze([]),
	});
}

function compareRows(left, right, configuration, decadeId) {
	const rank = contentRank[left.contentKind] - contentRank[right.contentKind];
	if (rank !== 0) return rank;
	if (left.contentKind === "individual-year") {
		const leftYear = left.period.startYear ?? -Infinity;
		const rightYear = right.period.startYear ?? -Infinity;
		return configuration.yearOrder === "newest-first" ? rightYear - leftYear : leftYear - rightYear;
	}
	if (left.contentKind === "genre-breakdown") {
		const names = configuration.genreNamesByDecade[decadeId] ?? [];
		return names.indexOf(left.genreName) - names.indexOf(right.genreName);
	}
	return 0;
}

export function buildDecadesPreviewGroups(configuration) {
	const built = buildDecadesSourceDrafts(configuration);
	if (!built.ok) return Object.freeze({ ok: false, groups: Object.freeze([]), errors: built.errors });
	const decadeIds = [];
	for (const group of built.groups) if (!decadeIds.includes(group.decadeId)) decadeIds.push(group.decadeId);
	const groups = decadeIds.map((decadeId) => {
		const sourceGroups = built.groups.filter((group) => group.decadeId === decadeId);
		const decadeLabel = sourceGroups[0]?.decadeLabel ?? decadeId;
		const rowsByKey = new Map();
		for (const sourceGroup of sourceGroups) {
			for (const entry of sourceGroup.sources) {
				const key = logicalKey(entry);
				const current = rowsByKey.get(key);
				if (current) current.drafts.push(entry.draft);
				else rowsByKey.set(key, { ...entry, key, drafts: [entry.draft] });
			}
		}
		const rows = [...rowsByKey.values()]
			.sort((left, right) => compareRows(left, right, built.configuration, decadeId))
			.map((entry) => {
				const drafts = Object.freeze([...entry.drafts].sort((left, right) => (
					(left.editable.mediaType === "MOVIE" ? 0 : 1) - (right.editable.mediaType === "MOVIE" ? 0 : 1)
				)));
				return Object.freeze({
					key: entry.key,
					label: rowLabel(entry),
					selectorLabel: entry.contentKind === "genre-breakdown" ? entry.genreName : rowLabel(entry),
					kind: "exact-source",
					kindLabel: kindLabel(entry.contentKind),
					contentKind: entry.contentKind,
					period: entry.period,
					genreName: entry.genreName,
					drafts,
					requests: Object.freeze(drafts.map((draft) => Object.freeze({
						mediaType: draft.editable.mediaType,
						draft,
					}))),
				});
			});
		const sample = buildRepresentativeSample(built.configuration, decadeId, decadeLabel);
		if (!sample.ok) return Object.freeze({ decadeId, decadeLabel, rows: Object.freeze([]), choices: Object.freeze([]), errors: sample.errors });
		return Object.freeze({
			decadeId,
			decadeLabel,
			logicalSourceCount: rows.length,
			rows: Object.freeze(rows),
			choices: Object.freeze([sample.choice, ...rows]),
		});
	});
	const sampleErrors = groups.flatMap((group) => group.errors ?? []);
	if (sampleErrors.length > 0) return Object.freeze({ ok: false, groups: Object.freeze([]), errors: Object.freeze(sampleErrors) });
	return Object.freeze({ ok: true, groups: Object.freeze(groups), errors: Object.freeze([]) });
}
