import { discoverSourceIdentity, discoverSourceNodeIdentity } from "../nuvio/discover.js";
import { NUVIO_INVISIBLE_TITLE } from "../nuvio/titles.js";
import { buildGenreFolderEditable } from "./genre-folder-artwork.js";
import { groupGenreSourceDrafts, inspectGenreFolderPlan } from "./genre-source.js";

export const GENRE_HIERARCHY_STRUCTURES = Object.freeze([
	Object.freeze({ id: "genre-folders", label: "Genre folders", description: "One folder card for each Genre, with its available Movies and Series sources together inside." }),
	Object.freeze({ id: "media-folders", label: "Movies & Series folders", description: "Create Movies and Series folder cards as needed, with Genre sources inside each." }),
	Object.freeze({ id: "separate-media-genre-folders", label: "Separate Movie & Series Genre folders", description: "Create separate folder cards for each Movie and Series Genre." }),
	Object.freeze({ id: "separate-media-collections", label: "Separate Movie & Series collections", description: "Create one Home collection for Movie Genres and another for Series Genres." }),
]);
export const DEFAULT_GENRE_HIERARCHY_STRUCTURE = "genre-folders";
export const DEFAULT_GENRE_HIERARCHY_COLLECTION_TITLES = Object.freeze({ movies: "Movie Genres", series: "Series Genres" });
export const GENRE_COMPOSITE_PLACEMENT_RULES = Object.freeze([
	Object.freeze({ genreName: "Action & Adventure", targetNames: Object.freeze(["Action", "Adventure"]) }),
	Object.freeze({ genreName: "Sci-Fi & Fantasy", targetNames: Object.freeze(["Science Fiction", "Fantasy"]) }),
	Object.freeze({ genreName: "War & Politics", targetNames: Object.freeze(["War"]) }),
]);

function canonicalText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function retitleDraft(draft, title) {
	return Object.freeze({ ...draft, editable: Object.freeze({ ...draft.editable, title }) });
}

function sourceEntry(group, draft, title = draft.editable.title) {
	return Object.freeze({
		genreName: group.concept.name,
		mediaType: draft.editable.mediaType,
		draft: title === draft.editable.title ? draft : retitleDraft(draft, title),
	});
}

function planEntryGroups(genres, drafts, sharedMediaChoice) {
	return groupGenreSourceDrafts(genres, drafts, sharedMediaChoice).map((group) => Object.freeze({
		...group,
		entries: Object.freeze(group.drafts.map((draft) => sourceEntry(group, draft))),
	}));
}

function selectedCompositeRules(groups) {
	const byName = new Map(groups.map((group) => [group.concept.name, group]));
	return GENRE_COMPOSITE_PLACEMENT_RULES.flatMap((rule) => {
		const composite = byName.get(rule.genreName);
		if (!composite?.entries.some((entry) => entry.mediaType === "TV")) return [];
		const targets = rule.targetNames.filter((name) => byName.get(name)?.entries.some((entry) => entry.mediaType === "MOVIE"));
		return targets.length ? [Object.freeze({ ...rule, targetNames: Object.freeze(targets) })] : [];
	});
}

export function genreCompositePlacementChoices(project, {
	scope,
	destinationCollectionInternalId = null,
	genres,
	drafts,
	sharedMediaChoice,
} = {}) {
	const groups = planEntryGroups(genres, drafts, sharedMediaChoice);
	const folderPlan = inspectGenreFolderPlan(project, scope === "new-folder" ? destinationCollectionInternalId : null, genres, drafts, sharedMediaChoice);
	const statusByName = new Map(folderPlan.groups.map((group) => [group.concept.name, group.status]));
	return Object.freeze(selectedCompositeRules(groups).map((rule) => {
		const compositeReady = scope !== "new-folder" || statusByName.get(rule.genreName) === "ready";
		const availableTargets = rule.targetNames.filter((name) => scope !== "new-folder" || (compositeReady && statusByName.get(name) === "ready"));
		const blockedTargets = rule.targetNames.filter((name) => !availableTargets.includes(name));
		const choices = [Object.freeze({ id: "standalone", label: "Keep its own folder" })];
		for (const name of availableTargets) choices.push(Object.freeze({ id: name, label: `Add to ${name}` }));
		if (availableTargets.length > 1) choices.push(Object.freeze({ id: "both", label: "Add to both" }));
		return Object.freeze({
			genreName: rule.genreName,
			targetNames: rule.targetNames,
			availableTargets: Object.freeze(availableTargets),
			blockedTargets: Object.freeze(blockedTargets),
			choices: Object.freeze(choices),
			blockedMessage: blockedTargets.length
				? `${blockedTargets.join(" and ")} already has matching Genre content in this collection, so it is not available here.`
				: null,
		});
	}));
}

export function normalizeGenreCompositePlacements(project, options, errors) {
	const supplied = options.compositePlacements ?? {};
	if (supplied === null || typeof supplied !== "object" || Array.isArray(supplied)) {
		errors.push(Object.freeze({ code: "INVALID_GENRE_COMPOSITE_PLACEMENTS", path: "$genreHierarchy.compositePlacements", message: "Composite placements must use reviewed Genre choices." }));
		return Object.freeze({});
	}
	if (options.structure !== "genre-folders") {
		if (Object.keys(supplied).length > 0) errors.push(Object.freeze({ code: "UNEXPECTED_GENRE_COMPOSITE_PLACEMENTS", path: "$genreHierarchy.compositePlacements", message: "Composite placement applies only to Genre folders." }));
		return Object.freeze({});
	}
	const choices = genreCompositePlacementChoices(project, options);
	const choicesByName = new Map(choices.map((entry) => [entry.genreName, entry]));
	if (Object.keys(supplied).some((key) => !choicesByName.has(key))) errors.push(Object.freeze({ code: "INVALID_GENRE_COMPOSITE_PLACEMENT_KEY", path: "$genreHierarchy.compositePlacements", message: "Composite placement was supplied for an unavailable Genre." }));
	const normalized = {};
	for (const [genreName, description] of choicesByName) {
		const value = Object.hasOwn(supplied, genreName) ? supplied[genreName] : "standalone";
		if (!description.choices.some((choice) => choice.id === value)) errors.push(Object.freeze({ code: "INVALID_GENRE_COMPOSITE_PLACEMENT", path: `$genreHierarchy.compositePlacements.${genreName}`, message: "Choose an available composite Genre placement." }));
		else normalized[genreName] = value;
	}
	return Object.freeze(normalized);
}

function sourceOccurrences(project, draft) {
	const identity = discoverSourceIdentity(draft.editable);
	if (!identity.comparable) return Object.freeze([]);
	const occurrences = [];
	for (const collection of project.collections ?? []) {
		for (const folder of collection.folders ?? []) {
			for (const source of folder.sources ?? []) {
				const candidate = discoverSourceNodeIdentity(source);
				if (!candidate.comparable || candidate.key !== identity.key) continue;
				occurrences.push(Object.freeze({
					identity: identity.key,
					collectionInternalId: collection.internalId,
					collectionTitle: canonicalText(collection.editable?.title),
					folderInternalId: folder.internalId,
					folderTitle: canonicalText(folder.editable?.title),
					sourceInternalId: source.internalId,
					sourceTitle: canonicalText(source.editable?.title),
				}));
			}
		}
	}
	return Object.freeze(occurrences);
}

function sourceOutcome(project, destinationCollectionInternalId, entry, statuses) {
	const occurrences = sourceOccurrences(project, entry.draft);
	const destination = occurrences.filter((item) => item.collectionInternalId === destinationCollectionInternalId);
	const elsewhere = occurrences.filter((item) => item.collectionInternalId !== destinationCollectionInternalId);
	return Object.freeze({
		genreName: entry.genreName,
		mediaType: entry.mediaType,
		identity: discoverSourceIdentity(entry.draft.editable).key,
		status: destination.length > 0 ? statuses.ALREADY_IN_COLLECTION : elsewhere.length > 0 ? statuses.EXISTS_ELSEWHERE : statuses.READY,
		destination: Object.freeze(destination),
		elsewhere: Object.freeze(elsewhere),
	});
}

function folderOutcome(sourceOutcomes, genreName, statuses) {
	const destinationCount = sourceOutcomes.filter((entry) => entry.destination.length > 0).length;
	const status = destinationCount === sourceOutcomes.length && sourceOutcomes.length > 0
		? statuses.ALREADY_IN_COLLECTION
		: destinationCount > 0
			? statuses.PARTLY_IN_COLLECTION
			: sourceOutcomes.some((entry) => entry.elsewhere.length > 0) ? statuses.EXISTS_ELSEWHERE : statuses.READY;
	return Object.freeze({
		genreName,
		status,
		sourceOutcomes: Object.freeze(sourceOutcomes),
		destination: Object.freeze(sourceOutcomes.flatMap((entry) => entry.destination)),
		elsewhere: Object.freeze(sourceOutcomes.flatMap((entry) => entry.elsewhere)),
	});
}

function genreFolderEditable(genreName, title, configuration) {
	const artwork = buildGenreFolderEditable(genreName, { tileShape: configuration.folderTileShape });
	return Object.freeze({
		...artwork,
		title: configuration.folderTitleVisibility === "HIDE_EVERYWHERE" ? NUVIO_INVISIBLE_TITLE : title,
		hideTitle: configuration.folderTitleVisibility !== "SHOW_EVERYWHERE",
	});
}

function mediaFolderEditable(mediaType, folderTileShape) {
	return Object.freeze({
		title: mediaType === "MOVIE" ? "Movies" : "Series",
		tileShape: folderTileShape,
		coverImageUrl: "",
		hideTitle: false,
		coverEmoji: "🎬",
	});
}

function buildGenreFolders(project, configuration, groups, statuses) {
	const destinationId = configuration.scope === "new-folder" ? configuration.destinationCollectionInternalId : null;
	const groupByName = new Map(groups.map((group) => [group.concept.name, group]));
	const incoming = new Map(groups.map((group) => [group.concept.name, []]));
	const mergedNames = new Set();
	for (const rule of selectedCompositeRules(groups)) {
		const placement = configuration.compositePlacements[rule.genreName] ?? "standalone";
		if (placement === "standalone") continue;
		const targets = placement === "both" ? rule.targetNames : [placement];
		const composite = groupByName.get(rule.genreName).entries.find((entry) => entry.mediaType === "TV");
		for (const target of targets) incoming.get(target).push(sourceEntry(groupByName.get(rule.genreName), composite.draft, `${rule.genreName} Series`));
		mergedNames.add(rule.genreName);
	}
	const evaluated = groups.flatMap((group) => {
		if (mergedNames.has(group.concept.name)) return [];
		const entries = Object.freeze([...group.entries, ...(incoming.get(group.concept.name) ?? [])]);
		const sourceOutcomes = entries.map((entry) => sourceOutcome(project, destinationId, entry, statuses));
		const outcome = folderOutcome(sourceOutcomes, group.concept.name, statuses);
		return [Object.freeze({
			genreName: group.concept.name,
			mediaType: null,
			editable: genreFolderEditable(group.concept.name, group.concept.name, configuration),
			sources: entries,
			outcome,
		})];
	});
	const outcomes = [...evaluated.map((folder) => folder.outcome)];
	for (const name of mergedNames) {
		const group = groupByName.get(name);
		const entry = group.entries.find((candidate) => candidate.mediaType === "TV");
		const rule = selectedCompositeRules(groups).find((candidate) => candidate.genreName === name);
		const targets = configuration.compositePlacements[name] === "both" ? rule.targetNames : [configuration.compositePlacements[name]];
		outcomes.push(Object.freeze({ ...folderOutcome([sourceOutcome(project, destinationId, entry, statuses)], name, statuses), placementTargets: Object.freeze(targets) }));
	}
	const folders = configuration.scope === "new-folder"
		? evaluated.filter((folder) => ![statuses.ALREADY_IN_COLLECTION, statuses.PARTLY_IN_COLLECTION].includes(folder.outcome.status))
		: evaluated;
	return Object.freeze({ folders: Object.freeze(folders), outcomes: Object.freeze(outcomes) });
}

function buildMediaFolders(project, configuration, groups, statuses) {
	const destinationId = configuration.scope === "new-folder" ? configuration.destinationCollectionInternalId : null;
	const byMedia = new Map([["MOVIE", []], ["TV", []]]);
	const outcomes = [];
	for (const group of groups) {
		for (const base of group.entries) {
			const entry = sourceEntry(group, base.draft, group.concept.name);
			const outcome = sourceOutcome(project, destinationId, entry, statuses);
			outcomes.push(outcome);
			if (configuration.scope !== "new-folder" || outcome.destination.length === 0) byMedia.get(entry.mediaType).push(entry);
		}
	}
	const folders = ["MOVIE", "TV"].flatMap((mediaType) => {
		const entries = byMedia.get(mediaType);
		if (!entries.length) return [];
		return [Object.freeze({
			genreName: null,
			mediaType,
			editable: mediaFolderEditable(mediaType, configuration.folderTileShape),
			sources: Object.freeze(entries),
			outcome: folderOutcome(entries.map((entry) => sourceOutcome(project, destinationId, entry, statuses)), null, statuses),
		})];
	});
	return Object.freeze({ folders: Object.freeze(folders), outcomes: Object.freeze(outcomes) });
}

function buildSeparateGenreFolders(project, configuration, groups, statuses, mediaType = null) {
	const destinationId = configuration.scope === "new-folder" ? configuration.destinationCollectionInternalId : null;
	const outcomes = [];
	const folders = [];
	for (const group of groups) {
		for (const entry of group.entries) {
			if (mediaType && entry.mediaType !== mediaType) continue;
			const outcome = sourceOutcome(project, destinationId, entry, statuses);
			outcomes.push(outcome);
			if (configuration.scope === "new-folder" && outcome.destination.length > 0) continue;
			const mediaLabel = entry.mediaType === "MOVIE" ? "Movies" : "Series";
			const title = configuration.structure === "separate-media-genre-folders" ? `${group.concept.name} ${mediaLabel}` : group.concept.name;
			folders.push(Object.freeze({
				genreName: group.concept.name,
				mediaType: entry.mediaType,
				editable: genreFolderEditable(group.concept.name, title, configuration),
				sources: Object.freeze([entry]),
				outcome: folderOutcome([outcome], group.concept.name, statuses),
			}));
		}
	}
	return Object.freeze({ folders: Object.freeze(folders), outcomes: Object.freeze(outcomes) });
}

export function buildGenreHierarchyStructure(project, configuration, drafts, statuses) {
	const groups = planEntryGroups(configuration.genres, drafts, configuration.sharedMediaChoice);
	if (configuration.structure === "genre-folders") return buildGenreFolders(project, configuration, groups, statuses);
	if (configuration.structure === "media-folders") return buildMediaFolders(project, configuration, groups, statuses);
	if (configuration.structure === "separate-media-genre-folders") return buildSeparateGenreFolders(project, configuration, groups, statuses);
	const movies = buildSeparateGenreFolders(project, configuration, groups, statuses, "MOVIE");
	const series = buildSeparateGenreFolders(project, configuration, groups, statuses, "TV");
	return Object.freeze({
		byRole: Object.freeze({ movies, series }),
		outcomes: Object.freeze([...movies.outcomes, ...series.outcomes]),
	});
}
