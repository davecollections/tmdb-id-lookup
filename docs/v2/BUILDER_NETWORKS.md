# V2 Builder Network Sources

Status: physical Add Source merged through issue [#98](https://github.com/davecollections/tmdb-id-lookup/issues/98) / PR [#99](https://github.com/davecollections/tmdb-id-lookup/pull/99); hierarchy issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) is closed/completed through merged [PR #127](https://github.com/davecollections/tmdb-id-lookup/pull/127) at `10a76aeffd351341321ab56658e69858fb85d39c`, after owner Worker deployment, live sorted-Preview validation, and owner review

Last reviewed: 2026-08-20

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

The Builder lazily loads `data/tv-networks.min.json` and normalizes only bounded presentation and search fields. Empty input automatically enters a deterministic A–Z browse. Typed search uses a hidden Best Match order across exact name, name prefix, name contains, and country/location metadata; an exact canonical positive integer selects by TMDB ID. Country matching supports the represented two-letter code, full country name, useful aliases, and compact headquarters context. Results are paged at 20 rows.

For selected-folder Add Source, the compact catalogue's `t` field remains deliberately outside the public Network projection. The Add Source projection omits both a retained valid count and Unknown. Add Source search text, relevance, filtering, browse order, paging, result display, selection identity, source construction, and serialization never read it. Its Network cards continue to show a contained logo or restrained text fallback, Network name, compact country/location, and quiet `TMDB <id>` only; they never show a cached or live title count.

Issue #126 adds a separate hierarchy-only catalogue projection. It preserves a valid non-negative safe-integer `t` as the checked-in Series Count, treats a missing or invalid value as Unknown, and does not change Add Source's public result shape or cards.

Malformed rows are skipped. Sparse valid rows remain selectable with the available name and ID. Catalogue load failures are sanitized and retryable; failed loads are not cached. A successful normalized catalogue is reused in memory.

## Configure and count boundary

Selecting a Network opens Configure without discarding Search query, page, scroll position, or logical result focus. The fixed identity includes a canonical external `https://www.themoviedb.org/network/<id>` link. The UI presents one Series source and no Movie choice.

Selection starts one structured request:

```text
GET /3/discover/tv?with_networks={positive integer}
```

The request times out after approximately 12 seconds, supports caller abort, and rejects stale completions when the selection or modal changes. Only successful non-negative safe-integer `total_results` values enter the five-minute, 40-entry bounded in-memory cache. Positive and zero values render as `Series Count: N`; a ready zero also shows a quiet amber explanation that TMDB currently returns no series and that Add remains available. Source Edit uses the same concise zero explanation without Add wording. Malformed, failed, or timed-out responses render the quiet `Count unavailable` state. Count state is informational, has no Retry or Refresh control, and never blocks Add or Save.

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

Networks is registered in both shared hierarchy launcher scopes while selected-folder Add Source retains the issue #98 behavior above:

- **New Collection → Networks** defaults to one ordinary editable `Networks` Collection with one Network Folder per eligible selection.
- **New Folder → Networks** appends eligible Network Folders beneath the captured existing Collection and leaves that parent byte-identical apart from the intended ordered insertion.

The family follows the shared [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md) architecture and uses **Select → Configure → Appearance → Create**. Select reuses the checked-in Network catalogue, 20-row paging, search ranking, location, and logo treatment without making a live request or auto-focusing Search. Hierarchy cards add exact `Series Count: N` wording, including zero, or `Series Count: Unknown` only for a missing or invalid checked-in value. The hierarchy-only filter order is **All**, **Exclude 0**, **10+**, **50+**, **100+**, and **500+**. All retains known positive, zero, and Unknown values; Exclude 0 removes only known zero and retains Unknown; a numeric threshold retains only known values at or above that threshold. Filtering precedes paging, a change returns to page 1 without disturbing selection/configuration/order, and no Most-series ordering is introduced. Add Source continues to omit catalogue counts.

Selection is exact-ID, insertion-ordered, removable, and uncapped. Removing then reselecting appends the Network. A nonblocking scale notice begins at 50, and the selected disclosure remains bounded. Configure applies one shared Series sort to the whole batch: **Popular** / `popularity.desc` by default, **Recent** / `first_air_date.desc`, **Top rated** / `vote_average.desc`, or **Most voted** / `vote_count.desc`. Search, selection, Configure, Appearance, planning, revalidation, and apply make zero automatic live Discover requests.

Every Configure row exposes one explicit poster-only **Preview** action after sort is known. Before a successful Preview, its single visible `Series Count:` line shows the checked-in catalogue value or Unknown; a successful Preview replaces that value on the same line with the response's `total_results`, while failure retains the catalogue value. The latest successful value may survive sort changes during the wizard, but remains transient UI state outside plans, identity, duplicate logic, stale comparison, and serialization. A cold Preview requests exactly one Network-and-sort TV Discover response and retains upstream first-page order. It renders at most 10 usable posters above 520px or 5 at and below 520px, omits posterless rows, backfills only from that same response page, and shows exactly **No posters available.** when no usable poster remains. It has no media selector because Networks is Series-only. The narrow Discover Preview requester is shared with Studio behind thin family adapters; the flows keep their own endpoint, cache key, and UI state. The response cache is success-only, defaults to five minutes and 40 LRU-style entries, includes successful zero results, and excludes failures, malformed responses, timeouts, aborts, and stale completions.

The tracked Worker source extends only `/3/discover/tv` with one canonical positive safe-integer `with_networks` plus zero or one `sort_by` from the four exact Network values above. It rejects duplicate, extra, mixed Company/Network, Movie, malformed, and unsupported-sort requests before upstream fetch. Existing no-sort Network and Company behavior, fixed upstream host, browser-origin authentication, CORS, API-key stripping, and sanitized failures remain unchanged; Discover is still unavailable through the origin-free service-token path. On 2026-08-20, the owner manually deployed the complete reviewed Worker as version `f6bee241-afef-447f-b8f9-3d4b8da460cf`; the recorded deployment-handoff source SHA-256 was `612955AD3ECCEF16E12E05ABA6B672B0AD68BA825F13419FFA2A0A9346706AD4`, and the post-deployment live sorted-Preview gate passed. The merged tracked Worker Git blob is separately `ceb37bb3711a43d6f25508a98943ce71b53baec2`; the deployment byte hash, Git blob OID, and CRLF-transformed Windows working-tree bytes are distinct identities and are not a byte-equivalence claim.

Appearance defaults to visible Collection title, generated Folder titles **Show everywhere**, Poster, Tabs, Show All on, and Pin off. It exposes only the shared batch-safe Poster/Landscape choice. Artwork resolution uses the exact requested orientation from the existing runtime, then the checked-in safe TMDB `w500` Network logo, then an empty image with 📺. It never substitutes the opposite runtime orientation. One workspace client/load resolves the batch before the ephemeral plan; plan creation, stale revalidation, and apply perform no artwork I/O. Per-Network URLs and focus controls remain ordinary **Edit Folder** work.

Generated names are exact: Collection `Networks`, canonical Network Folder name, and physical source title `Series`. The hierarchy-only constructor emits the same authoritative native `NETWORK/TV` shape and evidenced sort as issue #98 without weakening the selected-folder Add Source validator or adding `catalogSources`. Placement uses only **Ready**, **Already in this collection**, and **Exists elsewhere**; a single-source Network has no Partial state. A matching logical Network anywhere in the New Folder destination Collection is Already and omits that entire Network Folder with no override; project matches outside the destination are informational Elsewhere and remain addable. New Collection treats every project match as informational. Eligible bundles retain selected order and apply through one stale-revalidated atomic controller batch; a late failure creates nothing and advances no revision.

Issue #126 does not change Add Source, physical Source Edit, V1, catalogue maintenance data/writers, the Pages publication mechanism, or the current Nuvio source contract. No current-client Network hierarchy import/runtime/export result is claimed. The known client resolver divergence also remains unresolved: retained evidence records NuvioTV adding `with_status=0|3|4` and a null-to-current-date upper bound for native Network sources while NuvioMobile does not. The existing native `NETWORK/TV` evidence is reused; owner Worker deployment, live sorted Preview acceptance, final owner review, PR merge, issue completion, and automatic Pages publication are complete. Merge did not redeploy the Worker.

## Verification boundary

Deterministic coverage lives in `tests/builder-network-foundation.test.mjs`, `tests/builder-network-ui.test.mjs`, the shared Source Edit suites, Worker tests, and the normal Builder/compatibility checks. It covers legacy-`t` exclusion, search/ranking/paging, sparse rows, count success/zero/failure/cache/abort boundaries, all sorts, exact source output, projection exclusion, duplicate override binding, atomic insertion, physical editing, and mobile responsive contracts at 360, 384, 393, 402, and 412 pixels plus desktop.

Owner physical-phone acceptance passed on 2026-08-09. On the physical iPhone, Dave verified the Add Source chooser; Network search with the software keyboard open; empty A–Z browse; numeric Network-name search using `10`; Configure → Back restoration; live Network count presentation; normal source Add; same-folder duplicate and Add anyway; elsewhere duplicate information; known-zero Network presentation, including known-zero stacked with duplicate and elsewhere states; Network Source Edit with keyboard interaction; and Studio both-zero presentation. No horizontal overflow, trapped scrolling, hidden primary actions, or problematic keyboard layout behavior was observed.

The issue #98 automated validation, live Worker acceptance, desktop acceptance, physical-phone acceptance, and final ChatGPT/owner PR review are complete. No Nuvio client import/runtime/export result is claimed by that issue. Issue #126 adds deterministic hierarchy coverage for catalogue count filters, ordered uncapped selection, all four sorts, explicit Preview/cache boundaries, artwork orientation/fallback, placement, stale/rollback behavior, and responsive/scale cases through 125 selections. After owner deployment, repeated fresh mounted runs passed 27/27 through the production Worker with real TMDB responses and real image-CDN resources; the full repository check also passed 27/27 mounted tests, and the Worker suite passed 16/16. Post-merge Nuvio Contract Validation run [32326423651](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423651) succeeded, as did automatic Pages run [32326423777](https://github.com/davecollections/tmdb-id-lookup/actions/runs/32326423777). Pages publication was automatic, no manual frontend deployment or merge-time Worker redeployment occurred, and active Worker version `f6bee241-afef-447f-b8f9-3d4b8da460cf` remained in place. This evidence does not constitute a current-client hierarchy round-trip result. Issue #158 supersedes only the old five-poster mobile presentation bound with the shared maximum of 10 and phone 5×2 layout; Network query, cache, count, hierarchy, and Worker semantics remain unchanged.
