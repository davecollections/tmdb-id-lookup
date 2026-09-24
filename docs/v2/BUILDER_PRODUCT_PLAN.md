# Dingo's Collection Builder — Product Plan

## Current checkpoint - 2026-09-22

**Verified through [#238](https://github.com/davecollections/tmdb-id-lookup/issues/238) / merged [PR #239](https://github.com/davecollections/tmdb-id-lookup/pull/239), followed by [#240](https://github.com/davecollections/tmdb-id-lookup/issues/240) / merged [PR #241](https://github.com/davecollections/tmdb-id-lookup/pull/241).** Main for documentation reconciliation [#242](https://github.com/davecollections/tmdb-id-lookup/issues/242) is `450fddc52a33a15bb1e5a78f4e3f6ef5096c3675`. Post-#238 validation exposed a real shared image-fallback race; #240/#241 repaired it, and final [Nuvio Contract Validation](https://github.com/davecollections/tmdb-id-lookup/actions/runs/35645127885) and [Pages publication](https://github.com/davecollections/tmdb-id-lookup/actions/runs/35645127801) succeeded.

Export #194 / PR #195, roadmap reconciliation #234 / PR #235 and Back to top #236 / PR #237 are complete and merged. Optional direct Nuvio read/import is on main; Send is not. [#244](https://github.com/davecollections/tmdb-id-lookup/issues/244) has its Send foundation and **Export & Send** UI implemented on the feature branch, with owner-operated live acceptance passed and commit/push/PR preparation authorized. The approved Pass 3 product revision replaces mandatory recovery with one optional raw current-Nuvio backup and one fresh preflight before guarded replacement. Its subsequent UI refinement adds R0/P summary-tile comparison, non-dismissible active progress, Done-only verified success and quiet Last Send history inside Export & Send, with compact attention for unresolved attempts. The approved safety architecture is unchanged. The owner completed one successful live replacement on the intended test profile; no restoration or deployment occurred. Local evidence is in [testing](../TESTING.md#send-hardening-244-pass-3), and the [connection/UI contract](./BUILDER_NUVIO_CONNECTION.md#export--send-ui-244-pass-2) records this checkpoint. V2 remains isolated/unadvertised with `noindex, nofollow`; public-release approval is unchanged.

The final owner-approved #244 polish adds a neutral-current/subtle-cyan-proposed distinction, exact Collection-removal warnings and contextual **Merge instead** into the existing local Import review. It performs no remote Collection write and requires explicit local Merge selection/application. The shared Import/Send PIN field automatically verifies four valid numeric digits, clears/refocuses after an incorrect PIN and retains existing identity, grant and lockout rules. The subsequent presentation-only pass softens manual Download/Copy, names the actual profile in removal/Merge help, explains returning to Export & Send after local Merge, gives completed/no-op/rejected results Done only and blocks dismissal throughout active Send work. Compact decorative CSS dots support status text and become static under reduced motion. Send remains Replace-only. Owner-operated physical-iPhone live acceptance passed; merge/publication remain owner gates.

<a id="current-checkpoint---2026-09-19"></a>

## Historical checkpoint - 2026-09-19

This retains the #234 baseline and completed sequence at that date; the checkpoint above and canonical roadmap own current status.

**Verified through [#232](https://github.com/davecollections/tmdb-id-lookup/issues/232) / merged [PR #233](https://github.com/davecollections/tmdb-id-lookup/pull/233).** Canonical main at the start of documentation reconciliation [#234](https://github.com/davecollections/tmdb-id-lookup/issues/234): `1bd4fb8bbfba3445aec6fb6d2b6dcf5ca76a5bac`, with clean local main, origin/main and GitHub main equal. Collection Folder management and Preview-100 are merged; the Shared Advanced sequence is complete for the currently approved families and fields. **Global display settings** is the current user-facing name.

The completed September sequence since the previous checkpoint is:

| Issue / merged PR | Completed scope |
| --- | --- |
| [#216](https://github.com/davecollections/tmdb-id-lookup/issues/216) / [#217](https://github.com/davecollections/tmdb-id-lookup/pull/217) | Shared Studio/Network minimum and maximum rating |
| [#218](https://github.com/davecollections/tmdb-id-lookup/issues/218) / [#219](https://github.com/davecollections/tmdb-id-lookup/pull/219) | Complete approved Studio/Network Shared Advanced filters |
| [#222](https://github.com/davecollections/tmdb-id-lookup/issues/222) / [#223](https://github.com/davecollections/tmdb-id-lookup/pull/223) | Genre curated artwork and Square folder shape |
| [#220](https://github.com/davecollections/tmdb-id-lookup/issues/220) / [#221](https://github.com/davecollections/tmdb-id-lookup/pull/221) | Genre, Decades and Streaming Advanced alignment and expansion |
| [#224](https://github.com/davecollections/tmdb-id-lookup/issues/224) / [#225](https://github.com/davecollections/tmdb-id-lookup/pull/225) | Published Decades folder artwork integration |
| [#226](https://github.com/davecollections/tmdb-id-lookup/issues/226) / [#227](https://github.com/davecollections/tmdb-id-lookup/pull/227) | Supported exact TMDB Preview up to 100 source positions |
| [#228](https://github.com/davecollections/tmdb-id-lookup/issues/228) / [#229](https://github.com/davecollections/tmdb-id-lookup/pull/229) | Node24 Actions and Node22 genre maintenance |
| [#230](https://github.com/davecollections/tmdb-id-lookup/issues/230) / [#231](https://github.com/davecollections/tmdb-id-lookup/pull/231) | Unified guided stage presentation and green retained multi-selection |
| [#232](https://github.com/davecollections/tmdb-id-lookup/issues/232) / [#233](https://github.com/davecollections/tmdb-id-lookup/pull/233) | Existing-Folder shape changes, removal and sorting within a Collection |

The [canonical roadmap](#18-roadmap-and-mandatory-gates) owns the new near-term order. V2 remains isolated and unadvertised under `/builder/`, with `noindex, nofollow`. **No public-release approval has been given.** This documentation pass changes neither product behavior nor release readiness.

<a id="current-checkpoint---2026-09-13"></a>

## Historical checkpoint - 2026-09-13

This checkpoint retains the baseline and acceptance evidence recorded for #210. Its sequencing is superseded by the 2026-09-19 checkpoint and canonical roadmap.

**Historical main baseline:** `1cafa19168d23538d8ba416ed75cc52d3005ccb9`, verified clean and equal to `origin/main` for roadmap reconciliation [#210](https://github.com/davecollections/tmdb-id-lookup/issues/210). The [canonical roadmap](#18-roadmap-and-mandatory-gates) below owns current product direction; dated checkpoints and focused implementation documents retain their historical evidence, not outstanding release gates.

Investigation [#206](https://github.com/davecollections/tmdb-id-lookup/issues/206) is complete through merged [PR #207](https://github.com/davecollections/tmdb-id-lookup/pull/207), merge `2e6d1e72f7d2351327c0790f5b60beb60ba0ef66`. Its accepted [capability assessment](./SHARED_ADVANCED_ASSESSMENT.md) and [saved-JSON preservation results](../../manual-tests/collection-preservation/RESULTS.md) remain evidence, not a request to repeat the investigation.

**Studio Minimum votes [#208](https://github.com/davecollections/tmdb-id-lookup/issues/208) / [PR #209](https://github.com/davecollections/tmdb-id-lookup/pull/209) is complete, owner-approved, merged and published** at the baseline above. [Main validation](https://github.com/davecollections/tmdb-id-lookup/actions/runs/34746525722) and [automatic Pages publication](https://github.com/davecollections/tmdb-id-lookup/actions/runs/34746525698) passed. New Collection, New Folder, Add Source and Edit Source share optional Minimum votes, unset by default with explicit zero preserved, native COMPANY identity, and matching current-draft Preview, Review, export and exact-duplicate behavior. **No Worker change was required or made for #208.** The [current Studio contract](./BUILDER_STUDIOS.md#shared-minimum-votes-208) supersedes the assessment's proposed first slice and the [historical approved issue draft](./STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md); Studio runtime implementation is no longer future work.

Discover [#202](https://github.com/davecollections/tmdb-id-lookup/issues/202) / [PR #203](https://github.com/davecollections/tmdb-id-lookup/pull/203) is merged at `d9ad329d761522735e964ca69fba8267fac095ed`; imported List editing/current-draft Preview [#204](https://github.com/davecollections/tmdb-id-lookup/issues/204) / [PR #205](https://github.com/davecollections/tmdb-id-lookup/pull/205) is merged at `efe9966ebb04392dbc540f131ff19790d1c1e8ca`. Owner review, publication and cleanup are complete for both; the [historical #204 Pages run](https://github.com/davecollections/tmdb-id-lookup/actions/runs/34724507178) passed. The completed #204 acceptance includes current-draft Discover media/orders/effective filters, selected-only combinations, concise complete/partial List summaries, and conditional filter/sort notices. That acceptance does not establish new client filter capabilities.

### Accepted compatibility evidence and limits

The #206 website pair preserves all six Studio/Network source objects, including numeric 0/100 thresholds. Desktop 0.1.23-alpha (23) screenshots support minimum-vote application in that tested build, including five Studio Series titles at 100. The historical visual test involved website import/export followed by Desktop viewing, not direct Desktop import/export or a per-title vote audit. It does not prove complete Movie/Network results or other clients' behavior; the installed binary's exact commit is unknown. The later four-route pack separately establishes saved-JSON preservation, not title-result application.

The [saved-JSON pack](../../manual-tests/collection-preservation/README.md) forms part of the [combined investigation inventory](../../manual-tests/collection-preservation/REVIEW.md#complete-combined-pr-inventory). Every method started with a fresh import of the original master. Manage from phone imported/exported through that interface; direct TV imported through the local network URL and exported on the TV, with the export retrieved through File Explorer. Compressed transfer decoded to the unchanged master. Exact run times, sync activity, destination isolation and other unrecorded details remain unknown; no internal import/sync/export cause is inferred. The owner reported the findings in Nuvio Discord; no message link was supplied. Private evidence remains outside Git. Builder must keep correct supported JSON without compensating for upstream sort rewrites, removed exclusions or differing defaults.

## Native variants checkpoint - 2026-09-10

Historical issue-stage record: #200 subsequently merged through PR #201. The publication/merge wording below describes that checkpoint, not a current gate.

**Implemented and owner-approved (#200, 2026-09-10):** People, Studios and Networks use the existing multi-option **Sources to create** direction in Add Source, New Collection and New Folder. Popular, Recent, Top rated and Most voted create ordinary native scalar Sources in canonical order. Existing title Preview inspects the complete configured candidate set with Role where relevant, Media where there is a choice, and Show. Add inserts missing exact variants into the selected folder. Guided New Folder plans exact Sources across the destination Collection: create a folder for an entity with no recognized matching folder, append missing variants to one matching folder, and add nothing for fully present entities. When several folders match and Sources are missing, Configure requires an inline **Add new sources to** choice. Existing Sources stay in place; names, artwork, raw data and settings remain preserved. Append-only plans finish with Add sources in Configure; mixed plans apply appearance only to new folders. Zero-addition or unresolved plans cannot progress. Merging, replacement and alternate Collection routing remain outside this scope. See the [native-variant contract and supplied client comparisons](./BUILDER_NATIVE_VARIANTS.md). Most voted remains supported in Dingo; reported website import/export rewrites require investigation, and JSON preservation in TV/Desktop does not prove displayed ranking. Publication preparation is authorized; merge remains a separate owner gate.

### Priorities after #202/#204

This former queue is superseded by the [canonical roadmap](#18-roadmap-and-mandatory-gates), following completed #206/#207 and #208/#209. The accepted compatibility observations below remain unchanged in scope; they are not pending implementation tasks.

- **Nuvio.tv Most voted reproduction and historical attribution:** the corrected September comparison uses the 2,619,074-byte original, SHA-256 `e3baaefbb0de52639f5a7789a02989f74e9aa4827c6863a402dd50fc838818a7`. All 18 collections already use ROWS; there is no layout change. The 756 folders and 3,538 sources match without identity/order changes. The earlier comparison used a separate TABBED_GRID version; both inputs and provenance are preserved without attribution. Deployed normalization code reproduces the Movie/Series fallbacks, and the later exact six-source website import/export pair confirms both rewrites while retaining Top rated, numeric thresholds, collection settings and order. This identifies behavior and a mechanism, not the responsible step in the earlier sequence. Missing screenshot/build/sync details are not inferred. Continue exporting the selected `vote_count.desc`; do not imitate the fallback. The subsequent owner Discord report does not authorize an assistant to send a new upstream report.
- **Folder-level Focus Glow/pin:** the September output removes 176 folder `focusGlowEnabled: true` values and one folder `pinToTop: true`. Neither is in the inspected native folder models or website folder serializer. Supported collection fields and folder `focusGif*` are distinct. Preserve these unsupported imported folder extensions in Builder without relocating or normalizing them.

Status: Durable product direction for the isolated v2 Builder

Last reviewed: 2026-09-22 (publication/status reconciliation #242; verified through #240 / PR #241)

This document records the current product direction recovered from the owner-supplied V1 and V2 project histories and reconciled with the repository, tests, manual Nuvio evidence, current GitHub history, and official Nuvio documentation. It is not a release claim or an implementation specification.

Decision labels mean:

- **Confirmed:** an owner decision that agrees with current repository evidence.
- **Confirmed direction:** an approved direction whose detailed design remains future work.
- **Deferred:** intentionally later than the current roadmap gate.
- **Open decision:** evidence or owner approval is still required.
- **Rejected:** not part of the intended product.
- **Superseded:** replaced by a later decision or stronger evidence.

Implementation, deterministic tests, and confirmed manual Nuvio evidence override obsolete plans. [`BUILDER_KNOWLEDGE.md`](./BUILDER_KNOWLEDGE.md) owns the detailed technical contract.


## 2026-09-07 - First-stage multiple sorting creation (#198)

Historical issue-stage record: #198 subsequently merged through PR #199, and #200 / PR #201 completed native People/Studio/Network variants. The publication and later-stage wording below retains its original context.

The owner-approved first stage covers Streaming, Genres and Decades/Years in ordinary Add and guided creation. Selecting several existing semantic sorts creates ordinary scalar-sort Sources within existing structures; it does not introduce a saved multi-sort type or sort-specific Folders. The existing title Preview keeps its visual design and nested navigation, with a separate active **Show** selector alongside Media and applicable Region/Genre/Year/Source choices. Preview selections do not alter creation selections. Authored copy and generated names follow the [ASCII-separator convention](./BUILDER_HIERARCHY_CREATION.md#creation-sorting-and-authored-punctuation-198), preserving custom/imported data.

Issue [#198](https://github.com/davecollections/tmdb-id-lookup/issues/198) has completed owner review and is approved for publication, pending separate merge approval. People, Studios and Networks remain a later stage; Franchises are excluded by owner decision and TMDB Lists retain original order. This work does not expand the separate MDBList roadmap note below.

The #198 owner-approved wording refinement labels creation choices **Sources to create**, uses “Choose one or more options. Movies and Series get separate sources.” and validates empty selections with “Choose at least one option.” Creation summaries use **Selected:** and the existing Preview variant selector uses **Show**. Single-Source editors retain **Sort titles by**. See the shared [wording convention](./BUILDER_HIERARCHY_CREATION.md#creation-sorting-and-authored-punctuation-198); this refinement changes copy and its accessibility associations only.

## 1. Product purpose

**Confirmed**

- V1 remains the stable TMDB ID lookup and Nuvio JSON export utility at the repository root.
- V2 is the mobile-first visual **Dingo's Collection Builder**, made for Nuvio and powered primarily by TMDB.
- Lookup and copy-ID capabilities remain part of the broader product.
- Playback is outside scope.
- V2 must not replace or destabilise V1.
- The Builder should make collection creation approachable without requiring knowledge of TMDB IDs, raw JSON, source envelopes, `catalogSources`, Discover syntax, or Nuvio implementation details.

The Builder is active but isolated under `/builder/`. It is still unlinked and marked `noindex, nofollow`; this document does not describe it as publicly released.

## 2. Audience

**Confirmed direction**

The product must serve:

- beginners who want a ready-made, bounded setup;
- people who want a short guided path to a personalised setup;
- users who need to import and safely edit an existing configuration;
- advanced users who want manual control;
- mobile users who need large tap targets and manageable steps;
- users who want large curated setups without facing one enormous form or raw JSON.

Progressive disclosure should let a beginner reach a useful result while preserving the depth needed by an experienced user.

## 3. Product identity and trust promise

**Confirmed**

- The product name is **Dingo's Collection Builder**.
- A supporting line such as **Made for Nuvio** may be used; final wording needs later review.
- The visual direction is modern, dark, sleek, and mobile-first, with restrained TMDB-inspired blue, cyan, and green accents. It is not warm or cosy.
- No account, personal TMDB API key, or personal information is required to complete the core build-and-export journey.
- Core importing and editing remain local-first in the browser.
- **Copy JSON** and **Download JSON** are complete supported paths, not fallback-only features.
- Before the Builder's `noindex` state is removed or V2 is released or promoted for public use, its visible UI must identify TMDB use with an official TMDB logo and prominently display: **“This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.”** The TMDB mark must remain less prominent than the application identity.

**Confirmed direction**

The optional Direct Nuvio import connection requires Nuvio authentication. Product copy must avoid absolute promises such as “no login ever.” The core Builder does not depend on that connection.

## 4. Startup experience

**Confirmed direction**

The intended Builder home presents four routes:

1. **Quick Setup** — answer a few plain-language questions and generate a useful editable setup.
2. **Use a Template** — choose a curated recipe and customise the generated result.
3. **Import Existing JSON** — open a current configuration through the preservation-first importer.
4. **Start Manually** — enter the Builder with a clean hierarchy and full control.

The audience and mental model differ for each route, so they should not be collapsed into one technical import/create form. Users must also be able to return to a meaningful Builder home instead of being trapped in the workspace.

**Current implementation boundary**

The current welcome screen supports starting a clean collection plus local-file or pasted-JSON import. The four-route experience is planned, not implemented, and follows the current near-term sequence.

“Project” is primarily an internal data-model term. It should not become prominent user-facing language unless future persistence gives it a clear user meaning. The Builder does not currently store or manage multiple cloud projects.

## 5. Dave’s 1-Click Setup

**Confirmed direction**

**Dave’s 1-Click Setup** is the working name for the beginner-friendly guided Quick Setup feature. “One-click” means little prior knowledge and a short decision flow, not necessarily one literal button.

The feature:

- generates the normal editable Builder hierarchy;
- does not create a locked or separate output format;
- opens the generated setup in the full Builder;
- allows normal rename, reorder, remove, add, presentation, artwork, review, and export actions;
- uses sensible defaults and curated recipes;
- avoids generating the maximum possible setup by default.

The recovered initial questions are:

1. Movies, series, or both?
2. Which genres do you prefer?
3. Do you mostly use TV, phone, or both?
4. Which optional must-haves matter, such as anime, international content, awards, family content, or new releases?

These questions are the confirmed starting direction. Exact copy, optional questions, and branching remain design work.

## 6. Templates and recipes

**Confirmed direction**

Templates are curated starting points. Recipes are inspectable rules that generate ordinary editable Builder data; they are not opaque finished JSON and should remain distinct from serialization output. Recipes may eventually support reusable rules, dynamic dates, dependencies, and versioning.

Recovered candidate presets include:

- Essential;
- Complete;
- Full or Dave’s Full Setup;
- Movies;
- Series;
- Family;
- Dave’s Recommended Setup or Dave’s Setup.

Their exact public names, contents, sizes, and order are **open decisions** for a dedicated recipe-design issue. A useful proposed naming hierarchy is:

- **Quick Setup** — startup route;
- **Dave’s 1-Click Setup** — guided feature;
- **Dave’s Recommended Setup** — default curated recipe;
- **Essential / Complete / Full** — increasing setup sizes.

This hierarchy is a recommendation, not final naming.

An Ultra MAX-scale setup is useful compatibility and advanced-product evidence. It must not become the only template or the beginner default. Curated defaults should expose a manageable subset while leaving the larger catalogue searchable.

## 7. Kaptain comparison and boundaries

**Confirmed comparison lesson**

Kaptain’s broad onboarding pattern offered:

- Set Up & Send to Nuvio;
- Just give me the collection;
- Build it manually.

The useful lesson is the separation of audiences before exposing complexity. Kaptain primarily starts with a large curated collection and lets users remove or customise it. Dingo's Collection Builder is broader: a user may start with guided setup, a template, entity/search creation, manual creation, or preservation-first import.

Adopt as product principles:

- simple onboarding and plain-language questions;
- device-aware defaults;
- guided walkthrough concepts;
- quick and advanced paths;
- a clear review before final output.

**Rejected**

- copying Kaptain’s collection, code, branding, wording, layout, files, or artwork;
- guessing source identities from visible behaviour;
- replacing the preservation-first importer with a simpler lossy importer;
- making one enormous setup the only starting experience.

External comparison sites are design evidence, not product or technical authority.

## 8. Search and Add

**Confirmed product principle**

Users choose what they want; the Builder creates the required Nuvio hierarchy.

The implementation paragraphs in this section retain issue-stage history; later Shared Advanced, artwork, standalone Discover and Preview-100 contracts summarized in [Current state](#current-state) supersede their earlier restrictions.

The durable shared New Collection/New Folder contract is in [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md). Family documents retain their own source, sort, naming, identity, default, artwork, and duplicate semantics.

Search/Add should cover, within the confirmed compatibility contract:

- Actor;
- Director;
- Studio (internally TMDB/Nuvio `COMPANY`);
- Network;
- Franchise or TMDB Collection;
- Genre;
- Decade;
- Language;
- Country;
- Streaming provider;
- Custom TMDB Discover.

Suitable categories should support both single and bulk selection. For example, a user can create an Actors collection, select several search results, and let the Builder create the appropriate folders and native `PERSON` sources. The user should not repeat collection → folder → source setup for every actor.

Likely destination concepts are:

- create a new collection;
- add to an existing collection;
- add as a folder or source where the hierarchy makes that appropriate.

Exact action labels remain open. A visible plus symbol must perform the creation action a user reasonably expects.

**Implemented and merged through issue #65 / PR #66, with owner desktop/final physical-iPhone acceptance and successful current Nuvio Desktop import/runtime/round-trip evidence:** the initial #65 slice introduced Add Source for a selected existing folder with one Movie franchise · TMDB mode. It uses explicit full-screen Search and Review stages on phones, an isolated opaque mobile surface/coverage guard, responsive uncropped posters or stable placeholders, bounded result context, pagination only when needed, contained movie titles on demand, TMDB-backed `include_adult=false` search plus exclusion only for result objects explicitly marked `adult: true`, one canonical native `COLLECTION` source, and an identity-bound selected-folder duplicate override. It does not infer collection age suitability from wording or contained-part flags, provide an age guarantee or age gate, or implement destination branching, bulk selection, automatic collection/folder creation, or any other listed source type.

**Historical issue #74 / PR #75 checkpoint, merged with final owner Nuvio Desktop visual/import/export acceptance and superseded for hierarchy creation by issue #118 / PR #119:** the mode chooser added selected-folder `Add person` alongside Movie franchise, while Folders exposed the then-current collection-level `Add people` shortcut. Folder quick add configured direct Acting Movies/Series and Directed Movies/Series choices. An empty Builder-generated Untitled default was atomically promoted into a canonical-name, final-artwork person folder; every other destination preserved its presentation and received sources only. The original collection-batch UI retained up to 20 exact-ID selections across search/page/Back. That 20-person cap was a historical UI limit, not a hierarchy, controller, serialization, or current product limit. Issue #118 replaced that collection shortcut implementation with the shared uncapped New Collection/New Folder People hierarchy flow while preserving selected-folder Add Source behavior. The issue #74 regenerated fixture remains valid dated client evidence: both curated Posters rendered, all four distinct tabs and their Acting/Directing catalogues worked, and the immediate export preserved the exact SHA-versioned artwork URLs, `hideTitle: true`, IDs, grouping, source order, and native `catalogSources: []`. The client version/build remains unknown.

**Implemented and merged through issue #78 / PR #79, with deterministic checks, bounded local desktop/mobile browser QA, and owner desktop/physical-iPhone acceptance passing:** supported Movie Collection and People source cards expose `Edit source` before Delete. One physical source is edited in place through a registry-backed adapter and one minimal controller update. Selecting another Movie Collection immediately applies its canonical TMDB name to the draft while retaining custom/reset/Cancel behavior; provider/type/media/sort/filters stay fixed. People keeps the person ID fixed, allows the same four Acting/Directing and Movie/Series identities, auto-manages only approved default titles until manual customization, reuses one shared bounded non-blocking combined-credit count result, and exposes only stable-v1 Popular/Recent/Top-rated sort values while preserving untouched imports. Desktop/tablet editors now use natural content height capped by the viewport while the reviewed mobile shell remains full-height with one scroll owner and sticky actions. Add Source Collection Review and People Configure expose only validated canonical TMDB collection/person ID links, with external/new-tab semantics and mobile-safe wrapping; unsupported IDs remain plain or absent. Prominent focused duplicate/stale/validation alerts, difference-only owned-field patches, same-folder duplicate rejection, stale-session refusal, exact source focus recovery, and imported raw/unknown/order preservation are required. Studio, Network, and simple Streaming-shaped DISCOVER sources use the display-name/sort seam; simple official Genre and canonical Decade DISCOVER sources additionally own their focused approved filter sets while keeping their structural identities fixed. Generic Discover, addon, opaque, and other unsupported native shapes remain Delete-only. A complete current-client V2 edit/export round trip is deliberately deferred until V2 exposes export; it is not an unfinished merge gate. Logical bundle editing, person replacement, and Movie Collection sort/filter controls remain separate work.

**Merged through issue #92 / PR #93:** the selected-folder mode picker adds **Studios**, backed internally by TMDB/Nuvio `COMPANY`, and every child Search screen can return to that picker without closing the modal. Studio Search adapts V1's Company name/ID/parent/country/headquarters discovery to a mobile-first relevance model with compact locations, deliberate country-code matching, hidden Best Match plus A–Z/Most movies overrides, automatic paged Browse when empty, Hide 0 movies, contained real logos, restrained missing-logo text, and safe upper-right TMDB Company links. Franchise, People, and Studio retain ordinary `type="search"` fields with no adjacent clear control. Catalogue browsing makes no live count requests and shows a valid legacy total only as `Movie Count: XXX`. Selecting a Studio requests current Movie and Series totals in parallel through two narrowly allowlisted Worker routes; all count states remain informational and non-blocking, load automatically, and expose neither Retry nor Refresh. Retained resolver, sort, fixture, construction, duplicate, serialization, and edit evidence covers native `COMPANY/MOVIE` and `COMPANY/TV`, so both may be created together in Movie-then-Series order with concise user-facing **Movies**/**Series** labels and compact semantic no-icon sort pills mapped to correct media values. Same-folder duplicates use one compact outcome sentence; normal Add remains visually dominant and commits only missing identities, while a quieter exact configured-set **Add all anyway** override remains explicit. Each physical source supports independent display-name and sort editing while identity/media stay locked. Desktop primary cards also support safe double-click into their existing editor while explicit menu Edit remains the touch/discoverable route. See [`BUILDER_STUDIOS.md`](./BUILDER_STUDIOS.md).

**Merged through issue #98 / PR #99 with owner acceptance complete:** the selected-folder mode picker adds **Networks** for one native Series source. Network Search lazily uses the checked-in catalogue for automatic 20-row A–Z Browse, exact ID selection, and hidden Best Match across name plus country/location metadata. Its historical compact `t` value is discarded during normalization and cannot affect search, rank, filter, browse order, paging, cards, identity, source construction, or serialization. Cards show contained logo/fallback, name, compact location, and quiet TMDB ID only. Configure links to the canonical TMDB Network page and automatically requests one current Series Count through the narrowly tracked `/3/discover/tv?with_networks=<id>` Worker path; positive, zero, checking, and quiet unavailable states are informational and non-blocking with no Retry/Refresh. Popular/Recent/Top-rated/Most-voted map to the evidenced TV sort values. One exact projection-free `NETWORK/TV` source is added atomically; same-folder duplicates require exact **Add anyway**, elsewhere matches remain informational, and the existing physical editor permits display-name/sort changes while identity stays fixed. The reviewed Worker route was manually deployed on 2026-08-09; bounded live Network and existing Company-route acceptance plus a production-built mock-disabled Builder passed, while no Nuvio client result is claimed. See [`BUILDER_NETWORKS.md`](./BUILDER_NETWORKS.md).

**Implemented and merged through issue #104 / PR #105 after live Worker evidence and final hands-on owner refinement:** the selected-folder picker adds **Streaming service** as its fifth mode. Region(s) is first with zero selected, natural ordered row toggling, a curated live-resolved **Common** default beside complete **A–Z**, complete-catalogue search with persistent selections, a selected count, and disabled-until-valid **Next**—without a separate single/multiple mode, ranking claim, locale default, or geolocation. The Provider step derives only IDs with common Movies and/or Series availability across every selected region. One region defaults to a 30-row **Top providers** list using that region's real TMDB priority, explicitly not popularity, beside A–Z; multiple regions use eligible A–Z/search only with no synthetic ranking. Provider remains single-select. Configure retains the four DISCOVER semantic sorts, gives each generated physical source a distinct `<Provider>, <REGION> - Movies` or `<Provider>, <REGION> - Series` default that may be customized independently, and reviews candidates and duplicate outcomes without a separate Review screen. User-selected-region then Movie-before-TV ordering feeds one atomic controller batch; construction and identity remain DISCOVER Core-owned with only `watchRegion` and `withWatchProviders`, and title remains excluded from identity. Simple Streaming-shaped physical DISCOVER sources expose name/sort-only Edit through the existing adapter registry while Provider, Region, media, and filters remain fixed and compound/filtered/malformed/unknown meaningful shapes remain Delete-only. Sort changes still use DISCOVER Core identity for duplicate rejection. Missing logos retain the established text fallback. The global **About & Credits** modal centralizes TMDB and JustWatch-via-TMDB attribution. The 9 Aug nuvio.tv stripping result remains historical after the successful 10 Aug retest. The deployed Worker contract is unchanged. See [`BUILDER_STREAMING_SERVICES.md`](./BUILDER_STREAMING_SERVICES.md).

**Owner-approved implementation through issue #162 after desktop and physical-phone review:** Streaming Services joins the shared New Collection/New Folder hierarchy launcher after Genres while preserving the physical Add Source and Source Edit flows above. Ordered multi-provider selection has no cap; one global media choice requires every provider to support the requested media in every selected Region, and Region/media changes retain selected services in order whenever they remain eligible while pruning only newly ineligible provider IDs; one global Sort and grouped-by-service default produce exact `P × R × M` canonical sources. Multi-Region plans may instead use provider/Region folders. Context-aware names distinguish standalone, grouped, and separate placement without migrating existing titles. Provider logos remain transient, new unknown artwork stays unassigned, and reused existing artwork/focus fields remain exact; Review shows no temporary artwork warning. Preview is exact/lazy/bounded through the already deployed strict Streaming path, and logical placement trusts contained canonical source evidence rather than Folder title. Partial trusted folders receive missing exact sources, different-Sort slots block, elsewhere matches stay informational, and mixed/opaque evidence fails closed. New Collection reuses ordinary Streaming exact duplicate inspection for raw no/partial/complete project-wide overlap. Its destination discovery also recognizes zero-overlap Collections with trustworthy content-derived affinity from an effective preserved/imported native Movie/TV Discover source carrying a valid Watch Provider expression and Watch Region, including compound providers, extra filters, and canonical/preserved aliases. Titles, Lists, artwork, addon sources, and network-only Discover do not count. Affinity broadens Collection discovery only: exact duplicate identity and strict canonical-simple existing-Folder placement remain unchanged, every candidate still passes the same full existing-Collection planner, and a newly selected provider receives a new sibling Folder when no strict placement exists. Exact-overlap candidates rank first by match count, then affinity-only candidates in project order; none is auto-selected. Equal visible Collection titles receive UI-only project-order `· Collection N` labels consistently across cards, disclosures, selected Review, and zero-change notices; unique titles remain clean and internal identity is unchanged. Cards use plain exact delta copy and reliable Folder/Source context, while affinity-only cards explicitly say **Existing Streaming collection** and that no selected sources are there yet. Selecting an existing route activates only its mutation-delta Review, while **Create new collection instead** restores full creation and the complete-overlap duplicate confirmation. Complete existing overlap is a zero-mutation **Nothing to add** route that states no project changes are needed. Collection/new-Folder title drafts survive route changes, reused Folder titles remain read-only, and selected plans retain ordinary stale revalidation. Configure/Review carry compact run context and responsive Region selection retains border/surface/structural inset without a marker or cyan rail under the later issue #178 choice-presentation contract. A focused controller audit found no existing operation that could append to multiple existing folders and create new folders in one commit; the narrow family-independent collection-extension batch adds only that capability while preserving imported overlays/order and rollback. No other hierarchy family, Worker, schema, importer, serializer, export, V1, dependency, deployment, or production publication changes are included. See [issue #162](https://github.com/davecollections/tmdb-id-lookup/issues/162) and [`BUILDER_STREAMING_SERVICES.md`](./BUILDER_STREAMING_SERVICES.md).

**Implemented and merged through issue #110 / PR #111 after desktop/physical-iPhone owner acceptance:** **Genres** is the sixth selected-folder mode. Its one entry point remains selected folder → Add Source → Genres; there is no competing Folders-header action. The immutable catalogue exactly matches the 35 official media-specific `data/genres.csv` rows and groups them into 27 exact-name concepts; only the eight truly shared names pair Movie and TV. Browse supports all 27 with a compact count and grouped **Select all** / **Clear all**, with no artificial 20-item limit or selected chip cloud; it does not auto-focus Search or summon the mobile keyboard. One selected Genre always targets the current folder; the folder-per-Genre destination appears only for multi-select. The global media choice appears only when at least one selected Genre supports both Movies and Series. Small multi-selections use removable pills, large selections use a removable disclosure list, and the standard Back action is the only navigation to Browse. All 27 with Both expand to 35 ordered sources. Multi-Genre folder mode groups paired Movie/Series sources together, uses the published V1 wide Genre artwork with visible-title/🎬 fallback, and atomically replaces only the exact empty non-imported generated `Untitled Folder` shape; renamed, restyled, populated, imported, custom, and no-op placeholders are preserved. Full Core identity drives current-folder missing-only Add plus exact duplicate override; differently configured valid sources remain ordinarily addable with related-variant detection deferred. Neutral review rows use concise destination-aware status text and the shared blue/cyan elsewhere notice. Shared Add/Edit Advanced UI keeps year, rating, vote, language, and country global, stores exclusions per included Genre, and compiles each source's media-correct exclusions independently. Mobile exclusions use a root Genre list with overall Done and a persistent Back-to-Genres inner header while choices scroll beneath. Musicals, curated Lists, V1 semantic merges, generic folder merge/copy, runtime catalogue/count/artwork requests, generic Discover, compound included Genres, malformed/unsupported filters, and unknown shapes remain excluded. No current-client V2 import/export result is claimed; that evidence is deliberately deferred until V2 exposes export and is not an unfinished gate. See [`BUILDER_GENRES.md`](./BUILDER_GENRES.md).

**Implemented and merged through issue #112 / PR #114 and issue #113 / PR #115 after owner desktop/physical-phone review:** **Decades** has one deterministic eight-preset catalogue from 1950s & Earlier through 2020s, injected current-year expansion, additive overview/year/Decade-level-Genre DISCOVER construction, exact duplicate/elsewhere planning, and concrete ephemeral New Collection/New Folder hierarchy plans. Every existing New Collection/New Folder entry point opens one contextual Blank-first launcher backed by a small ordered creation registry. Blank delegates immediately to the unchanged draft helpers. Presets lead to **Configure Decades**, which owns content decisions only: removable selected Decades, reused compact Media and Sort pills, relevant Structure, additive **Decade overview** / Individual years / Genre choices, compact contextual Genre customisation, always-visible applicable Ordering, and one collapsed Advanced filter/exclusion disclosure. Visible defaults are Both media, Individual years on, Decade overview off, Genre breakdown off, Separate collections for New Collection, and **Newest Decades, Oldest Years** Display order. Exactly three presets map to the retained lower-level folder/year chronology fields: Newest Decades/Oldest Years (newest/oldest), Newest throughout (newest/newest), and Oldest throughout (oldest/oldest). Source grouping remains independent and appears only for mixed physical Movie/Series folders. **Review & Appearance** leads with plan-derived counts and editable generated names or captured destination, followed by one always-visible shared **Title options** section, directly visible **Layout**, **Folder options**, and **View folder details**. Collection title visibility reuses the exact manual hidden-title/draft-restoration semantics for New Collection, with one shared accessible status for every blank/disabled generated-name input and unchanged U+200E output; folder title visibility reuses the three existing outcomes in both scopes. Layout retains Tabs/Rows, All tab, and pin only, while Folder options retain Poster/Landscape only. This review recomposition changes no Decades defaults, plan values, JSON, duplicate behavior, or atomic application. Decade overview and Nuvio's All tab remain independently controllable; the simultaneous overview/Tabs/All-tab state gets a quiet informational note. New Folder reports inherited collection presentation read-only, cannot change it, and may configure only generated folders. The visible current-Decade selector and future-year message remain absent while the #113 adapter supplies 2020–2029 and #112's lower-level modes remain available. Future artwork may extend Review & Appearance only through a separately approved issue; #113 adds no artwork UI or placeholders. Source identity, filters, naming, per-Decade Genres/exclusions, V1, Worker, export, dependencies, lockfiles, and live-request behavior otherwise remain unchanged. See [`BUILDER_DECADES.md`](./BUILDER_DECADES.md).

**Implemented and merged through issue #118 / PR #119 after owner desktop, physical-keyboard, and responsive review:** **People** is the second guided hierarchy family and is supported in both New Collection and New Folder. It reuses the mature TMDB People search, ordered keyed selection, per-person Acting/Directing Movie/Series configuration, artwork preview, modal lifecycle, and source constructors. There is no artificial selection ceiling; Search uses visually hidden native checkboxes inside the existing full-card click targets, with the complete card carrying selected surface/border/inset and focus under the later issue #178 choice-presentation contract. One compact count/action summary opens a collapsed bounded removable list, and a tunable informational notice begins at 50. Configure exposes only Automatic and Same for all around the exact current four-combination V2 contract. The Same-for-all header and every bounded compact person row always show four direct marker-free count pills with a restrained Acting/Directing distinction. Editing a person records an internal override without changing the visible strategy; shared changes affect unmodified people and preserve explicit overrides. There is no Custom mode, transition notice, person dropdown, or expanded editor. One shared sort offers only verified Popular/Recent/Top-rated values and maps Recent per media while remaining outside exact duplicate identity; Most votes is not inferred from unrelated source-family evidence. A body-portalled poster-only Preview titles modal reuses combined credits and current configuration, deduplicates titles, caps at 10 desktop/5 mobile, contains focus, supports Close/Escape/exact-trigger restoration and loading/empty/retry states, and adds no pagination or separate preview endpoint. New Collection defaults to one editable `People` collection with one canonical-name Poster folder per person. Review presents shared **Title options** first, including collection title visibility and the three existing generated-folder title outcomes with **Hide on Home screen only** as the accepted default, followed by direct **Layout** controls. New Folder uses the same generated-folder title outcomes without exposing collection title editing and keeps the captured parent byte-identical. Both scopes can then apply one shared Poster/Landscape choice; every generated folder otherwise uses its shape-specific canonical manifest or fallback artwork, with individual artwork customisation deferred to the ordinary Folder editor after creation. Its ephemeral plan uses exact source identity plus collection-aware person evidence to report Ready, Already in this collection, Partly in this collection, and informational Exists elsewhere; the original complete/partial person omission has been superseded by #200 Source-level planning, safe missing-Source appends and inline ambiguity resolution. Both scopes revalidate and use existing atomic controller batches. Issue #132 removes the redundant Folders-header People compatibility alias, leaving `New Collection → People` and `New Folder → People` as the hierarchy routes while `Selected Folder → Add Source → People` keeps its established behavior. Guided People selection is browse-first and initially focuses a stable heading; direct Add Source remains typing-first. The final regression correction keeps the visually hidden native checkbox inside each selectable card's coordinate context, so partially clipped pointer/keyboard selection leaves the outer modal, document, and sticky action stable while the inner results pane owns focus scrolling.

Issue #158 supersedes only the older People Preview presentation bound above: People now shares the maximum of 10 at every viewport, the phone 5×2 poster layout, and centred bounded Title Preview geometry without changing combined-credit/provider semantics.

Issue #118 also makes the public `nuvio-people-assets` schema-v2 manifest the active V2 authority for registered People canonical name, actor/director membership, and artwork. Numeric TMDB person ID remains identity and TMDB search order remains unchanged. `poster`/`landscape`, separate `hero`, and separate `titleLogo` map only to existing Nuvio folder fields; the optional static focus pair is emitted only when complete. One validated in-memory manifest load is shared by the workspace, per-asset SHA-256 values remain transient comparison evidence, and missing IDs retain the safe TMDB-profile/emoji fallback without reconstructing legacy `nuvio-assets` People paths. Company/Network ownership, V1 behavior, both asset repositories, Worker/deployment, and legacy asset deletion are unchanged/deferred. See [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md).

**Issue #160 owner-approved implementation checkpoint:** selected-folder Add Source adds singular **Decade** after Genres, completing ordinary creation parity with the seven registered native Source Edit families. The owner-corrected compact order is Media, Sort, one Decade family, its exclusive whole period or multiple individual years, optional additive Genre sources, Advanced, generated review, and exact Preview. Every selected period retains one general logical source; each catalogue-ordered compatible Genre adds another, and each logical source generates Movie, Series, or Movie then Series. The shared canonical one-period builder still owns every physical source, while an ordinary bundle seam composes the deterministic period × general/Genre × media matrix without filtering the bulk hierarchy API or duplicating date/filter logic. Exact Preview deliberately omits the Guided representative sample and lazily selects optional Year, Source, and media dimensions before one atomic Save. There is no arbitrary range, hierarchy, artwork, custom Add-time title, compound-Genre physical source, generic Discover, schema/controller/import/export/serializer, Worker, Streaming, or other family change. See [issue #160](https://github.com/davecollections/tmdb-id-lookup/issues/160) and [`BUILDER_DECADES.md`](./BUILDER_DECADES.md).

The final #113 responsive corrections make both Decades Configure Genres and ordinary Genre exclusions consume the accepted bounded desktop context/catalogue and mobile context-root/detail shell from the established Genre flow. Inclusion and exclusion provide their own labels, selection state, actions, and validation while sharing navigation, history, focus, scroll ownership, safe areas, and breakpoints. The official catalogue, toolbar, All-selected/per-Decade state, filters, planner identity, and generated hierarchy remain unchanged.

**Retained future considerations:** Quick Add/multi-add may keep Search open for several independent results with clear Added/duplicate states; atomic behavior applies only where a future operation commits several sources together. Bulk collection lookup may use bounded one-name-per-line input, controlled concurrency, ambiguous/unmatched handling, duplicate review, and multi-source insertion. Optional spelling or singular/plural suggestions must be transparent and must not blindly append or remove `s`.

**Confirmed creation direction:** the eight established hierarchy families are complete. Any future family must extend the existing New Collection/New Folder launcher through the reuse-first, family-specific standard in [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md).

**Implemented Franchise naming direction in issue #122:** preserve meaningful canonical TMDB Collection wording, including semantic suffixes such as `Collection`, `Saga`, and `Trilogy`. Do not strip a trailing ` Collection` or reduce names such as `Matrix Collection`, `Avatar Collection`, or `Die Hard Collection` to ambiguous movie-like folder names. Issue #122 keeps the complete canonical visible name, including a leading `The`, and uses exact Collection ID as identity.

**Issue #122 owner-review presentation correction:** Franchise hierarchy folders are Poster-only. The TMDB Collection poster maps to `coverImageUrl`; a missing poster uses the safe emoji fallback, and the Collection backdrop is not substituted as a landscape cover. The shared hierarchy Layout control shows Show All only for Tabs. Rows hides it and generates `showAllTab: true` for Franchises, People, and Decades so returning to Tabs restores an enabled All tab. New Folder continues to inherit and preserve its parent presentation.

**Studio hierarchy merged through issue #124 / PR #125 after owner review:** Studios extends the same New Collection/New Folder hierarchy launcher without changing selected-folder Add Source. Ordered uncapped Studio selection keeps the checked-in catalogue's exact `Movie Count: N` / `Movie Count: Unknown` Search presentation and adds one hierarchy-only All/Exclude 0/10+/50+/100+/500+ Movie-count filter before paging, with Unknown retained only by All and Exclude 0. The filter makes no API request. The flow is Select → Configure → Appearance: Configure owns directly visible selected-Studio identity, catalogue/learned counts, reactive placement, Preview, and accessible removal; last removal stays in a calm disabled Configure state; the final Appearance stage owns presentation only. One global Movies/Series/Both composition (Movies default) and one shared evidenced sort create `Movies` / `Series` physical source titles. Movies/Series Preview is lazy by media; one response supplies its count and ordered first page, while only a successfully previewed Series count is retained transiently across sort changes. The same durable media-separation rule now keeps People Movies and Series in separate tabs over its already-loaded combined credits, with per-media role combination, physical-title deduplication, semantic sort, count, and no added People request. Franchises remains Movies-only and Decades has no title Preview. Plans, stale revalidation, and atomic apply perform no network work. Current #200 Company planning skips exact Sources, adds missing variants to matching folders with inline ambiguity resolution, and creates folders where needed; elsewhere remains informational and addable. Generated Studio folders use fixed Landscape artwork through one workspace runtime load, then checked-in TMDB logo, then `🎬`, and default to Show everywhere. The narrow optional Company `sort_by` Worker allowlist was manually deployed and live validated on 2026-08-19 after separate owner authorization. Overall V2 release status remains governed by the separate release and noindex boundary. See [`BUILDER_STUDIOS.md`](./BUILDER_STUDIOS.md).

**Network hierarchy merged through issue #126 / PR #127:** Networks extends the shared New Collection/New Folder launcher while keeping selected-folder Add Source and Source Edit unchanged. Its ordered uncapped Select reuses the checked-in catalogue and adds a hierarchy-only All/Exclude 0/10+/50+/100+/500+ Series-count filter before paging; exact `Series Count: N` includes zero, Unknown means missing/invalid, and Add Source remains count-free. Configure applies one evidenced TV sort to the batch and owns placement, remove, and an explicit single-view Series poster Preview. No step automatically requests Discover. Before successful Preview, one visible `Series Count:` line shows the catalogue snapshot; a successful response supersedes that value on the same line with transient `total_results`, while failure retains the snapshot. The same response supplies the upstream-ordered first page through the shared narrow requester/cache seam. Owner deployment and real production-Worker/TMDB/image-CDN mounted validation are complete without fabricated integrated responses. Appearance defaults to a visible `Networks` Collection, Show-everywhere Network folders, Poster, Tabs, Show All on, and Pin off, with only the batch-safe Poster/Landscape choice. Exact requested runtime orientation falls back to the checked-in `w500` logo, then empty image plus `📺`, before planning. Each eligible canonical Network folder contains one generic `Series` native `NETWORK/TV` source. Current #200 destination matching skips exact Sources and appends missing variants to recognized folders, requiring an inline choice for ambiguous append targets; elsewhere remains informational, and one stale-revalidated atomic batch combines appends and new folders with full rollback. The merge triggered the normal automatic Pages publication; it did not redeploy the Worker. No current-client hierarchy round trip is claimed. See [`BUILDER_NETWORKS.md`](./BUILDER_NETWORKS.md).

**Issue [#182](https://github.com/davecollections/tmdb-id-lookup/issues/182) owner-review implementation supersedes only the older Studio/Network discovery asymmetry described above:** selected-folder Add Source, New Collection, and New Folder now share the applicable checked-in count group, count-bearing result cards, and explicit result ordering for each family. Studios uses Movie-count **All** by default, **Exclude 0**, **10+**, **50+**, **100+**, and **500+**, removes the redundant Add-only hide-zero checkbox, and exposes **A–Z** plus **Most movies** everywhere; Networks uses the equivalent Series-count choices with **A–Z** plus **Most series** everywhere. Empty Browse defaults to the family's count-descending order, while typed search defaults to hidden Best Match until explicitly overridden; known counts precede Unknown and deterministic name/ID tie-breaking follows equal counts. Add remains single-select; guided creation remains insertion-ordered multi-select. Filter/order/query/page/selection state survives Back as applicable. Counts remain existing checked-in maintenance snapshots that may differ from later live exact-selection totals and add no request. A separate test-owned entity-selection capability contract covers all eight families across Add Source, New Collection, and New Folder beside the existing saved-source capability contract. Source construction, schema, serialization, live request paths, Worker behavior, dependencies, V1, and catalogue data remain unchanged.

**Genre hierarchy merged through issue #130 / PR #131 after final owner review:** Genres extends the same ordered, scope-aware New Collection/New Folder launcher while selected-folder Add Source and Source Edit remain unchanged. The approved Select stage retains the complete local 27-concept catalogue, uncapped ordered native-checkbox selection, no initial Search focus, and verified 35-source Both capacity. The flow is **Select → Configure → Structure → Appearance → Create**. Configure uses shared Media/Sort pills, fixed unavailable-media notes, Advanced, and one compact logical row per selected Genre with placement, Remove, and explicit **Preview titles**. Structure owns four plan-derived shapes: Genre folders; fixed visible-title Movie/Series media folders; separate media-specific Genre folders; and, only for New Collection with both media effective, separate Movie and Series collections. Its approved visual choice cards use first-time-user wording, illustrative nested Collection → Folder → content-choice wireframes, live Collection/Folder counts, and established radio/selected/focus treatment. The redundant intermediate heading and visible Source counts are omitted only from this decision screen; authoritative Source counts remain in the plan, validation, later technical summary, and Create behavior. Genre folders also expose only the three evidenced combined-Series concepts, now explained in ordinary language with **Keep its own folder** as the unchanged standalone default and the same exact target planner values. No structure, generated naming, composite, state, apply, or Worker behavior changes, and no Worker redeployment is required. New Folder omissions and combined-Series availability are structure-specific; all shapes rebuild and apply atomically, including two-collection rollback. Appearance exposes only batch-safe choices relevant to the chosen shape, including Landscape-default/Poster Genre artwork through explicit 27-concept `wide`/`vertical` mappings without cross-orientation fallback. Preview comes from the exact compiled physical draft, uses lazy Movie/Series views and the shared nested poster shell, and includes mandatory canonical `include_adult=false` in the complete cache identity. The tracked Worker still admits only the fail-closed single-Genre shape and does not authorize generic Discover or service-token access. Dave's first reviewed version `857c1fa3-e62d-4fd8-9321-9573aedb1906` remains historical evidence. Dave confirmed the corrected 10,479-byte source was deployed on 2026-08-21; direct canonical/rejection checks and the complete mounted mobile/desktop production Worker, real TMDB, and real image-CDN scenario passed. Final desktop/physical-phone owner review completed before the merge at `817b4b8c46ca135e2badcfc6ca903dde3f824222`. There is no dependency, V1, asset-repository, or new client-evidence claim. See [`BUILDER_GENRES.md`](./BUILDER_GENRES.md).

**Historical #158 Preview checkpoint, superseded by [Preview-100](./BUILDER_TITLE_PREVIEW.md):** the accepted ready state at that stage remained poster-only with at most 10 usable posters at every viewport. Phones use five columns and up to two rows without captions or horizontal grid scrolling; fewer usable results render naturally. Title Preview surfaces are centred in the usable visual viewport when they fit and use one bounded Preview scroll owner at short heights without shrinking posters solely to avoid scrolling.

**Historical issue #166 implementation checkpoint (its ten-poster limit is superseded by #226):** every ordinary selected-folder Add Source family now exposes the same explicit lazy **Preview titles** capability immediately before Save: Movie franchise, People, Studios, Networks, Streaming services, Genres, and the already-proven Decade flow. Preview consumes the exact validated detached physical draft that the current Add flow would save, never a Source Edit session or reconstructed approximation. Multi-source configurations select one physical source at a time in deterministic Save order: People uses Role then applicable Media; Studios uses Media; Streaming uses Region then Media; Genres uses Genre then Media; single-source Movie franchise and Network omit redundant selectors; Decade retains its existing Year/Source/Media behavior unchanged. Complete configured candidates remain previewable even when the destination already contains matching identities. The shared #158 nested dialog, 10-poster grid, request coordination, providers, bounded success caches, exact TMDB image URLs, loading/empty/error/Retry behavior, focus containment/restoration, and short-height geometry remain authoritative. Movie franchise and People reuse their successful details caches, while Company, Network, Streaming, Genre, and Decade continue through their existing exact production Preview providers. Movie franchise retains its non-interactive title count and removes the now-redundant expandable contained-title text list, making the standard poster Preview its one title-inspection path. The Add Source chooser retains its family-specific helper copy and makes no blanket claim that every current or future family uses TMDB; accurate TMDB context remains on the Movie-franchise card and within source-specific flows. Preview performs no controller operation, does not alter duplicate handling or Save, and adds no Worker, schema/model, importer/serializer/export, V1, dependency, deployment, publication, or current-Nuvio behavior claim. See [issue #166](https://github.com/davecollections/tmdb-id-lookup/issues/166).

**Issue #170 owner-accepted implementation checkpoint:** TMDB Lists joins selected-folder Add Source and both guided hierarchy scopes. One multiline input accepts strict public TMDB List IDs/URLs, explicitly resolves each canonical signed-int32 identity, preserves ordered successful selections, and retains line-specific failures. Review exposes an independent Source name for each List. Add Source creates `N` ordered sources in the selected Folder; New Collection creates exactly one named Collection → one named Folder → `N` sources; New Folder creates exactly one named Folder → `N` sources. Every source uses the confirmed native `LIST` shape with canonical source-level `MOVIE`, `original`, numeric ID, empty filters, and no `catalogSources` projection. Current Nuvio testing passed Movie-only, Series-only, and mixed Lists: items routed by TMDB `media_type` despite the fixed saved `MOVIE`, and immediate export retained `MOVIE` plus `original`. Duplicate identity is exact List ID plus physical media; same-destination duplicates are omitted unless Add Source explicitly overrides, elsewhere remains informational, and all mutations revalidate then use existing atomic operations. Preview and title-only Source Edit reuse the shared adapter/request/dialog/cache seams and label mixed results **Titles**. The owner-deployed Worker admits only `/3/list/<canonical int32>?language=en-US&page=1`; real Worker/TMDB/image-CDN acceptance and desktop/physical-phone owner review passed before integration. See [issue #170](https://github.com/davecollections/tmdb-id-lookup/issues/170) and [`BUILDER_TMDB_LISTS.md`](./BUILDER_TMDB_LISTS.md).

**Final integration after the issue #170 checkpoint:** issue #170 closed through merged [PR #171](https://github.com/davecollections/tmdb-id-lookup/pull/171) at `3e1ceace849d137e17ddfedb8637bc147f511285`; Pages publication, the owner-deployed narrow Worker, live production-path acceptance, current-Nuvio Movie-only/Series-only/mixed List checks, immediate export, and owner review all passed. That checkpoint displayed the complete normalized page-one sample. Shared Preview expansion subsequently merged through [#226](https://github.com/davecollections/tmdb-id-lookup/issues/226) / [PR #227](https://github.com/davecollections/tmdb-id-lookup/pull/227). The [current shared contract](./BUILDER_TITLE_PREVIEW.md) supersedes the page-one limit; this reconciliation does not reopen deployment or acceptance history.

**Merged through issue #172 / PR #173:** all eight guided hierarchy families and Node Editor share live reversible title-draft behavior, merged at `459be092738b2a70884347fd87a782d099986512` and published after exact-merge checks passed. Hiding presentation does not discard the latest valid visible draft; repeated generated titles retain independent drafts by stable logical key. Only Folder Hide everywhere blanks and disables the field, while Hide on home screen only keeps visible editable text. Persisted U+200E/`hideTitle` outcomes, planning labels, source identity/name, schema, and atomic creation remain unchanged. [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md) owns the shared contract; focused family documents do not duplicate it.

**Confirmed source-capability direction:** context may change container settings, but it must not silently remove source-level capability. Media, Sort, filters, role/credit type, Preview, appropriate Source name, and safely supported physical identity selection are source concerns; titles, grouping, layout, artwork, title visibility, pinning, and destination are container concerns. Issue [#176](https://github.com/davecollections/tmdb-id-lookup/issues/176) closes the People Add Source Sort gap with the existing Popular/Recent/Top-rated semantics and adds an enforceable test-owned capability matrix across all eight families and three contexts. It does not create a production capability registry or change Network and the other family behaviors. Source-name parity remains open and does not imply hundreds of bulk name fields.

Future collection sort controls must remain evidence-based. For current Nuvio Desktop `COLLECTION` resolution, `original` means TMDB-provided/API order rather than chronological or website order; `primary_release_date.desc` is owner-observed newest-first; `primary_release_date.asc` is currently unsupported and falls back to TMDB order. Oldest-first must not be exposed until supported and verified.

## 9. Search-result information

**Confirmed direction**

Results must contain enough context to distinguish similar entities without reproducing every column from the V1 lookup tables.

For Studios and Networks, useful fields may include:

- name;
- TMDB ID where it assists identification;
- entity type;
- parent entity;
- compact country/location context;
- title count;
- logo or approved artwork preview when available.

The ordinary cached Company and Network catalogues remain the Search/Add discovery source. They are not a globally pre-cached typed-count product contract. Studio cards expose the valid Company legacy total only as `Movie Count: XXX` and make no current-count request while searching or browsing. Studio discovery ranks exact ID/name, name prefix/contains, parent, and country/location in that order, using legacy count only within a relevance tier; A–Z/Most movies overrides and Hide 0 movies remain explicit choices, while empty search automatically enters paged Browse. Selected-folder Network Add Source deliberately discards legacy `t`: it cannot affect that flow's search, rank, filters, browse order, paging, cards, identity, creation, or output, and its cards show no count. Network hierarchy uses a separate projection in which a valid checked-in `t` drives only the visible Series Count and count filter; it remains outside identity, source output, live Preview state, and Add Source. Selected-folder Add Source continues to fetch fresh Studio Movie/Series counts after exact selection and one Network Series Count. Studio and Network hierarchy creation instead make no automatic Discover request: explicit Preview supplies that response's count and first-page titles together, with the Network total remaining transient wizard context. All such counts are informational and non-blocking; an unavailable count must never prevent supported source creation, and no global scan, sidecar, or background count publication is required.

People remains a focused selected-entity flow: only after a person is selected for configuration, its details request appends combined credits and derives distinct cast/director Movie/Series counts locally; it creates no sidecar, background scan, per-result credit request, or request solely to recreate `known_for` display rows. People result state retains TMDB's valid `known_for` order; desktop may render the first three while mobile renders only the first with natural wrapping and no empty placeholder. Result detail must remain proportionate to the choice being made.

## 10. Automatic hierarchy and hidden IDs

**Confirmed and implemented foundation**

- Collection and folder Nuvio IDs are generated automatically.
- Nuvio-facing IDs remain hidden from ordinary users.
- Missing, blank, invalid, or duplicate IDs are repaired silently where current controller behaviour permits.
- Builder-only internal IDs remain separate from Nuvio-facing IDs and never enter output.
- Users should not need to understand UUIDs.
- Predictable hierarchy should be generated automatically rather than requiring unnecessary clicks.

Hidden does not mean unvalidated. Diagnostics and automatic repair protect output without turning identifiers into a normal editing task.

## 11. Presentation and device-aware defaults

**Confirmed Nuvio behaviour from repository evidence**

- **Rows** presents each source within a folder as a streaming-style row.
- **Tabs** presents each source within a folder as a tab and defaults to the first source tab.
- **Tabs** with Show All enabled adds **All** as the first/default tab for each folder containing two or more sources; one-source folders have no visible All tab.
- These are collection-level settings.

**Confirmed and implemented foundation**

The current owner-reviewed workflow exposes:

- one in-card overflow trigger on every hierarchy card, with a body-portalled menu that uses full rendered height, the current Visual Viewport, upward flipping, edge clamping, and prevent-scroll initial focus; Collections expose Edit / Sort folders / Remove folders / Delete collection and Folders expose Edit/Delete, supported physical source shapes expose Edit/Delete through the fail-closed editor registry, unsupported source shapes expose Delete only, and actions directly target unselected cards;
- one mobile-only selected-context quick-rename pencil for collections and folders;
- one responsive modal for collection title, intentional invisible Nuvio title, source-level Tabs/Rows, the saved Include an All tab when using Tabs preference, and Pin to top; the source group is headed **How sources appear in this collection**, and `TABBED_GRID` is labelled **Tabs (recommended)**;
- the same modal with Folder **Basic details** and **Display** groups, compact native radios for the three title-visibility outcomes, and Poster/Square/Landscape visual selection cards.

Manual blank collections default to Tabs with All enabled, Pin off, and `focusGlowEnabled: true`. Focus glow is no longer exposed as a settings control: imported explicit booleans remain unchanged, absence stays absent, unusual values stay raw-preserved, and unrelated settings edits omit the field. Manual blank folders default to Poster with `hideTitle: true`, so the title beneath the card is hidden by default while the actual folder name remains visible. Square is an authored Folder choice through #222; imported Follow Layout and unsupported values remain preserved while untouched.

U+200E LEFT-TO-RIGHT MARK is the confirmed intentional invisible Nuvio title character. The collection setting and folder Hide everywhere choice deliberately emit one U+200E, and blank titles never become invisible automatically. The folder group presents three complete outcomes: Show everywhere uses a visible title with `hideTitle: false`; Hide on home screen only uses a visible title with `hideTitle: true`; Hide everywhere uses one U+200E with `hideTitle: true`. Imported repeated U+200E titles remain byte-for-byte preservation cases until the user deliberately replaces their intent. The Builder uses a display-only fallback rather than rendering blank cards or headings.

Issue #59 adds a restrained ordering foundation directly to existing hierarchy cards: each collection, folder, and source has one compact six-dot handle contained inside its visual card for pointer/touch dragging and keyboard-accessible one-position movement. Issue #63 keeps that grip and folds entity actions into the same visual card through an overflow trigger; drag clones expose no active menu controls. During pointer movement, the complete associated row follows the pointer above panel clipping, a matching placeholder shows its proposed position, and surrounding siblings visually make space without changing project data; insertion lines remain secondary feedback and reduced-motion mode removes nonessential sliding. Pinned collections remain a stable displayed group before ordinary collections, movement stays inside the current pin group, and moving never changes `pinToTop`. Folders remain within their collection and sources remain within their folder and category-bearing source objects; stable internal IDs retain selection and card identity. A completed pointer drop or successful keyboard arrow movement performs one authoritative move, while hover, cancellation, invalid boundaries, and same-position drops remain data no-ops. Collection-scoped one-time Folder sorting now applies an atomic permutation through #232; cross-parent bulk movement and persistent ordering metadata remain absent. The redundant Selection details panel is removed so the hierarchy uses the available workspace width; output review is part of the implemented Export collections journey.

**Confirmed direction**

The TV / phone / both Quick Setup answer may select safer initial presentation defaults. Defaults must stay editable and be based on current client evidence rather than assumptions. Exact per-device defaults remain open.

The approved future consistency direction retains the dense three-column `Collections → Folders → Sources` desktop workspace, row selection as the primary click behavior, and explicit editing. Teal/cyan communicates single selected, active, or current state; green marks retained/additive multi-selection and separately scoped success, amber/orange needs review, red is error or destructive, and muted grey is disabled or unavailable. Routine valid rows need counts where useful, not repetitive ready decoration. Detailed modal, action, terminology, and non-dismissal rules are owned by [`BUILDER_UI_SHELL.md`](./BUILDER_UI_SHELL.md); this is future consistency direction, not a claim that every current surface already conforms.

The current **Global display settings** feature is a one-shot bulk operation over existing nodes, not persistent global/default state. Single-node booleans and bulk tri-state controls may intentionally use different physical controls. Show All behavior currently differs intentionally between wizard, Node Editor, and bulk contexts, and changing it requires a focused product decision. Focus GIF enablement may remain independent of whether a URL exists.

Future Search/Add, template, and recipe defaults must begin from this planning matrix unless a later focused issue deliberately changes it:

| Source or creation type | Default tile shape |
| --- | --- |
| Manually created blank folder | Poster |
| Studio (`COMPANY`) | Landscape |
| Network | Poster |
| Actor / person / director | Poster |
| TMDB movie collection / franchise | Poster |
| Decade / general Discover | Poster unless a later recipe deliberately specifies otherwise |

The manual blank-folder default is implemented. Issue #65 implements the TMDB movie-collection source recipe inside an already selected folder without automatic hierarchy or artwork. Issue #74 implements the Actor/person/director Poster default for a new People folder plus exact People runtime/TMDB/emoji fallback; adding to an existing folder preserves its presentation. Issue #110 defaults to adding Genre sources to an existing folder without changing presentation. For a multi-Genre selection only, its explicit alternate destination creates one `LANDSCAPE` folder per Genre using the existing published V1 wide artwork mapping with visible-title/🎬 fallback and may atomically remove only the strictly recognized original untouched blank placeholder. That narrow cleanup does not authorize generic folder merge/copy or promotion. The remaining rows do not authorise source creation or entity-aware generation.

## 12. TMDB Discover experience

**Confirmed direction**

Discover should use understandable controls instead of making raw filter syntax the primary interface. Movies and series are separate source requests; selecting both may generate two sources. Advanced options should use progressive disclosure.

Product use cases include:

- 1990s Action;
- Shark Movies;
- provider and region filtering;
- language and country;
- company and network;
- genre and keyword;
- date ranges;
- rating and vote count.

Only fields and combinations inside the confirmed Nuvio compatibility contract may become supported controls. TMDB accepting a parameter is not enough to prove Nuvio compatibility. Composite concepts such as Romantic Comedy may require a curated recipe or keyword logic and must not be presented as a single official TMDB genre. Runtime-length filtering remains unsupported unless later evidence expands the contract.

Issue #100 established the original 14-field internal DISCOVER Core. Issue #106 updates that internal persisted vocabulary to the current 18 fields by recognizing `withoutGenres`, `withoutKeywords`, `withoutCompanies`, and `withoutWatchProviders`. That issue alone did not approve exclusion controls, generic Discover editing, or a new user-facing flow. Issue #110 later approved `withoutGenres` inside its focused official Genre Add/Edit contract. Those were historical boundaries: #202 / PR #203 subsequently completed standalone Discover creation and safe editing with supported filters. The approved Shared Advanced sequence is complete through #218 and #220; family-specific defining constraints and further capability questions remain governed by each family contract and the canonical roadmap.

See the dated [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md) inventory and the later accepted [#206 capability assessment](./SHARED_ADVANCED_ASSESSMENT.md) for evidence and its limits.

## 13. Artwork behaviour

**Confirmed direction**

Artwork should normally feel automatic rather than technical:

1. use approved published curated artwork when available;
2. otherwise use a suitable cached TMDB image or logo where the applicable consumer supports it;
3. otherwise retain a visible title and emoji fallback.

Imported or custom nonblank artwork must be preserved unless the user changes it. Runtime-owned automatic artwork may refresh under a later approved policy. Builder-only ownership metadata must never leak into Nuvio JSON. Missing artwork must not prevent collection creation.

Current Genre Square/curated artwork (#222) and Decades curated artwork (#224) are implemented. Collection settings (#232) reuses conservative same-authority Tile/Focus transitions for a one-time shape change across existing Folders; custom, unknown and fallback artwork stays exact. The issue-stage account below retains the earlier scopes and is superseded where the current family contracts extend them.

Issue [#134](https://github.com/davecollections/tmdb-id-lookup/issues/134) makes the workspace reflect the Folder Tile artwork that is already assigned: every nonblank string `coverImageUrl` is shown directly on the Folder card with compact Poster/Landscape treatment, regardless of origin. Native image requests omit the Builder referrer without using a host allowlist, and exact-URL failure state resets when the assignment changes. Blank, absent, null, invalid, or genuinely failed images use the established text-only card. This display is presentation-only and performs no resolution, discovery, normalization, migration, mutation, or serialization change; unsupported shapes remain preserved and receive a neutral thumbnail treatment.

Issue [#136](https://github.com/davecollections/tmdb-id-lookup/issues/136) completes ordinary Folder image/GIF visual-field editing, organizes the visible fields into Tile, Hero / Background, Branding, and Focus, and previews the exact current draft URL only. Known `coverEmoji` remains model-supported, creation-flow-compatible, and exactly preserved without a visible Settings control. `heroVideoUrl` is compatibility-only: ordinary absent, blank, and unusual unsupported values expose no video URL, Preview, Add action, or default; only a supported nonblank value present in the opening draft exposes inspect/preview/replace/clear controls for that fixed session. Image/GIF failures remain local, nonblocking, and retryable per exact URL; compatible video preview is explicit with no request on open and no autoplay. The current-value preview layer performs no discovery, identity inference, orientation detection, URL normalization, proxying, download, or mutation. Cancel is mutation-free and Apply remains touched-only. Issue [#140](https://github.com/davecollections/tmdb-id-lookup/issues/140) adds a separate compact opt-in assistance layer only when child-source semantics prove one exact People, Studio, Network, or official Genre authority. Titles, approximate text, image URLs, mixed/opaque/addon sources, and unsupported Franchise/Decade/Streaming families cannot establish identity. Assistance is strictly blank-field-only: a published applicable asset says **Use curated artwork**; a successfully checked approved authority with no published asset for that supported slot may say **Request artwork** and open a safe prefilled issue in the owning public asset repository. Every nonblank value—including curated, imported/custom, arbitrary TMDB, and exact known fallback URLs—receives no curated status, request, or replacement UI. Choosing curated artwork touches only that draft field and makes the assistance disappear; clearing it makes assistance eligible again. Focus enablement remains independent, Cancel remains zero mutation, and Apply remains touched-only. The current draft shape selects blank Tile availability, but changing shape never rewrites the URL automatically. The manifest/runtime remains publication authority; an expected future repository path may be included in the request but is never assigned before publication. No credentials, GitHub API, backend, or exported provenance are added. Guided creation keeps its existing automatic creation-time artwork behavior. Any later automatic switching may replace only positively recognized curated URLs, never fallback/imported/custom artwork. Issue #134 itself adds no Settings preview, assistance, or automatic replacement behavior.

Issue [#142](https://github.com/davecollections/tmdb-id-lookup/issues/142) implements that narrowly authorised shape transition for nonblank Tile and orientation-specific Focus artwork: only an explicit Poster/Landscape change may replace `coverImageUrl` or `focusGifUrl`, and each field qualifies independently only when its **current draft** value exactly matches a published same-field curated candidate for the Folder's exact #140 identity. A published requested counterpart becomes that field's new draft URL; if none exists, the requested shape remains selected, the exact current URL is kept, and a concise nonblocking field-specific notice explains the consequence. Tile consequence copy sits directly beneath Tile shape before the independent sibling-consensus message; Focus consequence copy stays beside the Focus field. Blank Tile and Focus remain #140 opt-in assistance and are never auto-filled. Custom, TMDB fallback, imported/unknown, wrong-identity, ambiguous-identity, and curated candidates from another artwork field are preserved exactly. Focus switching applies while disabled but never changes `focusGifEnabled`. Opening, import, unrelated Apply, and serialization never normalize existing data; no provenance is persisted. After explicit shape interaction only, a calm notice may identify when every other supported sibling Folder under the same Collection uses the opposite shape. Mixed, absent, and ambiguous sibling state fails closed. All notices are informational and Apply/Cancel retain one-draft, one-revision/no-op semantics. Guided creation, bulk editing, multi-Folder normalization, Collection rules, and every other artwork field remain unchanged.

Issue [#138](https://github.com/davecollections/tmdb-id-lookup/issues/138) makes Collection `backdropImageUrl` an optional first-class, preservation-safe setting without defaulting or automatically assigning it. Collection Settings describes it as fallback Folder artwork in Modern View and previews only the exact current draft image/GIF URL through the shared no-referrer, host-agnostic, URL-scoped failure contract. Blank values have no preview or assigned placeholder, unusual imported values remain preserved until explicitly replaced, Cancel remains mutation-free, and Apply remains touched-only. The field is not Collection-card artwork, so workspace Collection cards stay text-only. Curated suggestions, automatic assignment, bulk editing, Focus Glow UI, Folder intelligence, Source Edit cleanup, Worker, V1, and asset work remain separate.

**Manually confirmed in Nuvio — owner-observed current-client behavior, 2026-08-22; exact client build not captured:** in Modern View, Collection `backdropImageUrl` acted as a fallback for each missing Folder surface. It supplied Folder cover and hero/background when neither Folder field was present; with only Folder `heroBackdropUrl`, it supplied the cover while the Folder field supplied the hero; with both Folder `coverImageUrl` and `heroBackdropUrl`, the Collection backdrop was not visibly used. Folder hero video remained separate: the static Folder hero appeared first and video later took over while focused, without establishing a guaranteed delay or override rule. No visible Collection-backdrop effect was observed in Grid or Classic View. These are bounded observations, not a timeless universal Nuvio contract.

The separate `nuvio-assets` project owns artwork production, replacement, review, publication, runtime schema, and asset-contract decisions. TMDB ID Lookup consumes its published runtime. Questions owned by that project must be taken there instead of guessed in V2.

Issue #118 makes registered People hierarchy artwork automatic from the canonical People manifest and exposes only one batch-safe Poster/Landscape choice in the creator. It deliberately rejects per-person URL, focus, and reset controls from the bulk flow; later individual customization uses the ordinary Folder editor's image/focus fields and compatibility UI for an existing supported nonblank video, all with preservation-first minimal patches. This is a People-specific implementation, not a global artwork provider or default for other hierarchy families.

Owner-supplied current Nuvio evidence confirms collection-level `focusGlowEnabled`. The Builder continues to recognise, import, preserve, serialize, and default that field, while issue #69 removes its visible control. Issue #126 implements the batch-safe Network Poster/Landscape hierarchy choice; per-item or raw Network Poster controls, broader cross-family artwork automation, and new artwork schema fields remain deferred.

## 14. Import and editing

**Confirmed and partly implemented**

- Existing JSON import is a first-class startup route.
- The preservation-first importer and serializer are core product advantages.
- Unknown and community fields survive unrelated edits.
- Opaque sources remain preservable, movable, and removable without being guessed into known source types.
- Supported physical Movie Collection, People, Studio, Network, simple Streaming, official Genre, canonical Decade and native List sources retain their family-specific editing contracts; #202 additionally supports safe standalone Discover editing. Editing remains fail-closed with owned-field changes, duplicate rejection, stale-session protection and minimal patches; unsupported source shapes remain preservation-only for editing.
- Imported artwork and presentation values remain protected unless changed by the user.
- Import and export should be understandable without requiring raw-JSON editing.

Nuvio client import behaviour can be destructive or can change by client and version. Instructions must therefore remain dated and updateable, warn before replacement, and distinguish observed behaviour from assumptions.

## 15. Export and installation journey

**Implemented and merged — issue [#194](https://github.com/davecollections/tmdb-id-lookup/issues/194) / [PR #195](https://github.com/davecollections/tmdb-id-lookup/pull/195):** The Builder remains the sole editing, arrangement and reordering interface. **Export collections** opens a compact modal with current totals, validation, preservation warnings, the local-date filename, Download JSON and Copy JSON. Existing diagnostic editors return with current validation/counts. A visual Nuvio preview is deferred and should be reconsidered only after shared on-demand title-preview work exists and users demonstrate demand; no follow-up visual-preview issue is created now. Local #244 **Send to Nuvio** reuses the canonical prepared complete Collection array for the approved Replace-only slice described below; it is not available on main. Unauthenticated Copy JSON and Download JSON remain first-class supported paths. See [`BUILDER_EXPORT.md`](./BUILDER_EXPORT.md).

**Confirmed direction**

The intended journey is:

1. choose a starting route;
2. generate or import a setup;
3. edit it in the full Builder;
4. review collection, folder, and source counts plus warnings;
5. validate the output;
6. Copy JSON or Download JSON;
7. follow current, evidence-backed Nuvio import guidance;
8. optionally Send to Nuvio in the local #244 Replace-only implementation; this remains unpublished and unavailable on main.

Export discloses preservation warnings and blocking problems without changing the draft. Manual Copy JSON and Download JSON remain independently available with or without a Nuvio connection.

<a id="16-optional-future-nuvio-connection"></a>

## 16. Optional Direct Nuvio connection

**Read/import implemented on main — [#238](https://github.com/davecollections/tmdb-id-lookup/issues/238) / merged [PR #239](https://github.com/davecollections/tmdb-id-lookup/pull/239).** The [connection contract](./BUILDER_NUVIO_CONNECTION.md) retains the dated public API, upstream and CORS investigation evidence, architecture, safety boundaries and validation limits. #240 / PR #241 subsequently repaired the shared image-fallback race; repaired main validation and Pages are green. Publication of this slice does not implement remote writes or promote V2 as a released replacement for V1.

The approved flow is one of three consistently styled buttons in the unified landing Import section, alongside local File/JSON methods, and is also available from workspace: browser-direct login → identity-bound profile/PIN selection → pull Collections → local review → import. The file picker shows its filename once. Profile Refresh sits beside its heading; Profile/Review have primary Load/Import at left and quieter Disconnect at right. Review uses standard Back, local-time en-AU dates and concise grouped import notes. Workspace has only transient import success, cleared by content edits rather than selection/scrolling. Passwords are not retained; access tokens remain in memory, refresh tokens are discarded and reload starts disconnected. Missing blobs and empty arrays remain distinct and cannot import or clear current work.

After successful pull/structural validation, the reviewed immutable snapshot is local data. Import makes no new requests or profile checks; expiry does not invalidate that snapshot. Login is required before another network operation. Disconnect discards connection/review state and leaves Builder work unchanged. Read-only import has no backup action; ordinary manual Export is unchanged. Published main has no remote-write behavior; local #244 Send uses the optional-backup and fresh-preflight contract below.

Existing work requires **Add as separate Collections**, **Merge exact matches**, or **Replace current project**. Add appends complete Collections without matching. Merge requires unique exactly equal valid visible Collection/Folder titles, with no normalization or provenance inference. Invisible/U+200E, malformed and ambiguous parents stay whole and separate. Source dedupe occurs only inside matched Folders, reuses established identities and requires safe complete preserved equality; uncertainty retains both. Existing settings/raw data and order win; new nodes append with imported fields retained. The shared pure planner supplies preview counts and atomic apply, reserves current IDs, repairs only inserted IDs and validates the final tree. Failures commit no state/revision; success marks dirty in one revision. Replacement retains explicit destructive confirmation and the existing import pipeline.

Persistent login, refresh renewal, pairing, Dingo accounts/workspaces, TV LAN and Worker auth proxying remain outside the implemented read/import scope. Mocked/local tests were explicitly approved for #238. Owner-reported live login/avatar/PIN/pull/import and other-device-session checks remain the separate live evidence. The merged resilience pass adds one bounded retry for safe reads after 429/503, preserving the 20-second attempt timeout and never replaying login/PIN automatically. Owner review and publication gates for #238 are complete.

**Approved Send to Nuvio scope — locally implemented in #244, not on main:** Replace-only for one selected profile using complete frozen canonical P. Require explicit destructive Review R0, current protected-profile PIN authority, fresh R1 == R0 after **Replace Collections**, a final synchronous local/identity/authority guard, at most one dispatch with no automatic retry/restore, and post-write readback verification. Any baseline change, even R1 == P while R1 != R0, requires fresh Review. An identical reviewed profile is a no-op without fake Send success. Only exact verification uses **Sent to Nuvio**; acknowledged/unverified and unknown states remain distinct with read-only checking. No supported CAS/expected-revision API is evidenced; the residual final-read → write race is accepted with mitigation. Remote Add, Merge and selected-Collection modes stay deferred. Do not call this Sync.

**Optional current-Nuvio backup:** Review offers exact raw R0 without canonicalization or an authentication/diagnostic/account envelope. Missing data downloads as `[]` with blob absence retained privately. Filename/bytes stay stable for that Review; retries make no request and do not affect Send. Replace never depends on download use or success. R1 == R0 ensures a downloaded backup still represents the immediately preceding observed state when writing is permitted. The mandatory two-file stage, proposed-replacement file, possession confirmation and second preflight are removed. P remains available through ordinary Download JSON and Copy JSON.

The owner approved **Export & Send** redesign and its #244 Pass 2 implementation: Send to Nuvio, Download JSON, Copy JSON and manual Nuvio.tv Add/Merge help. This is local feature-branch behavior awaiting owner review; published main retains the existing manual Export UI.

The core Builder remains usable without login, a Nuvio connection, a personal TMDB API key or cloud storage. Manual JSON import, Copy JSON and Download JSON remain first-class supported paths.

### Integration terminology boundary

**Confirmed from official documentation reviewed 2026-07-25**

These are three different concepts:

1. **Nuvio collection sources** — source objects inside collection/folder JSON; the repository’s evidence-backed `sources` and compatibility `catalogSources` rules apply.
2. **Stremio-style addons** — profile-scoped addon manifest URLs used by Nuvio’s addon sync.
3. **Nuvio integration/plugin repositories** — repository `manifest.json` files that register locally executed integration JavaScript for Hermes.

The third concept is documented in the [Nuvio Integration Development Guide](https://nuvio.tv/docs?doc=plugins-repo), reviewed 2026-07-25. Plugin repositories are not part of the Builder's core scope. Their manifests must not be treated as collection sources or Stremio addon manifests.

## 17. Branding

**Deferred product direction**

- A Dave Collections master brand is preferred to a product logo that could imply official TMDB endorsement.
- Product colourways may distinguish Nuvio and possible future tools.
- The product title should remain ordinary UI text rather than being permanently embedded in a logo.
- Final logo design is deferred and must not delay functional Builder work.
- The welcome footer's text **About** control and the workspace header's single **?** now open a compact **About & Credits** modal; the workspace control replaces the former V1 backlink instead of adding another header action. A shared borderless credits group contains restrained left-logo/right-copy TMDB and JustWatch rows above a divided compact creator/action footer linking davecollections, the **TMDB ID Lookup Tool**, and GitHub issue chooser. One muted text-only line at the bottom states that this is an independent community tool for Nuvio collections. TMDB remains attribution rather than primary Builder branding, and its official mark must not become more prominent than the application identity.

Trakt integration remains outside current project scope; a possible future colourway is not approval to begin Trakt work.

## 18. Roadmap and mandatory gates

**Canonical roadmap and product-direction owner.** This section reconciles the owner-approved direction and retained repository plans as of 2026-09-22 under #242. It is a dependency-aware direction, not a rigid release schedule: no dates, release allocation or implementation promises are implied. Each implementation needs its own focused owner-approved scope. Listing a candidate does not create an issue or select it as the next task. Technical contracts and historical evidence remain in their focused documents.

### Current state

The Builder includes eight established hierarchy families plus standalone Discover, physical Source editing, preservation-first import/edit, JSON export, Global display settings, Source/Folder/Collection reordering, multi-sort creation and native People/Studio/Network Source variants. Unsupported or ambiguous imports remain preserved and structured editing/Preview fails closed where semantics cannot be represented safely. V2 stays isolated and unadvertised under `/builder/`, with `noindex, nofollow`; stable V1 lookup/copy-ID/export remains supported.

The approved **Shared Advanced** sequence is complete across Studios, Networks, Genres, Decades, Streaming and standalone Discover. #216 / PR #217 added native rating bounds, #218 / PR #219 completed approved Studio/Network fields, and #220 / PR #221 aligned and expanded the three Discover families. Supported fields cover minimum votes, minimum/maximum rating, scalar language/country, evidenced Genre/keyword rules and applicable date/year, Studio/Network and provider/region controls according to each family's contract. Studio/Network identities, fixed Genre inclusion, Decade/year periods and Streaming provider/region remain defining constraints. This does not mean all TMDB Discover filters are supported; see [remaining capability investigations](#investigate-first).

**Preview-100 is merged (#226 / PR #227).** Supported exact TMDB-backed paths represent up to the first 100 ordered source positions **before poster filtering**, paging sequentially through page 5 where applicable. Complete People/TMDB Collection data needs no paging; representative Decade/Period samples remain bounded. Counts distinguish loaded positions from established completion and never promise unsupported families. The [shared Preview contract](./BUILDER_TITLE_PREVIEW.md) owns current wording: for example, complete results use “Showing 18 of 18 titles.” and capped results use “Preview shows up to 100 titles.”

Genre Square and curated artwork (#222 / PR #223), Decades curated artwork (#224 / PR #225), unified guided stage presentation and green retained multi-selection (#230 / PR #231) are merged. **Collection Folder management (#232 / PR #233)** provides one-time existing-Folder shape changes with conservative exact-curated Tile/Focus orientation transitions, **Remove folders** through one atomic `removeFolders` operation, and **Sort folders** through one atomic Folder reorder. A–Z/Z–A use current titles; eligible native People Collections also offer First name/Last name, with the pragmatic final-word rule rather than surname inference. No persistent sorting/default mode or generic management framework is introduced. **Global display settings** is the current name for the existing one-shot presentation operation; internal `BulkEdit` names are not product copy.

**Back to top (#236 / merged PR #237)** is implemented: one floating `↑ Top` button (accessible name **Back to top**) appears at one viewport height of window scrolling and hides below that threshold. It sits at the lower right with a 48px minimum tap target and 16px plus safe-area offsets. Activation focuses the top Builder heading without an extra scroll and returns the page to the top smoothly, or immediately with reduced motion. The existing workspace underlay provides modal inert/aria-hidden protection. Selection, mobile level, project data and revision remain unchanged. No per-column bookkeeping or broader navigation features were added.

**Direct Nuvio read/import (#238 / merged PR #239)** includes unified Import, grouped Review notes, local Add separate/Merge exact/Replace and no read-only import backup. #240 / PR #241 repaired the subsequent shared image-fallback race; final main checks and Pages are green. Core use remains independent of login.

The [current checkpoint](#current-checkpoint---2026-09-22) records the verified base and completed sequence. Open non-PR product/maintenance issues checked on 2026-09-19 are [#9](https://github.com/davecollections/tmdb-id-lookup/issues/9) (V1/public-project screenshots and preview assets, not the next Builder milestone), [#14](https://github.com/davecollections/tmdb-id-lookup/issues/14) (public TMDB List keyword/name lookup; known URL/ID resolution already exists), [#19](https://github.com/davecollections/tmdb-id-lookup/issues/19) (ongoing cache-report maintenance), and [#24](https://github.com/davecollections/tmdb-id-lookup/issues/24) (blocked on a verified native direct TV/season source contract). #210 is closed. That is a dated backlog observation, not a fresh issue inventory. Reconciliation #234 is now closed through merged PR #235; #242 is the current documentation-housekeeping issue.

### Next

The completed prerequisites are roadmap reconciliation #234 / PR #235, Back to top #236 / PR #237, direct Nuvio read/import #238 / PR #239 and the #240 / PR #241 repair.

1. **Publication/status reconciliation — #242.** Correct current documentation and record settled future direction only; no product behavior change.
2. **Send to Nuvio — #244 revised Pass 3 implemented locally, awaiting PR owner review; not on main.** Replace-only for one profile with frozen canonical P, compact destructive Review R0, current protected-profile PIN authority, optional exact raw R0 backup, fresh R1 == R0, a final synchronous guard, one dispatch/no retry and post-write verification. Strong success requires exact verification. The accepted final-read/write race remains because no supported CAS/expected-revision API is evidenced. Remote Add/Merge/selected modes stay deferred. Owner-operated physical-iPhone live acceptance passed; PR review, merge and publication remain separate gates.
3. **Review/export help polish included locally in #244 Pass 2.** Keep Download JSON and Copy JSON first-class and retain manual Nuvio.tv Add/Merge help. Refresh dated client terminology when scoped; retain Nuvio.tv / TV app / TV management via phone or computer guidance, same-network local-address/QR instructions, and **Collections > Import > Paste or File > Import > Save Changes** where supported. Explain that URL import requires already hosted JSON, and retain beta and TMDB Enrichment guidance. Published main retains the original Export UI until publication is approved.

This sequence records owner-approved product direction, not implementation details or a new implementation issue. The housekeeping task stops at its documentation PR for owner review.

### Later

These are retained product features and polish candidates, not a ranked release backlog.

- **MDBList — desired, blocked on upstream support.** The completed Shared Advanced sequence is no longer its dependency. Dingo native MDBList source creation/export requires a verified upstream Nuvio native Collection/source serialization contract; current evidence does not justify it. [NuvioTV #2812](https://github.com/NuvioMedia/NuvioTV/issues/2812) remains upstream feature context, not proof of support or a release date. A lookup/search-only trial with no Create Source remains an optional future idea. Do not guess provider/source fields, authentication or output format, and do not create/export until actual serialized native support is verified. Account/watch-history integration remains outside Dingo's lookup/source-generation scope; MDBList has not been abandoned.

- **Quick Setup, templates and recipe engine — approved future product direction after the near-term sequence.** Build on reliable ordinary creation flows. Retain the four startup routes and meaningful return home in [Startup](#4-startup-experience), the short editable **Dave's 1-Click Setup** journey, and inspectable recipes that generate ordinary hierarchy data. Keep manageable defaults and searchable larger catalogues; exact recipe names, size, content, branching, ordering, regional/provider choices and device defaults remain [open decisions](#19-open-decisions). Neither these features nor Review/export depends on connected mode.

- **Expanded artwork/image requesting and runtime integration — product candidate.** Extend the useful People request-image experience to applicable gaps in other fields/categories. Existing #140 assistance already supports eligible blank fields for exact People, Studio, Network and official Genre authorities; do not reimplement that coverage. First inventory which family/field combinations are automatically resolved, requestable, imported-only or unsupported. Reuse the existing artwork architecture and published authorities, preserve nonblank imported/custom data, and keep asset production/publication in its owning project. Broader automation, provider-logo Folder artwork, Collection-backdrop suggestions and refresh policy need their own evidence and scope; per-item URLs/focus remain ordinary Folder-edit work, not bulk-creator controls.

- **Remaining management work.** Source multi-delete, Collection multi-delete, move/copy and generic management transactions remain deferred. Collection-scoped multi-Folder removal and one-time atomic Folder sorting are already implemented through #232; they do not establish a generic bulk-management framework.

- **Folder / Collection merging — explicit management action.** Consider **Edit / Merge / Delete → choose merge destination → review result → confirm**. Drag already means reorder and must not become merge. Preserve source identity, duplicates/variants, order, unknown imported fields and presentation safely. Copying while retaining the original remains conceptually separate from true Merge unless later design deliberately combines them.

- **Retained Search/Add and whole-Builder improvements — later candidates.** Keep Quick Add/multi-add with clear Added/duplicate feedback, bounded bulk collection lookup with ambiguity/unmatched handling, and transparent spelling/singular/plural suggestions that never blindly rewrite input. Retain shared-code consolidation, accumulated UX rough edges, source-name parity decisions and deliberate artwork-runtime integration. Logical/bundle editing, person replacement, and Streaming Provider/Region/media replacement remain separate designs; current physical editors do not authorize them. Preserve the dense three-column desktop direction and current focus/scroll/accessibility contracts.

- **Public-release readiness — mandatory release gate.** Explicit owner approval is required before removing `noindex` or promoting V2. Verify the visible official TMDB logo and exact required notice in [Product identity and trust](#3-product-identity-and-trust-promise), with TMDB less prominent than Dingo; existing About & Credits is not by itself a new release approval. Retain current attribution and JustWatch obligations. Final Dave Collections branding/supporting wording/logo remain deferred design decisions and must not delay functional work. V1 remains independently supported.

### Investigate first

These are capability investigations, not approvals to expose new settings. Preserve the distinction between TMDB accepting a query, Nuvio storing it, a client applying it and Builder Preview reproducing it.

- **Nuvio Advanced-filter capability refresh.** Eventually prepare controlled JSON covering every currently known Nuvio filter field, plus selected plausible TMDB-only candidate fields not currently modeled by Nuvio, with sensible populated values, meaningful explicit zero cases and absent/unset comparisons. Include Movie, Series, Studio, Network and Discover examples where relevant. Observe what current clients preserve, change or remove. **Preservation does not prove application to title results**: a newly preserved field needs a focused application test before Dingo exposes it. Choose the smallest useful client matrix when scoped; another four-route mega-test is not an automatic prerequisite, and this does not reopen completed #206 acceptance.
- **Compound language/country and remaining locale compatibility.** Keep the **48 blocked International Cinema Discover sources (40 Movie, 8 TV)** visible as preservation-only structured-editing cases. The [original audit](./SHARED_ADVANCED_ASSESSMENT.md#all-48-original-import-discover-cases) proves exact round-trip preservation; literal client forwarding does not establish independent Movie/TV language/country semantics, and the production gateway rejects compound values. Do not flatten, split or normalize expressions or substitute language codes without verified meaning. Resolve field/media behavior and catalogue gaps before a narrow validator/Preview/Worker change with owner deployment. Remaining origin-country/original-language cross-client questions belong here, not in a duplicate workstream.
- **Native People Advanced/filter behavior.** The inspected PERSON/DIRECTOR resolvers apply role/media selection and sorting but ignore Discover filters. Keep installed-client behavior and any future support change as a separate capability question; the retained controlled fixture is available if needed. Do not expose ineffective controls, convert People into Discover, or treat Lists stored inside People folders as native People evidence.
- **Multi-provider / compound Streaming.** Investigate whether one Streaming source can legitimately represent several providers and/or appropriate compound values. Verify field-specific TMDB semantics, Nuvio serialized representation, client consumption and exact Preview behavior. Do not assume `|`, comma or another delimiter works because another field uses it; existing read-only compound-provider destination affinity is not creation/filter support. Separate this from already-supported selection of multiple providers that creates separate sources/folders.
- **TMDB Recommendations runtime/schema behavior.** Retain the parked investigation into a supported source/runtime contract without guessing a source type. This does not approve a Dingo recommendation engine.
- **Other retained capability boundaries.** Public TMDB list keyword/name lookup remains tracked by #14; native direct TV/season support remains blocked under #24 until an actual source contract is verified. Family-specific sort extensions, particularly Franchise oldest-first, require current Nuvio evidence; the existing unsupported fallback must not become a promised control. Further preserved fields or client-default parity work must use focused application evidence, not UI presence or another family's semantics.

### Post-live / management improvements

**Two-file JSON comparison and merge — post-live candidate.** Upload **Collection file 1** and **Collection file 2**, compare them, and safely produce one editable combined Builder state. Neither file is called master/import by default. The existing V1 merge utility is not proof that this Builder management flow is implemented or safe without further design.

Later design should add unique Collections/Folders/Sources, review matching Collections/Folders instead of blindly flattening them, allow exact duplicate Sources to be deduplicated, and retain differently configured variants. Surface artwork/presentation conflicts and user-selectable outcomes; preserve unknown imported fields first. Matching rules, stable identity, ordering and conflict review require explicit design. A reusable comparison/merge engine might later serve templates or connected Nuvio flows, but those integrations are not promised here. This file-level flow remains distinct from explicit in-workspace Folder/Collection Merge above.

### Long-term direction

If adoption and continued development justify it, Dingo's may evolve toward a **“Nuvio collection-management companion”**: build, import, safely edit, reorganise and maintain large configurations, compare/merge configurations, and potentially audit configuration health. Optional read/import is implemented; the approved future Send direction is prioritized separately in the near-term sequence. This is a direction, not an immediate rename or implementation commitment. Keep **Dingo's Collection Builder** as the present name and creation plus preservation-first import/edit as the present focus. Nuvio remains the media centre and playback application; Dingo must not become its playback/media-centre replacement or add watch-history/general media-centre functions merely to broaden scope.

Optional Direct Nuvio read/import is merged through #238 / PR #239. Replace-only Send is the [approved next feature direction](#next); #244 implements its foundation, compact UI and hardening locally with one optional raw current-Nuvio backup, fresh R1 == reviewed R0 and one guarded dispatch. The accepted residual concurrency limitation remains. Owner-operated physical-iPhone live acceptance passed; PR owner review, merge and publication remain outstanding.

### Explicitly deferred / not currently planned

- **Mixed AND/OR grouping** remains deferred; a single evidenced operator does not authorize nested/mixed Boolean groups or treating several sources as one group.
- **Unsupported filters/source types** remain preservation-only where applicable. Runtime minimum/maximum and vote-count maximum are not modeled by the current Nuvio source contract. Certification, release type, status/type and other additional fields remain capability questions requiring evidence before exposure; direct movie/series/season types must not be invented. Lists and Franchises do not inherit Discover controls.
- **Saved Builder project format** is unnecessary for today's local JSON flow; revisit only if persistence provides a concrete user need. Cloud projects/storage are not a prerequisite.
- **Visual Nuvio layout preview** remains deferred pending demonstrated demand and a focused design; shared title Preview does not itself approve a full client-layout simulation.
- **Broader management and integration scope** is not bundled into the candidates above: permanent automatic sorting, implicit drag-to-merge, all bulk actions at once, a new recommendation engine, playback/watch history, mandatory accounts and Trakt remain outside current plans. The [non-goals](#20-explicit-product-non-goals) continue to apply.

## 19. Open decisions

| Decision | Why it remains open |
| --- | --- |
| Additional Advanced capabilities | The approved Shared Advanced sequence is complete. Unmodeled fields, People filters, compound language/country and compound Streaming still need focused evidence. |
| MDBList trial | Whether to build lookup/search-only first and its presentation remain undecided; native creation needs a verified Nuvio contract. |
| Remaining management semantics | Folder removal and one-time sorting are implemented. Source/Collection multi-delete, move/copy, generic transactions, merge identity/conflict outcomes and copy-versus-merge design remain deferred decisions. |
| Final public name for the one-click feature | Dave’s 1-Click Setup is the working name; final product copy needs review. |
| Final template names | Essential, Complete, Full, and Dave’s Setup are recovered concepts, not approved public labels. |
| Exact Essential / Complete / Full contents | Requires a dedicated recipe-design issue and size/performance judgement. |
| Category toggles before generation | The right balance between speed and control has not been designed. |
| Default collection ordering | Recovered examples differ and should be tested with real setups. |
| Quick Setup region/provider defaults | The selected-folder Streaming flow explicitly chooses Region(s) and then one eligible Provider; future recipe/Quick Setup defaults still need product and regional-relevance decisions. |
| Exact TV / phone / both defaults | Must follow current client evidence and owner UI review. |
| Startup-screen visual layout | The four routes are decided; their presentation is not. |
| Future Search/Add destination and action wording | All eight current families now have evidenced selected-folder and/or hierarchy routes. Any new destination model or wording still requires a focused decision rather than being inferred from those implementations. |
| Source-name parity across bulk creators | Source names are source-level where appropriate, but current family semantics differ; do not require hundreds of generated name inputs without focused design and evidence. |
| Later Nuvio write modes and connection capabilities | Read/import is merged and Replace-only Send direction is approved. Remote Add/Merge/selected-Collection semantics, pairing and persistent/refresh login remain deferred decisions. |
| Saved Builder project format | Not needed for the current local JSON flow; revisit only when persistence needs justify it. |
| Removal of `noindex` | Requires explicit release-readiness approval. |
| Final Dave Collections branding | Preferred direction is recorded; design remains deferred. |

Roadmap placement and investigation boundaries are owned by the [canonical roadmap](#18-roadmap-and-mandatory-gates), rather than a second parked-work list here.

## 20. Explicit product non-goals

**Rejected or out of scope**

- playback, watch-history, or general media-centre replacement;
- a recommendation engine;
- mandatory accounts;
- mandatory cloud project storage;
- requiring personal TMDB API keys;
- guessing unsupported Nuvio source types;
- replacing or rewriting stable V1 merely to modernise it;
- copying Kaptain or Ultra MAX implementations;
- converting imported opaque data into guessed known sources;
- treating Stremio addon manifests or Nuvio plugin-repository manifests as collection-source JSON;
- making optional integrations mandatory;
- plugin-repository development as a core Builder feature;
- Trakt integration without a future explicitly approved issue.

## Historical foundation checkpoints

This retained foundation ledger describes the contracts and acceptance boundaries at those issues' historical stages. It is not a second roadmap. Later #154, #194, #196, #198, #200, #202, #204 and the completed sequence through #232 supersede earlier pending/non-editable/export-not-yet-available wording as summarized in [Current state](#current-state). Old client evidence does not become new acceptance by moving this ledger.

1. Product-plan and workflow recovery — complete.
2. Collection/folder presentation settings — integrated, with owner review complete.
3. First mandatory Dave UI and flow review — complete.
4. Resolve the review findings, including direct per-card hierarchy actions — integrated, with owner local UI/browser review complete.
5. Bulk presentation settings were a separate future issue at this stage; the current Global display settings feature subsequently merged through #154 / PR #155.
6. Collection/folder/source reordering — integrated through issue #59 / PR #60; owner local review and the bounded Desktop/web/mobile/TV ordering evidence gate are complete. The evidence is under [`manual-tests/nuvio-clients/issue-59-builder-reordering/`](../../manual-tests/nuvio-clients/issue-59-builder-reordering/), with Windows line-ending verification integrated through issue #61 / PR #62.
7. Persistent collection/folder creation actions and safe collection/folder/source deletion — integrated through issue #63 / PR #64. Collection/folder/source actions live in one in-card overflow pattern whose body-portalled menu measures its full height against the current Visual Viewport, flips upward or clamps within a 10px margin, and focuses without automatic page scroll. Mobile selected collection/folder contexts provide preservation-safe quick rename, empty collection/folder deletion is immediate, and every source deletion plus populated/import-bearing collection/folder deletion is confirmed. Selection, mobile level, focus, raw preservation, addon projection removal, and deterministic cycles remain explicit contracts.
8. First source creation and Search/Add slice — TMDB movie franchises are integrated through issue #65 / PR #66; owner UI acceptance and the required current Nuvio Desktop import/runtime/round-trip gate are complete. A second client is desirable but non-blocking unless conflicting behavior appears. Future source types, automatic hierarchy, source editing, multi-add, bulk lookup, suggestions, and sort controls remain separate focused work.
9. Collection and Folder settings polish — integrated through issue #69 / PR #70 after repository and owner UI/flow review, with the issue #53 schema and export contract preserved.
10. Unified People Search/Add — integrated through issue #74 / PR #75 with selected-folder quick add, untouched-default promotion, preservation-only existing folders, the historical capped collection-batch flow, direct source combinations and one-time defaults, atomic single-folder/multi-folder batches, independently keyed final artwork, and stable v1 source tab titles. The first Desktop source-contract run passed, and the regenerated distinct-title/curated-artwork fixture subsequently passed owner visual/import/immediate-export validation; the client version/build remains unknown. Issue #118 / PR #119 supersedes the old collection-batch entry with the uncapped shared hierarchy flow while preserving Add Source.
11. Native physical-source editing — integrated through issue #78 / PR #79 for Movie Collection and People, extended through Studio issue #92 / PR #93 and Network issue #98 / PR #99, then narrowly extended through Streaming issue #104 / PR #105, official Genre issue #110 / PR #111, and canonical Decade issue #113 / PR #115. Generic Discover remains intentionally non-editable. A complete current-client V2 edit/export round trip is deliberately deferred until V2 exposes export and is not an unfinished integration gate.
12. Studio Movie/Series source creation and physical-source editing — merged through issue #92 / PR #93 with V1-informed Company metadata discovery, hidden relevance plus automatic browse/sort/filter controls, contained logos and shared TMDB identity links, automatic quiet informational post-selection counts, retained media-specific Movie/TV sort mappings, and preservation-safe display-name/sort updates.
13. Network Series source creation and physical-source editing — merged through issue #98 / PR #99 with cached discovery that completely ignores legacy `t`, one automatic informational on-demand Series Count, exact projection-free `NETWORK/TV` construction, folder-aware duplicate handling, and display-name/sort-only edits. The reviewed Worker route was manually deployed and bounded live acceptance passed on 2026-08-09.
14. Internal DISCOVER Core contract — the original 14-field milestone was implemented through issue #100; issue #106 updates it to the current 18-field persisted contract with no intended user-facing change. See [`BUILDER_DISCOVER_CORE.md`](./BUILDER_DISCOVER_CORE.md).
15. Streaming Services — merged through issue #104 / PR #105; tracked Worker evidence and owner refinement are recorded separately from any future client/export evidence.
16. Genres — merged through issue #110 / PR #111 with all-27 ordered multi-select, current-folder or atomic sibling-folder-per-Genre destinations, exact-only official grouping, compact scalable review, shared responsive Advanced Add/Edit UI, DISCOVER Core construction/identity, and matching fail-closed source editing. Current-client V2 export testing is deliberately deferred until export exists and is not an unfinished gate.
17. Decades — integrated through issue #112 / PR #114 and issue #113 / PR #115: the non-UI catalogue/source/hierarchy planning, duplicate/stale validation, canonical classification, atomic multi-collection foundation, shared Blank-first launcher, visible defaults/order/grouping, responsive per-Decade Genre configuration, physical-folder-aware naming, shared hidden-title accessibility, review/apply flow, presentation controls, scalable summaries, and narrow canonical Decade Source Edit.
18. Reuse-first hierarchy-family migration through the existing launcher — People is the first post-Decades proof through issue #118 / PR #119. Issue #120 codifies the shared standard. Franchises merged through issue #122 / PR #123, Studios through issue #124 / PR #125, Networks through issue #126 / PR #127, Genres through issue #130 / PR #131, Streaming Services through issue #162 / PR #163, and eighth family TMDB Lists through issue #170 / PR #171.
19. Whole-Builder tightening/consolidation after the eight-family milestone. Issue #132 removed the legacy People panel launcher and restored guided browse-first People focus; issue #158 resolves the shared Title Preview limit and mobile geometry; issue #166 completes Add Source Preview coverage; issue #172 makes title visibility live and reversible across all guided families and Node Editor; and issue #176 closes People Add Source Sort parity while adding the eight-family, three-context capability contract.
