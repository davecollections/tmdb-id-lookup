# V2 Builder Decades

## 1. Status and boundary

Issue [#112](https://github.com/davecollections/tmdb-id-lookup/issues/112) adds the deterministic, non-UI Decades foundation consumed by the later visible issue #113.

The persisted hierarchy remains:

```text
Project → Collection → Folder → Source
```

Decades configuration becomes a validated, transient hierarchy plan and then ordinary editable Builder nodes. The plan is never added to the domain model, importer, serializer, project JSON, or Nuvio output. There are no recipe/template nodes, nested folders, sources directly under collections, saved configuration metadata, UI launcher, wizard, modal, or editor in this issue.

## 2. Catalogue and dates

`builder/src/source-add/decades-catalogue.js` is the single production owner of the initial ordered catalogue and its exact date boundaries:

| Preset | Aggregate filters |
| --- | --- |
| 1950s & Earlier | `releaseDateLte: 1959-12-31` |
| 1960s | `1960-01-01` through `1969-12-31` |
| 1970s | `1970-01-01` through `1979-12-31` |
| 1980s | `1980-01-01` through `1989-12-31` |
| 1990s | `1990-01-01` through `1999-12-31` |
| 2000s | `2000-01-01` through `2009-12-31` |
| 2010s | `2010-01-01` through `2019-12-31` |
| 2020s | `2020-01-01` through `2029-12-31` |

The 1950s & Earlier individual expansion is exactly `Before 1950` (`releaseDateLte: 1949-12-31`) followed by the ten complete years 1950–1959. Every other individual year uses `YYYY-01-01` through `YYYY-12-31`.

The planner never reads the system clock. Callers inject `currentYear`. When the selected normal preset contains that year and Individual years is enabled, the supported modes are:

- Through current year — default;
- Current year only;
- Full decade.

These modes affect only individual-year expansion. The current decade's aggregate always retains its complete preset range; in particular, 2020s always ends at 2029-12-31.

Issue #113 deliberately keeps those lower-level #112 modes for deterministic callers and compatibility tests, but no longer asks the user to choose among them. Its visible creation adapter always supplies `full-decade` when Individual years includes the selected current Decade. For 2020s, the visible flow therefore creates canonical 2020 through 2029 year sources. Future-year sources remain valid dynamic Discover sources and may stay empty until titles become available, but the visible flow adds no future-year message.

## 3. Source composition

Each selected preset independently enables an additive combination of:

- Decade overview (the user-facing #113 label for the existing whole-Decade aggregate);
- Individual years;
- Genre breakdown.

At least one is required. The visible #113 defaults are Decade overview off, Individual years on, and Genre breakdown off; the lower-level #112 source contract keeps its existing compatibility defaults. The underlying transient field remains `wholeDecade`; source identity, complete-period filters, and the approved `All 2000s`-style names are unchanged.

Genre breakdown uses the existing immutable official Genre catalogue from issue #110. It creates only Decade-level Genre sources. Issue #113 minimally extends the transient #112 configuration with one ordered Genre selection per selected Decade. A shared selection remains accepted as a compatibility input and normalizes to the per-Decade map. The implementation has no loop that combines individual periods with Genres, and deterministic tests prove that Year × Genre multiplication cannot occur.

A selected structural Genre must have a physical mapping for the chosen media. Movies rejects Movie-incompatible concepts, Series rejects TV-incompatible concepts, and Both accepts a concept with at least one applicable mapping while generating every physical mapping it supports. An incompatible selection rejects the complete configuration before any source or hierarchy plan is returned; it is never silently omitted from an otherwise valid recipe.

Movies, Series, and Both create separate physical native TMDB `DISCOVER` sources. Inside one media group the order is whole period, individual years, then that Decade's selected Genre breakdown sources. Selected presets remain normalized to catalogue order for the chooser, while explicit transient settings determine whether planned folders and years are oldest-to-newest or newest-to-oldest. Aggregate sources always remain first. For 1950s & Earlier, newest-to-oldest means 1959 through 1950 and then Before 1950.

When Movie and Series sources physically coexist in one folder, the default remains the complete Movie group followed by the complete Series group. The optional paired order interleaves Movie then Series for each equivalent aggregate, year, or Genre concept. Movie-only and TV-only Genres retain their configured Genre position. This setting is ordering only: filters, source identity, counts, and media compatibility are unchanged. It is ignored when a physical folder contains only one media.

Every source is constructed through `buildDiscoverSourceDraft`. Exact duplicate comparison uses `discoverSourceIdentity` / `discoverSourceNodeIdentity`; title never participates. The four existing semantic sorts remain Popular, Recent, Top Rated, and Most Votes.

Approved Advanced settings are limited to minimum/maximum rating, minimum votes, original language, origin country, and Genre exclusions. Ordinary overview/year sources support one shared exclusion selection or a per-Decade override. Genre sources use the existing official compatibility mappings and one exclusion selection per included Genre, exposed only within Genre customisation; these exclusions likewise support shared or per-Decade state. Self-exclusion is rejected; media-inapplicable exclusions are omitted; another selected structural Genre may still be excluded from one physical Genre source.

No From/To year, arbitrary date, keyword, company, network, provider, or other DISCOVER field is accepted. The preset/year owns the structural date range.

## 4. Layouts, naming, and presentation

New Collection plans support:

- Movies → `Movie Decades`;
- Series → `TV Decades`;
- Both / Separate media collections (default) → `Movie Decades`, then `TV Decades`;
- Both / One mixed collection → `Decades`.

Each collection has one folder per selected preset. A mixed collection puts separate Movie and Series sources together in each Decade folder. The deferred Movies-folder/Series-folder layout is absent.

New Folder plans capture one existing collection and create one selected Decade folder or ordered sibling folders for several selected presets. They create no parent collection. The plan records the parent's current `viewMode` for preview information and never patches the parent.

New Collection plans use the existing `viewMode` values `TABBED_GRID` or `ROWS`; no Decades-only presentation enum exists. One configuration applies to every generated collection and carries the established All-tab, pin-to-top, and U+200E hidden-collection-title semantics. Defaults are Tabs, All tab on, not pinned, and title visible; focus glow retains its normal true generated default without becoming a control here. One folder configuration likewise applies to every generated Decade folder using the existing Poster/Landscape and three title-visibility outcomes. Decades defaults those generated folders to Poster with titles visible. New Folder accepts only the folder configuration, reports the captured parent's presentation read-only, and never patches that parent.

Generated source names reflect the media that physically coexist in their destination folder:

- a single-media Decade folder uses `All 2000s`, `2000`, and `Horror`-style names without a media suffix;
- a mixed-media Decade folder uses `All 2000s Movies`, `2000 Movies`, and `Horror Movies`, plus the corresponding Series names;
- the same rule applies to 1950s & Earlier and Before 1950.

The `All` prefix keeps a whole-period aggregate visibly distinct from its first individual year and Genre sources. Naming is display-only; date/Genre filters and exact DISCOVER identity are unchanged. Collection title proposals are validated editable values; folder and source names remain generated proposals that become ordinary editable output after creation.

## 5. Ephemeral plan and duplicate outcomes

`builder/src/source-add/decades-plan.js` owns one concrete bounded, ephemeral Decades plan shape. It contains only Decades-specific configuration, captured project/destination evidence, proposed ordinary hierarchy values, source provenance needed for review, exact placement outcomes, title-collision information, and counts derived from the actual bundles. `planType` is the strict Decades discriminator; the transient plan has no schema version or persistence/migration contract.

Placement outcomes use:

- `ready-to-create`;
- `already-in-this-folder`;
- `already-in-this-collection`;
- `partly-in-this-collection`;
- `exists-elsewhere`.

For New Folder scope, complete and partial exact identity sets already in the destination collection are omitted from the creation bundles. Matches only in other collections remain informational and do not block creation.

For New Collection scope, an identical source already in the current project remains informational. DISCOVER sources are not project-global unique, so the new collection bundle remains ready. Different sorts, approved filters, or exclusions remain distinct exact identities.

Plan validation regenerates the complete plan from its captured Decades configuration against the current project. Plan and source-draft comparison requires dense, plain JSON-compatible structures with exact key sets. Object key insertion order is ignored, while array/source ordering remains authoritative; unsupported or `undefined` values are rejected. Relevant changes to the destination, duplicate outcomes, presentation inheritance, or naming collisions make the plan stale. An unrelated project change that leaves all regenerated plan evidence identical does not force a false stale result.

## 6. Atomic application

New Folder application reuses `createFoldersWithSources`.

New Collection application uses the narrow controller method `createCollectionsWithFoldersAndSources`. It accepts one or more complete Collection → Folder → Source bundles, validates the entire argument shape before candidate construction, builds every node in one in-memory candidate project, enforces project-wide internal-ID uniqueness, generates unique collection/folder Nuvio IDs, and commits once.

Success advances one content revision and preserves/reconciles valid selection. Any validation, internal-ID, factory, Nuvio-ID, or later-bundle failure leaves project content, content revision, and selection unchanged. Operation diagnostics follow the existing atomic bundle convention without advancing content revision. A failure while constructing TV Decades after Movie Decades exists only in the candidate cannot leave Movie Decades in the project.

## 7. Canonical classification

The non-UI classifier recognizes title-independent canonical:

- Before 1950;
- 1950s & Earlier;
- exact supported full years from 1950 through 2029;
- exact supported full decades from 1960s through 2020s.

It may also recognize one official media-correct included Genre plus the approved Decades Advanced fields. Canonical `tmdbId` is either `null` or absent; blank, whitespace, numeric, boolean, object, array, and every other supplied value fail closed. Partial/custom dates, compound Genres, unsupported filters, unsafe exclusions, malformed data, and unknown-rich recipes also fail closed.

The issue #110 Genre recognizer now explicitly declines any source owned by this canonical Decades classifier. That makes the future rule structural rather than dependent on editor registry order: canonical Decades periods belong to Decades; official Genre recipes without a canonical Decades period remain Genre-owned. No Decade editor is mounted in #112.

## 8. Deterministic scale evidence

The accepted offline maximum uses all eight presets, Both media, Whole decade, Individual years through injected 2026, and the full 35 physical Genre references for every preset:

- 16 whole-period sources;
- 156 individual-period sources;
- 280 Decade-level Genre sources;
- 452 sources total;
- 2 collections and 16 folders in Separate mode.

The test applies all 452 sources in one controller revision. It proves stable ordering, exact counts, valid canonical drafts, no Year × Genre, and no arbitrary controller/product ceiling.

## 9. Issue #112 handover boundary

Issue #112 deliberately ended before New Collection/New Folder launchers, Decades configuration/review UI, Tabs/Rows controls, preview/status presentation, and the visible Decade Source Editor. Existing blank New Collection and New Folder behavior was unchanged by that foundation.

## 10. Visible workflow and source editor — merged issue #113 / PR #115

Issue [#113](https://github.com/davecollections/tmdb-id-lookup/issues/113) consumes the #112 contract without changing it. Every existing New Collection and New Folder entry point now opens one contextual **What would you like to create?** launcher. Its small ordered registry keeps **Blank** first and **Decades** second so later creation modes can be added without another panel-specific chooser. Blank immediately calls the exact pre-existing `createDraftCollection` or `createDraftFolder` helper: it adds no name screen, review, automatic hierarchy, or changed defaults.

Decades is a three-stage progressive flow:

1. choose one or more catalogue-ordered Decade presets, with dynamic Select all and Clear all controls;
2. **Configure Decades** answers what content should be created: editable selected Decades, compact Media and Sort pills, conditionally applicable collection structure, additive content, compact Genre customisation, visible applicable ordering, and one collapsed Advanced source-filter section;
3. **Review & Appearance** answers what will be created, what it is called, and how it looks: exact counts, editable collection names or captured destination, one always-visible Titles & visibility section, shared collection/folder presentation controls, title/identity outcomes, and collapsed folder-level details before applying the concrete plan.

New Folder scope captures the selected destination collection when the launcher opens. It creates ordered sibling Decade folders, defaults to Both media in mixed physical folders, and inherits rather than edits parent presentation. New Collection also defaults to Both and defaults that media choice to separate Movie and TV collections while permitting one mixed collection. The Separate preview shows Movie Decades first and TV Decades second as stacked home-screen rows; Mixed remains one collection row. Only New Collection exposes collection-level appearance and collection-title visibility. The Tabs/Rows chooser, hidden-title switch, Poster/Landscape cards, and three folder title-visibility outcomes are shared with the manual editors rather than copied. New Folder gets a read-only inherited summary plus editable generated-folder appearance and folder-title visibility only.

Step 2 keeps selected Decades editable using the shared removable-selection treatment: small selections are pills, while large selections use a bounded disclosure with individual removal. Removing a Decade prunes its Genre and exclusion state. Media reuses the existing three-pill control and defaults to Both; the four semantic Sort pills follow immediately. Collection structure remains conditional and defaults Both/New Collection to Separate. The content cards use **Decade overview**, Individual years, and Genre breakdown with Individual years as the sole content default. Genre breakdown opens the established catalogue/context subflow rather than mounting the catalogue in the main scroll; its helper states that Genres can be added to all selected Decades or customised per Decade. Applicable Ordering stays visible. Advanced remains last and collapsed, containing only the five global fields, contextual ordinary Genre exclusions, and the reused explanatory subview; Sort is absent from it. Configure Genres and ordinary exclusions both consume the same accepted responsive Genre context/catalogue shell: desktop shows a bounded All-selected-plus-each-Decade pane beside the existing official catalogue and toolbar, while mobile shows the same context root → catalogue detail → Back pattern, with root-only Done, one active scroll owner, safe-area padding, history-aware navigation, and preserved selections. Inclusion retains its official catalogue, compatibility labels, shared/per-Decade counts, Select all/Clear all behavior, and every-Decade-required validation; exclusion retains its existing selection semantics. The viewport/backdrop remains borderless and only the bounded inner panel owns its border and radius.

The visible current-Decade choice block is absent. When 2020s Individual years is enabled, Review derives ten year sources from 2020–2029 in addition to the unchanged complete aggregate when Decade overview is enabled. The UI shows no future-year message and makes no client refresh-schedule claim.

Configure Decades keeps the selected Decades visible and removable, using compact pills for a small selection and a bounded list for a large one. Genre breakdown mounts one reused official Genre catalogue at a time in its secondary surface. Its contexts are All selected Decades plus each selected Decade; the shared context adds/removes a Genre across every selection without erasing other per-Decade choices, while an individual context changes only that Decade. Counts and values survive context switching. Every selected Decade requires at least one Genre while breakdown is enabled; the accessible error remains beside the compact Genre summary and Continue stays disabled.

The always-visible Ordering section appears only when at least one ordering choice is relevant. One user-facing **Display order** control offers exactly three presets and maps them to the two retained lower-level #112 planner fields: **Newest Decades, Oldest Years** (default) means newest-first folders plus oldest-first years; **Newest throughout** means newest-first folders and years; **Oldest throughout** means oldest-first folders and years. Each card previews both folder order and its inside chronology. Aggregate sources remain first. For 1950s & Earlier, oldest-first years begin with Before 1950 then 1950–1959, while newest-first years run 1959–1950 then Before 1950. Changing the preset reorders only folders and individual-year sources without changing identities or counts. **Source grouping** remains an independent choice and appears only where Both media physically coexist in a mixed Decade folder, including New Folder; it does not appear for Separate Movie/TV collections. Movie Decades still precedes TV Decades when separate collections are created.

Review never renders one row per generated source or permanent configuration-summary boxes. Plan-derived count cards lead, followed immediately by editable generated collection names (or compact New Folder destination/inherited presentation), then the exact sequence **Titles & visibility**, **Collection options**, **Folder options**, and **View folder details**. New Collection reuses the manual **Hide collection title in Nuvio** behavior: every generated name field becomes blank and disabled while the plan emits exactly one U+200E per collection, and every field references one shared status message: “Collection titles are intentionally hidden in Nuvio. Turn this off to edit visible titles.” The visible drafts return when the setting is turned off. New Folder exposes no collection-title editor. Both scopes expose the existing three exact Decade-folder visibility outcomes. Collection options own Tabs/Rows, All tab, and pin only; Folder options own Poster/Landscape only. Decade overview and Nuvio's All tab remain independent; when overview, Tabs, and All tab are all enabled, Collection options shows a quiet nonblocking explanation without changing either choice. Folder/source readiness remains neutral, elsewhere locations use the shared notice, and destination duplicate/partial outcomes remain non-overridable. Apply sends the exact reviewed plan to `applyDecadesHierarchyPlan`, which revalidates against current controller state and either commits its complete hierarchy once or leaves the project untouched.

Artwork is an explicit future boundary. Review & Appearance is structured so separately approved cover, hero/backdrop, title-logo, runtime, ownership, or orientation-specific controls can later extend Collection options or Folder options. Issue #113 makes no artwork request and adds no empty artwork controls or placeholders.

`builder/src/source-edit/decade-editor.js` owns canonical classified Decade sources before the Genre adapter. It edits only display title, one of the four media-correct semantic sorts, and approved rating/vote/language/country/Genre-exclusion fields. Period dates, media, and an included official Genre remain fixed and visible. Advanced excludes arbitrary years because the classifier-owned canonical period is structural. Validation rebuilds a canonical candidate and fails closed for structural drift, incompatible exclusions, unsupported values, duplicates, stale sessions, and noncanonical Discover shapes. Genre editing continues to explicitly decline Decade-period sources.

Focused deterministic coverage is in `tests/builder-decades-ui.test.mjs` alongside the #112 foundation, plan, controller, manual presentation, and mounted browser suites. It covers Both/Separate defaults, all three exact Display-order mappings and previews, independent Source grouping, 1950 special ordering, shared one/two-field hidden-title accessibility and restoration, the Review section labels, the absence of future-year UI copy, the corrected Genre helper and shared inclusion/exclusion shell, and reviewed/applied hierarchy parity. The mounted Blank chain proves exact defaults and generated IDs, desktop selection, one revision per item, modal unlock, New Folder availability, and then Add Source availability. Local browser QA covers desktop plus 360, 384, 393, 402, and 412px widths, all nine inclusion and ordinary-exclusion contexts, desktop two-pane and mobile root/detail behavior, required-Genre validation, catalogue toolbar actions, Blank-first focus, body lock/inert underlay, no initial text autofocus, default-collapsed native disclosures, summary updates, value preservation through Back/Review, a single scroll owner, primary action reachability, current-year selector absence, New Folder inheritance, Decade Source Edit, trigger restoration, and horizontal-overflow checks without making a live TMDB request. A physical-phone review accepted the launcher, catalogue, top-left Back, structure/ordering/Tabs-Rows visuals, sticky action, and responsive direction; issue #113 / PR #115 subsequently merged. No client import/export result is claimed.
