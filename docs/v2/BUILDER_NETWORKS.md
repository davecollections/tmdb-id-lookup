# V2 Builder Network Sources

Status: implemented on the review branch for issue [#98](https://github.com/davecollections/tmdb-id-lookup/issues/98)

Last reviewed: 2026-08-08

## Scope

The first Network slice adds one native TMDB Network Series source to an existing selected folder:

1. open **Add source** and choose **Networks**;
2. browse or search the checked-in Network catalogue;
3. select exactly one Network;
4. review its fixed Series identity and automatic current Series Count;
5. choose a supported sort;
6. review same-folder and elsewhere duplicate evidence; and
7. insert exactly one native `NETWORK` / `TV` source through the existing atomic controller path.

The issue does not create collections or folders, add Network artwork to sources, change the catalogue refresh pipeline, regenerate checked-in data, implement Network multi-select, add another source family, or deploy the Worker.

## Catalogue discovery

The Builder lazily loads `data/tv-networks.min.json` and normalizes only bounded presentation and search fields. Empty input automatically enters a deterministic A–Z browse. Typed search uses a hidden Best Match order across exact name, name prefix, name contains, and country/location metadata; an exact canonical positive integer selects by TMDB ID. Country matching supports the represented two-letter code, full country name, useful aliases, and compact headquarters context. Results are paged at 20 rows.

The compact catalogue's historical `t` field is deliberately outside the Network contract. Normalization drops it. Search text, relevance, filtering, browse order, paging, result display, selection identity, source construction, and serialization never read it. Network cards show a contained logo or restrained text fallback, Network name, compact country/location, and quiet `TMDB <id>` only. They never show a cached or live title count.

Malformed rows are skipped. Sparse valid rows remain selectable with the available name and ID. Catalogue load failures are sanitized and retryable; failed loads are not cached. A successful normalized catalogue is reused in memory.

## Configure and count boundary

Selecting a Network opens Configure without discarding Search query, page, scroll position, or logical result focus. The fixed identity includes a canonical external `https://www.themoviedb.org/network/<id>` link. The UI presents one Series source and no Movie choice.

Selection starts one structured request:

```text
GET /3/discover/tv?with_networks={positive integer}
```

The request times out after approximately 12 seconds, supports caller abort, and rejects stale completions when the selection or modal changes. Only successful non-negative safe-integer `total_results` values enter the five-minute, 40-entry bounded in-memory cache. Positive and zero values render as `Series Count: N`; malformed, failed, or timed-out responses render the quiet `Count unavailable` state. Count state is informational, has no Retry or Refresh control, and never blocks Add or Save.

The tracked Worker source now permits TV Discover with exactly one of `with_companies` or `with_networks`. Movie Discover remains Company-only. Missing, mixed, duplicate, zero, signed, fractional, unsafe, malformed, and extra query parameters fail before upstream fetch. Host, CORS, authentication, caching, API-key stripping, and sanitized-error behavior remain unchanged. This branch changes code only: it does not deploy the Worker, so live Network counts remain unavailable until an explicitly authorized operator deploys the reviewed Worker source.

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

No Nuvio client import/runtime/export result is claimed by this issue. The existing repository and current-client evidence supports native `NETWORK` / `TV` resolution, while this focused implementation is stopped at a green draft PR for review. Worker deployment, production count verification, and any later client acceptance remain separate explicit actions.
