# Preview up to 100 — owner review

Review checkpoint for [#226 — Expand supported TMDB title Preview up to 100 source results](https://github.com/davecollections/tmdb-id-lookup/issues/226).

Branch: `work/226-preview-up-to-100`. Verified starting local main, origin/main and GitHub main: `c0eb33b438f0eb4d4910e5ea50ef93452397f27a`. Current HEAD is the same SHA. The task began on clean, synchronized main and created the dedicated branch after the issue. All implementation changes remain unstaged and uncommitted.

## Latest owner-review paging presentation refinement

The owner has confirmed production review after deploying the reviewed Worker. This refinement changes only local frontend paging presentation and its focused tests/documentation. The existing deployed Worker source is unchanged; no redeployment, staging, commit, push or PR occurred.

**Load-more fallback:** the native button remains in the accessibility tree and keyboard tab order. For scrollable content it is visually clipped until focused, so ordinary successful auto-paging does not display a manual action. It is visibly available when the content before the footer fits within the Preview body, including zero-poster content. A ResizeObserver measures body/content fit and excludes the action's own height to avoid visibility oscillation. It never requests data. Focus reveals the full existing button styling; pending state retains the existing guard. Retry and its error remain visible after a genuine next-page failure. The near-bottom gesture handler, request coordinator and all provider/cache/window code are unchanged.

**End marker:** after paging finishes, the action becomes exactly `<p className="title-preview-end" role="status">End of preview</p>`. Existing footer paragraph styling supplies `color: var(--muted)` and `font-size: .75rem`. There is no button element, click handler, tabindex, action background/border or hover/focus treatment. The approved summary still says “Preview shows up to 100 titles.” If the removed manual action held focus, the existing body receives focus without scrolling. Complete People/Collection views retain their existing presentation; representative samples are unchanged.

Focused validation:

- **25/25** pure Preview state/query/cache tests passed, including the approved status copy, first-100 positions, page cap, failure/Retry, cancellation/stale data and per-page List sorting.
- The existing **local paging mounted test passed** at 360/384/393/402/412/1280 and 393×400, plus the posterless short-content case. It covers hidden normal/pending Load more, Tab reveal and manual activation, visible short-content fallback, visible Retry, retained results/focus, normal auto-loading, no extra requests and the plain non-focusable end paragraph. The established retry/cancel sequence remains `[1,2,2,3,3,4,5]`.
- The focused **live List paging test passed** at **393×852 and 1280×852**, using the production Worker, genuine TMDB responses and real image CDN posters. The reviewed List traversed pages **1–5 exactly once** per viewport, with no page six or replacement requests; the existing scenario also resolves its separate small List once. Frame sampling saw **zero visible Load more frames** (196 sampled mobile frames, 24 desktop frames). Both runs showed 100 posters and the non-interactive end marker, retained the approved status, restored focus and left the project unchanged.
- Mobile and desktop live end-marker screenshots were visually inspected. The full suite was not rerun: the focused browser checks answer the rendering/focus/overflow questions, while the focused state suite covers the unchanged paging/cache contracts.
- `git diff --check` and changed-document local links passed. No unrelated edits were made.

Logs: [state tests](C:/Users/Dave/AppData/Local/Temp/tmdb-226-paging-presentation-state.log), [local mechanics](C:/Users/Dave/AppData/Local/Temp/tmdb-226-paging-presentation-local.log), [live paging](C:/Users/Dave/AppData/Local/Temp/tmdb-226-paging-presentation-live.log). Screenshots: [mobile end marker](C:/Users/Dave/AppData/Local/Temp/tmdb-226-paging-presentation/preview-226-live-end-393.png), [desktop end marker](C:/Users/Dave/AppData/Local/Temp/tmdb-226-paging-presentation/preview-226-live-end-1280.png).

Only these **eight files** changed for this presentation refinement:

- `builder/src/ui/TitlePreviewResults.jsx`
- `builder/src/styles.css`
- `tests/builder-source-edit-mounted.test.mjs`
- `tests/fixtures/builder-preview-pages-mounted.jsx`
- `tests/fixtures/builder-source-edit-mounted.jsx`
- `docs/TESTING.md`
- `docs/v2/BUILDER_TITLE_PREVIEW.md`
- `docs/v2/PREVIEW_100_OWNER_REVIEW.md`

Worker source remains the already deployed reviewed version: **19,151 bytes**, SHA-256 **`60b243f9e4ccf6838851f02241109d8e98bb54ce60caea6b340035b2e22ec758`**, verified unchanged against the preceding review. Owner deployment is acknowledged from the owner's production-review report; no new deployment identifier was supplied. The live test now confirms successful production List pages 2–5, without claiming an all-family production acceptance matrix.

Branch `work/226-preview-up-to-100`, HEAD `c0eb33b438f0eb4d4910e5ea50ef93452397f27a`. Final task status remains **52 modified tracked files and eight untracked files, all unstaged and uncommitted**, with an empty index. Local production frontend source changed; deployed frontend files were not changed by this task. **Next step: owner review of the local frontend refinements; stop here.**

## Earlier final owner-review copy refinement

The final status wording makes the 100-title Preview ceiling explicit. One production formatter changed: `builder/src/source-add/title-preview-results.js`. All requested exact Preview consumers already share it; representative Decade/Period samples retain their existing wording.

| State | Current copy |
| --- | --- |
| Pageable, incomplete, below 100 | “20 titles loaded. Preview shows up to 100 titles.” (actual loaded count) |
| At 100, source larger or completion unknown | “Preview shows up to 100 titles.” |
| Complete source within 100 | “Showing 18 of 18 titles.” (actual count, including “Showing 100 of 100 titles.”) |
| Bounded incomplete view without paging | “20 titles loaded.” (actual loaded count) |
| Zero results | “No titles found.” |
| Results exist but no usable posters | “No posters available.” |

Ordinary missing posters do not change title status. Full internal totals, result ordering, filters, cap, paging, cache and Retry behavior are unchanged. Capped copy displays neither a partial total fraction nor wording implying further Preview pages. Existing List ordering explanations remain intact.

**Focused validation: 23/23 passed** using `node --test --test-name-pattern='first 100 positions|completion and conservative totals|neutral title status|Preview ceiling copy|preserves the complete effective query|List original|complete People credits|shared .*title Preview' tests/builder-title-preview-pages.test.mjs tests/builder-people-ui.test.mjs`. Coverage includes actual count/pluralization, partial/complete/capped/unknown/empty states, exact completion at 100, unchanged retained totals and state, poster-count independence, Discover-backed family/Decade projections, List projections, People/Collection data and static rendering through the shared dialog. These are focused pure/static-render copy and state tests, not live service acceptance. [Test log](C:/Users/Dave/AppData/Local/Temp/tmdb-226-final-copy-tests.log).

Only these **eight files** changed for this final copy refinement:

- `builder/src/source-add/title-preview-results.js`
- `tests/builder-title-preview-pages.test.mjs`
- `tests/builder-people-ui.test.mjs`
- `tests/builder-source-edit-mounted.test.mjs`
- `tests/fixtures/builder-preview-pages-mounted.jsx`
- `tests/fixtures/builder-source-edit-mounted.jsx`
- `docs/v2/BUILDER_TITLE_PREVIEW.md`
- `docs/v2/PREVIEW_100_OWNER_REVIEW.md`

Existing mounted-fixture expectations were updated, but the mounted matrices and full suite were not rerun: only wording changed, so prior layout, live-service and paging evidence remains applicable. `git diff --check` and changed-document local link checks passed. Production frontend source changed locally; no deployed production behavior changed. No unrelated edits were made.

Worker bytes remain **19,151 bytes**, SHA-256 **`60b243f9e4ccf6838851f02241109d8e98bb54ce60caea6b340035b2e22ec758`**. No deployment, staging, commit, push or PR. Branch remains `work/226-preview-up-to-100`, HEAD `c0eb33b438f0eb4d4910e5ea50ef93452397f27a`; the index is empty, with 52 modified tracked files and eight untracked files across the existing task. The full status below remains current. Live page-two success remains unverified until the separate owner deployment gate. **Stop for owner review.**

Local review remains available at [localhost](http://127.0.0.1:5177/) and [same-network phone URL](http://192.168.1.43:5177/) while the LAN-bound Vite server is running.

## Earlier owner-review corrections — 18 September 2026

The two requested frontend corrections are ready for local review. No Worker deployment, staging, commit, push, PR or merge occurred.

**Clipping root cause:** the constrained shared Preview body used implicit `auto` grid rows. The Decades source selector is a horizontal scroll container with `overflow-y: hidden`, so its automatic minimum height could shrink to zero while the following poster content retained its intrinsic height. Browser measurements reproduced a **6px selector row containing 40px buttons**, in both representative and exact hierarchy Preview at 393px and 1280px. The fixed header itself did not overlap the body; the selector clipped its own contents immediately below it.

**Layout fix:** `grid-auto-rows: max-content` keeps every shared body row at its content height. The Decades selector is now **46px** high, with the same **12px header/body gap**. `SourcePreviewContent` also resets its existing scroll body and gesture state when the Decades request/draft changes, covering samples as well as exact results. The fixed header/Close, original selectors and single vertical body scroll owner remain intact; query and sampling code did not change.

**Status and artwork:** ordinary missing-poster and repeat counts were removed. The final status-copy matrix above supersedes that checkpoint's wording. The unchanged poster grid filters absent metadata, separately tracks failed image URLs and reflows all remaining loaded posters in source order. It does not fetch replacement artwork, request another API page, change the result window or reorder results. Genuine page failures still retain the prefix and show the existing error and Retry.

Focused correction evidence:

- **105/105** pure/UI checks passed: title windows/status/cache/caps, Decades provider and UI, source variants, List UI, and the Genre/Network empty-state assertions affected by the copy change.
- The focused **live Decades mounted test passed** at **393×852 and 1280×852**, with **15 measured states per width**. Samples stayed at 10 posters (7 for the configured current decade); the cached exact 1984 view had 20. Year/Source/Media/Show switches started at scrollTop 0, every selector cleared its clipping ancestors, Close remained fixed and exactly one body scrolled. Representative bucket requests stayed page-one only. Live Top rated had 16 posters with neutral “20 titles loaded” status. This used production Worker/TMDB/CDN responses.
- The existing owner-authorized **local paging mounted test passed** at 360/384/393/402/412/1280 and 393×400, plus a posterless-metadata case. It verifies ordered compaction at 20/40/100 represented positions, early image failure without a page-two request, cached reopening, zero usable posters, retained prefix and explicit Retry, focus/scroll preservation, and unchanged five-page/100-position bounds. Its retry/cancellation sequence remains `[1,2,2,3,3,4,5]`. This is local component evidence, not live page-two acceptance.
- Screenshots were visually inspected for narrow and desktop representative, exact-year and Year/Source/Media/Show layouts. No full suite or production build was repeated: the targeted browser runs compiled the affected JSX/CSS and answered the shared layout, scroll and paging questions. Broader prior implementation evidence remains recorded below.
- `git diff --check` passed. The Worker still has **19,151 bytes** and SHA-256 **`60b243f9e4ccf6838851f02241109d8e98bb54ce60caea6b340035b2e22ec758`**. It was not edited or redeployed for these corrections.

Correction logs: [focused checks](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-focused.log), [live Decades](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-decades.log), [local paging](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-paging.log). Responsive screenshots: [mobile sample](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-after/preview-226-decades-sample-393.png), [mobile exact year](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-after/preview-226-decades-exact-year-393.png), [mobile all selectors](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-after/preview-226-decades-exact-add-393.png), [desktop sample](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-after/preview-226-decades-sample-1280.png), [desktop exact year](C:/Users/Dave/AppData/Local/Temp/tmdb-226-correction-after/preview-226-decades-exact-year-1280.png).

Only these **14 files** changed during this correction (relative to the existing unstaged #226 implementation):

- `builder/src/styles.css`
- `builder/src/source-add/title-preview-results.js`
- `builder/src/ui/SourcePreviewContent.jsx`
- `builder/src/ui/CreationDialog.jsx`
- `builder/src/ui/DecadeSourceFlow.jsx`
- `tests/builder-title-preview-pages.test.mjs`
- `tests/builder-source-edit-mounted.test.mjs`
- `tests/fixtures/builder-source-edit-mounted.jsx`
- `tests/fixtures/builder-preview-pages-mounted.jsx`
- `tests/builder-genre-hierarchy-ui.test.mjs`
- `tests/builder-network-hierarchy-ui.test.mjs`
- `docs/TESTING.md`
- `docs/v2/BUILDER_TITLE_PREVIEW.md`
- `docs/v2/PREVIEW_100_OWNER_REVIEW.md`

These corrections change production frontend source locally; deployed production behavior and Worker bytes are unchanged. No unrelated changes were made. The index remains empty, HEAD remains `c0eb33b438f0eb4d4910e5ea50ef93452397f27a`, and the existing 52 modified tracked files plus eight untracked files remain unstaged; the complete final status is below. The owner's observed predeployment page-two rejection, retained prefix and Retry remain expected. Live page-two success is still unverified pending the separate deployment gate. **Next step: Dave's local UI review; stop here.**

## Implementation and final family matrix

The existing nested dialog, poster grid, family providers, request coordinator and bounded cache remain the owners. A thin shared page-chain cache and result accumulator now provide the 100-position window; the shared result view adds deliberate scroll loading, accessible Load more, retained-prefix errors and Retry. List ordering stays in its existing family comparator; People retains its distinct complete-credit role/media and tie semantics. No networking framework, source-format redesign or production dependency was introduced.

| Family or view | Final behavior |
| --- | --- |
| Full/standalone Discover | Exact supported Movie/TV query; page one on open, sequential pages 2–5 on deliberate progression |
| Studios, Networks, Genres, Streaming | Same shared paging; every effective filter, sort, fixed family constraint, adult policy and Streaming monetisation union stays intact |
| Exact Decades, whole period | Expanded exact Discover source, including applicable Movie/Series/Show selectors |
| Exact Decades, individual year | Expanded exact year query, retaining the Year selector and all other effective constraints |
| Exact Decades, configured Genre | Expanded exact Genre/period/year source, retaining Source/Media/Show choices |
| Representative Decade / Period sample | Unchanged representative year-bucket algorithm and bounded sample; no page two |
| People | Existing complete combined credits: exact role/media, identity deduplication, existing sort, first 100 identities, then usable posters. Zero additional creation requests; cold Edit retains its existing details request |
| Franchise / native Movie Collection, original order | First 100 complete parts-array positions in original TMDB order; no paging or extra details request |
| Imported Collection, unsupported ordering | Exact Preview unavailable; preserved source is unchanged; no new Collection-sort feature |
| List, original | Sequential raw pages appended in response order |
| List, Recent / Top rated / Most voted, including recognized date alias | Existing comparator applied to each page separately, then append. Summary explicitly says “within each page”; no whole-List/global ranking claim |
| List, unknown sort | Neutral page-one fallback only; no page two; imported filters remain unapplied and saved data preserved |
| Physical Source Edit | Same qualifying family contract, from the validated unsaved draft |
| Ambiguous/unknown TMDB recipes; Trakt, addon/Xperience, AIO, MDBList and other unsupported types | Existing bounded/fail-closed behavior; no added support |

## Counts, requests and preservation

The cap is the first **100 ordered source-result positions before poster filtering and duplicate display removal**. Posterless titles, failed images and repeated identities consume their original positions; they do not cause replacement requests. People first deduplicates its complete role/media identities as approved. The accumulator distinguishes source positions, distinct identities, usable posters, complete, capped, next-page availability and unknown totals.

Reliable totals require general structural consistency, plausible page lengths/arithmetic and an accessible TMDB page range. No special handling of observed `20001 / 1001` values exists. Complete-count wording requires established completion. Partial/capped/unknown/empty/no-poster states use truthful source-title summaries without ordinary missing-artwork or repeat counts. Recognized List sorts retain the existing neutral explanation if optional ordering metadata is missing.

One successful pageable traversal requests page one initially and at most pages two through five sequentially. No page six, inactive-variant prefetch or automatic draining occurs. Explicit retries and reopening after cancellation can add attempts to the same bounded page numbers. A next page requires renewed downward user progress near the bottom or Load more. There is one body scroll owner beneath reachable Close, with native lazy images, keyboard/touch/wheel support, focus containment, Escape, inert background and exact trigger restoration.

Successful raw page chains use the existing five-minute/40-entry cache policy. Exact functional queries remain separate; List sorts independently project shared raw List pages without mutating another projection. Duplicate triggers coalesce. A failed page retains the loaded prefix; Retry requests that page only. Aborts, timeouts, malformed and stale responses do not append. Cached reopening starts visually at the top. An active chain stays coherent across cache expiry; a new opening after expiry starts fresh.

Source Edit Preview never calls Save, changes controller state/revision, migrates, inserts/deletes or changes serialization. Cosmetic title changes only affect the heading. v1, source constructors/identity, hierarchy plans, normal count providers, representative sampling, export behavior and unknown/community field preservation are unchanged.

## Reviewed Worker source — owner deployed

Complete source: `C:\Users\Dave\Documents\GitHub\tmdb-id-lookup\cloudflare-worker\tmdb-proxy.js` ([open source](../../cloudflare-worker/tmdb-proxy.js)).

- Byte size: **19,151 bytes**
- SHA-256: `60b243f9e4ccf6838851f02241109d8e98bb54ce60caea6b340035b2e22ec758`
- Delta: allow an optional canonical `page=1..5` on the two existing standalone Builder Discover routes; widen the existing exact List page value from one to 1–5. Discover omission still means page one; List still requires exactly `language=en-US` and one page value.
- Duplicate, zero, negative, fractional, exponent, whitespace, padded, malformed and >5 page values fail closed. Legacy Discover branches, all other routes/filters, CORS/origins, host, credentials, authentication, service-token access and upstream response pass-through are unchanged.

The complete Worker diff was inspected. The exact bytes fingerprinted above passed **88/88 deterministic Worker tests** after line-ending normalization ([handoff validation log](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-worker-handoff.log)). Coverage includes accepted pages and rejected forms plus unchanged legacy behavior. Dave subsequently deployed the reviewed version and reported production review. Codex has performed no Worker deployment; the latest frontend refinement leaves those bytes unchanged. The focused live List evidence above now includes successful pages 2–5.

## Prior implementation validation evidence

- New pure Preview paging/window/query/cache suite: **23/23 passed**, including first-100 positions, duplicates, gaps, completion/reliability, pages 1–5/no six, failed page four, retry, expiry, coalescing, abort/late data, exact family queries, representative samples and independent List projections.
- Final Worker/List/Source Edit focused batch: **171 passed, zero failures, one optional private-import audit skipped**. Corrected family/UI suites passed (69 checks), and the final Franchise/Genre UI batch passed 23/23.
- Owner-authorized local component run: **seven viewport cases passed** at 360, 384, 393, 402, 412, 1280 and 393×400. Deep cases cover 360, 412, desktop and short height. Each verifies one body scroll owner, reachable Close, no horizontal overflow, inert background and no mutation. Deep cases also cover wheel/touch/keyboard progression, pending coalescing, retained-prefix failure, explicit Retry, cancellation/reopen at top, preserved focus/scroll and no automatic drain/page six. The deliberate retry/cancellation sequence was `[1,2,2,3,3,4,5]`, with 89 posters within 100 source positions; no replacement positions were requested. Final screenshots were visually inspected, including the short-height layout.
- Genuine page-one Full Discover regression: **passed** across 360/384/393/402/412/1280 and Add/New Collection/New Folder/created Edit/imported Edit, including exact selected queries, unsaved filters, selector changes, cache, focus and unchanged export.
- Broad validation: **the complete check-all sequence was covered in resumed batches**, with failed legacy ten-poster expectations and the first-open body-ref bug corrected and rechecked. All non-mounted suites, compatibility/fixture/artifact checks, Windows checks and the other mounted suites passed. The final broad source-edit mounted run completed every scenario: **53 passed, one outdated Genre total assertion failed, ten opt-in tests skipped**. That assertion was corrected to recognize truthful unknown-total wording; the **same live Genre scenario then passed independently at 393px and 900px**. There is no claim of a separate uninterrupted green check-all invocation after these targeted corrections.
- Final production Builder build: **passed**. Changed Markdown local links resolve. `git diff --check` passed, and the final status/index checks confirm unstaged working changes only.

Local evidence logs are outside Git:

- [Final broad mounted run](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-mounted-ready.log)
- [Corrected live Genre rerun](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-genre-live-final.log)
- [Final local paging/viewport run](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-local-final.log)
- [Live Full Discover page-one run](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-discover-live.log)
- [Worker/List/Source Edit focused batch](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-worker-final.log)
- [Broad sequence continuation](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-rest.log)
- [Final production build](C:/Users/Dave/AppData/Local/Temp/tmdb-preview-226-build-final.log)

Production page-one requests and genuine TMDB/image-CDN data remain the live evidence. The explicitly owner-authorized local paging fixture is opt-in, with synthetic local rows and distinctly labeled unit artwork; it proves component mechanics only. It does not replace or claim live page-two acceptance.

Nonblocking warnings: the production build reports the existing >500 kB bundle-size warning. The optional private original-import audit needs an owner-supplied file and was not enabled. Separate opt-in historical matrices were not multiplied across every family; shared width coverage and the required live default suite are the proportionate evidence. No new Nuvio installed-client acceptance is claimed; this is an independently implemented Preview change based on reviewed upstream contract facts.

## Owner review and stopping point

Local Builder: [http://127.0.0.1:5177/](http://127.0.0.1:5177/), or [same-network phone review](http://192.168.1.43:5177/). This serves the working frontend through its existing production integration path. The owner-deployed reviewed Worker now accepts the focused live List pages 1–5. Earlier predeployment rejection notes in historical checkpoints are superseded by this evidence.

Review the latest local frontend presentation: ordinary scrolling should show no Load more flash, keyboard/short-content fallback and Retry should remain usable, and the bottom marker should read “End of preview” as quiet text. The approved family, query, sample, artwork, count, cap and cache contracts remain unchanged. Physical-device owner acceptance of this frontend refinement remains Dave's review.

Production frontend and Worker source files remain part of the overall unstaged #226 implementation. This latest refinement changes only local frontend presentation, tests and documentation; the already deployed reviewed Worker is unchanged. No unrelated changes, staging, commit, push, PR creation, merge or redeployment occurred. The next step is Dave's review.

## Changed files and final Git status

Paths below are relative to `C:\Users\Dave\Documents\GitHub\tmdb-id-lookup`. Leading ` M` means an unstaged tracked edit; `??` means an untracked new file. The index is empty.

```text
 M builder/src/source-add/person-source.js
 M builder/src/source-add/source-title-preview.js
 M builder/src/source-add/tmdb-decades-preview-provider.js
 M builder/src/source-add/tmdb-discover-preview-requester.js
 M builder/src/source-add/tmdb-list-provider.js
 M builder/src/source-add/tmdb-list-source.js
 M builder/src/source-edit/source-edit-preview.js
 M builder/src/styles.css
 M builder/src/ui/CreationDialog.jsx
 M builder/src/ui/DecadeSourceFlow.jsx
 M builder/src/ui/FranchiseSourceFlow.jsx
 M builder/src/ui/GenreHierarchyFlow.jsx
 M builder/src/ui/PosterOnlyPreviewGrid.jsx
 M builder/src/ui/SourceTitlePreviewDialog.jsx
 M builder/src/ui/StreamingHierarchyFlow.jsx
 M cloudflare-worker/README.md
 M cloudflare-worker/tmdb-proxy.js
 M docs/TESTING.md
 M docs/v2/BUILDER_DECADES.md
 M docs/v2/BUILDER_FRANCHISES.md
 M docs/v2/BUILDER_GENRES.md
 M docs/v2/BUILDER_KNOWLEDGE.md
 M docs/v2/BUILDER_NETWORKS.md
 M docs/v2/BUILDER_PEOPLE.md
 M docs/v2/BUILDER_PRODUCT_PLAN.md
 M docs/v2/BUILDER_SOURCE_EDITING.md
 M docs/v2/BUILDER_STREAMING_SERVICES.md
 M docs/v2/BUILDER_STUDIOS.md
 M docs/v2/BUILDER_TMDB_LISTS.md
 M scripts/check-all.mjs
 M tests/builder-add-source-preview-parity.test.mjs
 M tests/builder-advanced-discover-worker.test.mjs
 M tests/builder-decade-add-source-ui.test.mjs
 M tests/builder-franchise-ui.test.mjs
 M tests/builder-genre-hierarchy-ui.test.mjs
 M tests/builder-genre-preview.test.mjs
 M tests/builder-native-source-variants.test.mjs
 M tests/builder-network-hierarchy-ui.test.mjs
 M tests/builder-network-preview.test.mjs
 M tests/builder-people-foundation.test.mjs
 M tests/builder-people-ui.test.mjs
 M tests/builder-source-edit-mounted.test.mjs
 M tests/builder-source-edit-preview.test.mjs
 M tests/builder-streaming-hierarchy-ui.test.mjs
 M tests/builder-studio-hierarchy-ui.test.mjs
 M tests/builder-studio-hierarchy.test.mjs
 M tests/builder-tmdb-lists-ui.test.mjs
 M tests/builder-tmdb-lists.test.mjs
 M tests/cloudflare-worker.test.mjs
 M tests/fixtures/builder-discover-preview-mounted.jsx
 M tests/fixtures/builder-native-source-variants-mounted.jsx
 M tests/fixtures/builder-source-edit-mounted.jsx
?? builder/src/source-add/preview-page-cache.js
?? builder/src/source-add/title-preview-results.js
?? builder/src/ui/SourcePreviewContent.jsx
?? builder/src/ui/TitlePreviewResults.jsx
?? docs/v2/BUILDER_TITLE_PREVIEW.md
?? docs/v2/PREVIEW_100_OWNER_REVIEW.md
?? tests/builder-title-preview-pages.test.mjs
?? tests/fixtures/builder-preview-pages-mounted.jsx
```
