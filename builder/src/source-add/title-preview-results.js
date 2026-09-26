export const TITLE_PREVIEW_RESULT_LIMIT = 100;
export const TITLE_PREVIEW_PAGE_LIMIT = 5;
export const TITLE_PREVIEW_PAGE_SIZE = 20;

export function validPreviewPage(page) {
	return Number.isInteger(page) && page >= 1 && page <= TITLE_PREVIEW_PAGE_LIMIT;
}

// Missing pagination is a bounded first-page response, never permission to guess
// another page. Present malformed metadata fails provider normalization.
export function previewPagination(value, expectedPage = 1) {
	if (value.page == null && value.total_pages == null) return expectedPage === 1 ? {} : null;
	if (!Number.isSafeInteger(value.page) || value.page !== expectedPage
		|| !Number.isSafeInteger(value.total_pages) || value.total_pages < 0
		|| (value.total_pages === 0 && expectedPage !== 1)
		|| (value.total_pages > 0 && value.page > value.total_pages)) return null;
	return { page: value.page, totalPages: value.total_pages };
}

function identity(item) {
	return `${item.mediaType ?? "MOVIE"}|${item.id}`;
}

export function accumulateTitlePreviewPages(pages, { complete = false, paging = true } = {}) {
	const positions = pages.flatMap((page) => page.results).slice(0, TITLE_PREVIEW_RESULT_LIMIT);
	const seen = new Set();
	const results = positions.filter((item) => {
		const key = identity(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	const last = pages.at(-1);
	const rawCount = pages.reduce((sum, page) => sum + page.results.length, 0);
	const suppliedTotal = pages[0]?.totalResults;
	// Trust consistent, structurally possible metadata, not particular magic totals.
	const reliable = Number.isSafeInteger(suppliedTotal) && suppliedTotal >= rawCount
		&& pages.every((page) => page.totalResults === suppliedTotal)
		&& (complete || (suppliedTotal === 0 && rawCount === 0 && pages.length === 1
			&& (last.page == null || (last.page === 1 && [0, 1].includes(last.totalPages)))) || pages.every((page, index) => page.page === index + 1
			&& page.totalPages === last.totalPages
			// TMDB documents a maximum accessible page of 500. Totals beyond
			// that range cannot establish an authoritative complete result set.
			&& page.totalPages <= 500
			&& page.totalPages === Math.ceil(suppliedTotal / TITLE_PREVIEW_PAGE_SIZE)
			&& page.results.length === Math.min(TITLE_PREVIEW_PAGE_SIZE, Math.max(0, suppliedTotal - index * TITLE_PREVIEW_PAGE_SIZE))));
	const exhausted = complete || (last?.page != null && (last.totalPages === 0 || last.page >= last.totalPages))
		|| last?.results.length === 0;
	const totalResults = reliable ? suppliedTotal : null;
	const establishedComplete = exhausted && totalResults !== null && rawCount === totalResults;
	const capped = positions.length === TITLE_PREVIEW_RESULT_LIMIT || (!complete && pages.length >= TITLE_PREVIEW_PAGE_LIMIT);
	const canLoadMore = paging && !complete && !exhausted && !capped && last?.page != null;
	return {
		results, totalResults, sourcePositions: positions.length, duplicateCount: positions.length - results.length,
		complete: establishedComplete && positions.length === rawCount,
		capped, canLoadMore, nextPage: canLoadMore ? pages.length + 1 : null,
		mediaType: pages[0]?.mediaType,
		orderingLabel: last?.orderingLabel,
		...(pages.some((page) => page.orderingNote) ? { orderingNote: [...new Set(pages.map((page) => page.orderingNote).filter(Boolean))].join(" ") } : {}),
	};
}

export function completeTitlePreview(results, totalResults = results.length, mediaType = "MOVIE") {
	return accumulateTitlePreviewPages([{ results, totalResults, mediaType }], { complete: true });
}

// The accumulator establishes reliable totals/completeness; loaded row counts
// alone must never become a claimed total. Artwork availability is independent.
export function titlePreviewSummary(data, displayedCount, limit = TITLE_PREVIEW_RESULT_LIMIT) {
	if (data.sourcePositions === 0) return "No titles to preview.";
	if (displayedCount === 0) return "No posters available.";
	if (data.complete && Number.isSafeInteger(data.totalResults)) {
		return data.totalResults === 1 ? "Showing the only title." : `Showing all ${data.totalResults} titles.`;
	}
	if (Number.isSafeInteger(data.totalResults) && data.totalResults > limit) {
		return `${data.totalResults} titles found. Preview is limited to ${limit}.`;
	}
	return `Preview shows up to ${limit} titles.`;
}
