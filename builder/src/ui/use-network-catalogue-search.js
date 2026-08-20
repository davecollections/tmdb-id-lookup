import { useEffect, useMemo, useRef, useState } from "react";
import {
	createAsyncRequestCoordinator,
	DEFAULT_NETWORK_SERIES_COUNT_FILTER,
	INITIAL_ASYNC_REQUEST_STATE,
	parseNetworkSearchInput,
} from "../source-add/index.js";

export const NETWORK_SEARCH_DEBOUNCE_MS = 250;

export function useNetworkCatalogueSearch(catalogueProvider, { seriesCountFilters = false } = {}) {
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [seriesCountFilter, setSeriesCountFilter] = useState(DEFAULT_NETWORK_SERIES_COUNT_FILTER);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const lookupCoordinatorRef = useRef(null);
	if (!lookupCoordinatorRef.current) lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });

	const parsedInput = useMemo(() => parseNetworkSearchInput(input), [input]);
	const browsing = parsedInput.kind === "empty";
	const activeFilter = seriesCountFilters ? seriesCountFilter : null;
	const searchData = lookupState.status === "success" && (
		(lookupState.context?.kind === "exact" && parsedInput.kind === "exact" && lookupState.context.id === parsedInput.id)
		|| (lookupState.context?.kind === "search" && parsedInput.kind === "search" && lookupState.context.query === parsedInput.query && lookupState.context.page === page)
		|| (lookupState.context?.kind === "browse" && browsing && lookupState.context.page === page)
	) && lookupState.context?.seriesCountFilter === activeFilter
		? lookupState.data
		: null;

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (parsedInput.kind === "invalid" || (parsedInput.kind === "search" && !parsedInput.eligible)) return undefined;
		const requestInput = browsing ? Object.freeze({ kind: "browse" }) : parsedInput;
		const timer = window.setTimeout(() => {
			const options = activeFilter === null ? { page } : { page, seriesCountFilter: activeFilter };
			coordinator.run(
				() => catalogueProvider.searchNetworks(requestInput, options),
				requestInput.kind === "exact"
					? { kind: "exact", id: requestInput.id, page: 1, seriesCountFilter: activeFilter }
					: requestInput.kind === "browse"
						? { kind: "browse", page, seriesCountFilter: activeFilter }
						: { kind: "search", query: requestInput.query, page, seriesCountFilter: activeFilter },
			);
		}, NETWORK_SEARCH_DEBOUNCE_MS);
		return () => { window.clearTimeout(timer); coordinator.cancel({ reset: false, notify: false }); };
	}, [activeFilter, browsing, catalogueProvider, page, parsedInput, retryGeneration]);

	useEffect(() => () => lookupCoordinatorRef.current.cancel({ notify: false }), []);

	return Object.freeze({
		input,
		page,
		parsedInput,
		lookupState,
		searchData,
		browsing,
		seriesCountFilter,
		handleInputChange(event) { setInput(event.target.value); setPage(1); },
		changeSeriesCountFilter(filterId) { setSeriesCountFilter(filterId); setPage(1); },
		retrySearch() { setRetryGeneration((value) => value + 1); },
		setPage,
	});
}
