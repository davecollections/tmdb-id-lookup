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
