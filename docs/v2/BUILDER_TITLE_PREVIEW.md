# Shared TMDB title Preview

Issue [#226 — Expand supported TMDB title Preview up to 100 source results](https://github.com/davecollections/tmdb-id-lookup/issues/226). Implemented and merged through [PR #227](https://github.com/davecollections/tmdb-id-lookup/pull/227). The retained deployment and validation evidence below describes completed implementation work; this documentation reconciliation does not reopen those gates. This contract supersedes earlier ten-poster and List-page-one descriptions in historical checkpoints.

## Supported families

| Source/view | Result contract |
| --- | --- |
| Full Discover, Studio, Network, Genre, Streaming | Exact existing query, sequential pages 1–5, at most the first 100 source-result positions |
| Exact Decade whole period, individual year, configured Genre | Same paging, with the exact active Year/Source/Media/Show draft |
| Representative Decade / Period sample | Existing year-bucket algorithm, up to ten representatives and up to ten page-one bucket requests; no paging |
| People | Existing complete combined credits; exact role/media, identity deduplication, existing Dingo sort, first 100 identities, then posters; no added request in creation |
| Franchise / native Collection, original order | Complete details parts array in TMDB order, first 100 positions; no paging or extra details request |
| List, original | Append raw pages in response order |
| List, Recent / Top rated / Most voted (including the supported date alias) | Apply the existing List comparator separately to each page, then append; never globally rank the entire List or re-sort the accumulated prefix |
| List, unknown sort | Existing neutral page-one fallback only; saved sort and imported filters preserved |
| Imported Collection, unsupported sort | Exact Preview unavailable; no new Collection sort support |
| Ambiguous/unknown TMDB recipes and non-TMDB sources | Existing bounded/fail-closed behavior |

Source Edit uses these same providers and the validated, detached current draft. Unsaved functional changes define query identity; cosmetic titles only change the heading. Preview never invokes Save, a controller operation, migration, serialization changes, or project revision changes.

## Result window and counts

The limit is **100 ordered source-result positions before poster filtering**. Duplicate identities consume their original positions but display only once. Missing artwork is normal catalogue data. The grid skips missing/failed posters and naturally reflows all remaining usable posters from the already-loaded bounded projection in source order. This never requests another page or artwork endpoint for replacements, including before page two or beyond page five/position 100. People deduplicates the complete role/media membership before sorting and taking its identity window.

The shared accumulator distinguishes represented positions, unique identities, visible posters, completion, the cap, and the next page. Complete-count wording requires established completion, not merely a short page or 100 loaded results. Complete datasets provide their known total. Paged totals require consistent non-negative integers, matching sequential metadata, plausible 20-row page lengths and final-page arithmetic, and a total within TMDB's documented accessible page range ([TMDB errors, page limit](https://developer.themoviedb.org/docs/errors)). Missing, contradictory, changing, or inaccessible totals use cautious up-to-limit wording. There is no special case for particular observed totals. A successful empty response remains cacheable. Total-result data remains available internally even when the displayed status omits it.

The shared successful status contract is:

| State | Status |
| --- | --- |
| Exact reliable total fully represented within the limit | “Showing all 20 titles.”; singular “Showing the only title.” |
| Reliable total exceeds the Preview limit | “347 titles found. Preview is limited to 100.”, using the actual reliable total and cap |
| Total unknown/unreliable, or known within the cap but not yet fully represented | “Preview shows up to 100 titles.”, using the actual cap |
| Zero source results | “No titles to preview.” |
| Represented titles but zero usable posters | “No posters available.” |

The ceiling is intentional: capped copy never displays a partial fraction or suggests more Preview pages. The same formatter serves Discover-backed Preview, People, Franchises/Movie Collections, Lists, exact Decades and Source Edit. Representative Decade/Period samples keep their separate established representative wording. The number of visible posters may be lower than the represented title count without changing its normal status; no missing-poster or repeat count is appended. Recognized List rankings retain “within each page”; missing optional sorting metadata retains the existing neutral fallback explanation. Imported List filters are not applied.

Title-result actions use **Preview titles**. Per-entity actions remain beside their entity; whole-configuration actions stay directly discoverable after Filters where applicable. Decades shows its per-Decade actions directly in Configure without another disclosure. Representative samples retain their own labels and cap; no samples are relabelled as exact results. Retry/loading copy stays concise and user-facing. Paging behavior within the existing bounded window is unchanged.

## Requests, cache and interaction

Opening requests only page one (or the existing complete details request). Exact inactive media, sort, year, source, Genre and Region variants remain lazy. Each next page requires deliberate downward wheel/touch/keyboard/scrollbar progress near the bottom (about one poster row) or **Load more titles**. A retained sentinel, resize, append, or image failure cannot automatically drain pages. One bounded body scroll region sits below the reachable Close header; native lazy images, responsive three-phone/five-desktop columns, focus containment, Escape, inert background and trigger restoration remain shared.

During normal scrollable Preview, the native Load more button stays in the accessibility tree and tab order but uses the established clipped visually-hidden treatment. It becomes visible on focus, or when the content preceding the paging footer fits within the body and cannot provide normal scrolling. A presentation-only ResizeObserver measures that fit, excluding the footer's own height to prevent visibility oscillation; it never requests data. Pending requests retain the same disabled-action guard. A genuine failure always exposes Retry and the existing error, including while retrying.

After a paging traversal finishes, its action is replaced with `<p className="title-preview-end" role="status">End of preview</p>`. It inherits the footer paragraph's muted colour and 0.75rem text, with no button, border, background, handler, tabindex or hover/focus treatment. The approved status above already explains the ceiling. If the removed manual action held focus, focus returns without scrolling to the existing Preview body. Complete People/Collection views retain their existing presentation without a new paging footer.

Body grid rows retain their content height so the horizontally scrollable Decades selector cannot shrink to its padding and clip its buttons. Decades request/draft changes reset that same body to the top and disarm paging, including representative samples. The header stays outside the scrolling body; no nested vertical scroll region is added.

The Preview page cache extends the existing five-minute/40-entry bounded cache. Each entry holds one coherent successful raw-page sequence for an exact functional query; List raw pages share List ID while each sort independently projects them. Identical triggers coalesce into one flight. A last-consumer abort cancels transport and discards late results. Failures/timeouts/malformed responses never append or replace prior successes. Explicit Retry requests only the failed page. Switching/reopening can reuse unexpired pages; reopening starts scroll at the top. An active continuation retains its coherent sequence even if its cache entry expires; a new open after expiry starts a fresh sequence. No cache state is serialized.

A successful pageable traversal makes at most five sequential page requests. Explicit retries or cancellation followed by a new attempt can increase attempts but cannot request a sixth page. Complete People/Collection views make no paging request. Representative samples retain their distinct existing request budget.

## Worker and validation boundary

Only `/builder/discover/movie`, `/builder/discover/tv` and `/3/list/{id}` gain canonical `page=1..5`. Discover omission still means page one; List still requires its exact `language=en-US` and one page value. Duplicate, padded, signed, fractional, exponent, whitespace, zero and out-of-range values fail closed. Legacy Discover routes, other filters/routes, hosts, credentials, CORS and service-token policy are unchanged; upstream responses pass through untouched.

`tests/builder-title-preview-pages.test.mjs` provides pure deterministic request/window/cache coverage. The existing source-edit mounted harness adds the owner-authorized **local mocked paging mechanics** scenario (`TMDB_PREVIEW_PAGES_ONLY=1`, test name `mounted local Preview paging`) at 360, 384, 393, 402, 412, 1280 and 393×400. Its synthetic rows and explicitly intercepted `preview-unit-*.svg` artwork are isolated to that opt-in component scenario and are not live TMDB evidence. They cover failure/Retry, short-content and keyboard fallback, cancellation and cap presentation.

Following owner deployment, `TMDB_PREVIEW_PRESENTATION_ONLY=1` and test name `mounted live Preview paging hides` reuse the existing live List scenario at 393px and 1280px. Actual production pages 1–5 and TMDB posters verify sequential auto-paging, no extra requests, zero visible Load more frames during ordinary scrolling, and the plain end marker. No Worker deployment is performed by these tests.

The same harness runs focused live Decades header/selector checks with `TMDB_DECADES_BOUNDARY_ONLY=1` and test name `mounted Decades Preview keeps` at 393px and 1280px. It reuses the existing representative and exact Add Source scenarios, checks all Year/Source/Media/Show controls against their clipping ancestors, and verifies scroll resets after changing choices. Genuine page requests and images use the production integration path.
