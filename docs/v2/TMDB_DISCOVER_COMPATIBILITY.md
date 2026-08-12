# TMDB Discover compatibility — historical July 2026 audit and current addendum

Reviewed: **2026-07-23**

Issue: [#47 — Audit TMDB Discover filter compatibility across Nuvio clients](https://github.com/davecollections/tmdb-id-lookup/issues/47)

Evidence: official TMDB documentation/OpenAPI, pinned public Nuvio source, local builder source/tests, owner-supplied Windows editor screenshots, and owner-controlled result/preservation observations on Nuvio Desktop `0.1.14-alpha` (14) and retained official iOS `1.2.23` (96). No direct TMDB requests or NuvioTV device run were made.

The normalized row-level artifact is [`manual-tests/tmdb-discover/compatibility-matrix.json`](../../manual-tests/tmdb-discover/compatibility-matrix.json). It is generated deterministically from [`scripts/lib/tmdb-discover-compatibility.mjs`](../../scripts/lib/tmdb-discover-compatibility.mjs) and keeps official acceptance, JSON deserialization, request mapping, defaults, preservation, and visible-result evidence separate. Completed device evidence is recorded in [`OWNER_RESULTS_2026-07-23.md`](../../manual-tests/tmdb-discover/OWNER_RESULTS_2026-07-23.md) and normalized in [`owner-results-2026-07-23.json`](../../manual-tests/tmdb-discover/owner-results-2026-07-23.json).

## Current 18-field addendum — issue #106

Issue [#106](https://github.com/davecollections/tmdb-id-lookup/issues/106), reviewed 2026-08-12, supersedes the audit's current-contract conclusion but does not rewrite its dated matrices, fixtures, owner results, or build-scoped counts. Current NuvioTV `f6e504868765aa6e5657c383723bdd2a9e6ebf7b` and NuvioMobile `f9ad843b14cd3be7fa3ddb800b6961233e0e5b56` persist the same 18 fields: the original 14 plus `withoutGenres`, `withoutKeywords`, `withoutCompanies`, and `withoutWatchProviders`. All four are nullable strings for Movie and TV and map literally to `without_genres`, `without_keywords`, `without_companies`, and `without_watch_providers`.

Included or excluded watch-provider filtering activates the same effective region rule: explicit nonblank `watchRegion` is authoritative, while missing/null/blank active region has effective value `US`. The inferred `US` is runtime/comparison-only and is not inserted into persisted JSON. Current evidence is insufficient to normalize exclusion expression ordering safely, so Builder keeps exclusion comparison exact and order-sensitive while still using strict ID-expression validation for canonical construction.

The NuvioTV local web-config projection still appears to model only the older 14 fields and may be lossy for exclusions in that adapter path. This upstream caveat does not change the authoritative 18-field persisted contract and is not worked around in Builder.

Every unqualified “current” statement in the historical sections below refers to the 2026-07-23 issue #47 snapshots unless a later addendum explicitly says otherwise.

## Historical July executive answer

TMDB currently documents **38 Movie Discover parameters** and **33 TV Discover parameters**. Those totals include request controls and `sort_by`; the content-filter/context subsets are **35 Movie** and **29 TV**.

Current NuvioTV and NuvioMobile both declare the same **14 camelCase JSON filter fields**. There are **0 TV-only model fields** and **0 Mobile-only model fields**. At static request-construction level:

- Movie JSON independently controls **13 of 35** official filter/context parameters. The fourteenth modeled field, `withNetworks`, is not an official Movie parameter: TV omits it and Mobile sends the undocumented `with_networks` query.
- TV JSON independently controls **14 of 29** official filter/context parameters.
- Therefore **22 Movie** and **15 TV** official filter/context parameters are not independently controllable through current collection JSON. This count includes `with_watch_monetization_types`, which clients synthesize but users cannot select.
- **Five** common JSON fields have an ordinary-DISCOVER media mapping or conditional behavior: `releaseDateGte`, `releaseDateLte`, `year`, `watchRegion`, and `withWatchProviders`. Native COMPANY/NETWORK overrides and the separate Movie `withNetworks` divergence are additional source-type behavior, not part of that count.
- `withWatchProviders` also injects `with_watch_monetization_types=flatrate|free|ads|rent|buy`; this is automatic behavior, not a fifteenth JSON field.
- Both clients deserialize a raw top-level `sortBy` string. All **14 Movie** and **12 TV** official sort values are code-pass-through-capable when manually authored for the correct endpoint, but each editor offers only **4** per media.
- Owner-controlled fixture coverage is **29/29 sources** on Desktop `0.1.14-alpha` (14) and **29/29** on retained official iOS `1.2.23` (96). These are two build-scoped observations, not a count of generally supported filters: the iOS build is frozen historical evidence, NuvioTV remains 0/29 pending, and direct TMDB remains 0/60.
- The runs visibly distinguished M2 from M1, T2 from T1, W2 from W1, all three comma/pipe pairs, and several official sorts. They also captured a material S3 divergence, six no-effect unknown candidates with different preservation outcomes, off-media aliases, and fallback-like unofficial/invalid cases. None of those observations identifies the exact outbound query by itself.

“Code-supported” below means a pinned client model accepts the field and the pinned resolver constructs the stated query. It does not mean a device result changed, that TMDB did not silently ignore a query, or that client import/export preserves unknown alternatives.

## Evidence levels

| Level | What it proves | Status in this audit |
| --- | --- | --- |
| Official TMDB contract | The current documentation/OAS lists the parameter or enum value | Complete for all 71 endpoint parameter rows and 26 endpoint sort rows |
| Nuvio deserialization | The pinned typed model accepts the JSON key and type | Complete by source inspection |
| Nuvio request mapping | The resolver/API builder emits a query key or documented transformation | Complete by source inspection |
| Hidden default/transformation | The resolver supplies a value not represented exactly by JSON | Complete by source inspection |
| Nuvio preservation | Import, persistence, export, or sync retains the field | Pinned current source inspected; Desktop alpha and retained iOS manually observed with a version-specific preservation divergence |
| Direct TMDB effect | A controlled request changes count/ordered IDs as expected | Pending; 0 requests |
| Visible Nuvio effect | A controlled device fixture changes visible results | 29/29 sources observed on Desktop alpha and 29/29 on retained official iOS; NuvioTV 0/29 pending |

HTTP 200 is never classified as proof of effect. The live harness records both `total_results` and ordered first-page IDs for paired review.

## Pinned primary sources

### TMDB

- [Discover Movie](https://developer.themoviedb.org/reference/discover-movie)
- [Discover TV](https://developer.themoviedb.org/reference/discover-tv)
- [TMDB v3 OpenAPI JSON](https://developer.themoviedb.org/openapi/tmdb-api.json), `Last-Modified: 2026-03-23T14:27:00.500Z`, SHA-256 `1c709375fe994e58c5a35aba7c9abfa7f28aa7103ed6c2052ea5ab0b62af081b`
- [Region and release-type guide](https://developer.themoviedb.org/docs/region-support)
- [Movie certification list endpoint](https://developer.themoviedb.org/reference/certification-movie-list)
- [Configuration timezone list endpoint](https://developer.themoviedb.org/reference/configuration-timezones)
- [Watch-provider region list endpoint](https://developer.themoviedb.org/reference/watch-providers-available-regions)

The issue's preliminary Movie/TV inventories and sort sets exactly match the current official source: no additions, removals, or renames were found. There are 49 unique parameter names: 22 shared, 16 Movie-only, and 11 TV-only.

### NuvioTV

- Repository/default: [`NuvioMedia/NuvioTV` `dev` at `10fa8d4b16996a64c1636f0a04e7dd1ad3acde00`](https://github.com/NuvioMedia/NuvioTV/commit/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00)
- Latest release: [`0.7.19-beta` at `44743a289687cd30a3c2d6a137c9454e8f42c45f`](https://github.com/NuvioMedia/NuvioTV/releases/tag/0.7.19-beta)
- Release-to-default comparison: `dev` is 23 commits ahead and 0 behind. No collection model, Discover resolver/API/editor, serializer shape, or relevant resolver test differs, so the findings apply to both snapshots.
- Reviewed paths: `Collection.kt`, `CollectionsDataStore.kt`, `TmdbCollectionSourceResolver.kt`, `TmdbApi.kt`, `CollectionEditorTmdbPicker.kt`, `AddonWebPage.kt`, `CollectionSyncService.kt`, and resolver/migration tests. Exact pinned links are recorded in the machine matrix.

### NuvioMobile

- Repository/default: [`NuvioMedia/NuvioMobile` `cmp-rewrite` at `b1c9d08435a5b7d7487b30bbf181cb48830c2458`](https://github.com/NuvioMedia/NuvioMobile/commit/b1c9d08435a5b7d7487b30bbf181cb48830c2458)
- Latest release: [`0.3.1`](https://github.com/NuvioMedia/NuvioMobile/releases/tag/0.3.1), resolving to the same SHA. There is no release/default implementation delta.
- Reviewed paths: `CollectionModels.kt`, `CollectionRepository.kt`, `CollectionJsonPreserver.kt`, `TmdbCollectionSourceResolver.kt`, `TmdbService.kt`, `CollectionEditorScreen.kt`, `FolderDetailRepository.kt`, sync code, and serialization tests. Exact pinned links are recorded in the machine matrix.

### Owner-supplied Windows editor screenshots

The owner supplied screenshots of the current Nuvio Windows **TMDB Sources > Custom** editor. They are visual UI evidence only: the exact app version was not captured, so they are not version-pinned behavioral, request-forwarding, or visible-result proof.

- The editor visibly exposes exactly the same 14 filter fields listed in the contract below; no additional Windows-only Discover filter was visible.
- **Movies / Series / Both** is a media/source control, not a fifteenth filter. Quick chips are convenience inputs, not additional fields.
- The four visible sort labels are **Popular**, **Top Rated**, **Most Voted**, and **Recent**.
- Network IDs remains visible with Movies selected, while its helper says **“For series only.”** This visually supports the existing Movie `withNetworks` usability/client-divergence finding without proving runtime behavior.
- Genre IDs and Watch provider IDs explicitly document comma as AND and pipe as OR. This agrees with the existing official TMDB delimiter findings for those parameters.
- Language and country placeholders show comma-separated examples, but placeholder copy is not upgraded to official delimiter semantics; current TMDB evidence does not document comma/pipe behavior for `with_original_language` or `with_origin_country`.

This visual evidence changes no official parameter count, 14-field contract count, client mapping count, or controlled-result-effect count.

### Owner-controlled client results

On 2026-07-23 the owner completed all 29 fixture sources on two specific builds:

- Nuvio Desktop `0.1.14-alpha` (14), Windows 11 Home 25H2 build `26200.8875`: 4 collections, 4 folders, 29 sources, with multiple source tabs.
- Retained official Nuvio iOS `1.2.23` (96): 4 collections, 29 one-source folders, 29 sources. This was a previously installed official build retained after distribution was removed, with no sideload. It is historical build-specific evidence, not current or future NuvioMobile proof.

The original four-folder fixture imported all 29 sources on iOS but did not expose multiple source tabs. The generated `00-complete-audit-one-source-per-folder.json` variant therefore keeps every collection and source object in the same order while changing only the presentation to one source per folder. It is an alternate fixture, not another 29 observations in the audit total.

Key visible observations were:

- M2 Action differed from M1; T2 network 49 differed from T1.
- W1 provider 8 and W2 provider 8/AU both differed from their comparators, but the visible list cannot prove the hidden W1 default region.
- Genre, keyword, and provider comma-AND cases all differed from their pipe-OR comparators on both builds.
- U1–U6 exactly matched their M1/T1 baselines on both builds. Desktop removed all six unknown nested fields; retained iOS preserved them. The exact retained-build wording is: “Preserved but not visibly applied on retained official iOS 1.2.23 (96).” Preservation is not forwarding proof.
- S2 `revenue.desc`, S5 `name.asc`, and the two correct-media date comparators produced visibly ordered results on both builds. S3 `original_title.asc` worked on retained iOS but left Desktop alpha on an endless spinner with no content or error; Desktop export still retained the raw sort.
- Off-media aliases S4/S6 exactly matched their correct-media comparators. Unofficial S7 and invalid S8 both matched the popularity baseline. These remain separate manual cases, not official matrix rows or product-exposure candidates.

Desktop export preserved recognized fields/order, normalized structure/default/null fields, removed U1–U6, and retained raw sorts. Copy/export from retained iOS preserved all candidate/provider/raw/alias/unofficial/invalid values on both the original and alternate fixture without losing a folder or source.

A Nuvio.tv account-management profile export later removed provider/region fields from W1/W2/A5/A6, removed U1–U6, changed S2/S3/S5/S8 to client-default-like sorts, retained S4/S4C/S6/S6C/S7, and added structural/default fields. The responsible layer was not isolated: iOS sync, account storage, web normalization, and export serialization remain possible. This is pipeline evidence, not attribution to one client component.

NuvioTV `0.7.19-beta` device testing remains pending at 0/29 because a practical device run was not available. Pinned NuvioTV source is still the static contract evidence. A later TV addendum is preferred product confirmation but does not block this research package.

## Historical July Nuvio JSON contract

The client models reviewed for issue #47 declared these 14 filter fields. Every member was optional/nullable, and no camelCase, snake_case, or other filter aliases were found. The owner-supplied Windows screenshots independently showed the same visible 14-field editor surface, with no extra Windows-only field. “Editor” refers to that dated client source-creation surface, not this repository's builder UI. Issue #106's current 18-field addendum above supersedes this inventory without changing the historical table.

| JSON field | Client type | Movie query | TV query | Current client editors | Limitation/transformation |
| --- | --- | --- | --- | --- | --- |
| `withGenres` | string | `with_genres` | `with_genres` | Both | Raw comma/pipe syntax passes unchanged |
| `releaseDateGte` | string | `primary_release_date.gte` | `first_air_date.gte` | Both | Cannot separately choose Movie `release_date.gte` or TV `air_date.gte` |
| `releaseDateLte` | string | `primary_release_date.lte` | `first_air_date.lte` | Both | TV NETWORK default differs by client |
| `voteAverageGte` | number | `vote_average.gte` | `vote_average.gte` | Both | No semantic range validation |
| `voteAverageLte` | number | `vote_average.lte` | `vote_average.lte` | Both | No semantic range validation |
| `voteCountGte` | integer | `vote_count.gte` | `vote_count.gte` | Both | Client type is narrower than official float OAS type |
| `withOriginalLanguage` | string | `with_original_language` | `with_original_language` | Both | Forwarded literally |
| `withOriginCountry` | string | `with_origin_country` | `with_origin_country` | Both | Forwarded literally; TMDB docs do not promise comma/pipe semantics |
| `withKeywords` | string | `with_keywords` | `with_keywords` | Both | Raw documented comma/pipe syntax passes unchanged |
| `withCompanies` | string | `with_companies` | `with_companies` | Both | Native COMPANY `tmdbId` overrides it |
| `withNetworks` | string | TV: omitted; Mobile: sends undocumented `with_networks` | `with_networks` | Both, even for Movie | Movie behavior is a client divergence; official TV OAS says integer |
| `year` | integer | `year` | `first_air_date_year` | Both | Does not expose Movie `primary_release_year` |
| `watchRegion` | string | conditional `watch_region` | conditional `watch_region` | Both | Ignored unless providers are nonblank; blank/missing then defaults to `US` |
| `withWatchProviders` | string | `with_watch_providers` | `with_watch_providers` | Both | Also injects region/default and all monetization types |

Top-level `sortBy` is a known raw string, not a strict serialized enum. NuvioTV's serializable property is non-null and defaults blank/missing input to `popularity.desc`; NuvioMobile's property is nullable and its resolver supplies the effective fallback. `language` comes from client settings/profile and `page` from pagination. Neither is a saved filter. `tmdbId` is unused for ordinary `DISCOVER` sources.

NuvioMobile's Kotlin serialization strictly requires the modeled JSON number types. NuvioTV uses Gson and its quoted-number coercion behavior was not established by this audit; do not rely on quoted numeric values. Neither client performs post-decode validation of date shape, rating range, IDs, delimiter semantics, or sort enum membership.

## Movie parameter compatibility matrix

Legend: **code** = modeled and forwarded by both pinned current clients; **transform** = conditional, media-mapped, or automatic; **official only** = no current JSON field/request path; **sort** = top-level raw `sortBy`. `AND/OR` is true only when current official prose explicitly documents comma-AND and pipe-OR. The machine matrix links version-specific owner cases only to the official parameter rows their fixtures actually exercised; D1 and off-media/unofficial/invalid sorts remain separate manual cases.

| Official parameter | Kind/type | AND/OR | Current Nuvio representation and request behavior | Classification |
| --- | --- | --- | --- | --- |
| `certification` | filter/string | no/no | None; official companion `region` | official only |
| `certification.gte` | filter/string | no/no | None; official companion `region` | official only |
| `certification.lte` | filter/string | no/no | None; official companion `region` | official only |
| `certification_country` | filter/string | no/no | None; use with a certification field | official only |
| `include_adult` | filter/boolean, default false | no/no | Not sent; TMDB default governs | official only; safety decision required |
| `include_video` | filter/boolean, default false | no/no | Not sent; TMDB default governs | official only |
| `language` | request control/string, default `en-US` | no/no | Client setting/profile, not collection JSON | transform |
| `page` | request control/int32, default 1 | no/no | Resolver pagination, not collection JSON | transform |
| `primary_release_year` | filter/int32 | no/no | None; current `year` does not map here | official only |
| `primary_release_date.gte` | filter/date | no/no | `releaseDateGte` | transform; code-supported |
| `primary_release_date.lte` | filter/date | no/no | `releaseDateLte` | transform; code-supported |
| `region` | filter context/string | no/no | None; distinct from `watchRegion` | official only |
| `release_date.gte` | filter/date | no/no | None; generic release field does not map here | official only |
| `release_date.lte` | filter/date | no/no | None; generic release field does not map here | official only |
| `sort_by` | sort/14-value enum | no/no | Top-level `sortBy`; see sort matrix | sort pass-through |
| `vote_average.gte` | filter/float | no/no | `voteAverageGte` | code |
| `vote_average.lte` | filter/float | no/no | `voteAverageLte` | code |
| `vote_count.gte` | filter/float | no/no | `voteCountGte` as client integer | code with type narrowing |
| `vote_count.lte` | filter/float | no/no | None | official only |
| `watch_region` | filter context/string | no/no | `watchRegion`, sent only with nonblank providers; default `US` | transform; code-supported |
| `with_cast` | filter/string | yes/yes | None | official only |
| `with_companies` | filter/string | yes/yes | `withCompanies` | code |
| `with_crew` | filter/string | yes/yes | None | official only |
| `with_genres` | filter/string | yes/yes | `withGenres` | code |
| `with_keywords` | filter/string | yes/yes | `withKeywords` | code |
| `with_origin_country` | filter/string | no/no | `withOriginCountry` | code; delimiter semantics undocumented |
| `with_original_language` | filter/string | no/no | `withOriginalLanguage` | code; delimiter semantics undocumented |
| `with_people` | filter/string | yes/yes | None | official only |
| `with_release_type` | filter/int32 in OAS; codes 1–6 | yes/yes | None | official only; prose/type inconsistency |
| `with_runtime.gte` | filter/int32 | no/no | None | official only |
| `with_runtime.lte` | filter/int32 | no/no | None | official only |
| `with_watch_monetization_types` | filter/string enum | yes/yes | No field; providers force `flatrate|free|ads|rent|buy` | transformed, not selectable |
| `with_watch_providers` | filter/string | yes/yes | `withWatchProviders` plus hidden region/monetization values | transform; code-supported |
| `without_companies` | filter/string | no/no | None | official only |
| `without_genres` | filter/string | no/no | None | official only |
| `without_keywords` | filter/string | no/no | None | official only |
| `without_watch_providers` | filter/string | no/no | None | official only |
| `year` | filter/int32 | no/no | `year`; passed to official `year`, not `primary_release_year` | transform; code-supported |

Release-type values are 1 Premiere, 2 Theatrical (limited), 3 Theatrical, 4 Digital, 5 Physical, and 6 TV. Official prose permits comma/pipe composition even though OAS says integer; the official region guide also says ordering such as `2|3` versus `3|2` can change the projected release date.

## TV parameter compatibility matrix

| Official parameter | Kind/type | AND/OR | Current Nuvio representation and request behavior | Classification |
| --- | --- | --- | --- | --- |
| `air_date.gte` | filter/date | no/no | None; generic release field does not map here | official only |
| `air_date.lte` | filter/date | no/no | None; generic release field does not map here | official only |
| `first_air_date_year` | filter/int32 | no/no | `year` | transform; code-supported |
| `first_air_date.gte` | filter/date | no/no | `releaseDateGte` | transform; code-supported |
| `first_air_date.lte` | filter/date | no/no | `releaseDateLte`; NuvioTV NETWORK may default today | transform; code-supported/divergent NETWORK default |
| `include_adult` | filter/boolean, default false | no/no | Not sent; TMDB default governs | official only; safety decision required |
| `include_null_first_air_dates` | filter/boolean, default false | no/no | Not sent; TMDB default governs | official only |
| `language` | request control/string, default `en-US` | no/no | Client setting/profile, not collection JSON | transform |
| `page` | request control/int32, default 1 | no/no | Resolver pagination, not collection JSON | transform |
| `screened_theatrically` | filter/boolean, no documented default | no/no | None | official only |
| `sort_by` | sort/12-value enum | no/no | Top-level `sortBy`; see sort matrix | sort pass-through |
| `timezone` | request control/string | no/no | None in collection JSON | official only as saved source control |
| `vote_average.gte` | filter/float | no/no | `voteAverageGte` | code |
| `vote_average.lte` | filter/float | no/no | `voteAverageLte` | code |
| `vote_count.gte` | filter/float | no/no | `voteCountGte` as client integer | code with type narrowing |
| `vote_count.lte` | filter/float | no/no | None | official only |
| `watch_region` | filter context/string | no/no | `watchRegion`, sent only with nonblank providers; default `US` | transform; code-supported |
| `with_companies` | filter/string | yes/yes | `withCompanies` | code |
| `with_genres` | filter/string | yes/yes | `withGenres` | code |
| `with_keywords` | filter/string | yes/yes | `withKeywords` | code |
| `with_networks` | filter/int32 | no/no | `withNetworks` string, forwarded literally | code; string/type mismatch; multi-ID semantics pending |
| `with_origin_country` | filter/string | no/no | `withOriginCountry` | code; delimiter semantics undocumented |
| `with_original_language` | filter/string | no/no | `withOriginalLanguage` | code; delimiter semantics undocumented |
| `with_runtime.gte` | filter/int32 | no/no | None | official only |
| `with_runtime.lte` | filter/int32 | no/no | None | official only |
| `with_status` | filter/string codes `0`–`5` | yes/yes | No field; NuvioTV forces `0|3|4` only for NETWORK; Mobile does not | client divergence / transformed NETWORK only |
| `with_watch_monetization_types` | filter/string enum | yes/yes | No field; providers force `flatrate|free|ads|rent|buy` | transformed, not selectable |
| `with_watch_providers` | filter/string | yes/yes | `withWatchProviders` plus hidden region/monetization values | transform; code-supported |
| `without_companies` | filter/string | no/no | None | official only |
| `without_genres` | filter/string | no/no | None | official only |
| `without_keywords` | filter/string | no/no | None | official only |
| `without_watch_providers` | filter/string | no/no | None | official only |
| `with_type` | filter/string codes `0`–`6` | yes/yes | None | official only |

Current official Discover prose does not define the labels behind TV status/type numeric codes. A generic paragraph on the TV page mentions `region` and `with_release_type`, but neither exists in the TV parameter list or OAS operation; it is treated as a template artifact, not TV support.

## Sort compatibility matrix

Every correct-media official value below is accepted by each pinned current client's raw `sortBy` model and forwarded unchanged. “UI” means it is visibly offered for that media; raw-only values require authored/imported JSON. Owner evidence is attached only to the six official rows actually exercised, and remains scoped to Desktop alpha plus retained historical iOS.

### Movie sorts

| Official value | TV code | Mobile code | TV UI | Mobile UI | Evidence classification |
| --- | --- | --- | --- | --- | --- |
| `original_title.asc` | pass | pass | no | no | owner S3: retained iOS ordered; Desktop alpha spinner |
| `original_title.desc` | pass | pass | no | no | sort pass-through; manual pending |
| `popularity.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `popularity.desc` | pass | pass | yes | yes | owner S1 baseline on both tested builds |
| `revenue.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `revenue.desc` | pass | pass | no | no | owner S2 visibly ordered on both tested builds |
| `primary_release_date.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `primary_release_date.desc` | pass | pass | yes | yes | owner S4C observed on both tested builds |
| `title.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `title.desc` | pass | pass | no | no | sort pass-through; manual pending |
| `vote_average.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `vote_average.desc` | pass | pass | yes | yes | sort pass-through; manual pending |
| `vote_count.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `vote_count.desc` | pass | pass | yes | yes | sort pass-through; manual pending |

### TV sorts

| Official value | TV code | Mobile code | TV UI | Mobile UI | Evidence classification |
| --- | --- | --- | --- | --- | --- |
| `first_air_date.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `first_air_date.desc` | pass | pass | yes | yes | owner S6C observed on both tested builds |
| `name.asc` | pass | pass | no | no | owner S5 visibly ordered on both tested builds |
| `name.desc` | pass | pass | no | no | sort pass-through; manual pending |
| `original_name.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `original_name.desc` | pass | pass | no | no | sort pass-through; manual pending |
| `popularity.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `popularity.desc` | pass | pass | yes | yes | sort pass-through; manual pending |
| `vote_average.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `vote_average.desc` | pass | pass | yes | yes | sort pass-through; manual pending |
| `vote_count.asc` | pass | pass | no | no | sort pass-through; manual pending |
| `vote_count.desc` | pass | pass | yes | yes | sort pass-through; manual pending |

Both resolvers normalize only the exact descending cross-media aliases:

- Movie `first_air_date.desc` becomes `primary_release_date.desc`.
- TV `primary_release_date.desc` becomes `first_air_date.desc`.
- Cross-media ascending values are not normalized and reach TMDB unchanged.

Arbitrary invalid nonblank strings also reach TMDB in pinned current source. NuvioTV forwards `original` for DISCOVER; NuvioMobile substitutes `popularity.desc`. Missing/blank values resolve effectively to popularity descending, with minor implementation differences for whitespace. Both client UIs can label an unknown imported sort as “Popular” even while the resolver retains and forwards the raw string. Owner S7/S8 matched the popularity baseline on both tested builds, but the visible layer does not attribute that fallback-like result to request construction, TMDB, storage, or UI. Direct evidence remains pending.

## TV versus Mobile differences

| Area | NuvioTV | NuvioMobile | Consequence |
| --- | --- | --- | --- |
| Movie `withNetworks` | Deserializes but omits from Movie Retrofit call | Sends `with_networks` to `/discover/movie` | Unsupported/ignored/error behavior requires direct and device evidence |
| Native NETWORK source | Forces TV/network ID, `with_status=0|3|4`, and null `first_air_date.lte` to current local date | Forces TV/network ID only | Same JSON can return different catalogs |
| `sortBy=original` on DISCOVER | Forwards `original` | Substitutes `popularity.desc` | Client divergence on an unofficial value |
| Unknown filter import | Gson ignores unknown keys; typed persistence/export drops them | Decoder accepts unknown keys, then shallow filter overlay loses them during import/persist/export/sync | Neither client is preservation-safe for unsupported nested filter keys |
| Raw unknown source keys | Typed cycle drops them | Top-level source keys can survive while the source identity key remains stable | Mobile preservation does not extend into `filters` |
| Language fallback | App TMDB setting | Profile setting, default `en` | Results may differ if client locale settings are not aligned |
| Manual collection import | Imports/upserts by collection ID, so separately imported audit collections can coexist | Replaces the current collection list with the newly imported list | Use one complete fixture for an audit; component files are rerun-only |

NuvioTV's browser editor can transiently retain unknown plain-JavaScript fields before save, but saving returns to the typed lossy path. That narrow browser-memory case is not durable preservation.

The retained official iOS `1.2.23` (96) result is a historical exception to the pinned current Mobile preservation expectation: it preserved U1–U6 in Copy/Export without visibly applying them. It does not supersede current source inspection or prove that those fields were sent.

## Builder preservation and editability

As of issue #106, the local builder recognizes the current 18 persisted filter keys in `builder/src/nuvio/known-fields.js`: the historical 14 plus `withoutGenres`, `withoutKeywords`, `withoutCompanies`, and `withoutWatchProviders`. Current behavior is:

- Importer: extracts only those 18 keys into `editable.filters`; retains the complete imported source and filter object in `rawImported`.
- Validation: requires a supported native source's `filters` to be a plain object, but does not validate semantic types for recognized filter values. Any JSON-compatible value reaches the serializer.
- Domain defaults: `createSource()` clones only the supplied editable object; it invents neither Discover filters nor a `sortBy` default.
- Serializer overlay: clones raw filters, removes recognized keys, reapplies current recognized editable keys, and leaves unknown raw keys intact.
- Unrelated collection/folder edits: safely preserve recognized and unknown imported filter keys while the source remains.
- Deliberate recognized-filter clearing: can remove that recognized key by design.
- Source replacement/removal: discards the source's raw evidence. New sources do not acquire unsupported unknown filter keys from editable state.
- Migration: addon-projection-only logic does not transform native TMDB sources or filters.
- UI: Streaming creation still emits only `watchRegion` and `withWatchProviders`, and simple Streaming Source Edit still permits only display-name/sort changes for that narrow shape. The four exclusions have no creation or editing UI.
- `sortBy`: is a recognized top-level raw string and is not enum-validated by builder serialization.

No importer, serializer, domain, controller, migration, or UI production change is required for issue #106 because those paths consume the shared inventory or retain their independent narrow guards. Valid exclusions are now known Core fields; malformed known exclusions remain exact preservation-only data, and unrelated future unknown filter keys still survive known edits and serialize → reimport → serialize cycles.

## Historical July high-value official gaps

- Exclusions: all four `without_*` families were unavailable through the issue #47 client JSON snapshots. Issue #106 supersedes this item for the current persisted contract.
- Runtime: `with_runtime.gte/lte` is unavailable on both media.
- Vote-count maximum: `vote_count.lte` is unavailable; only minimum is modeled.
- People: Movie cast, crew, and combined people are unavailable.
- TV status/type: no ordinary DISCOVER field; only TV's hidden NETWORK status injection exists.
- Certification and release type: unavailable, including their country/region context and ordering semantics.
- Monetization choice: providers force all five types; subscription/free/ads/rent/buy cannot be selected independently.
- Alternate date semantics: Movie regional `release_date.*`, Movie `primary_release_year`, and TV `air_date.*` are unavailable.
- Adult/video/null-date/theatrical flags: unavailable. `include_adult` remains governed by TMDB's false default and needs an explicit product/safety decision before any exposure proposal.
- Ascending and title/name/revenue sorts: code-pass-through-capable only through raw JSON, not current client editor controls.

The supplied Kaptain collection patterns (`withoutGenres`, `withRuntimeGte`, comma/pipe combinations) were treated only as community hypotheses. The full third-party collection was not committed. Small sanitized candidates appear in the manual fixture solely to test ignore/preservation behavior; appearance in a fixture is not a support claim.

## Direct and manual test status

Direct TMDB live request count is **0**. The deterministic direct plan still uses its exact **60-request** hard cap, covering fixed historical baselines, documented AND/OR forms, runtime, exclusions, people, certification, release types/order, TV status/type, Movie/TV vote maxima, media-specific dates, Mobile's undocumented Movie `with_networks` query, an invalid sort, and all 26 endpoint-specific official sort values (the two popularity-descending baselines cover that official value). Every direct case with `with_watch_providers` also carries an explicit nonblank `watch_region` and the exact client-injected `with_watch_monetization_types=flatrate|free|ads|rent|buy` union.

The two added provider cases, `movie-provider-8-us` and `movie-provider-8-au`, omit the historical date and vote-count constraints so their sanitized URLs can match W1/W2's effective provider query shape when the client language is aligned to `en-US` and the source is on page 1 with `popularity.desc`. The AU case compares to the US case; no live result is committed or claimed.

Use [`manual-tests/tmdb-discover/README.md`](../../manual-tests/tmdb-discover/README.md) for exact PowerShell and future device instructions. The harness uses Node built-ins, sends the token only as a bearer header, records sanitized URLs/status/count/IDs, refuses overwrite, and is not wired into CI.

The primary complete fixture is the exact ordered concatenation of four retained component fixtures: four collections, four folders, 29 sources, and 19 essential sources. The generated alternate has the same collection/source objects and order but 29 one-source folders. The alternate was necessary on retained iOS because the original imported without source tabs. It is recorded separately in the manifest and does not double the audit source count.

The completed owner report covers 29/29 on Desktop alpha and 29/29 on retained iOS. NuvioTV remains 0/29 pending, and direct TMDB remains 0/60. This is sufficient to complete the version-scoped research package, while a later NuvioTV addendum remains the preferred product confirmation.

## Historical July recommendations

### Safe candidates for a later, separately scoped builder issue

- The issue #47 recommendation was to preserve its 14-field wire contract and expose only fields whose media mapping was clearly labelled. Issue #106 supersedes the internal persisted vocabulary with the current 18 fields while adding no exclusion UI.
- Treat Movie `withNetworks` as unavailable until the client divergence and TMDB runtime behavior are resolved.
- Consider raw official sorts only with their build-scoped evidence and remaining current-client gaps; keep correct-media values distinct and explain that client editors expose only four.
- Keep comma/pipe ID composition in an advanced control with explicit TMDB-documented AND/OR wording only for parameters whose official docs promise it.

### Needs manual proof before product exposure

- Current NuvioTV/current NuvioMobile confirmation for the modeled fields, especially network, provider/region, and compound syntax.
- Unexercised raw-only official sorts; S2, S3, S5, S4C, and S6C have only the two recorded build-specific observations.
- Direct attribution for invalid/cross-media sort handling and Mobile's Movie `with_networks` request.
- Current released-client import/export/sync behavior for unknown nested filter candidates.

### Requires Nuvio upstream model/resolver support

- Exclusions, runtime, vote-count maximum, cast/crew/people, certification, release types, alternate date fields, TV type, and ordinary TV status.
- User-selectable monetization type rather than the hard-coded all-types union.
- Any preservation-safe extension for unknown filter keys.

### Keep advanced-only or do not expose

- Advanced-only: raw ID expressions, country/region companions, certification/release-type ordering, raw sort strings, and any future TV status/type codes after labels are authoritatively sourced.
- Do not expose as saved recipe filters: `page`, client localization `language`, or TV `timezone` without a distinct request-context design.
- Do not expose: invalid/off-media sort values or Movie `withNetworks` while behavior is unresolved.
- Do not expose `include_adult` without an explicit product and safety decision plus verified forwarding policy.

## Historical July concise answer: how many could the audited builds use?

At the issue #47 source-code checkpoint, users could place **14 common filter fields** in the reviewed Nuvio collection JSON. **13** mapped to official Movie Discover parameters, while all **14** mapped to official TV Discover parameters. Five were transformed or conditional, provider filtering added a non-selectable monetization union, and Movie `withNetworks` diverged between clients. Raw JSON at that checkpoint could also carry all **14 Movie** and **12 TV** official sort values even though only four per media were shown in client editors.

At the visible-device evidence level, this issue records all **29 fixture sources** on Desktop `0.1.14-alpha` (14) and all **29** on retained official iOS `1.2.23` (96), including controlled comparisons, no-effect candidates, preservation checks, aliases, and failure/fallback cases. That is not “29 supported filters”: the result is build-scoped, NuvioTV is still 0/29, the iOS build is historical rather than current Mobile proof, and direct TMDB is 0/60. The official counts, 14-field contract, and static client mapping counts remain unchanged.
