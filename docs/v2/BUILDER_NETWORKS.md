# V2 Builder Network Sources

Status: implemented on the review branch for issue [#98](https://github.com/davecollections/tmdb-id-lookup/issues/98)

Last reviewed: 2026-08-09

## Scope

The first Network slice adds one native TMDB Network Series source to an existing selected folder:

1. open **Add source** and choose **Networks**;
2. browse or search the checked-in Network catalogue;
3. select exactly one Network;
4. review its fixed Series identity and automatic current Series Count;
5. choose a supported sort;
6. review same-folder and elsewhere duplicate evidence; and
7. insert exactly one native `NETWORK` / `TV` source through the existing atomic controller path.

The issue does not create collections or folders, add Network artwork to sources, change the catalogue refresh pipeline, regenerate checked-in data, implement Network multi-select, or add another source family. Worker deployment remained a separate explicitly authorized acceptance action.

## Catalogue discovery

The Builder lazily loads `data/tv-networks.min.json` and normalizes only bounded presentation and search fields. Empty input automatically enters a deterministic A–Z browse. Typed search uses a hidden Best Match order across exact name, name prefix, name contains, and country/location metadata; an exact canonical positive integer selects by TMDB ID. Country matching supports the represented two-letter code, full country name, useful aliases, and compact headquarters context. Results are paged at 20 rows.

The compact catalogue's `t` field is deliberately outside the Builder Network contract. In the maintenance data, explicit zero is a confirmed zero-series result and an absent field is unknown; Builder normalization drops both states. Search text, relevance, filtering, browse order, paging, result display, selection identity, source construction, and serialization never read it. Network cards show a contained logo or restrained text fallback, Network name, compact country/location, and quiet `TMDB <id>` only. They never show a cached or live title count.

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

## Verification boundary

Deterministic coverage lives in `tests/builder-network-foundation.test.mjs`, `tests/builder-network-ui.test.mjs`, the shared Source Edit suites, Worker tests, and the normal Builder/compatibility checks. It covers legacy-`t` exclusion, search/ranking/paging, sparse rows, count success/zero/failure/cache/abort boundaries, all sorts, exact source output, projection exclusion, duplicate override binding, atomic insertion, physical editing, and mobile responsive contracts at 360, 384, 393, 402, and 412 pixels plus desktop.

Owner physical-phone acceptance passed on 2026-08-09. On the physical iPhone, Dave verified the Add Source chooser; Network search with the software keyboard open; empty A–Z browse; numeric Network-name search using `10`; Configure → Back restoration; live Network count presentation; normal source Add; same-folder duplicate and Add anyway; elsewhere duplicate information; known-zero Network presentation, including known-zero stacked with duplicate and elsewhere states; Network Source Edit with keyboard interaction; and Studio both-zero presentation. No horizontal overflow, trapped scrolling, hidden primary actions, or problematic keyboard layout behavior was observed.

Automated validation, live Worker acceptance, desktop acceptance, physical-phone acceptance, and final ChatGPT/owner PR review are complete. No Nuvio client import/runtime/export result is claimed by this issue. The existing repository and current-client evidence supports native `NETWORK` / `TV` resolution. Merge state is tracked by GitHub.
