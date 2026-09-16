# V2 Builder Network Sources

## Shared Advanced filters (#218)

[Issue #218](https://github.com/davecollections/tmdb-id-lookup/issues/218) extends the existing collapsed Advanced disclosure in Add Source, New Collection, New Folder and physical Edit with `withOriginalLanguage`, `withOriginCountry`, `withGenres`, `withoutGenres`, `withKeywords`, `withoutKeywords`, `releaseDateGte`, `releaseDateLte` and `year`. Network remains native NETWORK, fixed TMDB ID and Series-only. Existing votes/ratings, sort inventory, naming, artwork, ordering, placement, atomic application and sources-only output remain unchanged.

The [shared Studio contract](./BUILDER_STUDIOS.md#shared-advanced-filters-218) defines locale grammar, included Any/All expressions, comma-list exclusions, date/year validation and preservation boundaries. Network uses the actual TV genre catalogue. Dates map to `first_air_date.gte/lte`; year maps separately to `first_air_date_year`. No hidden current-date upper bound or NuvioTV status default is added.

Multi-Network creation provides genre **Shared genres**, **Using default** and **Custom** contexts through the reused Discover controls and genre context chooser. Customise starts with blank, independent genre rules: an intentional empty Custom override means no genre restriction. Clear selections keeps Custom and resets its rules, Include mode and Match any operator; Use default removes the override and restores the current shared rules. Subsequent shared changes do not affect blank or populated Custom rules. Review shows differing effective rules. Single-Network creation shows direct genre controls; physical Edit has only concrete filters. Keywords and other settings remain shared. Overrides resolve before configured equality and plan construction, are frozen for rebuild/revalidation, and never serialize into Nuvio JSON.

The Advanced threshold controls share one desktop row and stack on mobile. Minimum/Maximum rating use ordinary decimal-entry fields; optional values, validation and explicit 0/10 boundaries remain unchanged. Genre configuration summarises Shared genres counts and Custom/Using default entity counts; inheriting contexts show an entity-specific Customise prompt instead of repeating the rules. Desktop keywords retain removable Include/Exclude chips without a separate selected-only view; mobile retains its dedicated picker and selected-items navigation.

The existing explicit detached Preview sends fixed Network, adult exclusion, sort and the complete effective filter query through the approved TV gateway/cache. Advanced interaction requests no titles. Untouched imported representations and inactive/alias-only/conflicting mirrors remain preserved; coupled edits include stored partners and only touched canonical fields plus equivalent mirrors change. Unsafe effective semantics block exact Preview while preservation-only edits remain available. No Worker change or deployment is required. Other families and provider/region authoring remain outside this feature.


## Shared rating bounds (#216)

[Issue #216](https://github.com/davecollections/tmdb-id-lookup/issues/216) adds **Minimum rating** and **Maximum rating** after Minimum votes in the same default-collapsed Advanced disclosure on Add Source, New Collection, New Folder and physical Edit Source. Network shares the [Studio rating/preservation contract](./BUILDER_STUDIOS.md#shared-rating-bounds-216): optional inclusive 0–10 decimals, minimum ≤ maximum, equal bounds allowed, canonical authored numbers, meaningful explicit 0/10 presence, scalar-shape safety and canonical request representability. No arbitrary precision limit or rounding is introduced.

One shared pair applies to all selected Network/scalar-sort candidates, configured placement, frozen/revalidated plans and atomic application. Network retains fixed `NETWORK/TV` identity, native `sources`-only output, names, sorts, ordering and artwork. Its creation allowlist is now `voteCountGte`, `voteAverageGte`, `voteAverageLte`; other fields remain rejected. Final Appearance summarizes the configured values.

Deliberate physical rating edits validate against untouched stored bounds, update only touched canonical fields and genuinely equivalent owned mirrors, and preserve the other bound exactly. Inactive aliases and untouched invalid imports survive open/Cancel/no-op/title-only/unrelated supported saves. Unsupported imported pairs cannot be edited here and exact Preview fails closed. Minimum votes behavior is unchanged. Configured comparison recognizes supported canonical number/string equivalents without broadening mirror equivalence or changing storage; explicit boundaries remain distinct from unset, and functional edits into an exact sibling remain rejected.

The existing detached TV Discover Preview includes both bounds, fixed native Network inclusion, canonical adult exclusion, current sort, Minimum votes and all other already-safe effective predicates in its complete-query cache key. Advanced interaction makes no request. No hidden NuvioTV status/current-date defaults, Worker changes, standalone Discover changes or new dependencies are included. [Builder Knowledge](./BUILDER_KNOWLEDGE.md#native-studionetwork-rating-contract-216) records the upstream evidence; [testing](../TESTING.md#mounted-browser-lifecycle) describes the extended existing live scenario. This section supersedes the minimum-only creation subset in the historical #213 description.

## Shared Minimum votes (#213)

Network Minimum votes is implemented through [#213](https://github.com/davecollections/tmdb-id-lookup/issues/213) / [PR #214](https://github.com/davecollections/tmdb-id-lookup/pull/214). Add Source, New Collection, New Folder and physical Edit Source expose optional **Minimum votes** in default-collapsed **Advanced options**, using the same label, help, error and touched-field presentation as Studio #208. Unset produces `filters: {}`; explicit zero produces `filters: { voteCountGte: 0 }`. Supported number/string input uses the existing nonnegative int32 contract through 2147483647 and emits a canonical number. Creation accepts only this filter subset; other keys are rejected. Opening, changing and collapsing Advanced performs no request or autofocus. Invalid current values block progression and explicit Preview. Appearance summarizes the validated threshold without repeating a summary beside the input.

One shared creation value applies to every selected Network × scalar-sort candidate. Network remains `tmdb / NETWORK / TV` with the fixed canonical TMDB ID, all four existing sorts, naming and order. Supported filters survive candidate construction, configured placement, frozen plan configuration, revalidation, append/create planning, atomic application and serialization. Changing the threshold recalculates exact coverage; append-only New Folder still finishes in Configure. Ambiguous destinations, collection-wide coverage, existing-folder preservation and rollback retain the native-variant contract.

Physical editing preserves original values/types, aliases, nulls, unknown fields, raw snapshots, IDs and order on open, Cancel, unchanged Save and title-only Save. Deliberate edits update only `voteCountGte` and an existing meaningful equivalent `vote_count.gte` mirror; clear removes only those owned representations. Inactive null/empty mirrors remain preserved. Invalid, conflicting and alias-only minimum semantics cannot be edited. Other unknown meaningful filters may coexist with a supported minimum edit but block exact Preview.

Structural identity remains `tmdb|NETWORK|<id>|TV`. Configured comparison additionally includes sort, supported effective minimum and the remaining meaningful native semantics. Supported numeric/string values and matching mirrors compare equivalently; unset, zero and 100 stay distinct. Unknown/conflicting semantics are not collapsed into false equality. Add review, guided placement and edit sibling rejection use the same comparison hook; unchanged/title-only preservation beside existing duplicates remains possible.

Network title Preview now uses the existing production `/builder/discover/tv` gateway and complete-query requester/cache. A detached query contains `include_adult=false`, the current scalar sort, fixed `with_networks` from native `tmdbId`, and every safely understood effective filter, including `vote_count.gte`. Imported aliases are inspected before fixing native inclusion; alias-only/conflicting/unknown meaningful semantics fail closed. Cache keys contain every effective parameter. Preview retains Series-only context, Show choices, first-page ordering, ten-poster maximum, Retry, abort/stale suppression and focus/scroll restoration. Visible Preview totals belong to the active response; existing automatic Add/Edit identity counts remain unfiltered.

The shared extraction is limited to `minimum-votes.js` (validation/inspection/comparison), `native-entity-preview-query.js` (detached query preparation) and `MinimumVotesAdvancedOptions.jsx` (disclosure/field/summary). Studio public wrappers remain. Network's thin adapter fixes TV/inclusion and the strict creation allowlist. No new requester, cache, settings store, editor framework or planner is introduced. New native sources serialize canonical `voteCountGte` in `sources` only, without a `catalogSources` projection.

The accepted #206/#207 evidence is reused with its original limits. No Nuvio client retest or exact cross-client result/count parity is claimed; hidden NuvioTV status/current-date behavior is not reproduced. Worker source, routes, allowlists, CORS, CSP, hosts, authentication, V1 and dependencies are unchanged.

Focused validation covers numeric boundaries, filters, comparison, preservation/editing, complete-query Preview, configured placement, stale/tampered plans and rollback, with Studio regression. The existing mounted native/source-edit harness passed 28 Network cases: all four surfaces at 360×800, 384×800, 393×852, 402×800, 412×800, 1280×900 and 393×400. Actual production Worker/TMDB responses and image CDN resources verified unset/0/100, clearing, invalid inputs, no request from Advanced interaction, exact posters/visible counts, cache reuse, focus restoration, no horizontal overflow, contained scrolling and one-revision apply. See [testing commands](../TESTING.md#mounted-browser-lifecycle).

The historical milestones below retain their dated evidence; this section supersedes their empty-filter, title/sort-only editing and legacy title-Preview route statements.

## Current native variants checkpoint - 2026-09-10

Issue [#200](https://github.com/davecollections/tmdb-id-lookup/issues/200) has owner-approved implementation as of 2026-09-10; merge remains a separate owner gate. Add Source, New Collection and New Folder now select one or more options under **Sources to create**, initially Popular, with **Choose one or more options. Each option creates a separate Series source.** Empty selection blocks creation. Every option creates a native scalar `NETWORK/TV` source; a single option retains the existing title, while multiple options append ` - <option>`. Add appends missing exact variants. Guided New Folder plans exact Sources across the destination Collection: create a folder for an entity with no recognized matching folder, append missing variants to one matching folder, and add nothing for fully present entities. When several folders match and Sources are missing, Configure requires an inline **Add new sources to** choice. Existing Sources stay in place; names, artwork, raw data and settings remain preserved. Append-only plans use Add sources in Configure; Appearance affects new folders only. No-addition and unresolved plans cannot progress. Shared Preview retains fixed Series context and a **Show** selector when there is a choice; count and posters belong to the exact active response. The scalar editor remains **Sort titles by**. The [native-variant contract](./BUILDER_NATIVE_VARIANTS.md) supersedes earlier one-source, structural-only duplicate and no-Partial descriptions below; catalogue, count, artwork and Worker contracts are unchanged.

Status: physical Add Source merged through issue [#98](https://github.com/davecollections/tmdb-id-lookup/issues/98) / PR [#99](https://github.com/davecollections/tmdb-id-lookup/pull/99); hierarchy issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) is closed/completed through merged [PR #127](https://github.com/davecollections/tmdb-id-lookup/pull/127) at `10a76aeffd351341321ab56658e69858fb85d39c`, after owner Worker deployment, live sorted-Preview validation, and owner review; issue [#182](https://github.com/davecollections/tmdb-id-lookup/issues/182) is the current owner-review implementation for shared Add/guided discovery controls

Last reviewed: 2026-09-04

## Scope

The first Network slice adds one native TMDB Network Series source to an existing selected folder:

1. open **Add source** and choose **Networks**;
2. browse or search the checked-in Network catalogue;
3. select exactly one Network;
4. review its fixed Series identity and automatic current Series Count;
5. choose a supported sort;
6. review same-folder and elsewhere duplicate evidence; and
7. insert exactly one native `NETWORK` / `TV` source through the existing atomic controller path.

Issue #98 does not create collections or folders, add Network artwork to sources, change the catalogue refresh pipeline, regenerate checked-in data, implement Network multi-select, or add another source family. Its Worker deployment remained a separate explicitly authorized acceptance action.

## Catalogue discovery

The Builder lazily loads `data/tv-networks.min.json` and normalizes only bounded presentation and search fields. Empty input automatically enters deterministic **Most series** browse. Typed search uses hidden Best Match across exact name, name prefix, name contains, and country/location metadata; Series Count breaks ties only inside the same relevance tier. An exact canonical positive integer keeps its TMDB ID match first. Country matching supports the represented two-letter code, full country name, useful aliases, and compact headquarters context. Results are paged at 20 rows.

The low-level catalogue loader keeps count projection opt-in, but selected-folder Add Source, New Collection, and New Folder now request the same discovery projection. A valid non-negative safe-integer `t` becomes the checked-in Series Count; a missing or invalid value becomes Unknown. All three contexts show `Series Count: N`, including zero, or `Series Count: Unknown` on result cards and expose the same **Series count** group: **All** by default, **Exclude 0**, **10+**, **50+**, **100+**, and **500+**. All retains positive, zero, and Unknown values; Exclude 0 removes only known zero; numeric thresholds retain only known values at or above the threshold. Filtering happens before paging and returns to page 1 without changing the selected Network.

All three contexts expose explicit **A–Z** and **Most series** result ordering. Empty Browse defaults to visibly selected Most series. Known counts sort descending, Unknown follows every known count, and equal counts resolve by normalized name, numeric TMDB ID, then display name. Typed input without an override retains hidden Best Match; its relevance tiers stay authoritative and the same count comparison breaks only within a tier. An explicit order replaces the visible result order while exact numeric input still keeps the matching TMDB ID first. Changing the order returns to page 1. Catalogue order never changes selection insertion order, selection identity, source construction, duplicate identity, or serialization.

Malformed rows are skipped. Sparse valid rows remain selectable with the available name and ID. Catalogue load failures are sanitized and retryable; failed loads are not cached. A successful normalized catalogue is reused in memory.

## Configure and count boundary

Selecting a Network opens Configure without discarding Search query, Series-count filter, explicit order, page, scroll position, or logical result focus. Returning to Search restores the selected result's explicit non-colour selected state. The fixed identity includes a canonical external `https://www.themoviedb.org/network/<id>` link. The UI presents one Series source and no Movie choice.

Selection starts one structured request:

```text
GET /3/discover/tv?with_networks={positive integer}
```

The request times out after approximately 12 seconds, supports caller abort, and rejects stale completions when the selection or modal changes. Only successful non-negative safe-integer `total_results` values enter the five-minute, 40-entry bounded in-memory cache. Positive and zero values render as `Series Count: N`; a ready zero also shows a quiet amber explanation that TMDB currently returns no series and that Add remains available. Source Edit uses the same concise zero explanation without Add wording. Malformed, failed, or timed-out responses render the quiet `Count unavailable` state. Count state is informational, has no Retry or Refresh control, and never blocks Add or Save. The checked-in discovery count is maintenance data and may differ from this later live exact-selection result; it is browsing context, not a current-count guarantee.

The tracked Worker source permits TV Discover with exactly one of `with_companies` or `with_networks`. Movie Discover remains Company-only. Missing, mixed, duplicate, zero, signed, fractional, unsafe, malformed, and extra query parameters fail before upstream fetch. Host, CORS, authentication, caching, API-key stripping, and sanitized-error behavior remain unchanged.

On 2026-08-09, the reviewed source was manually deployed to the existing `tmdb-id-lookup-proxy` Worker at the configured production endpoint. Bounded live acceptance returned ABC Network 2 → **1,616**, SBS Australia 223 → **255**, HBO 49 → **377**, and Nine Network 66 → **354**. Existing Company 3 routes remained successful at **136 Movies** and **15 Series**. Representative malformed and mixed Network routes returned HTTP 403, no API-key or bearer leakage was observed, and a production-built Builder with mock counts disabled matched the direct Worker results.

## Source contract and sorts

The exact new source is:

```json
{
  "title": "<Network name>",
  "sortBy": "popularity.desc",
  "tmdbId": 2,
  "filters": {},
  "provider": "tmdb",
  "mediaType": "TV",
  "tmdbSourceType": "NETWORK"
}
```

The four semantic choices are:

| Choice | `sortBy` |
| --- | --- |
| Popular | `popularity.desc` |
| Recent | `first_air_date.desc` |
| Top rated | `vote_average.desc` |
| Most voted | `vote_count.desc` |

Popular is the default. The source is authoritative only in `sources`; no native Network entry is written to `catalogSources`. Logo, location, count, search state, duplicate state, and Builder internal IDs are UI/application data and never serialize.

## Duplicates and mutation

Network duplicate identity is `tmdb|NETWORK|<positive id>|TV`. Display title and sort are not part of identity. A matching source in the destination folder shows a warning and replaces normal Add with **Add anyway**. The override is bound to the exact destination folder and current source identity, then duplicates are rechecked immediately before insertion. Matches in other folders are informational and show bounded `Folder · in Collection` locations without blocking Add.

One accepted submission delegates to the existing controller insertion path, adds one source, creates one content revision, closes the modal, selects/focuses the new source, and announces success. Cancel, invalid input, unsupported draft, missing destination, duplicate rejection without override, rapid repeat activation, provider failure, and controller failure make no partial mutation. Existing source order, folder presentation, raw/unknown data, addon projections, and unrelated content remain intact.

## Physical Source Edit

Complete native `NETWORK` / `TV` sources are registered with the existing physical-source editor. The overflow menu exposes **Edit source** immediately before Delete and desktop double-click uses the same editor entry point. Source name and the four supported sorts are editable. Network TMDB ID, `NETWORK`, `TV`, provider, filters, raw identity, and unrelated fields remain fixed.

The editor hydrates available cached presentation by exact Network ID, shows the contained logo/fallback, compact location, canonical TMDB Network link, and the same automatic non-blocking current Series Count. An untouched unusual imported sort remains exact until the user chooses a supported value. Cancel and unchanged Save perform no mutation; a real difference-only title/sort Save performs one existing controller update and preserves raw/unknown fields and ordering.

## Guided Network hierarchy creation — issue #126

Networks is registered in both shared hierarchy launcher scopes while selected-folder Add Source retains the issue #98 source construction, Configure, duplicate, and mutation behavior:

- **New Collection → Networks** defaults to one ordinary editable `Networks` Collection with one Network Folder per eligible selection.
- **New Folder → Networks** creates needed Network Folders and appends missing Sources to matching folders beneath the captured Collection, preserving all existing fields and order.

The family follows the shared [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md) architecture and uses **Step 1 · Select → Step 2 · Configure → Step 3 · Appearance → Create**. Select reuses the checked-in Network catalogue, 20-row paging, search ranking, location, logo, result-count wording, Series-count filter, and A–Z/Most series result ordering described above without making a live request or auto-focusing Search. Add Source and guided selection deliberately share those discovery controls and card counts. Guided multi-selection remains insertion-ordered and Add remains single-select.

Selection is exact-ID, insertion-ordered, removable, and uncapped. Removing then reselecting appends the Network. A nonblocking scale notice begins at 50, and the selected disclosure remains bounded. Configure applies one shared Series sort to the whole batch: **Popular** / `popularity.desc` by default, **Recent** / `first_air_date.desc`, **Top rated** / `vote_average.desc`, or **Most voted** / `vote_count.desc`. Search, selection, Configure, Appearance, planning, revalidation, and apply make zero automatic live Discover requests.

Every Configure row exposes one explicit poster-only **Preview titles** action after sort is known. Before a successful Preview, its single visible `Series Count:` line shows the checked-in catalogue value or Unknown; a successful Preview replaces that value on the same line with the response's `total_results`, while failure retains the catalogue value. The latest successful value may survive sort changes during the wizard, but remains transient UI state outside plans, identity, duplicate logic, stale comparison, and serialization. A cold Preview requests exactly one Network-and-sort TV Discover response and retains upstream first-page order. It renders at most 10 usable posters above 520px or 5 at and below 520px, omits posterless rows, backfills only from that same response page, and shows exactly **No posters available.** when no usable poster remains. It has no media selector because Networks is Series-only. The narrow Discover Preview requester is shared with Studio behind thin family adapters; the flows keep their own endpoint, cache key, and UI state. The response cache is success-only, defaults to five minutes and 40 LRU-style entries, includes successful zero results, and excludes failures, malformed responses, timeouts, aborts, and stale completions.

The tracked Worker source extends only `/3/discover/tv` with one canonical positive safe-integer `with_networks` plus zero or one `sort_by` from the four exact Network values above. It rejects duplicate, extra, mixed Company/Network, Movie, malformed, and unsupported-sort requests before upstream fetch. Existing no-sort Network and Company behavior, fixed upstream host, browser-origin authentication, CORS, API-key stripping, and sanitized failures remain unchanged; Discover is still unavailable through the origin-free service-token path. On 2026-08-20, the owner manually deployed the complete reviewed Worker as version `f6bee241-afef-447f-b8f9-3d4b8da460cf`; the recorded deployment-handoff source SHA-256 was `612955AD3ECCEF16E12E05ABA6B672B0AD68BA825F13419FFA2A0A9346706AD4`, and the post-deployment live sorted-Preview gate passed. The merged tracked Worker Git blob is separately `ceb37bb3711a43d6f25508a98943ce71b53baec2`; the deployment byte hash, Git blob OID, and CRLF-transformed Windows working-tree bytes are distinct identities and are not a byte-equivalence claim.

Appearance defaults to visible Collection title, generated Folder titles **Show everywhere**, Poster, Tabs, Show All on, and Pin off. It exposes only the shared batch-safe Poster/Landscape choice. Artwork resolution uses the exact requested orientation from the existing runtime, then the checked-in safe TMDB `w500` Network logo, then an empty image with 📺. It never substitutes the opposite runtime orientation. One workspace client/load resolves the batch before the ephemeral plan; plan creation, stale revalidation, and apply perform no artwork I/O. Per-Network URLs and focus controls remain ordinary **Edit Folder** work.

Generated base names are Collection Networks, canonical Network Folder name, and Series. Multiple options add the canonical option suffix. Each Source remains scalar NETWORK/TV with the evidenced sort and no catalogSources projection. Guided New Folder plans exact Sources across the destination Collection: create a folder for an entity with no recognized matching folder, append missing variants to one matching folder, and add nothing for fully present entities. When several folders match and Sources are missing, Configure requires an inline **Add new sources to** choice. Existing Sources stay in place; names, artwork, raw data and settings remain preserved. Partial coverage is possible with multiple sorts. Elsewhere matches are informational. Plans retain selected order, revalidate current destinations and apply new folders plus append bundles atomically with full rollback.

Issue #126 did not change Add Source, physical Source Edit, V1, catalogue maintenance data/writers, the Pages publication mechanism, or the current Nuvio source contract. Issue #182 later changes only the Add/guided discovery projection, filters, and ordering documented above; it adds no request, source, Worker, schema, or serializer behavior. No current-client Network hierarchy import/runtime/export result is claimed. The known client resolver divergence also remains unresolved: retained evidence records NuvioTV adding `with_status=0|3|4` and a null-to-current-date upper bound for native Network sources while NuvioMobile does not. The existing native `NETWORK/TV` evidence is reused; owner Worker deployment, live sorted Preview acceptance, final owner review, PR merge, issue completion, and automatic Pages publication are complete. Merge did not redeploy the Worker.

## Verification boundary

Deterministic coverage lives in `tests/builder-network-foundation.test.mjs`, `tests/builder-network-ui.test.mjs`, the hierarchy suites, the separate test-owned entity-selection capability contract, the shared Source Edit suites, Worker tests, and the normal Builder/compatibility checks. It covers default-versus-opt-in count projection, shared Add/guided filters, A–Z/Most series controls and card counts, hidden Best Match, count-descending and Unknown/tie semantics, page reset, search/ranking/paging, sparse rows, Configure → Back preservation, count success/zero/failure/cache/abort boundaries, all saved-source sorts, exact source output, duplicate override binding, atomic insertion, physical editing, and mobile responsive contracts at 360, 384, 393, 402, and 412 pixels plus desktop.

Owner physical-phone acceptance passed on 2026-08-09. On the physical iPhone, Dave verified the Add Source chooser; Network search with the software keyboard open; empty A–Z browse; numeric Network-name search using `10`; Configure → Back restoration; live Network count presentation; normal source Add; same-folder duplicate and Add anyway; elsewhere duplicate information; known-zero Network presentation, including known-zero stacked with duplicate and elsewhere states; Network Source Edit with keyboard interaction; and Studio both-zero presentation. No horizontal overflow, trapped scrolling, hidden primary actions, or problematic keyboard layout behavior was observed.

The issue #98 automated validation, live Worker acceptance, desktop acceptance, physical-phone acceptance, and final ChatGPT/owner PR review are complete. No Nuvio client import/runtime/export result is claimed by that issue. Issue #126 adds deterministic hierarchy coverage for catalogue count filters, ordered uncapped selection, all four sorts, explicit Preview/cache boundaries, artwork orientation/fallback, placement, stale/rollback behavior, and responsive/scale cases through 125 selections. After owner deployment, repeated fresh mounted runs passed 27/27 through the production Worker with real TMDB responses and real image-CDN resources; the full repository check also passed 27/27 mounted tests, and the Worker suite passed 16/16. Post-merge Nuvio Contract Validation run [32326423651](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423651) succeeded, as did automatic Pages run [32326423777](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423777). Pages publication was automatic, no manual frontend deployment or merge-time Worker redeployment occurred, and active Worker version `f6bee241-afef-447f-b8f9-3d4b8da460cf` remained in place. This evidence does not constitute a current-client hierarchy round-trip result. Issue #158 supersedes only the old five-poster mobile presentation bound with the shared maximum of 10 and phone 5×2 layout; Network query, cache, count, hierarchy, and Worker semantics remain unchanged.
