import { TMDB_LIST_PLACEMENT_STATUSES } from "../source-add/tmdb-list-plan.js";
import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";
import { titleSortWords } from "./title-sorting.js";

// Presentation only: the planner still owns identity, placement and output counts.
export function tmdbListHierarchyReview(lists, review, { folderTitleVisibility } = {}) {
	const rows = lists.map((list, index) => ({ list, outcome: review?.outcomes[index] }));
	const ready = rows.filter(({ outcome }) => outcome && outcome.status !== TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION);
	const omitted = rows.filter(({ outcome }) => outcome?.status === TMDB_LIST_PLACEMENT_STATUSES.ALREADY_IN_COLLECTION);
	const elsewhere = ready.filter(({ outcome }) => outcome.elsewhere.length > 0);
	const names = new Map();
	if (folderTitleVisibility !== "HIDE_EVERYWHERE") for (const { list } of ready) {
		if (!isValidVisibleNuvioTitle(list.folderTitle)) continue;
		// Keep articles: similar visible names are advisory, never source identity.
		const key = titleSortWords(list.folderTitle, { stripArticle: false }).join(" ").toLocaleLowerCase();
		if (!key) continue;
		const group = names.get(key) ?? { title: list.folderTitle.trim(), ids: [] };
		group.ids.push(list.id); names.set(key, group);
	}
	return { ready, omitted, elsewhere, duplicateNames: [...names.values()].filter(group => group.ids.length > 1) };
}
