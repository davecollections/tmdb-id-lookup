import { useEffect, useMemo, useRef, useState } from "react";
import {
	createAsyncRequestCoordinator,
	INITIAL_ASYNC_REQUEST_STATE,
	parseTmdbCollectionInput,
} from "../source-add/index.js";
import {
	ADD_SOURCE_SEARCH_DEBOUNCE_MS,
	AddSourceSearchStep,
	beginSelectedCollectionDetailsRequest,
	selectedCollectionDetailsFromOutcome,
} from "./AddSourceDialog.jsx";
import { createAddSourceNavigationState } from "./add-source-navigation-state.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

function requestStateMessage(state, loadingMessage = "Searching TMDB…") {
	if (state.status === "loading") return loadingMessage;
	if (state.status === "error") return state.error?.message ?? "TMDB could not complete this request.";
	return null;
}

export function MovieCollectionPicker({
	provider,
	onSelect,
	inputRef: externalInputRef = null,
}) {
	const [input, setInput] = useState("");
	const [page, setPage] = useState(1);
	const [retryGeneration, setRetryGeneration] = useState(0);
	const [lookupState, setLookupState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectionState, setSelectionState] = useState(INITIAL_ASYNC_REQUEST_STATE);
	const [selectionCandidate, setSelectionCandidate] = useState(null);
	const [selectedResult, setSelectedResult] = useState(null);
	const selectionErrorRef = useRef(null);
	const localInputRef = useRef(null);
	const lookupCoordinatorRef = useRef(null);
	const selectionCoordinatorRef = useRef(null);
	const navigationStateRef = useRef(createAddSourceNavigationState());
	if (lookupCoordinatorRef.current === null) {
		lookupCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setLookupState });
	}
	if (selectionCoordinatorRef.current === null) {
		selectionCoordinatorRef.current = createAsyncRequestCoordinator({ onStateChange: setSelectionState });
	}

	const parsedInput = useMemo(() => parseTmdbCollectionInput(input), [input]);
	const searchData = (
		parsedInput.kind === "search"
		&& lookupState.status === "success"
		&& lookupState.context?.kind === "search"
		&& lookupState.context.query === parsedInput.query
		&& lookupState.context.page === page
	) ? lookupState.data : null;

	useEffect(() => {
		const target = externalInputRef ?? localInputRef;
		focusElementWithoutScroll(target.current);
	}, [externalInputRef]);

	useEffect(() => {
		const coordinator = lookupCoordinatorRef.current;
		coordinator.cancel({ notify: false });
		setLookupState(INITIAL_ASYNC_REQUEST_STATE);
		if (
			parsedInput.kind === "empty"
			|| parsedInput.kind === "invalid"
			|| (parsedInput.kind === "search" && !parsedInput.eligible)
		) return undefined;

		const timer = window.setTimeout(async () => {
			const outcome = await coordinator.run(
				({ signal }) => parsedInput.kind === "exact"
					? provider.getCollection(parsedInput.id, { signal })
					: provider.searchCollections(parsedInput.query, { page, signal }),
				parsedInput.kind === "exact"
					? { kind: "exact", id: parsedInput.id }
					: { kind: "search", query: parsedInput.query, page },
			);
			if (!outcome.accepted || outcome.result?.ok !== true || parsedInput.kind !== "exact") return;
			setSelectedResult(outcome.result.data);
			onSelect(outcome.result.data);
		}, ADD_SOURCE_SEARCH_DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timer);
			coordinator.cancel({ reset: false, notify: false });
		};
	}, [onSelect, page, parsedInput, provider, retryGeneration]);

	useEffect(() => () => {
		lookupCoordinatorRef.current.cancel({ notify: false });
		selectionCoordinatorRef.current.cancel({ notify: false });
	}, []);

	useEffect(() => {
		if (selectionState.status !== "error") return;
		queueMicrotask(() => {
			selectionErrorRef.current?.scrollIntoView?.({ block: "nearest" });
			focusElementWithoutScroll(selectionErrorRef.current);
		});
	}, [selectionState.requestId, selectionState.status]);

	function handleInputChange(event) {
		setInput(event.target.value);
		setPage(1);
		setSelectedResult(null);
		setSelectionCandidate(null);
		setSelectionState(INITIAL_ASYNC_REQUEST_STATE);
		selectionCoordinatorRef.current.cancel({ notify: false });
	}

	async function selectResult(result) {
		if (
			parsedInput.kind === "exact"
			&& selectedResult?.id === result.id
			&& lookupState.status === "success"
		) {
			onSelect(selectedResult);
			return;
		}
		const selection = beginSelectedCollectionDetailsRequest({
			coordinator: selectionCoordinatorRef.current,
			provider,
			result,
			navigationState: navigationStateRef.current,
			searchScrollTop: 0,
		});
		if (selection.repeated) return;
		navigationStateRef.current = selection.navigationState;
		setSelectionCandidate(result);
		setSelectedResult(null);
		const outcome = await selection.request;
		const details = selectedCollectionDetailsFromOutcome(outcome);
		if (details === null) return;
		setSelectedResult(details);
		onSelect(details);
	}

	function changePage(nextPage) {
		selectionCoordinatorRef.current.cancel({ notify: false });
		setPage(nextPage);
		setSelectedResult(null);
		setSelectionCandidate(null);
		setSelectionState(INITIAL_ASYNC_REQUEST_STATE);
	}

	return (
		<section className="source-edit-picker" data-source-edit-picker="movie-collection">
			<AddSourceSearchStep
				input={input}
				inputRef={externalInputRef ?? localInputRef}
				parsedInput={parsedInput}
				lookupState={lookupState}
				lookupMessage={requestStateMessage(lookupState)}
				searchData={searchData}
				selectedResult={selectedResult}
				selectionState={selectionState}
				selectionCandidate={selectionCandidate}
				selectionMessage={requestStateMessage(selectionState, "Validating the selected TMDB collection…")}
				selectionErrorRef={selectionErrorRef}
				onInputChange={handleInputChange}
				onRetryLookup={() => setRetryGeneration((value) => value + 1)}
				onSelectResult={selectResult}
				onRetrySelection={selectResult}
				onChangePage={changePage}
			/>
		</section>
	);
}
