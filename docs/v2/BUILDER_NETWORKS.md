# V2 Builder Network Sources

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
- **New Folder → Networks** appends eligible Network Folders beneath the captured existing Collection and leaves that parent byte-identical apart from the intended ordered insertion.

The family follows the shared [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md) architecture and uses **Select → Configure → Appearance → Create**. Select reuses the checked-in Network catalogue, 20-row paging, search ranking, location, logo, result-count wording, Series-count filter, and A–Z/Most series result ordering described above without making a live request or auto-focusing Search. Add Source and guided selection deliberately share those discovery controls and card counts. Guided multi-selection remains insertion-ordered and Add remains single-select.

Selection is exact-ID, insertion-ordered, removable, and uncapped. Removing then reselecting appends the Network. A nonblocking scale notice begins at 50, and the selected disclosure remains bounded. Configure applies one shared Series sort to the whole batch: **Popular** / `popularity.desc` by default, **Recent** / `first_air_date.desc`, **Top rated** / `vote_average.desc`, or **Most voted** / `vote_count.desc`. Search, selection, Configure, Appearance, planning, revalidation, and apply make zero automatic live Discover requests.

Every Configure row exposes one explicit poster-only **Preview** action after sort is known. Before a successful Preview, its single visible `Series Count:` line shows the checked-in catalogue value or Unknown; a successful Preview replaces that value on the same line with the response's `total_results`, while failure retains the catalogue value. The latest successful value may survive sort changes during the wizard, but remains transient UI state outside plans, identity, duplicate logic, stale comparison, and serialization. A cold Preview requests exactly one Network-and-sort TV Discover response and retains upstream first-page order. It renders at most 10 usable posters above 520px or 5 at and below 520px, omits posterless rows, backfills only from that same response page, and shows exactly **No posters available.** when no usable poster remains. It has no media selector because Networks is Series-only. The narrow Discover Preview requester is shared with Studio behind thin family adapters; the flows keep their own endpoint, cache key, and UI state. The response cache is success-only, defaults to five minutes and 40 LRU-style entries, includes successful zero results, and excludes failures, malformed responses, timeouts, aborts, and stale completions.

The tracked Worker source extends only `/3/discover/tv` with one canonical positive safe-integer `with_networks` plus zero or one `sort_by` from the four exact Network values above. It rejects duplicate, extra, mixed Company/Network, Movie, malformed, and unsupported-sort requests before upstream fetch. Existing no-sort Network and Company behavior, fixed upstream host, browser-origin authentication, CORS, API-key stripping, and sanitized failures remain unchanged; Discover is still unavailable through the origin-free service-token path. On 2026-08-20, the owner manually deployed the complete reviewed Worker as version `f6bee241-afef-447f-b8f9-3d4b8da460cf`; the recorded deployment-handoff source SHA-256 was `612955AD3ECCEF16E12E05ABA6B672B0AD68BA825F13419FFA2A0A9346706AD4`, and the post-deployment live sorted-Preview gate passed. The merged tracked Worker Git blob is separately `ceb37bb3711a43d6f25508a98943ce71b53baec2`; the deployment byte hash, Git blob OID, and CRLF-transformed Windows working-tree bytes are distinct identities and are not a byte-equivalence claim.

Appearance defaults to visible Collection title, generated Folder titles **Show everywhere**, Poster, Tabs, Show All on, and Pin off. It exposes only the shared batch-safe Poster/Landscape choice. Artwork resolution uses the exact requested orientation from the existing runtime, then the checked-in safe TMDB `w500` Network logo, then an empty image with 📺. It never substitutes the opposite runtime orientation. One workspace client/load resolves the batch before the ephemeral plan; plan creation, stale revalidation, and apply perform no artwork I/O. Per-Network URLs and focus controls remain ordinary **Edit Folder** work.

Generated names are exact: Collection `Networks`, canonical Network Folder name, and physical source title `Series`. The hierarchy-only constructor emits the same authoritative native `NETWORK/TV` shape and evidenced sort as issue #98 without weakening the selected-folder Add Source validator or adding `catalogSources`. Placement uses only **Ready**, **Already in this collection**, and **Exists elsewhere**; a single-source Network has no Partial state. A matching logical Network anywhere in the New Folder destination Collection is Already and omits that entire Network Folder with no override; project matches outside the destination are informational Elsewhere and remain addable. New Collection treats every project match as informational. Eligible bundles retain selected order and apply through one stale-revalidated atomic controller batch; a late failure creates nothing and advances no revision.

Issue #126 did not change Add Source, physical Source Edit, V1, catalogue maintenance data/writers, the Pages publication mechanism, or the current Nuvio source contract. Issue #182 later changes only the Add/guided discovery projection, filters, and ordering documented above; it adds no request, source, Worker, schema, or serializer behavior. No current-client Network hierarchy import/runtime/export result is claimed. The known client resolver divergence also remains unresolved: retained evidence records NuvioTV adding `with_status=0|3|4` and a null-to-current-date upper bound for native Network sources while NuvioMobile does not. The existing native `NETWORK/TV` evidence is reused; owner Worker deployment, live sorted Preview acceptance, final owner review, PR merge, issue completion, and automatic Pages publication are complete. Merge did not redeploy the Worker.

## Verification boundary

Deterministic coverage lives in `tests/builder-network-foundation.test.mjs`, `tests/builder-network-ui.test.mjs`, the hierarchy suites, the separate test-owned entity-selection capability contract, the shared Source Edit suites, Worker tests, and the normal Builder/compatibility checks. It covers default-versus-opt-in count projection, shared Add/guided filters, A–Z/Most series controls and card counts, hidden Best Match, count-descending and Unknown/tie semantics, page reset, search/ranking/paging, sparse rows, Configure → Back preservation, count success/zero/failure/cache/abort boundaries, all saved-source sorts, exact source output, duplicate override binding, atomic insertion, physical editing, and mobile responsive contracts at 360, 384, 393, 402, and 412 pixels plus desktop.

Owner physical-phone acceptance passed on 2026-08-09. On the physical iPhone, Dave verified the Add Source chooser; Network search with the software keyboard open; empty A–Z browse; numeric Network-name search using `10`; Configure → Back restoration; live Network count presentation; normal source Add; same-folder duplicate and Add anyway; elsewhere duplicate information; known-zero Network presentation, including known-zero stacked with duplicate and elsewhere states; Network Source Edit with keyboard interaction; and Studio both-zero presentation. No horizontal overflow, trapped scrolling, hidden primary actions, or problematic keyboard layout behavior was observed.

The issue #98 automated validation, live Worker acceptance, desktop acceptance, physical-phone acceptance, and final ChatGPT/owner PR review are complete. No Nuvio client import/runtime/export result is claimed by that issue. Issue #126 adds deterministic hierarchy coverage for catalogue count filters, ordered uncapped selection, all four sorts, explicit Preview/cache boundaries, artwork orientation/fallback, placement, stale/rollback behavior, and responsive/scale cases through 125 selections. After owner deployment, repeated fresh mounted runs passed 27/27 through the production Worker with real TMDB responses and real image-CDN resources; the full repository check also passed 27/27 mounted tests, and the Worker suite passed 16/16. Post-merge Nuvio Contract Validation run [32326423651](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423651) succeeded, as did automatic Pages run [32326423777](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423777). Pages publication was automatic, no manual frontend deployment or merge-time Worker redeployment occurred, and active Worker version `f6bee241-afef-447f-b8f9-3d4b8da460cf` remained in place. This evidence does not constitute a current-client hierarchy round-trip result. Issue #158 supersedes only the old five-poster mobile presentation bound with the shared maximum of 10 and phone 5×2 layout; Network query, cache, count, hierarchy, and Worker semantics remain unchanged.
