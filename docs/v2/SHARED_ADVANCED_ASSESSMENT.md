# Shared Advanced options and Nuvio filter compatibility

Investigation [#206](https://github.com/davecollections/tmdb-id-lookup/issues/206), 13 September 2026. Baseline: `efe9966ebb04392dbc540f131ff19790d1c1e8ca`; branch `work/206-shared-advanced-investigation`. The owner accepted the findings and scoped acceptance evidence, then authorized committing, pushing and opening the investigation PR. The owner subsequently authorized final commit/push, normal PR merge after passing checks/review, main synchronization and safe branch cleanup. No Worker deployment is included. This is a capability assessment and proposed implementation sequence; no runtime feature is implemented here. The baseline identifies the starting repository, not the final review commit.

## Completed saved-JSON preservation extension

The owner extended #206 with the completed [collection preservation pack](../../manual-tests/collection-preservation/README.md). PR [#207](https://github.com/davecollections/tmdb-id-lookup/pull/207) combines the original investigation and later results; the [complete 28-file inventory](../../manual-tests/collection-preservation/REVIEW.md#complete-combined-pr-inventory) supersedes the historical 14-file checkpoint below.

The owner returned the unchanged master and four exports in Nuvio Tests.zip. The owner confirmed that every method started with a fresh import of the original master. Manage from phone imported and exported through that interface. Direct TV imported through the local network URL, exported on the TV, and the on-device export was retrieved using File Explorer. The compressed transfer decoded to the unchanged master. Exact run times, sync activity, destination isolation and other unrecorded procedural details remain unknown; no internal import/sync/export cause is inferred.

The [new-master results](../../manual-tests/collection-preservation/RESULTS.md) match all 6 collections, 24 folders and 68 sources in every file with no order changes. The website rewrites 17 selected Most voted values. The phone file omits 24 populated exclusions across six sources that survive in the other three files. Explicit presentation choices and populated/zero canonical minimum votes survive across all four. Default additions, null/empty conversions, aliases and imported probes are recorded separately. Full comparisons and exact files remain outside Git. These findings concern saved JSON only and do not isolate an internal import/sync/export step or test title behavior. The historical evidence below, reconstruction provenance and website/visual distinctions remain intact.

The authored pack/results are published separately in the existing Drive handoff; the private archive remains unchanged. The owner reported the preservation findings in Nuvio Discord; no message link was supplied. Builder creation and export must continue using the correct supported JSON, with no workarounds for upstream sort rewrites, removed exclusions or differing defaults. These findings do not block the approved Studio minimum-votes work. Broader Advanced, People and compound language/country work remain recorded below.

## Findings and next step

The best first implementation is an explicit **Minimum votes** option for native Studios, shared across Add Source, New Collection, New Folder and physical Source Edit. Current Nuvio TV, Mobile and Desktop resolvers consume `filters.voteCountGte` for `COMPANY`; the existing production Discover gateway already supports the corresponding query. Dave's six-source test now separately establishes website preservation and visible 0/100 result differences in Desktop 0.1.23-alpha (23), including five Studio Series titles at 100. This supports filter application in that tested build. Keep the default unset. Warner Bros. Top rated's one-vote results are valid TMDB results, not a sorting defect. Focused Studio scope and issue creation are approved. Its dedicated implementation chat/branch starts from verified updated main after closeout; the retained compatibility evidence is sufficient and needs no repeat.

Native People must not receive this setting: all three inspected native resolvers fetch combined credits, select cast or exact Director crew and media, then sort. They do not read `source.filters`. A saved minimum does not filter those credits. Lists in People folders remain Lists; their preserved minimum-vote values prove preservation only.

The 48 original-import Discover cases remain preservation-only for structured editing. All have compound language and country expressions. Current clients forward those strings, but field-specific endpoint semantics are not established by the reference documentation and the production Builder gateway rejects them. None can safely be unlocked in this investigation.

The current Nuvio.tv account-editor bundle has a reproducible sort-normalization mechanism matching the reported Movie/Series changes. Its allowed sort list excludes `vote_count.desc`; normalization substitutes `popularity.desc` for Movies and `first_air_date.desc` for Series. An isolated execution of the actual downloaded functions reproduces those transitions. Dave then supplied the exact controlled input and a new website export through the reported **Collections → Import → Collections → Export** route: both Most voted rewrites are confirmed, while the Top rated controls survive. This establishes a reproduction through the reported website path; it does not isolate the internal import/export stage or attribute the earlier full-library sequence. The later Studio/Network Desktop evidence below is a separate minimum-votes test using Top rated.

## Evidence identities

| Evidence | Version / identity | Scope |
| --- | --- | --- |
| Builder | `efe9966ebb04392dbc540f131ff19790d1c1e8ca` | Local/remote main verified equal and clean before branch creation |
| NuvioTV | `dev`, `e54a74904b7ee40e5c748e156a70749f89e8decf`; source build `0.9.2-beta`, code 1058 | Current public source, not Dave's installed version |
| NuvioMobile | `cmp-rewrite`, `13cd02040a6e9b8bc3b5a51c4925fb0603597955` | Current public source; no installed version inferred |
| NuvioDesktop | `Dev`, `ab579533ece5ecb51294652696cf4928f5d4a73d`; source build `0.1.23-alpha`, code 23 | Current public source, not installed acceptance |
| Owner's installed Nuvio Desktop | Screenshot shows `0.1.23-alpha (23)`, based on `Nuvio 0.4.14` | Six Studio/Network result screenshots after website import/export; installed binary commit not established by the version label |
| Nuvio.tv account editor | `/_next/static/chunks/5986-61f0fb883edfc9f5.js` and `app/account/page-5284eea99fb8ebe9.js`, fetched 13 September Sydney time | Actual public deployment assets; byte hashes retained with review evidence; no public commit/version established |
| NuvioWeb | `main`, `ef50a43de59cb622b48f651df072454463b3df87` | WebOS/Tizen client repository. It is not the nuvio.tv account editor and is not substituted for it |
| TMDB | Movie/TV API v3 reference fetched 13 September 2026 | Current field contracts; reference supplies no immutable release SHA |
| Production probes | 12 September 2026 23:44 UTC / 13 September Sydney | Eleven requests: one complete People response, six Discover responses, four expected gateway rejections |

Primary links:

- [TV resolver](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt), [TV model](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/domain/model/Collection.kt), [TV TMDB API mapping](https://github.com/NuvioMedia/NuvioTV/blob/e54a74904b7ee40e5c748e156a70749f89e8decf/app/src/main/java/com/nuvio/tv/data/remote/api/TmdbApi.kt).
- [Mobile resolver](https://github.com/NuvioMedia/NuvioMobile/blob/13cd02040a6e9b8bc3b5a51c4925fb0603597955/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/TmdbCollectionSourceResolver.kt), [Mobile model](https://github.com/NuvioMedia/NuvioMobile/blob/13cd02040a6e9b8bc3b5a51c4925fb0603597955/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt), [Mobile preservation helper](https://github.com/NuvioMedia/NuvioMobile/blob/13cd02040a6e9b8bc3b5a51c4925fb0603597955/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionJsonPreserver.kt).
- [Desktop resolver](https://github.com/NuvioMedia/NuvioDesktop/blob/ab579533ece5ecb51294652696cf4928f5d4a73d/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/TmdbCollectionSourceResolver.kt), [Desktop model](https://github.com/NuvioMedia/NuvioDesktop/blob/ab579533ece5ecb51294652696cf4928f5d4a73d/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt), [Desktop preservation helper](https://github.com/NuvioMedia/NuvioDesktop/blob/ab579533ece5ecb51294652696cf4928f5d4a73d/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionJsonPreserver.kt).
- [Nuvio.tv deployed collection helpers](https://nuvio.tv/_next/static/chunks/5986-61f0fb883edfc9f5.js), [deployed account UI](https://nuvio.tv/_next/static/chunks/app/account/page-5284eea99fb8ebe9.js), [official site](https://nuvio.tv/).
- [TMDB Movie Discover](https://developer.themoviedb.org/reference/discover-movie), [TV Discover](https://developer.themoviedb.org/reference/discover-tv), [combined credits](https://developer.themoviedb.org/reference/person-combined-credits).

External repositories declare GPL-3.0. They were inspected as evidence; no external implementation was copied into Builder. Downloaded website code was executed only in an isolated research harness outside Git, with no account, filesystem or network API exposed to its functions. No website licence or permission to reuse its implementation is assumed.

Website byte identities: collection helper SHA-256 `731fe60319509d4fc12e81a3445e5f381c73e10c34aafd4a11d83265089e15c5`; account UI SHA-256 `922f7b6d9c1a931e2e82e554dcc7f073c2415827b92f0c62ca7bc8ec0d0fde89`. The isolated check invokes helper modules 1746, 9787 and 2227 from those actual assets; it does not reimplement the suspected normalization.

## Field capability table

Here **D** means native `DISCOVER`, used by Streaming, Genres, Decades/years and standalone Discover. **C** means native `COMPANY`; **N** means native `NETWORK/TV`; **P** means native `PERSON`/`DIRECTOR`. "Applied" below means verified request construction in all three pinned native clients, not a new physical-device result. P applies **none** of the 18 filters. LIST and COLLECTION likewise do not become Discover resolvers.

All 18 wire fields are represented in the three native client models. Builder preserves imported values and types via raw source overlays even when they are not editable. Nuvio models and website normalization are not equally preservation-safe; see the following section.

| Setting | Nuvio field / JSON type | TMDB Movie query | TMDB TV query | D / C / N application and limits |
| --- | --- | --- | --- | --- |
| Included genres | `withGenres`, string | `with_genres` | `with_genres` | Applied. Use media-correct IDs; Any/All documented. Genre-family defining genre cannot be removed or broadened |
| Excluded genres | `withoutGenres`, string | `without_genres` | `without_genres` | Applied. Existing UI emits comma exclusions; no new exclusion Any/All promise |
| Included keywords | `withKeywords`, string | `with_keywords` | `with_keywords` | Applied. Included Any/All documented; existing Movie keyword compatibility rewrite must be retained |
| Excluded keywords | `withoutKeywords`, string | `without_keywords` | `without_keywords` | Applied; existing tested exclusion behavior retained, not broadened from generic AND/OR prose |
| From date | `releaseDateGte`, string | `primary_release_date.gte` | `first_air_date.gte` | Applied; strict calendar dates. Fixed Decade/year lower bound remains authoritative |
| Through date | `releaseDateLte`, string | `primary_release_date.lte` | `first_air_date.lte` | Applied. TV's native NETWORK supplies today when this is null; Mobile/Desktop do not |
| Year | `year`, integer | `year` | `first_air_date_year` | Applied; different endpoint semantics. Fixed period cannot be replaced by a conflicting year |
| Minimum rating | `voteAverageGte`, number | `vote_average.gte` | same | Applied; 0 through 10; explicit zero is meaningful |
| Maximum rating | `voteAverageLte`, number | `vote_average.lte` | same | Applied; validate against minimum |
| Minimum votes | `voteCountGte`, integer | `vote_count.gte` | same | Applied; unset default, nonnegative int32. Six production query checks pass. Owner's website pair preserves all six sources; Desktop 0.1.23-alpha (23) screenshots support application for C Movie/TV and N TV. No direct Desktop round-trip or per-title vote audit |
| Original language | `withOriginalLanguage`, string | `with_original_language` | same | Applied literally. Current Builder accepts one lowercase two-letter code. Not audio/subtitle availability or request localization |
| Origin country | `withOriginCountry`, string | `with_origin_country` | same | Applied literally. Current Builder accepts one uppercase two-letter code. Distinct from watch region and Movie regional release date |
| Included companies | `withCompanies`, string | `with_companies` | same | D/N apply it; C replaces it with the native `tmdbId`. Any/All documented for the endpoint; do not expose an ineffective override for Studio |
| Excluded companies | `withoutCompanies`, string | `without_companies` | same | Applied; reject excluding the defining Studio. No new exclusion operator semantics assumed |
| Included networks | `withNetworks`, string | No supported Movie field | `with_networks` | D/C TV apply it; N replaces it with the native network ID. TV client omits Movie field, Mobile/Desktop send it: do not expose Movie support. Reference declares int32; current Builder compound-TV support is retained as existing evidence, not newly proven here |
| Watch region | `watchRegion`, string | `watch_region` | same | Applied only with included or excluded providers; native clients default missing/blank region to US. Builder requires an explicit region for new filtered sources |
| Included providers | `withWatchProviders`, string | `with_watch_providers` | same | Applied; Any/All documented. Native clients add `flatrate|free|ads|rent|buy`. Defining Streaming provider/region stays fixed |
| Excluded providers | `withoutWatchProviders`, string | `without_watch_providers` | same | Applied; exclusion-only requests require region but do not inject the all-types union. Reject excluding a required service |

Current exclusions are modeled and forwarded. Older July documentation describing them as absent is historical, not the present contract. Likewise, a parameter accepted by TMDB is not automatically available in a Nuvio model.

| Candidate | TMDB capability | Nuvio wire/resolver and Preview conclusion |
| --- | --- | --- |
| Runtime minimum/maximum | `with_runtime.gte/lte` on both endpoints | No corresponding field in the inspected 18-field models or Builder inventory. `withRuntimeGte/Lte` are unknown preserved imports, not applied settings; website drops them. Do not offer |
| Vote-count maximum | `vote_count.lte` on both | No modeled field or current Preview compiler support; do not offer |
| Cast / crew / people predicates | Movie Discover has `with_cast`, `with_crew`, `with_people` | No corresponding Nuvio filter field. `with_crew` is not exact Director-job filtering. No silent People-to-Discover conversion, especially for Series |
| Network exclusions | No exposed `without_networks` field | No modeled control; do not invent one |
| Certification, Movie release type, alternate date semantics, TV status/type | Endpoint-specific TMDB fields | No ordinary modeled Nuvio controls. TV's hidden NETWORK status injection is not a general setting |
| Monetization type selector | TMDB supports separate types | Current resolver fixes the included-provider union; do not offer a choice that it cannot reproduce |
| Adult inclusion, output language, page, timezone | Endpoint/request capabilities | Not this Advanced scope; retain canonical `include_adult=false`, current localization and bounded Preview behavior |

## Preservation and client behavior are different contracts

| Layer | Established behavior | Limits |
| --- | --- | --- |
| Builder import/serialize | Known editable overlay plus full `rawImported` retains unknown fields, aliases, nulls and JSON types. All 48 original blocked sources serialize exactly; second cycle is stable | A structured filter edit is touched-field behavior, not permission to normalize untouched imports |
| Builder List editor | All 504 original native Lists open. #204 retains arbitrary string sorts and filter objects through unchanged Save/title/sort/Cancel; Preview shows conditional unapplied-filter notice | Filter preservation does not mean filtering; do not reuse Discover alias synchronization for Lists |
| TV model/store | Typed camelCase fields are persisted; resolver reads those fields | Dotted aliases and unknown nested fields are not modeled; type coercion/preservation on a particular installed build needs its export |
| Mobile/Desktop | Typed 18-field filters; raw collection/folder/source envelope merge | The helper replaces the nested `filters` object with encoded fields; unknown filter keys can be lost. Source matching includes sort, so unrelated envelope preservation also has an identity boundary |
| Nuvio.tv current code | Known filter object reconstructed, strings trimmed, numeric values parsed, integer values truncated, null/empty entries omitted | Drops dotted aliases and unsupported keys. A string `"100"` need not remain a string. Sort allowlist can rewrite Most voted. Pure helper execution confirms the mechanism, not an authenticated round trip |

The Nuvio.tv bundle retains compound locale strings through its filter normalizer and maps them literally in query construction. That does not establish endpoint meaning or a saved-client title result. Its UI contains the 18 fields; UI presence alone does not establish People/List application.

Folder `focusGlowEnabled` and `pinToTop` are absent from the inspected TV/Mobile/Desktop **folder** models and from the website folder serializer. TV and the website support those names at **collection** level; Mobile/Desktop model collection pinning but not collection focus glow. `focusGifEnabled`/`focusGifUrl` are different, supported folder properties. Therefore dropped folder glow/pin probes are currently unsupported extension removal, not confirmed loss of supported folder settings. Builder must still preserve them. Do not relocate fields or alter exports to mimic Nuvio.tv.

## Existing Builder surfaces and proposed fit

| Family | Current creation / editing / Preview | Shared Advanced constraints |
| --- | --- | --- |
| Streaming | Provider/regions/media/sorts; simple physical editor owns title/sort; specialized Preview accepts only its narrow shape. Safely understood imported Discover can use explicit Advanced editing | Collapsed Advanced after normal configuration. Keep service and region fixed per physical candidate. Add filters without changing trusted destination placement or provider reconciliation |
| Genres | Existing global year/rating/votes/language/country controls and contextual exclusions; focused Add/Edit/guided adapters and exact Preview | Reuse these controls. Each defining official genre is fixed; no generic OR selection that broadens it. Preserve per-genre exclusions and media applicability |
| Decades/years | Existing rating/votes/language/country/exclusions, canonical periods, exact and representative Preview | Keep full canonical period/year and additive structure fixed. Extra date/year controls stay hidden initially; intersecting ranges require a later explicit design |
| Studios | Native COMPANY; creation multi-media/multi-sort; physical editor title/sort only; Preview currently sends entity/media/sort only | Add native filters without changing COMPANY type or entity. Native ID owns inclusion. Preview must accept effective filters before exposing the control |
| Networks | Native NETWORK/TV; title/sort editing; Preview currently sends network/sort only | TV fixed, native network ID fixed. State TV's hidden status/today difference; no claim of identical counts across clients |
| Native People | Roles/media/multi-sort, exact credits Preview; filters ignored | No filtering section until actual supported consumption exists. Keep exact cast/Director-job and media split |
| Existing Discover | #202 composer/editor and #204 current-draft Preview already support the understood 18-field vocabulary | Shared control extraction must preserve touched fields, aliases, unknown-field Preview blocking, imported sort and per-media candidates |

Creation configuration retains one default-collapsed **Advanced options** disclosure, placed before existing candidate review/Preview. Physical editing retains one-source media/identity and scalar sorting. Opening the disclosure makes no title request. The same validated effective candidate must drive planned JSON, duplicate checking and Preview. No schema-level recipe or second settings store is needed.

Retain the accepted Both behavior: ordinary scalar Movie and Series sources; official genre IDs and TV networks derive by actual media, with visible applicability information. Shared names do not authorize cross-media genre merging. The broader Discover composer can keep a Movie source unrestricted where its chosen criterion applies only to TV, with the existing explanation. A family-defining genre/service/period must never disappear through that derivation. Keep existing family-specific catalogue eligibility and grouping.

Any/All remains a pure one-operator expression only where already supported. Mixed AND/OR grouping, speculative locale normalization and converting several sources into an alleged Boolean group stay deferred. Conflicting fixed includes/exclusions are validation errors; do not silently prune them.

## Reuse map and justified extensions

Paths below are relative to `builder/src/`; requester/provider modules are in `source-add/`. Imported Studio/Network sources can already open their title/sort editors with populated filters, which those editors preserve. Their current Preview projection omits those filters, so adding the UI alone would be insufficient.

| Existing owner | Reuse / bounded extension |
| --- | --- |
| `ui/AdvancedDiscoverControls.jsx` | Reuse named picker, keyword/genre controls, operator, field errors and notices. Extract private numeric/select field rendering when a second consumer needs it; do not duplicate the full composer |
| `ui/GenreAdvancedOptions.jsx`, `ui/DecadesAdvancedOptions.jsx` | Reuse disclosure and contextual exclusion behavior. Keep per-genre/per-period semantics in thin adapters |
| `source-add/advanced-discover.js` | Reuse validation, media derivation, field labels, selection and query mapping. Extend with a field-subset/fixed-constraint contract rather than another validator |
| `nuvio/discover.js`, `known-fields.js` | Existing field descriptors, effective source overlay and comparison rules remain authoritative. No new wire field is needed for minimum votes |
| `nuvio/discover-imported-filters.js`, `source-edit/advanced-discover-editor.js` | Reuse effective alias inspection and touched-field patch pattern where semantics match. Native-family use needs explicit tests; Lists stay on their current preservation-only path |
| `source-edit/source-editors.js`, editor sessions and controller | Extend current family adapters and minimal patches. Keep stale-target guards, no-op/Cancel behavior and one atomic mutation |
| `source-add/studio-source.js`, `network-source.js`, native variant keys/plans | Include validated effective filters in candidates and existing exact comparison; preserve native ID, scalar sort, grouping, names and placement rules |
| `source-add/source-title-preview.js`, `source-edit/source-edit-preview.js` | Extend native request models with exact effective filters. Current Studio/Network request projections omit them; reusing the dialog alone is insufficient |
| `tmdb-discover-preview-requester.js`, `tmdb-advanced-discover-preview-provider.js` | Reuse production request coordination, complete-query cache keys, abort/Retry and normalization. Thin native adapter can map fixed IDs into a detached query without converting exported sources |
| `ui/use-source-title-preview.js`, shared nested Preview | Keep one scroll owner, media/sort selectors only when selected, current-draft reopening and focus restoration |
| Existing mounted fixtures and testing policy | Extend current native/Discover cases with real Worker responses. Pure injected tests remain limited to parsing, plans, state and comparison |

## Native People controlled evidence

One production `getPerson(31)` call returned complete Tom Hanks combined credits. After exact role/media selection and ID deduplication:

| Native source | Returned titles | Would remain at 100 votes | Would remain at 2,147,483,647 votes |
| --- | ---: | ---: | ---: |
| PERSON/MOVIE | 186 | 80 | 0 |
| PERSON/TV | 81 | 27 | 0 |
| DIRECTOR/MOVIE | 3 | 2 | 0 |
| DIRECTOR/TV | 5 | 3 | 0 |

These are current TMDB credit calculations, **not client-filter results**. The maximum observed vote count was 30,434. The manual pair uses zero versus the maximum valid int32 so an applied setting must empty the high-threshold source; surviving titles visibly establish ignored filtering without relying on ranked first-page coincidences. All four baselines are nonempty. Director Movie's `Vault of Horror I` (473544) had 3 votes; `Larry Crowne` (59861) had 1,449. These also support a later realistic 100-vote comparison. Counts are dated observations.

The recommendation is **unsupported for control exposure on the inspected native resolvers**. Installed behavior remains explicitly unverified. No conversion, Preview-only workaround, ineffective saved control or hidden minimum is proposed.

## All 48 original-import Discover cases

The original audit input remains `nuvio_custom_collection_2026-08-30.json`, SHA-256 `363888d14c04d818ed001b1f798f41fd00a9cfc6c179b637a6ffc53c36a3b8eb`. It is separate from the September comparison. The actual importer/registry produces 3,070 physical sources, 2,796 native TMDB sources and 504 Lists. The 48 blocked sources are **40 Movie and 8 TV**, six in each folder below.

Each folder's original six positions are: Popular Movies, Top Rated Movies, Recent Movies, Popular TV, Action/Crime/Thriller Movies, and Drama/Romance/Comedy Movies, with original regional/custom wording retained in the private 48-row inventory. Exact input JSON paths, parent IDs, source titles, media, sort, complete filters, alias types and source hashes are retained in `original-audit/audit.json` in the private review evidence. No full private export is checked in.

| Folder | Original language expression | Origin country expression | Original locations |
| --- | --- | --- | --- |
| Latin American Cinema | `es\|pt` | `MX\|GT\|HN\|SV\|NI\|CR\|PA\|CU\|DO\|PR\|CO\|VE\|EC\|PE\|BO\|PY\|UY\|AR\|CL\|BR` | Six physical sources; exact paths in private inventory |
| North American Cinema | `en\|fr` | `US\|CA` | Same |
| Nordic Cinema | `sv\|no\|da\|fi\|is` | `SE\|NO\|DK\|FI\|IS` | Same |
| East Asian Cinema | `ja\|ko\|zh` | `JP\|KR\|CN\|TW\|HK` | Same |
| Southeast Asian Cinema | `th\|id\|tl\|vi` | `TH\|ID\|PH\|VN` | Same |
| South Asian Cinema | `hi\|bn\|ur\|si\|ne\|ta\|te` | `IN\|BD\|PK\|LK\|NP` | Same |
| Middle Eastern Cinema | `ar\|fa\|he\|tr` | `EG\|IR\|TR\|SA\|IL\|LB\|AE\|IQ\|JO` | Same |
| African Cinema | `en\|fr\|ar\|sw\|am\|pt\|zu\|xh\|af` | `NG\|ZA\|KE\|GH\|ET\|SN\|DZ\|TN\|MA` | Same |

Every locale token has the expected two-letter syntax; that is not proof of a valid combination or up-to-date TMDB membership. All 48 fail the same two Advanced validations and produce no exact Preview query. Each source survives import/serialize unchanged, including matching numeric `vote_count.gte` / `voteCountGte`, dates, genre expressions and ordering. A second project cycle is stable. Editor opening fails without mutation; Save/Cancel cannot be claimed for an editor that currently cannot open.

The existing CLDR-derived Builder code catalogue (retrieved 10 September) contains every country token and every language token except `tl`. That is a catalogue gap, not evidence that TMDB rejects Tagalog. Preserve `tl`; do not substitute `fil` or infer endpoint membership from CLDR. The current Worker accepts syntactically valid single codes without checking this catalogue. Exact TMDB code membership remains part of the follow-up evidence gate.

| Field and media | Primary contract / client | Current results and decision |
| --- | --- | --- |
| Movie original language | Reference declares string without a field-specific separator promise; clients forward literal value. An [older TMDB staff forum example](https://www.themoviedb.org/talk/5f4a5df323be460035ffbe98?language=pt-AO) uses language OR, but is not current four-way proof | `es\|pt` is plausible OR; production gateway returns 403. TMDB combination semantics unresolved |
| TV original language | Same reference gap and literal forwarding | `es\|pt` gateway 403; do not infer TV from Movie |
| Movie origin country | Reference declares string without a field-specific separator promise; literal forwarding | `US\|CA` gateway 403; no endpoint evidence of union/intersection/ignored input |
| TV origin country | Same contract gap, independent media path | `US\|CA` gateway 403; independent installed test required |

All sixteen distinct folder/media locale pairs are recorded. The four live negative probes isolate language and country independently on Movie and TV; they establish gateway policy only. No fabricated TMDB response or bypass of the production integration was used. Pure OR is not mixed grouping, but it still needs field-specific support. Country may describe multiple origins while original language is a single title attribute; do not mechanically expose the same All semantics for both.

Before unlocking any case: establish individual code validity, OR behavior for each field/media and their intersection, preserve original literal order/aliases/types on no-op/title-only edits, verify explicit single-field edits, cancellation, unknown data, raw snapshots and exact Preview/export query equality. Unsupported or unresolved combinations remain preserved and blocked; token sorting/deduplication is not an import repair.

## September round-trip investigation

**Input-version correction, 13 September 2026:** the original September upload identified by Dave is 2,619,074 bytes, SHA-256 `e3baaefbb0de52639f5a7789a02989f74e9aa4827c6863a402dd50fc838818a7`. All 18 collections already use `ROWS`. The initial #206 comparison instead read the local same-named 2,619,200-byte version, SHA-256 `d9a2edd9e295d91e7f397bde6b574010bbee5e6f55ecba17ad80f75729e6be0a`, whose 18 collections use `TABBED_GRID`. Those input versions differ only in the 18 collection `viewMode` values, accounting for exactly 126 bytes. No inference is made about who, when, why or which tool changed the other input version.

Both byte sequences and the verified export are preserved separately outside Git with hashes and provenance. At correction time the direct original attachment was not available in the local attachment/Downloads search. A separate byte reconstruction replacing exactly those 18 string values matches Dave's original byte count and full SHA-256; reversing the replacements reproduces the previously compared file byte for byte. The corrected comparison uses that checksum-verified original byte sequence, not a claim that a direct original attachment was received. The Downloads file and prior comparison records remain untouched. The private correction evidence distinguishes the corrected original-to-export comparison, input-to-input differences and the superseded comparison.

It contains the two reported sources as native DISCOVER: Family Movie Night All-Stars is MOVIE, `vote_count.desc`, Family genre 10751 and English; Biggest Reality Hits is TV, `vote_count.desc`, Reality genre 10764 and English. Anne Hathaway's three sources are LIST/MOVIE 8659014; Top Rated Movies has both minimum-vote aliases at numeric 100. This is separate evidence from native People.

The corresponding supplied output is `nuvio-collections-profile-4-2026-09-12(1).json`, 2,357,803 bytes, SHA-256 `5f2a3354cee61eb413f0a01e3bb2661dd9fa935a330f40d02f43d4e281a660f8`. The download suffix has no semantic meaning; this exact pair was verified by content and identities. It matches all **18 collections, 756 folders and 3,538 sources**, with zero missing, added or ambiguous identities and zero hierarchy/source-order changes. The older original audit has different counts and was not substituted.

| September pair observation | Classification |
| --- | --- |
| Family Movie Night All-Stars (`src-GZPU49GE`) changes `vote_count.desc` → `popularity.desc`; Biggest Reality Hits (`src-C3L3SHEG`) changes `vote_count.desc` → `first_air_date.desc` | Confirmed two native sort changes; responsible historical step unproven |
| Two Trakt Cloverfield entries change `original` → `rank`, adding `sortHow: asc` | Recorded separately; Trakt implementation remains outside scope |
| 2,425 dotted vote aliases removed; corresponding camelCase values remain exact | Matching aliases removed, not evidence of minimum-vote loss or application. Anne Hathaway retains numeric 100 and 10 |
| 846 exclusion-genre, 693 exclusion-keyword, 678 provider, 687 region, 582 genre, 56 language, 151 keyword, 22 network and 6 company request-style aliases removed | All had matching canonical fields; their retained canonical values are unchanged |
| 845 nested `filters.sortBy` copies removed | Every removed copy matched the original source-level sort |
| Four blank `withGenres: ""` fields removed | Empty-value omission, not removal of an active genre restriction |
| Eight TMDB IDs change string → number; 1,396 missing IDs become explicit null | Value/type normalization recorded separately from identity |
| All 48 compound language/country source pairs remain literal | September pipeline preservation established; filtering still unverified |
| 176 folder `focusGlowEnabled: true` and one folder `pinToTop: true` disappear | Unsupported folder extension fields under inspected models; no relocation/workaround |
| All 18 collections use `ROWS` in both the original input and verified export | **No collection layout change.** The earlier TABBED_GRID → ROWS finding is withdrawn; it arose from comparing the other input version |
| Three empty collection `backdropImageUrl: ""` fields are omitted | The only remaining collection-envelope changes in the original pair; empty-value omission |

There are 2,472 sources with any recorded field change and 378 changed folder envelopes. These differences, including the two native sort changes, are identical under both input comparisons. The folder total includes 138 absent `catalogSources` fields becoming empty arrays, empty presentation-field omissions and one populated addon projection gaining genre labels. Absent and empty arrays are counted separately; none of these counts is a count of lost supported filters. The corrected original pair has three changed collection envelopes, all limited to empty backdrop omission; the withdrawn layout finding is not included. Full typed differences remain private. No new native filter value changes were found beyond the four blank genre omissions; preservation still does not establish resolver application.

The comparator uses exact collection/folder IDs and a persisted source ID where present; otherwise it requires a unique provider/type/entity/media/title tuple. Canonical numeric ID representation can match while value-type changes remain in the diff. It never includes sort or filter values in the match key and never zips ambiguous duplicates by position. Regenerated parent IDs or title changes without a source ID are reported unmatched. Field comparison distinguishes absent, null, number, string, array and object.

The current website helper's normalization and serialization both call the restrictive sort routine. Known filters are rebuilt; equivalent dotted vote aliases are removed, and unknown runtime candidates disappear. Compound language/country strings remain literal in the pure check. Folder glow/pin are dropped by the serializer while the same collection keys remain. These mechanisms make a clean reproduction valuable, but they do not prove the September build, user actions, sync sequence or responsible historical step.

## Owner-supplied website reproduction - 13 September 2026

Dave supplied `01-unchanged-round-trip.json` (3,573 bytes, SHA-256 `efd9998fb4efed53568f539c80372413d21d32254a2519ce3bcfcf89e5d9eb49`) and `nuvio-collections-profile-4-2026-09-13.json` (3,851 bytes, SHA-256 `407b3592b97e069203871aa3484bd1a5bea96cf12ded34bbee47508b390f85d8`). The input is byte-for-byte identical to the checked-in six-source fixture. These files are separate from both September full-library input versions and the older original audit.

The recorded owner-supplied route is **Nuvio.tv Collections → Import → Collections → Export**. The pair supplies concrete reproduction evidence for the saved Most voted values changing through that route. One collection, six folders and six sources match without missing, added, ambiguous or reordered identities. This is an owner-performed test with independently verified files, not an assistant-operated authenticated browser session.

| Physical source | Input sort | Export sort | Result |
| --- | --- | --- | --- |
| 206 Family Movie Most voted | `vote_count.desc` | `popularity.desc` | Most voted becomes Popular |
| 206 Reality Series Most voted | `vote_count.desc` | `first_air_date.desc` | Most voted becomes Recent |
| 206 Movie Top rated control | `vote_average.desc` | `vote_average.desc` | Unchanged |
| 206 Series Top rated control | `vote_average.desc` | `vote_average.desc` | Unchanged |
| 206 List Top rated aliases | `vote_average.desc` | `vote_average.desc` | Unchanged; only duplicate vote alias removed |
| 206 Folder schema probe | `popularity.desc` | `popularity.desc` | Unchanged |

The complete source diff contains exactly those two sort replacements and removal of the List's matching numeric `vote_count.gte: 100` alias. Canonical numeric `voteCountGte: 100` remains exact in the List and both Discover controls. No genre, language, identity or other source field changes. This is preservation evidence, not proof that the List applies the threshold.

The complete collection envelope is unchanged: `TABBED_GRID`, collection pinning, focus glow and Show All values all survive. This controlled fixture intentionally has its own layout and must not be confused with the full-library original, whose 18 collections already use ROWS. The unsupported folder-level `focusGlowEnabled: true` and `pinToTop: true` probes are removed. All six folders gain absent `hideTitle` and `focusGifEnabled` fields as boolean false; no existing toggle is flipped. These added defaults and the duplicate alias removal are distinct from the two lost sort choices.

The forwarded note references a screenshot, but no screenshot was provided to this task; its labels are not claimed as visually inspected. Browser/version, exact site build, profile isolation/sync state and an independently observed no-edit sequence were not supplied. The current-bundle mechanism and this owner-reported route support the website compatibility finding without inventing those details or identifying the exact internal normalization stage. Displayed title ranking, native People filtering and compound locale semantics are not tested by this pair.

**Builder behavior stays unchanged:** continue serializing the selected Most voted value as `vote_count.desc`. Do not replace it with Nuvio.tv's fallback. No Worker change, compatibility rewrite or upstream report is authorized by receiving this evidence. Raw owner files, exact typed comparison, hashes, route and scope notes are preserved in the private Drive handoff, outside Git.

## Owner Studio/Network evidence - 13 September 2026

Dave supplied `03-native-studio-network-votes.json` (3,369 bytes, SHA-256 `fa83e9044974ceace4aaec3998acfdd47772c91d1f4ad20aa01f8af7b7055aa0`) and `nuvio-collections-profile-4-2026-09-13 (1).json` (3,794 bytes, SHA-256 `ad1747d0826b85de14d33a315c7a9814f9dc006f8792fb489f36a2ab9be15217`). The input matches the checked-in six-source fixture byte for byte. This export's filename suffix distinguishes it from the preceding Most voted test; hashes identify the actual evidence.

**Website preservation:** the owner-reported route was **nuvio.tv Collections import → Collections export → view in Nuvio Desktop**. No Desktop import/export occurred. Exact comparison matches one collection, six folders and six sources, with zero changed source objects and no identity, sort or order changes. Each whole source retains numeric `voteCountGte: 0` or `100`, `vote_average.desc`, provider, media and native entity ID. The complete output differs only by 14 absent-to-false defaults: collection `pinToTop` and `focusGlowEnabled`, plus each folder's `hideTitle` and `focusGifEnabled`. No existing toggle changes; no filters, aliases or unsupported fields are removed in this pair.

**Desktop visual behavior:** all seven supplied screenshots were inspected. `Screenshot 2026-09-13 110511.png` shows **Version 0.1.23-alpha (23), Based on Nuvio 0.4.14**. That displayed version is separate from the pinned public source commit; the installed binary's exact commit is not established. The six result views correspond to the fixture's source labels:

| Source pair, all Top rated | Minimum 0 screenshot | Minimum 100 screenshot | Observed difference |
| --- | --- | --- | --- |
| Studio Movies, COMPANY 174 / MOVIE | `110335.png` | `110351.png` | Baseline begins The Amazon Trader, Romance in the Air and Survival of Spaceship Earth; 100 begins The Dark Knight, GoodFellas and Inception |
| Studio Series, COMPANY 3 / TV | `110404.png` | `110417.png` | Baseline shows more than five titles, including SparkShorts and Inside Pixar. The 100 view shows five: Win or Lose, Dream Productions, Cars on the Road, Dug Days and Pixar Popcorn |
| Networks, NETWORK 213 / TV | `110431.png` | `110442.png` | Baseline begins Stolen Heartbeats, Stokes Twins and Let's Marry Harry; 100 begins Teach You a Lesson, KPop Demon Hunters Lyric Videos and BAKI-DOU |

Screenshot names in the table share the prefix `Screenshot 2026-09-13 `. Movie and Network views continue beyond the viewport, so they are not complete result counts. The Studio Series five-title view agrees with the earlier dated production 15/5 endpoint result, but that separate endpoint response is not an audit of the Desktop's current returned titles.

Together with the unchanged source configuration, pinned resolver and production query evidence, the three visual contrasts **support minimum-vote filter application in the tested Desktop build**. They do not establish every returned title's vote count, exact complete result sets/ranking, other clients' behavior, or direct Desktop import/export preservation. No assistant-operated authenticated sequence is claimed. Original JSON and all seven original PNGs are preserved unchanged outside Git, with byte hashes, screenshot captions, the complete typed comparison and exact full-output assertions in the private handoff.

**Approved first implementation:** the owner approved the focused native Studio minimum-votes scope and issue creation. After #206 closeout, start a dedicated implementation chat/branch from verified updated main. Retained website preservation and Desktop visual evidence are sufficient for this bounded decision. No direct Desktop round trip, per-title vote audit, TV/Mobile acceptance, People test or compound-locale investigation is an additional prerequisite. The [approved issue scope](./STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md) supplies the implementation handoff; this investigation starts no runtime work.

## Implementation stages and Worker boundary

1. **Recommended first issue: native Studio minimum votes with shared Advanced control.** One optional integer control, unset by default, in the four existing Studio contexts. Reuse the Discover numeric input/error behavior and validation; keep COMPANY/ID/media/sort and grouping. Extend effective-filter candidate/variant identity and Preview request projection before enabling the UI. Use the existing `/builder/discover/movie` and `/builder/discover/tv` contract via a thin native query adapter. Revalidate exact source patches and plans; no hidden defaults and no standalone-Discover conversion. Website preservation and Desktop visual evidence support starting this slice under the approved focused scope. Its implementation tests must cover unset versus explicit zero/100, invalid integers, exact saved filters, current-draft Preview/query/cache and duplicate identity, untouched imported fields, minimal edits, and all four creation/editing contexts through the approved live integration path.
2. **Extend the same control to Networks and Streaming, then consolidate Genre/Decade numeric controls.** Preserve Network TV-only identity and explain its client defaults; preserve service/region and family placement guards. Confirm filtered imports retain their appropriate editor and exact cache identity. Reuse already accepted Genre/Decade functionality instead of presenting it as newly established.
3. **Add the remaining supported controls by family.** Named keyword/company/provider selectors and exclusions, scalar language/country, date/rating controls where they cannot replace family constraints. Reuse accepted per-media Both derivation and no-request-until-Preview behavior. Require field/subset acceptance rather than a simultaneous broad UI rewrite.
4. **Compound locale compatibility separately.** Complete field/media evidence first, then a narrowly scoped validator, UI, comparison and Worker change. Existing regexes reject compound language/country, so actual Preview support necessarily requires a Worker source change and Dave's separate owner deployment gate. No generic forwarding, mixed grouping or speculative normalization.
5. **People remains deferred pending client support.** No shared minimum-vote control for the current native resolver. An upstream report requires separate authorization; none is sent here. MDBList remains behind this work.

**Worker changes for the first Studio slice:** none expected if it reuses the existing bounded standalone Discover query route; this investigation verified that route live. Existing native-family routes remain narrow. Network exact parity with TV's hidden `with_status=0|3|4` would require a separate contract decision and currently unsupported query parameter; do not silently add it. Compound locale support does require a separately scoped Worker change. No Worker file, route, CORS, host, secret or deployment changed here.

Future UI acceptance includes 360, 384, 393, 402 and 412px plus desktop and short-height cases, browse-first focus, one intentional scroll owner, selected-card semantics and even-border notices. This investigation has no new UI to validate at those sizes. Existing mounted acceptance is regression evidence only.

## Review artifacts and verification

### Original investigation inventory checkpoint

The original investigation checkpoint contains **14 files**: the original 13 investigation files plus the requested proposed Studio issue. This historical list is retained for traceability; the final combined 28-file inventory is in [REVIEW.md](../../manual-tests/collection-preservation/REVIEW.md#complete-combined-pr-inventory).

| File | Change and purpose |
| --- | --- |
| `docs/v2/BUILDER_KNOWLEDGE.md` | Modified: current findings, corrected provenance and completed #202/#204 checkpoint |
| `docs/v2/BUILDER_PRODUCT_PLAN.md` | Modified: accepted investigation, priorities, scoped evidence and implementation sequence |
| `docs/v2/BUILDER_SOURCE_EDITING.md` | Modified: reconcile merged List editing/Preview completion and link the separate assessment |
| `docs/v2/SHARED_ADVANCED_ASSESSMENT.md` | New: capability/reuse tables, pinned sources, comparisons, accepted evidence, limits and this inventory |
| `docs/v2/STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md` | New: proposed focused implementation issue; no runtime changes |
| `manual-tests/shared-advanced/README.md` | New: exact routes, observed results, unresolved tests and reproducible commands |
| `manual-tests/shared-advanced/generate-fixtures.mjs` | New: authored input recipes and exact Builder-preservation checks |
| `manual-tests/shared-advanced/probe-production.mjs` | New: bounded opt-in live production evidence recorder; writes outside Git |
| `manual-tests/shared-advanced/fixtures/01-unchanged-round-trip.json` | New: authored six-source website input recipe |
| `manual-tests/shared-advanced/fixtures/02-native-people-votes.json` | New: authored eight-source role/media threshold input recipe |
| `manual-tests/shared-advanced/fixtures/03-native-studio-network-votes.json` | New: authored six-source Studio/Network threshold input recipe |
| `manual-tests/shared-advanced/fixtures/04-compound-locale-probes.json` | New: authored sixteen-source independent field/media input recipe |
| `scripts/investigate-shared-advanced.mjs` | New: actual Builder import audit and stable-identity typed comparison; private output outside Git |
| `tests/shared-advanced-investigation.test.mjs` | New: four pure comparison/fixture-preservation tests |

The four authored JSON files contain 36 ordinary source configurations, not private library exports or downloaded responses. Owner exports (including the website outputs), both full-library input versions, full typed comparison/audit results, raw service responses and every screenshot stay outside Git. File hashes and limited findings in this report identify that private evidence without adding the files themselves.

### Reproduction and validation

See [manual pack and exact steps](../../manual-tests/shared-advanced/README.md). Four generated input files contain 36 ordinary native sources: unchanged website round trip, eight native People controls, six native Studio/Network controls and sixteen independent compound-locale probes. Each file passed the actual importer/serializer exact preservation check. Their unique 206-prefixed IDs protect against accidental identity collision; an isolated destination is still required.

Reproducible tools: `scripts/investigate-shared-advanced.mjs` audits the actual original file and compares two exports without rewriting them; its private output must be outside Git. `manual-tests/shared-advanced/probe-production.mjs` records eleven bounded real requests; it refuses to overwrite evidence. `generate-fixtures.mjs` validates recipes through the actual Builder path and refuses to overwrite existing fixtures. Four focused tests cover typed differences, absent/empty values, stable source IDs and order, ambiguous/missing identities, overwrite refusal, unchanged inputs and two exact Builder cycles for all 36 manual sources.

The review handoff retains the complete changed files, baseline files, diff, SHA inventory, original 48-row private audit, dated live responses/summary, website asset identities and pure normalization results, corrected full-library comparison, owner-supplied Most voted website reproduction, separate Studio/Network website pair and seven Desktop screenshots, commands and full validation log. Private exports and screenshots remain outside Git. No historical #202/#204 acceptance is relabeled as support for these new capabilities. Native People and compound TMDB semantics remain pending; the Studio/Network Desktop visual result is established only to the scope above. Browser/build/sync and the screenshot referenced for the earlier Most voted test remain unverified; these later Desktop screenshots do not fill that earlier evidence gap.

Validation on 13 September 2026:

| Check | Result |
| --- | --- |
| Initial investigation `scripts/check.cmd` with the private original-import fixture | Stopped at the mounted suite's People Movies Preview setup at 360px: the Preview did not become available within 20 seconds. All earlier commands passed. This historical full invocation did not pass |
| Unchanged `tests/builder-source-edit-mounted.test.mjs` retry, bundled Node, diagnostics enabled | 49 enabled tests passed, 7 mode-specific tests skipped, zero failures; 337 seconds. Uses the required live production integration. The first setup failure's cause is not established |
| Eight commands after that mounted suite in `scripts/check-all.mjs`, run separately | Passed: line-ending/Windows validation, four existing manual-fixture checks and two migration round-trip checks |
| `node --test tests/shared-advanced-investigation.test.mjs` | 4/4 passed; pure comparison and two-cycle fixture preservation |
| Final original audit and correct September comparison | Passed; 48 blocked sources preserved exactly, all 3,538 September identities matched without order changes |
| Eleven production probes | Passed their endpoint/credits/negative-policy assertions; no installed-client acceptance inferred |
| Script syntax and `git diff --check` | Passed |
| Input-version correction assertions | Passed: original hash/byte count, reverse byte equality, exactly 18 input-only viewMode differences, zero original-to-export layout changes, three empty collection-backdrop omissions, and unchanged full source/folder diff arrays. Four investigation tests passed again |
| Fresh `scripts/check.cmd` for the input-version correction | **Passed completely, exit 0**, including the required live mounted-browser integration and all later checks. Full log retained separately from the initial investigation logs |
| Owner-supplied six-source website pair | Input matches the checked-in fixture byte for byte; exact comparison confirms two Most voted rewrites, retained controls and canonical thresholds, no collection/identity/order changes, only matching alias removal and specified folder defaults/probe removal |
| Owner Studio/Network website pair and Desktop screenshots | Input matches fixture; all six complete source objects unchanged, zero sort/identity/order changes; exact full-output assertion permits only the 14 absent false presentation defaults. Seven supplied screenshots inspected, including displayed Desktop build and five Studio Series titles at 100. Original hashes verified unchanged |

Publication verification after owner acceptance: a fresh full `scripts/check.cmd` run passed completely (exit 0), including required live production mounted integration and the supplied original-import audit. All four focused investigation tests passed again. The complete 14-file inventory, authored fixture structure, staged blob hashes, targeted credential scan and excluded private-file audit passed; `git diff --check` and the staged whitespace check passed. No private export, screenshot, full comparison or downloaded response is included in the commit. The earlier runs and their limitations above remain historical evidence rather than being replaced by this pass.

At the original 14-file checkpoint, no production files, Worker, dependencies or existing test harness changed. The later pack extends the investigation comparator and required check entry point and adds pure tests/manual tooling, with no runtime changes. Final scope is the combined inventory above. The owner approved closeout and creation of the [Studio implementation issue](./STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md), with no runtime implementation, broader expansion or Worker deployment here.