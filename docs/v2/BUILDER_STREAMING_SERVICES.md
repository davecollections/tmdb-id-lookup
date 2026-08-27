# V2 Streaming Services contract

## 1. Status and scope

Issue [#104](https://github.com/davecollections/tmdb-id-lookup/issues/104) adds Streaming Services as the fifth selected-folder **Add Source** mode.

Hands-on owner acceptance on 11 Aug 2026 established the final interaction:

```text
Add Source → Streaming service → Region(s) → Provider → Configure + generated-source review → Add
```

There is no automatic or locale-derived region, no special single/multiple mode, and no separate Review screen. This remains a focused consumer of [`BUILDER_DISCOVER_CORE.md`](./BUILDER_DISCOVER_CORE.md), not a generic picker, multi-select, navigation, transaction, or creation-plan framework. The completion pass adds only physical Streaming source name/sort editing through the existing Source Edit registry; richer filters, multiple providers, automatic hierarchy, recipes, and V1 behavior remain outside #104.

## 2. Worker catalogue boundary

The deployed, tracked Cloudflare Worker narrowly permits:

```text
GET /3/watch/providers/regions?language=en-US
GET /3/watch/providers/movie?language=en-US
GET /3/watch/providers/tv?language=en-US
```

Each path requires exactly one `language=en-US` parameter. The fixed TMDB upstream, server-side bearer token, browser-origin policy, `GET`/`OPTIONS` policy, incoming credential stripping, sanitized errors, and successful-response cache headers remain unchanged.

The final Region-first refinement adds no Worker route or request. It introduces no normalized endpoint, persistent provider data, scheduled refresh, dependency, or deployment.

## 3. Transient normalized catalogue

One workspace-owned provider requests Regions, Movie providers, and TV providers together. Successful data is cached only in memory for that workspace provider instance; failures remain uncached and retryable.

The normalized provider model keeps only data with an active consumer:

```js
{
  id: 8,
  name: "Netflix",
  logoPath: "/example.png",
  moviePriorities: { AU: 0 },
  tvPriorities: { AU: 0 }
}
```

Movie and TV `display_priorities` remain independent. A valid map code is retained even if its priority is missing or malformed, with `null` priority so availability can remain conservative while ranking sorts it last. The global top-level `display_priority` is deliberately discarded because #104 has no global-provider ranking consumer.

Provider identity requires a positive safe integer ID, a nonblank normalized name, and Movie and/or TV regional availability evidence. Logo data is optional; missing, malformed, and load-failed logos use the established text fallback. Unknown provider-map codes may remain in normalized evidence but are not invented as primary Region-picker rows.

## 4. Region selection

Streaming opens on **Streaming service · Region** with zero selected regions and a compact **Common | A–Z** browse switch. **Common** is selected by default and is an intentionally curated convenience list, not TMDB ranking, popularity, or user analytics:

```text
Australia · AU
Brazil · BR
Canada · CA
France · FR
Germany · DE
India · IN
Japan · JP
Mexico · MX
New Zealand · NZ
South Korea · KR
United Kingdom · GB
United States · US
```

Each configured Common code is resolved from the loaded known Regions catalogue. If TMDB omits a configured code at runtime, Common omits that entry without inventing a name or failing the Region screen. **A–Z** continues to expose every valid known TMDB region, ordered by normalized display name and then code.

Search always covers the complete known Regions catalogue regardless of the active browse mode and matches region name or two-letter code. A nonempty query replaces the browse results; clearing it restores the currently selected Common or A–Z view.

Every row is naturally selectable:

- click/tap an unselected row to append it to the selection;
- click/tap a selected row to remove it;
- deselecting and reselecting appends that region at the end;
- `aria-pressed` and a restrained selected mark expose state without a separate checkbox mode.

Selections persist while switching Common/A–Z, searching, clearing search, and searching for another region. Switching browse mode never changes user selection order. The sticky modal footer reports the singular/plural selected count and keeps **Next** disabled until at least one region is selected. Candidate generation preserves this user selection order, not alphabetical browse order.

Only known Region catalogue rows are shown. Missing provider-map metadata is not surfaced as a selectable code-only row, and no selectable region object or name is inferred from the Common configuration.

## 5. Eligible providers and common availability

After **Next**, the already-loaded Movie/TV regional maps are filtered locally. A provider is eligible only when it has at least one media type common to every selected region:

- **Movies** when Movie availability exists in every selected region;
- **Series** when TV availability exists in every selected region;
- **Movies · Series** when both conditions hold.

A provider that is Movie-only in one selected region and Series-only in another is excluded because Configure could not apply one valid choice across the region bundle. This same common-availability result drives Provider metadata, Configure choices, construction, and validation.

Provider selection remains single-select. Selecting one provider immediately opens Configure; #104 adds no provider checkbox, AND/OR behavior, exclusion UI, or `withoutWatchProviders` support.

## 6. Provider browse and search

For exactly one selected region, the Provider screen offers **Top providers | A–Z**, with Top providers selected by default.

Top providers uses that selected region's actual TMDB `display_priorities` evidence and sorts eligible providers by:

1. lowest valid Movie/TV regional priority;
2. normalized provider name;
3. Provider ID.

Missing or nonnumeric regional priority sorts after valid priority. The result is capped at 30. **Top providers** describes TMDB's regional display order and is not a popularity claim.

For two or more regions, only A–Z browse is used. No average, sum, minimum/maximum composite, coverage count, first-region preference, top-level priority, or other synthetic multi-region score exists.

A–Z always contains the complete eligible set, ordered by normalized name and Provider ID. Same-name IDs remain separate and cards show Provider ID plus common Movies/Series availability.

Search covers only the eligible set. Ranking is exact numeric Provider ID, exact normalized name, prefix, then contains. Inside one tier, one-region search uses selected-region priority before name/ID; multi-region search uses name/ID only. Clearing search restores the selected Top/A–Z mode for one region and A–Z for multiple regions.

Back restores the Region selections. Continuing again invalidates the previous provider and query, recomputes eligibility, and chooses Top for one region or A–Z for multiple regions. Configure Back restores the active Provider context.

## 7. Configure, construction, and titles

Configure shows the selected provider, selected region(s), common Movies/Series/Both choices, Popular/Recent/Top Rated/Most Votes, generated candidates, duplicate outcomes, and Add. If runtime evidence changes and no common media remains, Configure fails safely with concise Back/retry guidance and generates nothing invalid.

The four semantic sorts resolve concrete Movie/TV values only through DISCOVER Core. Every candidate starts with a region-and-media-qualified default:

```text
Netflix, AU - Movies
Netflix, AU - Series
```

Each generated physical-source row exposes a compact **Edit name** action. Movie and Series candidates are independently named, default to `<Provider>, <REGION> - Movies` or `<Provider>, <REGION> - Series`, use the established Nuvio title rule, and can return to the matching media-qualified name through **Use default name**. Name state is keyed by the exact region/media candidate: changing sort preserves it, changing media preserves only candidates that still exist, newly appearing candidates use their default, and incompatible Provider/Region changes cannot leak a previous name. Title is presentation only and remains excluded from DISCOVER identity and duplicate checks.

Candidate order is user-selected region order, then Movie before TV within each region. Streaming-authored filters remain exactly:

```json
{
  "watchRegion": "AU",
  "withWatchProviders": "8"
}
```

Sources remain projection-free native TMDB `DISCOVER` sources with explicit `tmdbId: null`. No Nuvio 0.8.3 exclusion field or Streaming-specific identity logic is added.

## 8. Generated review, duplicates, and atomic insertion

Configure contains the generated-source review and compact ordered rows such as `US · Movies`, `US · Series`, `AU · Movies`, and `AU · Series`, including **To add** or **Already exists** outcomes. This is not the future visual collection Preview feature.

Every candidate is independently compared through DISCOVER Core identity. Opaque and non-comparable imports are not forced into matches; elsewhere occurrences remain informational. Normal Add inserts only missing same-folder identities in candidate order. The existing exact folder/candidate-bound **Add all anyway** behavior remains available.

The final approved array is passed once to `controller.addSourcesToFolder`. The controller constructs the complete batch before one project commit, so failure leaves the project unchanged.

The hardened Streaming validator rebuilds expected candidates through the Streaming/DISCOVER constructors and enforces normalized provider identity, one or more distinct ordered selected regions, common availability, exact count, region order, Movie-before-TV order, unique comparable identities, shared semantic sort, a valid Nuvio title for every physical source, Provider ID, and only `watchRegion` plus `withWatchProviders`. Custom titles do not relax any functional-source field.

## 9. Physical-source editing

The existing source overflow menu exposes **Edit source** only for a simple Streaming-shaped native TMDB `DISCOVER` source: Movie or TV, one uppercase `watchRegion`, one positive `withWatchProviders` ID, no compound providers, no other meaningful filter, no non-null custom `tmdbId`, and no unknown meaningful or malformed/non-comparable data. Other DISCOVER sources remain Delete-only.

The editor changes only Source name and the same four DISCOVER semantic sorts. Provider, Region, media type, filters, category, raw snapshot, source order, and Nuvio-facing source ID remain fixed. Provider presentation is hydrated non-blockingly from the existing transient Streaming catalogue, with `Provider <id>` fallback. **Use default name** appears only after that provider name is reliably resolved and restores `<Provider>, <REGION> - Movies` or `<Provider>, <REGION> - Series`; the editor adds no title count or external identity link. Issue #158 adds an explicit poster-only Preview of the current physical draft without changing that editing boundary. Preview requires one supported sort and sends exactly one Provider ID, one uppercase Region, the fixed media, `include_adult=false`, and the media-correct sort through the strict Worker branch; compound providers and every extra filter remain ineligible.

Dave confirmed deployment of the complete 14,718-byte reviewed Worker source with SHA-256 `94CD976AA642A732D969D535D5F09E09D9B1033DC51B02756FCAF3BB28436E91` on 2026-08-27; no deployment version identifier was supplied. Direct production probes returned live TMDB results for canonical Movie and TV simple-Streaming requests and HTTP 403 for lowercase Region, compound Provider, and extra-parameter requests. This deployment does not publish the uncommitted Builder UI.

An untouched imported unsupported sort remains exact until the user chooses one of the four supported sorts. A sort change changes DISCOVER identity and therefore uses DISCOVER Core for same-folder duplicate rejection; a title change does not. Save uses the established stale-session, validation focus, prominent duplicate alert, difference-only patch, exact source-card focus restoration, and no-op/one-update contracts.

## 10. Attribution and compatibility evidence

The accepted global **About & Credits** modal remains the only TMDB and JustWatch-via-TMDB attribution surface. Streaming Region, Provider, Configure, loading, error, and empty states do not repeat it.

Compatibility evidence remains historical:

- On 9 Aug 2026, a controlled nuvio.tv Account Manager import/export test stripped `watchRegion` and `withWatchProviders`.
- On 10 Aug 2026, the same path preserved both fields.

The stripping behavior is no longer reproducible, so Configure has no compatibility warning.

## 11. Deferred work and acceptance boundary

Deferred work includes logical/bundle Streaming editing, Provider/Region/media replacement, richer Discover/Streaming filters, the Nuvio 0.8.3 exclusion fields, runtime, multiple-provider selection, provider AND/OR semantics, generic multi-select, artwork/cache work, title counts, persistent provider storage, automatic refresh, source-led hierarchy, recipes, and broader Help work.

Repository tests and rendered local QA establish the Region-first natural selection, regional/common provider filtering, strict media, generated review, duplicate behavior, and atomic controller path. Physical-iPhone and Nuvio-client acceptance remain owner evidence and are not inferred from local narrow rendering.
