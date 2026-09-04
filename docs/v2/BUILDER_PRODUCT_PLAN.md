# Dingo's Collection Builder — Product Plan

Status: Durable product direction for the isolated v2 Builder

Last reviewed: 2026-09-03

This document records the current product direction recovered from the owner-supplied V1 and V2 project histories and reconciled with the repository, tests, manual Nuvio evidence, current GitHub history, and official Nuvio documentation. It is not a release claim or an implementation specification.

Decision labels mean:

- **Confirmed:** an owner decision that agrees with current repository evidence.
- **Confirmed direction:** an approved direction whose detailed design remains future work.
- **Deferred:** intentionally later than the current roadmap gate.
- **Open decision:** evidence or owner approval is still required.
- **Rejected:** not part of the intended product.
- **Superseded:** replaced by a later decision or stronger evidence.

Implementation, deterministic tests, and confirmed manual Nuvio evidence override obsolete plans. [`BUILDER_KNOWLEDGE.md`](./BUILDER_KNOWLEDGE.md) owns the detailed technical contract.

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

A future Nuvio connection may require Nuvio authentication, but it must remain optional. Product copy must therefore avoid absolute promises such as “no login ever.” The core Builder must not depend on that connection.

## 4. Startup experience

**Confirmed direction**

The intended Builder home presents four routes:

1. **Quick Setup** — answer a few plain-language questions and generate a useful editable setup.
2. **Use a Template** — choose a curated recipe and customise the generated result.
3. **Import Existing JSON** — open a current configuration through the preservation-first importer.
4. **Start Manually** — enter the Builder with a clean hierarchy and full control.

The audience and mental model differ for each route, so they should not be collapsed into one technical import/create form. Users must also be able to return to a meaningful Builder home instead of being trapped in the workspace.

**Current implementation boundary**

The current welcome screen supports starting a clean collection plus local-file or pasted-JSON import. The four-route experience is planned, not implemented.

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

**Implemented and merged through issue #118 / PR #119 after owner desktop, physical-keyboard, and responsive review:** **People** is the second guided hierarchy family and is supported in both New Collection and New Folder. It reuses the mature TMDB People search, ordered keyed selection, per-person Acting/Directing Movie/Series configuration, artwork preview, modal lifecycle, and source constructors. There is no artificial selection ceiling; Search uses visually hidden native checkboxes inside the existing full-card click targets, with the complete card carrying selected surface/border/inset and focus under the later issue #178 choice-presentation contract. One compact count/action summary opens a collapsed bounded removable list, and a tunable informational notice begins at 50. Configure exposes only Automatic and Same for all around the exact current four-combination V2 contract. The Same-for-all header and every bounded compact person row always show four direct marker-free count pills with a restrained Acting/Directing distinction. Editing a person records an internal override without changing the visible strategy; shared changes affect unmodified people and preserve explicit overrides. There is no Custom mode, transition notice, person dropdown, or expanded editor. One shared sort offers only verified Popular/Recent/Top-rated values and maps Recent per media while remaining outside exact duplicate identity; Most votes is not inferred from unrelated source-family evidence. A body-portalled poster-only Preview titles modal reuses combined credits and current configuration, deduplicates titles, caps at 10 desktop/5 mobile, contains focus, supports Close/Escape/exact-trigger restoration and loading/empty/retry states, and adds no pagination or separate preview endpoint. New Collection defaults to one editable `People` collection with one canonical-name Poster folder per person. Review presents shared **Title options** first, including collection title visibility and the three existing generated-folder title outcomes with **Hide on Home screen only** as the accepted default, followed by direct **Layout** controls. New Folder uses the same generated-folder title outcomes without exposing collection title editing and keeps the captured parent byte-identical. Both scopes can then apply one shared Poster/Landscape choice; every generated folder otherwise uses its shape-specific canonical manifest or fallback artwork, with individual artwork customisation deferred to the ordinary Folder editor after creation. Its ephemeral plan uses exact source identity plus collection-aware person evidence to report Ready, Already in this collection, Partly in this collection, and informational Exists elsewhere; complete/partial destination people are omitted rather than duplicated. Both scopes revalidate and use existing atomic controller batches. Issue #132 removes the redundant Folders-header People compatibility alias, leaving `New Collection → People` and `New Folder → People` as the hierarchy routes while `Selected Folder → Add Source → People` keeps its established behavior. Guided People selection is browse-first and initially focuses a stable heading; direct Add Source remains typing-first. The final regression correction keeps the visually hidden native checkbox inside each selectable card's coordinate context, so partially clipped pointer/keyboard selection leaves the outer modal, document, and sticky action stable while the inner results pane owns focus scrolling.

Issue #158 supersedes only the older People Preview presentation bound above: People now shares the maximum of 10 at every viewport, the phone 5×2 poster layout, and centred bounded Title Preview geometry without changing combined-credit/provider semantics.

Issue #118 also makes the public `nuvio-people-assets` schema-v2 manifest the active V2 authority for registered People canonical name, actor/director membership, and artwork. Numeric TMDB person ID remains identity and TMDB search order remains unchanged. `poster`/`landscape`, separate `hero`, and separate `titleLogo` map only to existing Nuvio folder fields; the optional static focus pair is emitted only when complete. One validated in-memory manifest load is shared by the workspace, per-asset SHA-256 values remain transient comparison evidence, and missing IDs retain the safe TMDB-profile/emoji fallback without reconstructing legacy `nuvio-assets` People paths. Company/Network ownership, V1 behavior, both asset repositories, Worker/deployment, and legacy asset deletion are unchanged/deferred. See [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md).

**Issue #160 owner-approved implementation checkpoint:** selected-folder Add Source adds singular **Decade** after Genres, completing ordinary creation parity with the seven registered native Source Edit families. The owner-corrected compact order is Media, Sort, one Decade family, its exclusive whole period or multiple individual years, optional additive Genre sources, Advanced, generated review, and exact Preview. Every selected period retains one general logical source; each catalogue-ordered compatible Genre adds another, and each logical source generates Movie, Series, or Movie then Series. The shared canonical one-period builder still owns every physical source, while an ordinary bundle seam composes the deterministic period × general/Genre × media matrix without filtering the bulk hierarchy API or duplicating date/filter logic. Exact Preview deliberately omits the Guided representative sample and lazily selects optional Year, Source, and media dimensions before one atomic Save. There is no arbitrary range, hierarchy, artwork, custom Add-time title, compound-Genre physical source, generic Discover, schema/controller/import/export/serializer, Worker, Streaming, or other family change. See [issue #160](https://github.com/davecollections/tmdb-id-lookup/issues/160) and [`BUILDER_DECADES.md`](./BUILDER_DECADES.md).

The final #113 responsive corrections make both Decades Configure Genres and ordinary Genre exclusions consume the accepted bounded desktop context/catalogue and mobile context-root/detail shell from the established Genre flow. Inclusion and exclusion provide their own labels, selection state, actions, and validation while sharing navigation, history, focus, scroll ownership, safe areas, and breakpoints. The official catalogue, toolbar, All-selected/per-Decade state, filters, planner identity, and generated hierarchy remain unchanged.

**Retained future considerations:** Quick Add/multi-add may keep Search open for several independent results with clear Added/duplicate states; atomic behavior applies only where a future operation commits several sources together. Bulk collection lookup may use bounded one-name-per-line input, controlled concurrency, ambiguous/unmatched handling, duplicate review, and multi-source insertion. Optional spelling or singular/plural suggestions must be transparent and must not blindly append or remove `s`.

**Confirmed future creation direction:** after the merged People proof, later approved issues may extend the existing New Collection/New Folder hierarchy launcher to more existing families through the reuse-first, family-specific standard in [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md).

**Implemented Franchise naming direction in issue #122:** preserve meaningful canonical TMDB Collection wording, including semantic suffixes such as `Collection`, `Saga`, and `Trilogy`. Do not strip a trailing ` Collection` or reduce names such as `Matrix Collection`, `Avatar Collection`, or `Die Hard Collection` to ambiguous movie-like folder names. Issue #122 keeps the complete canonical visible name, including a leading `The`, and uses exact Collection ID as identity.

**Issue #122 owner-review presentation correction:** Franchise hierarchy folders are Poster-only. The TMDB Collection poster maps to `coverImageUrl`; a missing poster uses the safe emoji fallback, and the Collection backdrop is not substituted as a landscape cover. The shared hierarchy Layout control shows Show All only for Tabs. Rows hides it and generates `showAllTab: true` for Franchises, People, and Decades so returning to Tabs restores an enabled All tab. New Folder continues to inherit and preserve its parent presentation.

**Studio hierarchy merged through issue #124 / PR #125 after owner review:** Studios extends the same New Collection/New Folder hierarchy launcher without changing selected-folder Add Source. Ordered uncapped Studio selection keeps the checked-in catalogue's exact `Movie Count: N` / `Movie Count: Unknown` Search presentation and adds one hierarchy-only All/Exclude 0/10+/50+/100+/500+ Movie-count filter before paging, with Unknown retained only by All and Exclude 0. The filter makes no API request. The flow is Select → Configure → Appearance: Configure owns directly visible selected-Studio identity, catalogue/learned counts, reactive placement, Preview, and accessible removal; last removal stays in a calm disabled Configure state; the final Appearance stage owns presentation only. One global Movies/Series/Both composition (Movies default) and one shared evidenced sort create `Movies` / `Series` physical source titles. Movies/Series Preview is lazy by media; one response supplies its count and ordered first page, while only a successfully previewed Series count is retained transiently across sort changes. The same durable media-separation rule now keeps People Movies and Series in separate tabs over its already-loaded combined credits, with per-media role combination, physical-title deduplication, semantic sort, count, and no added People request. Franchises remains Movies-only and Decades has no title Preview. Plans, stale revalidation, and atomic apply perform no network work. Logical destination Company matches that are complete or partial are omitted without an override; elsewhere remains informational and addable. Generated Studio folders use fixed Landscape artwork through one workspace runtime load, then checked-in TMDB logo, then `🎬`, and default to Show everywhere. The narrow optional Company `sort_by` Worker allowlist was manually deployed and live validated on 2026-08-19 after separate owner authorization. Overall V2 release status remains governed by the separate release and noindex boundary. See [`BUILDER_STUDIOS.md`](./BUILDER_STUDIOS.md).

**Network hierarchy merged through issue #126 / PR #127:** Networks extends the shared New Collection/New Folder launcher while keeping selected-folder Add Source and Source Edit unchanged. Its ordered uncapped Select reuses the checked-in catalogue and adds a hierarchy-only All/Exclude 0/10+/50+/100+/500+ Series-count filter before paging; exact `Series Count: N` includes zero, Unknown means missing/invalid, and Add Source remains count-free. Configure applies one evidenced TV sort to the batch and owns placement, remove, and an explicit single-view Series poster Preview. No step automatically requests Discover. Before successful Preview, one visible `Series Count:` line shows the catalogue snapshot; a successful response supersedes that value on the same line with transient `total_results`, while failure retains the snapshot. The same response supplies the upstream-ordered first page through the shared narrow requester/cache seam. Owner deployment and real production-Worker/TMDB/image-CDN mounted validation are complete without fabricated integrated responses. Appearance defaults to a visible `Networks` Collection, Show-everywhere Network folders, Poster, Tabs, Show All on, and Pin off, with only the batch-safe Poster/Landscape choice. Exact requested runtime orientation falls back to the checked-in `w500` logo, then empty image plus `📺`, before planning. Each eligible canonical Network folder contains one generic `Series` native `NETWORK/TV` source. Destination matches omit the folder without an override, elsewhere remains informational, and one stale-revalidated atomic batch preserves selection order and rolls back completely. The merge triggered the normal automatic Pages publication; it did not redeploy the Worker. No current-client hierarchy round trip is claimed. See [`BUILDER_NETWORKS.md`](./BUILDER_NETWORKS.md).

**Issue [#182](https://github.com/davecollections/tmdb-id-lookup/issues/182) owner-review implementation supersedes only the older Studio/Network discovery asymmetry described above:** selected-folder Add Source, New Collection, and New Folder now share the applicable checked-in count group, count-bearing result cards, and explicit result ordering for each family. Studios uses Movie-count **All** by default, **Exclude 0**, **10+**, **50+**, **100+**, and **500+**, removes the redundant Add-only hide-zero checkbox, and exposes **A–Z** plus **Most movies** everywhere; Networks uses the equivalent Series-count choices with **A–Z** plus **Most series** everywhere. Empty Browse defaults to the family's count-descending order, while typed search defaults to hidden Best Match until explicitly overridden; known counts precede Unknown and deterministic name/ID tie-breaking follows equal counts. Add remains single-select; guided creation remains insertion-ordered multi-select. Filter/order/query/page/selection state survives Back as applicable. Counts remain existing checked-in maintenance snapshots that may differ from later live exact-selection totals and add no request. A separate test-owned entity-selection capability contract covers all eight families across Add Source, New Collection, and New Folder beside the existing saved-source capability contract. Source construction, schema, serialization, live request paths, Worker behavior, dependencies, V1, and catalogue data remain unchanged.

**Genre hierarchy merged through issue #130 / PR #131 after final owner review:** Genres extends the same ordered, scope-aware New Collection/New Folder launcher while selected-folder Add Source and Source Edit remain unchanged. The approved Select stage retains the complete local 27-concept catalogue, uncapped ordered native-checkbox selection, no initial Search focus, and verified 35-source Both capacity. The flow is **Select → Configure → Structure → Appearance → Create**. Configure uses shared Media/Sort pills, fixed unavailable-media notes, Advanced, and one compact logical row per selected Genre with placement, Remove, and explicit **Preview titles**. Structure owns four plan-derived shapes: Genre folders; fixed visible-title Movie/Series media folders; separate media-specific Genre folders; and, only for New Collection with both media effective, separate Movie and Series collections. Its approved visual choice cards use first-time-user wording, illustrative nested Collection → Folder → content-choice wireframes, live Collection/Folder counts, and established radio/selected/focus treatment. The redundant intermediate heading and visible Source counts are omitted only from this decision screen; authoritative Source counts remain in the plan, validation, later technical summary, and Create behavior. Genre folders also expose only the three evidenced combined-Series concepts, now explained in ordinary language with **Keep its own folder** as the unchanged standalone default and the same exact target planner values. No structure, generated naming, composite, state, apply, or Worker behavior changes, and no Worker redeployment is required. New Folder omissions and combined-Series availability are structure-specific; all shapes rebuild and apply atomically, including two-collection rollback. Appearance exposes only batch-safe choices relevant to the chosen shape, including Landscape-default/Poster Genre artwork through explicit 27-concept `wide`/`vertical` mappings without cross-orientation fallback. Preview comes from the exact compiled physical draft, uses lazy Movie/Series views and the shared nested poster shell, and includes mandatory canonical `include_adult=false` in the complete cache identity. The tracked Worker still admits only the fail-closed single-Genre shape and does not authorize generic Discover or service-token access. Dave's first reviewed version `857c1fa3-e62d-4fd8-9321-9573aedb1906` remains historical evidence. Dave confirmed the corrected 10,479-byte source was deployed on 2026-08-21; direct canonical/rejection checks and the complete mounted mobile/desktop production Worker, real TMDB, and real image-CDN scenario passed. Final desktop/physical-phone owner review completed before the merge at `817b4b8c46ca135e2badcfc6ca903dde3f824222`. There is no dependency, V1, asset-repository, or new client-evidence claim. See [`BUILDER_GENRES.md`](./BUILDER_GENRES.md).

Issue #158 resolves the whole-Builder Preview question: the accepted ready state remains poster-only with at most 10 usable posters at every viewport. Phones use five columns and up to two rows without captions or horizontal grid scrolling; fewer usable results render naturally. Title Preview surfaces are centred in the usable visual viewport when they fit and use one bounded Preview scroll owner at short heights without shrinking posters solely to avoid scrolling.

**Issue #166 implementation checkpoint:** every ordinary selected-folder Add Source family now exposes the same explicit lazy **Preview titles** capability immediately before Save: Movie franchise, People, Studios, Networks, Streaming services, Genres, and the already-proven Decade flow. Preview consumes the exact validated detached physical draft that the current Add flow would save, never a Source Edit session or reconstructed approximation. Multi-source configurations select one physical source at a time in deterministic Save order: People uses Role then applicable Media; Studios uses Media; Streaming uses Region then Media; Genres uses Genre then Media; single-source Movie franchise and Network omit redundant selectors; Decade retains its existing Year/Source/Media behavior unchanged. Complete configured candidates remain previewable even when the destination already contains matching identities. The shared #158 nested dialog, 10-poster grid, request coordination, providers, bounded success caches, exact TMDB image URLs, loading/empty/error/Retry behavior, focus containment/restoration, and short-height geometry remain authoritative. Movie franchise and People reuse their successful details caches, while Company, Network, Streaming, Genre, and Decade continue through their existing exact production Preview providers. Movie franchise retains its non-interactive title count and removes the now-redundant expandable contained-title text list, making the standard poster Preview its one title-inspection path. The Add Source chooser retains its family-specific helper copy and makes no blanket claim that every current or future family uses TMDB; accurate TMDB context remains on the Movie-franchise card and within source-specific flows. Preview performs no controller operation, does not alter duplicate handling or Save, and adds no Worker, schema/model, importer/serializer/export, V1, dependency, deployment, publication, or current-Nuvio behavior claim. See [issue #166](https://github.com/davecollections/tmdb-id-lookup/issues/166).

**Issue #170 owner-accepted implementation checkpoint:** TMDB Lists joins selected-folder Add Source and both guided hierarchy scopes. One multiline input accepts strict public TMDB List IDs/URLs, explicitly resolves each canonical signed-int32 identity, preserves ordered successful selections, and retains line-specific failures. Review exposes an independent Source name for each List. Add Source creates `N` ordered sources in the selected Folder; New Collection creates exactly one named Collection → one named Folder → `N` sources; New Folder creates exactly one named Folder → `N` sources. Every source uses the confirmed native `LIST` shape with canonical source-level `MOVIE`, `original`, numeric ID, empty filters, and no `catalogSources` projection. Current Nuvio testing passed Movie-only, Series-only, and mixed Lists: items routed by TMDB `media_type` despite the fixed saved `MOVIE`, and immediate export retained `MOVIE` plus `original`. Duplicate identity is exact List ID plus physical media; same-destination duplicates are omitted unless Add Source explicitly overrides, elsewhere remains informational, and all mutations revalidate then use existing atomic operations. Preview and title-only Source Edit reuse the shared adapter/request/dialog/cache seams and label mixed results **Titles**. The owner-deployed Worker admits only `/3/list/<canonical int32>?language=en-US&page=1`; real Worker/TMDB/image-CDN acceptance and desktop/physical-phone owner review passed before integration. See [issue #170](https://github.com/davecollections/tmdb-id-lookup/issues/170) and [`BUILDER_TMDB_LISTS.md`](./BUILDER_TMDB_LISTS.md).

**Final integration after the issue #170 checkpoint:** issue #170 closed through merged [PR #171](https://github.com/davecollections/tmdb-id-lookup/pull/171) at `3e1ceace849d137e17ddfedb8637bc147f511285`; Pages publication, the owner-deployed narrow Worker, live production-path acceptance, current-Nuvio Movie-only/Series-only/mixed List checks, immediate export, and owner review all passed. Preview remains limited to the complete normalized page-1 sample. A shared Preview of up to 100 titles remains parked future work requiring a separately approved Worker change and manual owner deployment.

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

- one in-card overflow trigger on every hierarchy card, with a body-portalled menu that uses full rendered height, the current Visual Viewport, upward flipping, edge clamping, and prevent-scroll initial focus; collections/folders expose Edit/Delete, supported physical source shapes expose Edit/Delete through the fail-closed editor registry, unsupported source shapes expose Delete only, and actions directly target unselected cards;
- one mobile-only selected-context quick-rename pencil for collections and folders;
- one responsive modal for collection title, intentional invisible Nuvio title, source-level Tabs/Rows, the saved Include an All tab when using Tabs preference, and Pin to top; the source group is headed **How sources appear in this collection**, and `TABBED_GRID` is labelled **Tabs (recommended)**;
- the same modal with Folder **Basic details** and **Display** groups, compact native radios for the three title-visibility outcomes, and Poster/Landscape visual selection cards.

Manual blank collections default to Tabs with All enabled, Pin off, and `focusGlowEnabled: true`. Focus glow is no longer exposed as a settings control: imported explicit booleans remain unchanged, absence stays absent, unusual values stay raw-preserved, and unrelated settings edits omit the field. Manual blank folders default to Poster with `hideTitle: true`, so the title beneath the card is hidden by default while the actual folder name remains visible. Imported Follow Layout and Square values are preserved while untouched but are not offered as normal new choices.

U+200E LEFT-TO-RIGHT MARK is the confirmed intentional invisible Nuvio title character. The collection setting and folder Hide everywhere choice deliberately emit one U+200E, and blank titles never become invisible automatically. The folder group presents three complete outcomes: Show everywhere uses a visible title with `hideTitle: false`; Hide on home screen only uses a visible title with `hideTitle: true`; Hide everywhere uses one U+200E with `hideTitle: true`. Imported repeated U+200E titles remain byte-for-byte preservation cases until the user deliberately replaces their intent. The Builder uses a display-only fallback rather than rendering blank cards or headings.

Issue #59 adds a restrained ordering foundation directly to existing hierarchy cards: each collection, folder, and source has one compact six-dot handle contained inside its visual card for pointer/touch dragging and keyboard-accessible one-position movement. Issue #63 keeps that grip and folds entity actions into the same visual card through an overflow trigger; drag clones expose no active menu controls. During pointer movement, the complete associated row follows the pointer above panel clipping, a matching placeholder shows its proposed position, and surrounding siblings visually make space without changing project data; insertion lines remain secondary feedback and reduced-motion mode removes nonessential sliding. Pinned collections remain a stable displayed group before ordinary collections, movement stays inside the current pin group, and moving never changes `pinToTop`. Folders remain within their collection and sources remain within their folder and category-bearing source objects; stable internal IDs retain selection and card identity. A completed pointer drop or successful keyboard arrow movement performs one authoritative move, while hover, cancellation, invalid boundaries, and same-position drops remain data no-ops. Bulk movement and new ordering metadata remain absent. The redundant Selection details panel is removed so the source hierarchy uses the available workspace width; detailed review remains part of the later Create JSON journey.

**Confirmed direction**

The TV / phone / both Quick Setup answer may select safer initial presentation defaults. Defaults must stay editable and be based on current client evidence rather than assumptions. Exact per-device defaults remain open.

The approved future consistency direction retains the dense three-column `Collections → Folders → Sources` desktop workspace, row selection as the primary click behavior, and explicit editing. Teal/cyan communicates selected, active, or current state; green is meaningful success, amber/orange needs review, red is error or destructive, and muted grey is disabled or unavailable. Routine valid rows need counts where useful, not repetitive ready decoration. Detailed modal, action, terminology, and non-dismissal rules are owned by [`BUILDER_UI_SHELL.md`](./BUILDER_UI_SHELL.md); this is future consistency direction, not a claim that every current surface already conforms.

The current **Bulk display settings** feature is a one-shot bulk operation over existing nodes, not persistent global/default state. Single-node booleans and bulk tri-state controls may intentionally use different physical controls. Show All behavior currently differs intentionally between wizard, Node Editor, and bulk contexts, and changing it requires a focused product decision. Focus GIF enablement may remain independent of whether a URL exists.

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

Issue #100 established the original 14-field internal DISCOVER Core. Issue #106 updates that internal persisted vocabulary to the current 18 fields by recognizing `withoutGenres`, `withoutKeywords`, `withoutCompanies`, and `withoutWatchProviders`. That issue alone did not approve exclusion controls, generic Discover editing, or a new user-facing flow. Issue #110 later approves `withoutGenres` only inside its focused official Genre Add/Edit contract; the other exclusion families and generic Discover remain deferred.

See [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md) for the current evidence boundary.

## 13. Artwork behaviour

**Confirmed direction**

Artwork should normally feel automatic rather than technical:

1. use approved published curated artwork when available;
2. otherwise use a suitable cached TMDB image or logo where the applicable consumer supports it;
3. otherwise retain a visible title and emoji fallback.

Imported or custom nonblank artwork must be preserved unless the user changes it. Runtime-owned automatic artwork may refresh under a later approved policy. Builder-only ownership metadata must never leak into Nuvio JSON. Missing artwork must not prevent collection creation.

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
- Supported physical Movie Collection, People, Studio, Network, simple Streaming, official Genre, and canonical Decade sources can be edited through registry-backed, fail-closed adapters with adapter-owned changes, duplicate rejection, stale-session protection, and minimal patches; unsupported source shapes remain preservation-only for editing.
- Imported artwork and presentation values remain protected unless changed by the user.
- Import and export should be understandable without requiring raw-JSON editing.

Nuvio client import behaviour can be destructive or can change by client and version. Instructions must therefore remain dated and updateable, warn before replacement, and distinguish observed behaviour from assumptions.

## 15. Review, export, and installation journey

**Confirmed direction**

The intended journey is:

1. choose a starting route;
2. generate or import a setup;
3. edit it in the full Builder;
4. review collection, folder, and source counts plus warnings;
5. validate the output;
6. Copy JSON or Download JSON;
7. follow current, evidence-backed Nuvio import guidance;
8. later, optionally Send to Nuvio through a verified integration.

Review should disclose external dependencies and what will be added or replaced. Manual export must remain available after any future connection feature.

## 16. Optional future Nuvio connection

**Deferred, with a partially confirmed external contract**

Official Nuvio public API documentation reviewed 2026-07-25 explicitly documents:

- email/password authentication and access/refresh tokens;
- up to six profiles with profile-scoped resources;
- collection pull and push operations;
- full replacement of the profile’s complete `collections_json` blob, where omitted collections are removed and an empty array clears it.

Source: [Nuvio Public API](https://nuvio.tv/docs), reviewed 2026-07-25.

No separate collection import, merge, or targeted-update endpoint was identified on the reviewed page. This establishes that an authenticated collection transport exists. It does **not** make connection part of the core Builder or establish a safe product flow. Before implementation, a dedicated issue still needs verified answers for:

- supported authentication, browser handoff, or device pairing;
- profile selection;
- how an intended Add / Merge / Overwrite experience can be provided over a documented full-replace API;
- initial setup versus later update targeting;
- token storage, refresh, expiry, disconnect, and revocation;
- privacy disclosures;
- backup, conflict, partial-failure, and recovery behaviour;
- whether a safe update is possible without destructive replacement.

The reviewed documentation did not establish a public device-pairing contract. That remains unverified. The Builder must not infer its design from a third-party “Connect” button, ask users to paste credentials into an unreviewed flow, or expose long-lived tokens without an approved security model.

Manual Copy/Download remains complete and supported.

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

**Confirmed current dependency-aware direction**

1. Product-plan and workflow recovery — complete.
2. Collection/folder presentation settings — integrated, with owner review complete.
3. First mandatory Dave UI and flow review — complete.
4. Resolve the review findings, including direct per-card hierarchy actions — integrated, with owner local UI/browser review complete.
5. Bulk presentation settings remain desired but deferred to a separate focused issue.
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
19. Whole-Builder tightening/consolidation after the eight-family milestone. Issue #132 removed the legacy People panel launcher and restored guided browse-first People focus; issue #158 resolves the shared Title Preview limit and mobile geometry; issue #166 completes Add Source Preview coverage; issue #172 makes title visibility live and reversible across all guided families and Node Editor; and issue #176 closes People Add Source Sort parity while adding the eight-family, three-context capability contract. Later work may consider other accumulated UX rough edges, safe shared-code opportunities, evidence gaps, unnecessary duplication, and stale/deferred items worth closing; these are directions, not pre-created issues, and no next implementation issue is selected here.
20. Advanced Discover.
21. Broader deliberate V2 UI/UX and artwork-runtime integration at appropriate source stages.
22. Quick Setup, templates, and recipe engine after underlying creation flows are reliable.
24. Review/export usability.
25. Optional Nuvio connection only after its product, authentication, security, and replacement contract is verified.

This is a dependency map, not a rigid release schedule. Each step requires its own approved issue and may be refined by stronger evidence.

## 19. Open decisions

| Decision | Why it remains open |
| --- | --- |
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
| Direct Nuvio connection flow | Transport exists, but full replacement, authentication, safe updates, and recovery need design and verification. |
| Saved Builder project format | Not needed for the current local JSON flow; revisit only when persistence needs justify it. |
| Removal of `noindex` | Requires explicit release-readiness approval. |
| Final Dave Collections branding | Preferred direction is recorded; design remains deferred. |

Parked investigations are not implementation commitments: origin-country/original-language compatibility filters; TMDB Recommendations runtime/schema behavior; and a shared Preview of up to 100 titles, which would require separately approved Worker work and manual owner deployment.

## 20. Explicit product non-goals

**Rejected or out of scope**

- playback;
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
