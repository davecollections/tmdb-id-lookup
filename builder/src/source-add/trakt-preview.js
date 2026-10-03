import { accumulateTitlePreviewPages } from "./title-preview-results.js";
import { isCanonicalTraktListId } from "../nuvio/trakt.js";

const labels = Object.freeze({ movie: "Movie", show: "Series", season: "Season", episode: "Episode" });

// Only identities cross into artwork lookup. Trakt text and row order stay authoritative.
export function traktPosterIdentity(item) {
	const mediaType = item?.type === "movie" ? "movie" : Object.hasOwn(labels, item?.type) ? "tv" : null;
	const id = ["season", "episode"].includes(item?.type) ? item?.ids?.showTmdb : item?.ids?.tmdb;
	return mediaType && isCanonicalTraktListId(id) ? Object.freeze({ mediaType, id, key: mediaType + ":" + id }) : null;
}

export function normalizeTraktPreview(sample) {
	if (sample?.sample !== "first-page" || !isCanonicalTraktListId(sample.id) || !Array.isArray(sample.items)) throw new TypeError("A normalized Trakt item sample is required.");
	const items = sample.items.map((item, position) => {
		if (!Object.hasOwn(labels, item?.type)) throw new TypeError("Unsupported Trakt item type.");
		const detail = item.type === "season"
			? item.number === null ? null : "Season " + item.number
			: item.type === "episode" ? [
				item.season === null ? null : "Season " + item.season,
				item.number === null ? null : "Episode " + item.number,
			].filter(value => value !== null).join(" · ") || null : null;
		return Object.freeze({ ...item, ids: Object.freeze({ ...item.ids }), position,
			title: item.title?.trim() ? item.title : "Title unavailable",
			typeLabel: labels[item.type], detail, posterIdentity: traktPosterIdentity(item) });
	});
	return Object.freeze({ id: sample.id, sample: sample.sample, items: Object.freeze(items),
		pagination: Object.freeze({ ...sample.pagination }) });
}

export const TRAKT_TITLE_PREVIEW_LIMIT = 50;

// Adapt the bounded service sample to the existing poster-only Preview contract.
// No loadMore capability: Trakt supplies page one only, regardless of its totals.
export async function requestTraktTitlePreview({ client, posterProvider, listId, sourcePreview, signal }) {
 const response = await client.getItems(listId, { signal, limit: TRAKT_TITLE_PREVIEW_LIMIT, ...(sourcePreview ? { sourcePreview } : {}) });
 if (!response?.ok || signal?.aborted) return response;
 const sample = normalizeTraktPreview(response.data);
 const posters = posterProvider ? await posterProvider.getPosters(sample.items.map(item => item.posterIdentity), { signal }) : [];
 const results = sample.items.map((item, index) => ({
  id: item.posterIdentity?.id ?? `missing-${index}`,
  mediaType: item.posterIdentity?.mediaType === "tv" ? "TV" : "MOVIE",
  posterPath: posters[index]?.status === "ready" ? posters[index].posterPath : null,
 }));
 // Keep supplied positions for honest empty/partial summaries. Shared identity
 // deduplication prevents repeated movie/show/parent-show posters in the grid.
 return { ok: true, data: accumulateTitlePreviewPages([{ results }], { paging: false }) };
}
