import { nodeTitle } from "./node-titles.js";
import { sourceCardDetails } from "./source-details.js";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { officialGenreReference } from "../source-add/genre-catalogue.js";

export const scopedSourceCount = (count) => `${count} ${count === 1 ? "Source" : "Sources"}`;
const names = (values) => new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(values);

function humanTitle(node) {
	const title = nodeTitle(node.editable.title, node.nodeType);
	return { ...title, text: isValidVisibleNuvioTitle(node.editable.title) ? node.editable.title
		: node.nodeType === "source" && !title.hidden ? sourceCardDetails(node).fallback : title.text };
}

// One preorder leaf array and half-open ranges keep membership linear in project size.
// Empty leaves are presentation only; they never enter a controller request.
export function scopedGenreTargetIndex(project) {
	const entries = new Map(), roots = [], leaves = [];
	function siblings(nodes, parent = null) {
		const titles = nodes.map(humanTitle), frequencies = new Map(), positions = new Map();
		for (const { text } of titles) frequencies.set(text, (frequencies.get(text) ?? 0) + 1);
		return nodes.map((node, position) => {
			const { text: title, hidden } = titles[position], kind = node.nodeType;
			const ordinal = (positions.get(title) ?? 0) + 1; positions.set(title, ordinal);
			const noun = kind[0].toUpperCase() + kind.slice(1);
			const duplicate = frequencies.get(title) > 1 ? `${noun} ${ordinal} of ${frequencies.get(title)} named ${title}` : "";
			const context = [parent?.label, duplicate || noun, hidden ? "Invisible in Nuvio" : ""].filter(Boolean).join(" · ");
			const entry = { internalId: node.internalId, kind, title, hidden, context,
				label: duplicate || title, parentId: parent?.internalId, order: entries.size,
				start: leaves.length, end: leaves.length, sourceCount: 0, emptyCount: 0, children: [] };
			entries.set(entry.internalId, entry);
			entry.searchText = `${parent?.searchText ?? ""} ${title} ${context}`.toLocaleLowerCase("en");
			const children = kind === "collection" ? node.folders : kind === "folder" ? node.sources : [];
			if (children.length) entry.children = siblings(children, entry);
			else leaves.push(entry);
			entry.end = leaves.length;
			entry.sourceCount = kind === "source" ? 1 : entry.children.reduce((sum, child) => sum + child.sourceCount, 0);
			entry.emptyCount = kind === "source" ? 0 : children.length ? entry.children.reduce((sum, child) => sum + child.emptyCount, 0) : 1;
			return entry;
		});
	}
	roots.push(...siblings(project?.collections ?? []));
	return { entries, roots, leaves, sourceCount: roots.reduce((sum, entry) => sum + entry.sourceCount, 0) };
}

export function scopedGenreSelection(index, selection) {
	const counts = new Uint32Array(index.leaves.length + 1), sources = new Uint32Array(index.leaves.length + 1);
	for (let i = 0; i < index.leaves.length; i += 1) {
		const leaf = index.leaves[i], selected = (leaf.kind === "source" ? selection.sources : selection.empty).has(leaf.internalId);
		counts[i + 1] = counts[i] + Number(selected);
		sources[i + 1] = sources[i] + Number(selected && leaf.kind === "source");
	}
	const states = new Map();
	for (const entry of index.entries.values()) {
		const selected = counts[entry.end] - counts[entry.start], physical = sources[entry.end] - sources[entry.start];
		states.set(entry.internalId, { checked: selected === entry.end - entry.start, mixed: selected > 0 && selected < entry.end - entry.start,
			selected, sources: physical, empty: selected - physical });
	}
	return { states, selected: counts.at(-1), sources: sources.at(-1), missingSources: selection.sources.size - sources.at(-1) };
}

export function selectScopedGenreTarget(index, selection, entry, checked) {
	const next = { sources: new Set(selection.sources), empty: new Set(selection.empty) };
	for (let i = entry?.start ?? 0; i < (entry?.end ?? index.leaves.length); i += 1) {
		const leaf = index.leaves[i], set = leaf.kind === "source" ? next.sources : next.empty;
		if (checked) set.add(leaf.internalId); else set.delete(leaf.internalId);
	}
	return next;
}

// Visibility only. Parent ranges remain the complete current branch under any query.
export function searchScopedGenreTargets(index, query) {
	const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
	if (!terms.length) return { searching: false, roots: index.roots, children: null };
	const children = new Map();
	function filter(entries) {
		const result = [];
		for (const entry of entries) {
			const descendants = filter(entry.children);
			if (descendants.length || terms.every((term) => entry.searchText.includes(term))) {
				children.set(entry.internalId, descendants); result.push(entry);
			}
		}
		return result;
	}
	return { searching: true, roots: filter(index.roots), children };
}

export function scopedGenreReviewGroups(review, index) {
	const collections = new Map(), folders = new Map(), selected = new Set(review.sourceInternalIds);
	const blockers = new Set();
	for (const group of review.duplicateGroups) if (group.sourceInternalIds.some((id) => !selected.has(id))) {
		for (const id of group.sourceInternalIds) if (selected.has(id)) blockers.add(id);
	}
	for (const outcome of review.outcomes) {
		if (!selected.has(outcome.sourceInternalId)) continue;
		const collection = index.entries.get(outcome.collectionInternalId), folder = index.entries.get(outcome.folderInternalId);
		if (!collections.has(collection.internalId)) collections.set(collection.internalId, { ...collection, folders: [], selectedCount: 0, totals: { changed: 0, unchanged: 0, skipped: 0 } });
		const group = collections.get(collection.internalId);
		if (!folders.has(folder.internalId)) {
			const result = { ...folder, totals: { changed: 0, unchanged: 0, skipped: 0 }, rows: [], changedRows: [], unchangedRows: [], skippedRows: [] };
			folders.set(folder.internalId, result); group.folders.push(result);
		}
		const result = folders.get(folder.internalId);
		const row = { outcome, label: index.entries.get(outcome.sourceInternalId), unselectedBlocker: blockers.has(outcome.sourceInternalId) };
		result.rows.push(row); result[outcome.status + "Rows"].push(row);
		result.totals[outcome.status] += 1; group.totals[outcome.status] += 1; group.selectedCount += 1;
	}
	return [...collections.values()];
}

export function scopedGenreExclusionLabel(value, mediaType) {
	if (!mediaType) return "Preserved; not safely interpreted";
	if (value === null || value === undefined || value === "") return "None";
	return String(value).split(",").map((id) => {
		const reference = officialGenreReference(mediaType, Number(id));
		return reference ? `${reference.name} (${id})` : id;
	}).join(", ");
}

export function scopedGenreInapplicableLabel(row) {
	if (!row.inapplicableGenres.length) return "";
	return `${names(row.inapplicableGenres)} ${row.inapplicableGenres.length === 1 ? "has" : "have"} no ${row.mediaType === "TV" ? "Series" : "Movies"} mapping.`;
}

// Format the authenticated outcome; never reclassify it or propose another patch.
export function scopedGenreSourceSummary(row) {
	if (row.status === "changed") {
		const previous = new Set(String(row.beforeExclusions ?? "").split(","));
		const added = String(row.afterExclusions).split(",").filter((id) => !previous.has(id))
			.map((id) => officialGenreReference(row.mediaType, Number(id))?.name ?? id);
		return `Will change — add ${names(added)} to exclusions.`;
	}
	if (row.status === "unchanged") return row.reason.code === "ALREADY_EXCLUDED"
		? `Unchanged — ${names(row.applicableGenres)} already excluded.`
		: "Unchanged — selected Genres do not apply to this media.";
	if (row.reason.code === "UNSUPPORTED_SOURCE") return "Skipped — Genre exclusions aren’t supported.";
	if (row.reason.code === "INCLUDED_GENRE_CONFLICT") return `Skipped — ${names(row.conflictingGenres)} ${row.conflictingGenres.length === 1 ? "is" : "are"} already included by this Source.`;
	if (row.reason.code === "DUPLICATE_CONVERGENCE") return "Skipped — these exclusions would duplicate another Source in this Folder.";
	if (row.reason.code === "INVALID_MEDIA") return "Skipped — this media configuration isn’t supported.";
	if (row.reason.code === "INVALID_CANDIDATE") return "Skipped — the proposed exclusions couldn’t be validated.";
	return "Skipped — these settings need to be preserved.";
}

// One history boundary for the complete settings session, including replaced surfaces.
// Serialize cleanup before a rapid reopen so an old pop cannot dismiss a new dialog.
const historyKey = "__dingoGlobalSettings";
let historySequence = 0;
let historyCleanup = Promise.resolve();
export function bindGlobalSettingsHistory(view, onBack) {
	let disposed = false, active = false, draining = false, resolveDrain = null;
	const token = ++historySequence;
	const ownsEntry = () => view.history.state?.[historyKey] === token;
	const push = () => view.history.pushState({ ...view.history.state, [historyKey]: token }, "");
	function finishDrain() {
		view.removeEventListener("popstate", pop);
		active = false;
		resolveDrain?.();
	}
	function pop() {
		if (draining) { finishDrain(); return; }
		if (disposed || ownsEntry()) return;
		// Staying in the operation consumes Back as one local step, without retaining
		// abandoned step entries or ever reconstructing a reviewed capability.
		if (onBack()) push();
		else { view.removeEventListener("popstate", pop); active = false; }
	}
	historyCleanup.then(() => {
		if (disposed || !view?.history?.pushState) return;
		push(); active = true; view.addEventListener("popstate", pop);
	});
	return () => {
		disposed = true;
		if (!active) return;
		if (!ownsEntry()) { finishDrain(); return; }
		draining = true;
		historyCleanup = new Promise((resolve) => { resolveDrain = resolve; });
		view.history.back();
	};
}
