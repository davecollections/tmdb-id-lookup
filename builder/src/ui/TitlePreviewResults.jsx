import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createAsyncRequestCoordinator } from "../source-add/async-request-state.js";
import { accumulateTitlePreviewPages, titlePreviewSummary } from "../source-add/title-preview-results.js";
import { PosterOnlyPreviewGrid } from "./PosterOnlyPreviewGrid.jsx";
import { PreviewScrollContext } from "./SourcePreviewContent.jsx";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";

export function TitlePreviewResults({ data: initialData, listPreview = false, hasImportedFilters = false, ...gridProps }) {
	const [data, setData] = useState(initialData);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(null);
	const busy = useRef(false);
	const failed = useRef(false);
	const coordinator = useRef(null);
	const scroll = useContext(PreviewScrollContext);
	const requestedMore = useRef(false);
	const footer = useRef(null);
	const action = useRef(null);
	const [needsManual, setNeedsManual] = useState(false);
	if (!coordinator.current) coordinator.current = createAsyncRequestCoordinator();
	useEffect(() => () => coordinator.current.cancel({ notify: false }), []);
	useLayoutEffect(() => {
		coordinator.current.cancel({ notify: false });
		busy.current = false; failed.current = false;
		requestedMore.current = false;
		setNeedsManual(false);
		setData(initialData); setPending(false); setError(null);
		if (scroll) {
			// Complete-data views can mount ready before the parent body ref attaches.
			if (scroll.body.current) scroll.body.current.scrollTop = 0;
			scroll.gesture.current = { armed: false, top: 0 };
		}
	}, [initialData, scroll]);
	const represented = data?.sourcePositions !== undefined ? data : accumulateTitlePreviewPages([data ?? { results: [] }], {
		complete: data?.totalResults === data?.results?.length, paging: false,
	});
	useEffect(() => {
		if (!data?.loadMore) return undefined;
		const body = scroll?.body.current;
		if (!body) { setNeedsManual(true); return undefined; }
		const measure = () => {
			if (!footer.current) return;
			// Exclude the action's own height, so revealing it cannot oscillate
			// between scrollable and unscrollable. Measurement never loads data.
			const contentHeight = footer.current.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
			setNeedsManual(contentHeight <= body.clientHeight + 1);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(body);
		for (const child of body.children) observer.observe(child);
		return () => observer.disconnect();
	}, [data, scroll]);
	async function loadMore(retry = false) {
		if (busy.current || (failed.current && !retry) || !data?.loadMore) return;
		busy.current = true; failed.current = false;
		requestedMore.current = true;
		if (scroll) scroll.gesture.current.armed = false;
		setPending(true);
		const outcome = await coordinator.current.run(({ signal }) => data.loadMore({ signal }));
		if (!outcome.accepted) return;
		if (scroll) scroll.gesture.current.armed = false;
		busy.current = false; setPending(false);
		if (outcome.result?.ok) {
			if (!outcome.result.data?.loadMore && document.activeElement === action.current) {
				focusElementWithoutScroll(scroll?.body.current);
			}
			setError(null);
			setData(outcome.result.data);
		} else if (outcome.result?.error?.kind !== "aborted") {
			failed.current = true; setError(outcome.result?.error ?? { message: "More titles could not be loaded." });
		}
	}
	useLayoutEffect(() => {
		if (!scroll) return undefined;
		scroll.paging.current = () => loadMore();
		return () => { scroll.paging.current = null; };
	});
	return <>
		<PosterOnlyPreviewGrid {...gridProps} items={represented.results} displayAll embedded emptyMessage={null}
			renderSummary={(displayedCount) => <div className="source-title-preview-context">
				<p className="source-title-preview-summary" role="status" data-preview-empty-state={displayedCount === 0 ? "true" : undefined}>{titlePreviewSummary(represented, displayedCount)}{listPreview && represented.orderingLabel ? ` · ${represented.orderingLabel}${represented.orderingLabel !== "List order" ? " within each page" : ""}` : ""}</p>
				{represented.orderingNote ? <p className="source-title-preview-summary tmdb-list-preview-ordering">{represented.orderingNote}</p> : null}
				{hasImportedFilters ? <p className="source-title-preview-summary tmdb-list-preview-filters">Imported filters aren’t applied in Preview. Your saved settings will be kept.</p> : null}
			</div>}
		/>
		{data?.loadMore || requestedMore.current ? <div ref={footer} className="title-preview-more" aria-busy={pending}>
			{error ? <p className="add-source-request-state" role="alert">Couldn’t load more titles. Your loaded results are still available. {error.message}</p> : null}
			{pending ? <p role="status">Loading more titles…</p> : null}
			{data?.loadMore
				? <button ref={action} type="button" data-fallback-hidden={!needsManual && !error ? "true" : undefined} aria-disabled={pending} onClick={() => loadMore(Boolean(error))}>{error ? "Retry" : "Load more titles"}</button>
				: <p className="title-preview-end" role="status">End of preview</p>}
		</div> : null}
	</>;
}
