# V2 Streaming Services contract

## 1. Status and scope

Last reviewed: 2026-09-02

Issue [#104](https://github.com/davecollections/tmdb-id-lookup/issues/104) added Streaming Services as the fifth selected-folder **Add Source** mode. The separate guided **New Collection** and **New Folder** hierarchy family is complete through issue [#162](https://github.com/davecollections/tmdb-id-lookup/issues/162) / merged [PR #163](https://github.com/davecollections/tmdb-id-lookup/pull/163) at `f88d9f7846e093acc456158e9c495cbf263c08c8` after owner desktop and physical-phone acceptance.

Hands-on owner acceptance on 11 Aug 2026 established the final interaction:

```text
Add Source → Streaming service → Region(s) → Provider → Configure + generated-source review → Add
```

There is no automatic or locale-derived region, no special single/multiple mode, and no separate Review screen in the physical Add Source flow. That flow remains a focused consumer of [`BUILDER_DISCOVER_CORE.md`](./BUILDER_DISCOVER_CORE.md), and its completion pass adds only physical Streaming source name/sort editing through the existing Source Edit registry. Issue #162 reuses its catalogue, canonical constructors, identity, Preview provider, and physical editor without conflating the two entry points.

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

Streaming opens on **Choose regions** with zero selected regions and a compact **Common | A–Z** browse switch. The helper explains that services shown next must support the subsequently chosen media in every selected Region. **Common** is selected by default and is an intentionally curated convenience list, not TMDB ranking, popularity, or user analytics:

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

The four semantic sorts resolve concrete Movie/TV values only through DISCOVER Core. Issue #162 supersedes only the default grammar for newly generated standalone physical sources; persisted and custom titles are not migrated. Every candidate now starts with:

```text
Netflix Movies (AU)
Netflix Series (AU)
```

Each generated physical-source row exposes a compact **Edit name** action. Movie and Series candidates are independently named, default to `<Provider> Movies (<REGION>)` or `<Provider> Series (<REGION>)`, use the established Nuvio title rule, and can return to the matching media-qualified name through **Use default name**. Name state is keyed by the exact region/media candidate: changing sort preserves it, changing media preserves only candidates that still exist, newly appearing candidates use their default, and incompatible Provider/Region changes cannot leak a previous name. Title is presentation only and remains excluded from DISCOVER identity and duplicate checks.

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

The editor changes only Source name and the same four DISCOVER semantic sorts. Provider, Region, media type, filters, category, raw snapshot, source order, and Nuvio-facing source ID remain fixed. Provider presentation is hydrated non-blockingly from the existing transient Streaming catalogue, with `Provider <id>` fallback. **Use default name** appears only after that provider name is reliably resolved and restores `<Provider> Movies (<REGION>)` or `<Provider> Series (<REGION>)`; the editor adds no title count or external identity link. Issue #158 adds an explicit poster-only Preview of the current physical draft without changing that editing boundary. Preview requires one supported sort and sends exactly one Provider ID, one uppercase Region, the fixed media, `include_adult=false`, and the media-correct sort through the strict Worker branch; compound providers and every extra filter remain ineligible.

Dave confirmed deployment of the complete 14,718-byte reviewed Worker source with SHA-256 `94CD976AA642A732D969D535D5F09E09D9B1033DC51B02756FCAF3BB28436E91` on 2026-08-27; no deployment version identifier was supplied. Direct production probes returned live TMDB results for canonical Movie and TV simple-Streaming requests and HTTP 403 for lowercase Region, compound Provider, and extra-parameter requests. This deployment does not publish the Builder UI.

An untouched imported unsupported sort remains exact until the user chooses one of the four supported sorts. A sort change changes DISCOVER identity and therefore uses DISCOVER Core for same-folder duplicate rejection; a title change does not. Save uses the established stale-session, validation focus, prominent duplicate alert, difference-only patch, exact source-card focus restoration, and no-op/one-update contracts.

## 10. Attribution and compatibility evidence

The accepted global **About & Credits** modal remains the only TMDB and JustWatch-via-TMDB attribution surface. Streaming Region, Provider, Configure, loading, error, and empty states do not repeat it.

Compatibility evidence remains historical:

- On 9 Aug 2026, a controlled nuvio.tv Account Manager import/export test stripped `watchRegion` and `withWatchProviders`.
- On 10 Aug 2026, the same path preserved both fields.

The stripping behavior is no longer reproducible, so Configure has no compatibility warning.

## 11. Guided hierarchy creation — issue #162

Streaming Services is the seventh guided hierarchy family and is registered after Genres for both shared scopes:

```text
New Collection / New Folder → Streaming Services
Choose Regions → Choose providers → Configure → Review & Appearance → Create
```

The hierarchy flow preserves ordered multi-Region and multi-provider selection with no arbitrary provider cap. One global Movies/Series/Both choice filters providers conservatively: every chosen provider must support the requested media in every selected Region. When Region or media changes, selected services are retained in their existing order whenever they remain eligible; only newly ineligible provider IDs are pruned, with one calm contextual notice when pruning occurs and no substitute selection. Search is deliberate and never auto-focused or used to summon the mobile keyboard on entry.

Configure owns one shared Streaming Sort and, only for multiple Regions, one folder grouping:

- **Group regions by service** is the default and creates one folder per provider.
- **Separate folders by region** creates one folder per provider and Region in provider-major, selected-Region order.
- Sources remain selected-Region order and Movie-before-TV within each Region.
- Exact totals are `P × R × M` physical sources, with `P` grouped folders or `P × R` separate folders.

Configure begins with compact run-level Region and Media context before Sort and Grouping. Review repeats the complete read-only run context: Regions, Media, selected services, Sort, and meaningful multi-Region Grouping. Small selections are direct; larger Region/provider sets use the established collapsed count/disclosure treatment rather than an unbounded inline list.

One explicit context-aware name helper owns all new defaults without migrating persisted or custom titles:

- standalone Add/Edit regeneration: `Netflix Movies (AU)` / `Netflix Series (AU)`;
- grouped hierarchy: folder `Netflix`, sources `Movies (AU)` / `Series (AU)`;
- separate hierarchy: folder `Netflix (AU)`, sources `Movies` / `Series`.

Provider logos are transient selection/configuration identity and are not persisted as folder artwork. New folders leave unknown artwork fields unassigned, while every artwork and focus field on reused existing folders is preserved exactly. Collection and folder title/layout controls reuse the shared hierarchy presentation contract, while New Folder leaves its parent Collection byte-for-byte unchanged. Review exposes one initially collapsed **Folder names** editor for new folders only, keyed by stable provider or provider/Region logical identity. Generated names can be replaced with any title accepted by ordinary Folder settings or restored through **Use default name**. Surviving logical folders retain their draft across Back/Review; removed keys are discarded. Reused existing folders are read-only and retain imported/custom titles exactly. Folder-title edits never change provider/Region/media/Sort identity or deterministic source names. Review does not show a temporary artwork-availability warning.

Preview is explicit and exact. Opening a provider Preview requests only its first selected Region and first applicable media; Region and media selectors appear only when useful and request newly visited exact sources lazily. The existing strict Streaming requester/provider, bounded success cache, nested focus-safe dialog, Retry behavior, and poster-only grid remain authoritative. At most ten real posters are shown and Preview never mutates the plan or project.

The framework-independent ephemeral planner creates only ordinary Collection, Folder, and canonical simple native Streaming DISCOVER source drafts. It revalidates immediately before Apply. Display titles are never placement identity:

- grouped placement trusts only contained canonical simple Streaming evidence consistently identifying one provider;
- separate placement also requires one consistent Region;
- partial trusted folders receive only missing exact sources;
- an exact destination source is complete and an exact occurrence elsewhere is informational;
- the same provider/Region/media slot with a different Sort blocks Apply;
- mixed providers, mixed Regions where Region is required, opaque Streaming evidence, unsupported shapes, and multiple logical candidates fail closed;
- no source is moved, renamed, deleted, or globally deduplicated.

New Collection plans directly reuse ordinary Streaming Add Source's project-wide `inspectStreamingSourceDuplicates` evidence with a null destination. Title is excluded; provider, Region, media, Sort, and canonical filters remain authoritative. No overlap is quiet. Partial overlap reports the exact matched/proposed source count and compact provider/location evidence. Complete overlap warns that all proposed physical sources exist elsewhere without claiming the same hierarchy structure. Duplicate evidence is part of the ephemeral plan and the normal rebuild rejects materially changed evidence before mutation.

Review offers an explicit destination choice rather than assuming a route. Candidate discovery recognizes two independent levels of trust. Exact proposed-source overlap remains the strongest signal. A zero-overlap Collection may also qualify by content-derived Streaming affinity when at least one effective preserved/imported native TMDB Movie or TV `DISCOVER` source has a valid positive watch-provider expression and an uppercase two-letter Watch Region. This read-only affinity inspection accepts canonical camel-case and preserved snake-case aliases, compound provider expressions, and unrelated extra Discover filters; conflicting aliases and malformed values fail closed. Collection/Folder/Source titles, provider-named TMDB Lists, artwork, addon sources, and network-only Discover sources do not establish affinity.

Affinity broadens Collection discovery only. It does not make a rich imported source a canonical simple Streaming source, an exact duplicate, or trustworthy folder-placement evidence. Candidate discovery does not implement a second merge planner: every exact-overlap or affinity Collection rebuilds the same ordinary existing-Collection Streaming plan used by New Folder and is offered only when that full plan is safe. Strict existing-folder reuse still requires the established canonical simple contained-source evidence; a new provider in an affinity-only imported Collection therefore receives a new sibling Folder. Relevant ambiguous/mixed/opaque outcomes still exclude the Collection, while a different-Sort conflict retains its normal visible blocking behavior. Safe candidates with exact matches rank by distinct proposed exact source count descending, affinity-only zero-overlap candidates follow in current project order, and the list never auto-selects. **Create new collection instead** remains an explicit alternative and explains that it will create all selected sources in a separate Collection.

Destination labels are UI-only. A unique visible Collection title stays unchanged. Equal visible titles are disambiguated in current project order as `<title> · Collection 1`, `<title> · Collection 2`, and so on; reordering the project recomputes those labels without changing identity, plans, or persisted titles. The same label is used on destination cards, matching-location disclosures, the selected Review, and **Nothing to add**. Duplicate-title cards may add reliable `Currently: <folders> · <sources>` context. Partial cards say `<matched> of <selected> sources already here · <missing> will be added`; complete cards say `All <selected> selected sources already exist here · nothing to add`. Affinity-only cards identify an **Existing Streaming collection**, always show reliable Folder/Source counts, and say `None of the selected sources are here yet · all <missing> sources will be added` without claiming an exact match.

Selecting an existing Collection makes its rebuilt plan the only active Review. It reports **What will change**, preserves inherited Collection settings and reused Folder titles, exposes names only for folders that plan would create, and applies solely through the existing atomic Collection-extension operation. Selecting **New Collection** restores the full **What will be created** review, Collection-title state, and all logical new-Folder name drafts. Switching between routes does not discard those dormant drafts. If a selected candidate disappears or becomes ambiguous as the project changes, Review clears the selection and requires a new explicit choice; final Apply still performs the ordinary stale-plan rebuild before mutation.

A complete existing destination has a calm **Nothing to add** state, identifies the same display-only destination label, says **No project changes are needed**, and provides a non-mutating **Close** action. Deliberate duplicate creation remains available only after selecting **Create new collection instead**, where the existing explicit **Create duplicate collection** confirmation still applies. The whole proposed hierarchy count is unchanged because the user may deliberately create another Collection.

Review calls a New Collection result **What will be created** and reports its full Collection/Folder/Source counts. Existing-Collection Review calls the result **What will change** and reports only the mutation delta: existing folders updated, new folders, and sources to add. Placement rows separate an **Existing folder** or **New folder** status from plain-language already-present/add/create counts. The existing parent copy is **Collection settings stay unchanged**; any folder presentation or name controls apply only to new folders.

Owner review on 2026-08-28 confirmed the mixed atomic case from an existing `Apple TV` folder containing `Movies (AU)` and `Series (AU)`: selecting Apple TV plus Dekkoo, AU plus US, Both, Popular, and grouped-by-service reports one existing folder updated, one new folder, and six sources to add. Apply appends Apple TV US Movies/Series, creates Dekkoo with all four AU/US Movies/Series sources, preserves the existing folder title, and advances exactly one revision.

New Collection continues through `createCollectionsWithFoldersAndSources`. Existing Collection plans may need to append sources to several trusted folders and create additional folders together. The focused controller audit found no existing operation with both capabilities: guided families used `createCollectionsWithFoldersAndSources`, `createFoldersWithSources`, or single-folder `addSourcesToFolder`. Issue #162 therefore adds the narrow family-independent `extendCollectionWithFoldersAndSources(collectionInternalId, { existingFolderAdditions, newFolders })` operation. It validates all internal-ID targets and complete bundles before constructing one detached candidate, checks project-wide ID uniqueness, and commits once. A true empty batch is a zero-revision no-op. It does not expose deletion, movement, rename, presentation updates, cross-Collection work, or a generic transaction callback. Imported Collection/Folder raw overlays, opaque/unknown children, existing sibling order, and existing source order remain unchanged; failed validation, late factory failure, and ID collision leave the project revision and content unchanged.

The mounted hierarchy suite covers 360, 384, 393, 402, 412, 899, 900, 901, and 1280 pixels. Its live Apple TV Store/Dekkoo AU+US New Collection path starts with three existing Collections sharing the visible `Streaming Services` title. It renders project-order **Collection 1/2/3** labels consistently across ranked cards, matching disclosures, and selected Review; shows exact partial deltas and reliable Folder/Source context; and makes no automatic choice. The scenario switches New → existing → New without losing Collection or new-Folder title drafts, proves the selected candidate's honest one-existing/one-new/six-source delta, blocks invalid naming, preserves both unselected Collections byte-for-byte, preserves every existing custom cover/hero/logo/focus field, leaves new unknown artwork unassigned, performs zero mutation before Apply, and commits only the selected Collection in one revision without creating another Collection. The same responsive checks confirm no horizontal overflow, retain selected Region border/surface/structural inset without a marker or cyan left rail, and prove ordered selected-service reconciliation for no-prune, partial-prune, and all-pruned Media/Region changes, including Netflix AU Both → Movies/Series and the compact three-folder name editor. The 393px and 900px cases use the production Worker, real TMDB catalogue/Discover responses, and real `image.tmdb.org` posters for exact AU/US Movie/TV Streaming requests.

A second deterministic mounted path at all nine widths imports an owner-style `Streaming Services` Collection with two richly configured folders and six mixed sources: compound-provider and alias-form Discover sources, TMDB Lists, a Trakt source, a network-only Discover source, custom artwork/focus values, and unknown preserved fields. A newly selected Crunchyroll AU Movie/TV pair has zero exact overlap, yet the Collection is offered by its content affinity with the explicit zero-overlap copy. Selecting it produces a `0 existing folders / 1 new folder / 2 sources` Review and one atomic Apply. The original Collection identity/settings/raw overlay and every existing Folder/source/serialized output remain exact while a text-only Crunchyroll sibling receives only the two new canonical sources. A deterministic mounted unique-title complete-overlap path separately proves clean unsuffixed labels, exact **Nothing to add** / **No project changes are needed** copy, and a zero-mutation Close route, while **Create new collection instead** retains confirmation and creates one duplicate only after acknowledgement. Deterministic coverage also proves project-order relabeling, exact-before-affinity ranking, title/list/artwork/network-only negative cases, strict Collection-versus-Folder trust, single selected-destination mutation, unsafe exclusion with raw evidence retained, Sort-conflict visibility, stale rejection, no/partial/complete overlap, title-independent identity, 20/50/100 provider selection, naming, counts/order, rollback, artwork preservation, and Add Source/Source Edit regressions. Owner desktop and physical-phone review is complete and approved. PR #163 is merged; no separate current-Nuvio runtime/import/export round-trip validation is claimed.

## 12. Deferred work and acceptance boundary

Deferred work includes logical/bundle Streaming editing, Provider/Region/media replacement in existing bundles, richer Discover/Streaming filters, the Nuvio 0.8.3 exclusion fields, runtime, provider AND/OR source semantics, generic cross-family multi-select, automatic provider-logo Folder artwork, title counts, persistent provider storage, automatic refresh, recipes, and broader Help work.

Repository tests and mounted production-path QA establish the Region-first natural selection, regional/common provider filtering, strict media, generated review, duplicate behavior, hierarchy placement, responsive behavior, Preview, and atomic controller paths. Owner desktop and physical-phone acceptance is recorded above. Separate current-Nuvio runtime/import/export round-trip validation remains outside issue #162 and is not inferred from local rendering.
