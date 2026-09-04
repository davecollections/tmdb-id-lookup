import { useEffect, useMemo, useRef, useState } from "react";
import {
	createAsyncRequestCoordinator,
	DEFAULT_STUDIO_MOVIE_COUNT_FILTER,
	DEFAULT_STUDIO_SEARCH_SORT,
	INITIAL_ASYNC_REQUEST_STATE,
	parseStudioSearchInput,
	STUDIO_SEARCH_SORTS,
} from "../source-add/index.js";
export const STUDIO_SEARCH_DEBOUNCE_MS = 250;

export function useStudioCatalogueSearch(catalogueProvider) {
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [searchSortOverride, setSearchSortOverride] = useState(null);
	const [movieCountFilter, setMovieCountFilter] = useState(DEFAULT_STUDIO_MOVIE_COUNT_FILTER);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const lookupCoordinatorRef = useRef(null);
	if (!lookupCoordinatorRef.current) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	const parsedInput = useMemo(() => parseStudioSearchInput(input), [input]);
	const browsing = parsedInput.kind === "empty";
	const effectiveSearchSort = searchSortOverride ?? (browsing ? STUDIO_SEARCH_SORTS.MOVIE_COUNT_DESC : DEFAULT_STUDIO_SEARCH_SORT);
	const searchData = lookupState.status === "success" && (
		(lookupState.context?.kind === "exact" && parsedInput.kind === "exact" && lookupState.context.id === parsedInput.id)
		|| (lookupState.context?.kind === "search" && parsedInput.kind === "search" && lookupState.context.query === parsedInput.query && lookupState.context.page === page)
		|| (lookupState.context?.kind === "browse" && browsing && parsedInput.kind === "empty" && lookupState.context.page === page)
	) && lookupState.context?.sort === effectiveSearchSort
		&& lookupState.context?.hideZero === false
		&& lookupState.context?.movieCountFilter === movieCountFilter
		? lookupState.data
		: null;

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (parsedInput.kind === "invalid" || (parsedInput.kind === "search" && !parsedInput.eligible)) return undefined;
		const requestInput = browsing && parsedInput.kind === "empty" ? Object.freeze({ kind: "browse" }) : parsedInput;
		const timer = window.setTimeout(() => {
			coordinator.run(
				() => catalogueProvider.searchStudios(requestInput, { page, sort: effectiveSearchSort, hideZero: false, movieCountFilter }),
				requestInput.kind === "exact"
					? { kind: "exact", id: requestInput.id, page: 1, sort: effectiveSearchSort, hideZero: false, movieCountFilter }
					: requestInput.kind === "browse"
						? { kind: "browse", page, sort: effectiveSearchSort, hideZero: false, movieCountFilter }
						: { kind: "search", query: requestInput.query, page, sort: effectiveSearchSort, hideZero: false, movieCountFilter },
			);
		}, STUDIO_SEARCH_DEBOUNCE_MS);
		return () => { window.clearTimeout(timer); coordinator.cancel({ reset: false, notify: false }); };
	}, [browsing, catalogueProvider, effectiveSearchSort, movieCountFilter, page, parsedInput, retryGeneration]);

	useEffect(() => () => lookupCoordinatorRef.current.cancel({ notify: false }), []);

	return Object.freeze({
		input,
		page,
		parsedInput,
		lookupState,
		searchData,
		effectiveSearchSort,
		browsing,
		movieCountFilter,
		handleInputChange(event) { setInput(event.target.value); setPage(1); },
		toggleSearchSort(sort) { setSearchSortOverride((current) => current === sort ? null : sort); setPage(1); },
		changeMovieCountFilter(filterId) { setMovieCountFilter(filterId); setPage(1); },
		retrySearch() { setRetryGeneration((value) => value + 1); },
		setPage,
	});
}
