# V2 Builder Decades foundation

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

## 3. Source composition

Each selected preset independently enables an additive combination of:

- Whole decade;
- Individual years;
- Genre breakdown.

At least one is required. Defaults are Whole decade on, Individual years off, and Genre breakdown off.

Genre breakdown uses the existing immutable official Genre catalogue from issue #110. It creates only Decade-level Genre sources. The implementation has no loop that combines individual periods with Genres, and deterministic tests prove that Year × Genre multiplication cannot occur.

A selected structural Genre must have a physical mapping for the chosen media. Movies rejects Movie-incompatible concepts, Series rejects TV-incompatible concepts, and Both accepts a concept with at least one applicable mapping while generating every physical mapping it supports. An incompatible selection rejects the complete configuration before any source or hierarchy plan is returned; it is never silently omitted from an otherwise valid recipe.

Movies, Series, and Both create separate physical native TMDB `DISCOVER` sources. Mixed folders order the complete Movie group before the complete Series group. Inside one media group the order is whole period, individual years, then selected Genre breakdown sources. Selected presets are normalized to catalogue order; selected Genres retain supplied order.

Every source is constructed through `buildDiscoverSourceDraft`. Exact duplicate comparison uses `discoverSourceIdentity` / `discoverSourceNodeIdentity`; title never participates. The four existing semantic sorts remain Popular, Recent, Top Rated, and Most Votes.

Approved Advanced settings are limited to minimum/maximum rating, minimum votes, original language, origin country, and Genre exclusions. Ordinary whole/year sources use one ordinary exclusion selection. Genre sources use the existing official compatibility mappings and one exclusion selection per included Genre. Self-exclusion is rejected; media-inapplicable exclusions are omitted; another selected structural Genre may still be excluded from one physical Genre source.

No From/To year, arbitrary date, keyword, company, network, provider, or other DISCOVER field is accepted. The preset/year owns the structural date range.

## 4. Layouts, naming, and presentation

New Collection plans support:

- Movies → `Movie Decades`;
- Series → `TV Decades`;
- Both / Separate media collections (default) → `Movie Decades`, then `TV Decades`;
- Both / One mixed collection → `Decades`.

Each collection has one folder per selected preset. A mixed collection puts separate Movie and Series sources together in each Decade folder. The deferred Movies-folder/Series-folder layout is absent.

New Folder plans capture one existing collection and create one selected Decade folder or ordered sibling folders for several selected presets. They create no parent collection. The plan records the parent's current `viewMode` for preview information and never patches the parent.

New Collection plans use the existing `viewMode` values `TABBED_GRID` or `ROWS`; no Decades-only presentation enum exists. Planned collections retain the normal new-collection `showAllTab`, pin, and focus-glow defaults. Decade folders use the product-plan Poster default.

Deterministic source names are `<period> Movies|Series` and `<decade> <Genre> Movies|Series`, including `Before 1950 Movies|Series`. Collection title proposals are validated editable values; folder and source names remain generated proposals that become ordinary editable output after creation.

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

## 9. Deferred visible work

Issue #113 remains responsible for New Collection/New Folder launchers, Decades configuration/review UI, Tabs/Rows controls, preview/status presentation, and the visible Decade Source Editor. Existing blank New Collection and New Folder behavior is unchanged by this foundation.
