# Builder hierarchy creation standards

Status: Durable cross-family architecture, product, UX, accessibility, scale, presentation, and verification standard

Established by: Decades issues [#112](https://github.com/davecollections/tmdb-id-lookup/issues/112) and [#113](https://github.com/davecollections/tmdb-id-lookup/issues/113), then reconciled with People issue [#118](https://github.com/davecollections/tmdb-id-lookup/issues/118) / PR [#119](https://github.com/davecollections/tmdb-id-lookup/pull/119) through issue [#120](https://github.com/davecollections/tmdb-id-lookup/issues/120), with Franchises applied through issue [#122](https://github.com/davecollections/tmdb-id-lookup/issues/122) / PR [#123](https://github.com/davecollections/tmdb-id-lookup/pull/123), Studios through issue [#124](https://github.com/davecollections/tmdb-id-lookup/issues/124) / PR [#125](https://github.com/davecollections/tmdb-id-lookup/pull/125), and Networks through issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) / PR [#127](https://github.com/davecollections/tmdb-id-lookup/pull/127), merged at `10a76aeffd351341321ab56658e69858fb85d39c`

Last reviewed: 2026-08-29

This document owns the rules shared by guided **New Collection** and **New Folder** hierarchy families. Family documents such as [`BUILDER_DECADES.md`](./BUILDER_DECADES.md), [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md), [`BUILDER_FRANCHISES.md`](./BUILDER_FRANCHISES.md), [`BUILDER_STUDIOS.md`](./BUILDER_STUDIOS.md), [`BUILDER_NETWORKS.md`](./BUILDER_NETWORKS.md), [`BUILDER_GENRES.md`](./BUILDER_GENRES.md), and [`BUILDER_STREAMING_SERVICES.md`](./BUILDER_STREAMING_SERVICES.md) continue to own family-specific source contracts, defaults, naming, artwork authority, duplicate strictness, and optional features. Repository implementation, deterministic tests, and confirmed owner evidence override obsolete plans.

The merged guided hierarchy families are **Decades, People, Franchises, Studios, Networks, and Genres**. Genres merged through issue [#130](https://github.com/davecollections/tmdb-id-lookup/issues/130) / PR [#131](https://github.com/davecollections/tmdb-id-lookup/pull/131) at `817b4b8c46ca135e2badcfc6ca903dde3f824222` after the required owner Worker deployment, production Worker/TMDB/image-CDN validation, and desktop/physical-phone review. **Streaming Services** is the seventh family in the owner-approved issue [#162](https://github.com/davecollections/tmdb-id-lookup/issues/162) implementation. Its selected-folder Add Source and Source Edit flows remain separate; the family document owns their context-aware default naming.

## 1. Entry points and persisted architecture

- **New Collection** and **New Folder** are the contextual hierarchy-creation launchers.
- **Add Source** remains the physical-source operation for the selected existing Folder. A family may support both entry types, but the flows must not be conflated.
- People uses only `New Collection → People` and `New Folder → People` for hierarchy creation; there is no Folders-header People shortcut. `Selected Folder → Add Source → People` remains the separate physical-source route.
- New hierarchy families register through the existing ordered, scope-aware creation-family registry. Do not create a panel-specific or family-specific launcher in parallel.
- The registry owns only family ID, label, description, supported scope, and ordering. Family components, planners, validators, constructors, duplicate rules, and mutations remain outside it.
- A hierarchy creator generates ordinary editable `Collection → Folder → Source` nodes. It must not persist a recipe, hierarchy, wizard, or family-only node merely to support creation.
- Each family prepares a framework-independent, ephemeral, validated hierarchy plan containing the concrete ordinary-node bundles and review evidence.
- Immediately before application, rebuild or revalidate the plan against current project and destination state. Materially stale placement, identity, presentation inheritance, or configuration evidence must return to Review without mutation.
- Apply the complete reviewed plan atomically through the existing controller batch operations. A late factory, validation, identity, or ID failure creates nothing and advances no content revision.
- When one existing Collection plan must both append sources to multiple existing folders and create new folders, use the narrow `extendCollectionWithFoldersAndSources` operation introduced by issue #162. It accepts only internal-ID folder targets and complete new-folder/source bundles, validates the whole request, constructs one detached candidate, checks uniqueness, and commits once. It is not a generic transaction and does not authorize delete, move, rename, presentation mutation, or cross-Collection work. Existing raw overlays, opaque/unknown children, and sibling/source ordering remain preservation boundaries.

## 2. Reuse-first rule

Before adding a family-specific search or catalogue surface, search hook, selectable card, ordered-selection store, plan, presentation or title control, layout control, review block, Preview shell/provider, requester, response normalizer, request coordinator, success-only bounded cache, thin family adapter, source constructor, identity or duplicate helper, artwork resolver, responsive shell, focus/scroll behavior, controller operation, fixture, or test harness, inspect the current Builder for substantially similar behavior.

Prefer, in order:

1. direct reuse;
2. extraction into a shared abstraction;
3. extension of an existing abstraction;
4. a new implementation only when the family semantics materially differ.

Shared infrastructure must not absorb family business rules merely to increase reuse. Record a material semantic difference in the focused issue and final report.

## 3. Flow and state

Use this established shape as the starting point:

```text
Select / Choose → Configure → Review & Appearance → Create
```

A simple family may collapse a stage. A family may add a focused nested subview when the task would otherwise overload the primary stage. Do not force identical steps when the semantics are simpler.

A family may also move routine entity review earlier when that makes the final presentation stage materially clearer. Studio issue #124 deliberately uses **Select → Configure → Appearance**: Configure owns the directly visible selected-Studio rows, Preview/remove actions, learned counts, and reactive placement; Appearance owns presentation only and contains no Studio rows. Network issue #126 follows that same stage split with Network-specific Series-only configuration and appearance. Genre issue #130 uses **Select → Configure → Structure → Appearance → Create**. Configure keeps the approved catalogue stable, groups shared-pill Media and Sort controls with Advanced, and always renders one compact configured row per selected Genre with Preview/remove/placement. Structure owns the four evidenced hierarchy shapes, plan-derived Collection/Folder/Source counts, and the three focused combined-Series placement choices. Its choices use visual selection cards with first-time-user copy, compact illustrative Collection → Folder → content-choice wireframes, live plan-derived Collection/Folder summaries, native radios, and established selected/focus treatment; source totals remain authoritative internally and in later technical summaries, while the illustrations are explanatory only and never become plan input. Appearance owns only choices valid for the selected structure. Configure has no duplicate selected-set or View-all disclosure; the primary stage scroll owner handles all 27 logical rows.

Back must preserve every still-valid selection, configuration override, title draft, presentation choice, and relevant search position. Cancel and Back are mutation-free. Browse/select screens do not auto-focus Search or summon the mobile keyboard; Search may receive focus only after explicit interaction or when the user has explicitly chosen a flow whose primary task is typing.

## 4. Ordered bulk selection and scale

For eligible family pickers:

- selection order is meaningful, deterministic, and preserved through search, paging, Back, removal, and reselection;
- there is no arbitrary hard selection cap;
- the historical issue #74 People limit of 20 must not be copied into a new hierarchy family;
- a family may show a nonblocking scale notice at a tunable threshold, but Continue/Create stays available and the notice must not imply a maximum;
- use a compact count summary (`<count> selected`, with a family noun where clearer) plus a bounded `View selected` disclosure;
- do not render a permanent chip wall for a large selection;
- expanded selected lists are bounded and internally scrollable.

A hard ceiling requires measured technical evidence and explicit owner review. Controller convenience limits, historical UI limits, or concern about a large number alone are not evidence for a product cap.

## 5. Selectable-card accessibility

For multi-select catalogue or search results:

- the complete card is an activation target;
- selected state uses the established restrained surface and border;
- use the modern circular empty/filled indicator and retain a visible tick when selected;
- never rely on colour alone;
- retain accessible native checkbox semantics where practical;
- keep keyboard focus visibly apparent.

The People regression establishes a required layout rule: a visually hidden focusable checkbox, or an equivalent focusable control, must be positioned inside the selectable card and intended inner scroller's coordinate context. When a partially clipped card receives pointer or keyboard focus, browser-native focus scrolling may move the inner result pane only; it must not reposition the outer creation dialog, document, or sticky action. Do not compensate with brittle focus handlers, synthetic keyboard interception, or post-focus scroll resets.

Single-choice visual cards, including Genre Structure, retain native radio semantics and the same restrained selected border/surface plus visible keyboard focus. A wireframe preview is presentation-only, may be hidden from assistive technology when the adjacent title/subtitle names the choice completely, and must not replace the radio label or live derived summary.

## 6. Scroll ownership

Each creation stage has one intentional primary scroll owner.

For result and long-list stages:

- the outer modal remains stable;
- the document/body remains stable and locked where the shared shell requires it;
- the intended inner results or list pane owns scrolling;
- sticky navigation and primary action remain reachable;
- focus may scroll the inner pane only as needed;
- nested disclosures or previews must not create an unbounded competing scroll trap.

Verification must exercise a partially clipped card near the inner boundary, not only fully visible cards.

## 7. Batch-first configuration

When many selected entities share configurable behavior, prefer batch-first controls with sensible family defaults. A pattern such as **Automatic** / **Same for all** may be reused where its meaning is genuine. Individual rows may remain directly overridable without exposing a global **Custom per item** mode solely because internal overrides exist.

Do not impose Automatic/Same-for-all on a family that does not need it. Keep family-specific validation and configuration state outside generic selection or presentation components.

## 8. Sort and other family contracts

Shared sort presentation does not authorize shared sort values. Expose only values evidenced for the current source-family contract. A sort supported by Discover, Network, or another family must not be added merely to make controls match visually.

The following remain family-specific and must be documented by the owning family:

- exact source sets and source order;
- sort values and mappings;
- naming cleanup and generated labels;
- artwork provider, manifest, and fallback chain;
- Poster/Landscape and title-visibility defaults;
- duplicate strictness and logical-entity rules;
- Automatic/default-selection rules;
- Preview availability and behavior;
- counts and metadata shown.

Naming normalization is also family-specific:

- preserve meaningful semantic wording;
- do not apply cleanup rules from one family to another;
- do not remove words merely to shorten a name when those words clarify what the generated Folder represents.

Franchise issue #122 resolves that family decision by preserving the complete canonical TMDB Collection name unchanged after provider trimming. Suffixes such as `Collection`, `Saga`, and `Trilogy` remain, and a leading `The ` is not removed. Ignoring an article for display sorting is not part of the issue #122 flow.

Current contrasts prove why this boundary matters:

| Concern | Decades | People | Franchises | Studios | Networks | Genres | Streaming Services |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sort | Four evidenced Discover sorts, including Most Votes | Popular, Recent, and Top rated only; no evidenced native People Most Votes | Fixed TMDB-provided `original` order | Four evidenced Company sorts with media-correct Recent mapping | Four evidenced Network TV sorts | Four evidenced Genre Discover sorts, including Most Votes | Four evidenced simple-Streaming Discover sorts, including Most Votes |
| Folder-title default | Show everywhere | Hide on home screen only | Hide on home screen only | Show everywhere | Show everywhere | Hide on home screen only | Show everywhere |
| Artwork in creator | Shared Poster/Landscape presentation only; no artwork request in #113 | Shared Poster/Landscape choice over canonical per-person manifest/fallback defaults | Fixed Poster tile from each TMDB Collection poster, then safe emoji fallback | Fixed Landscape from Company runtime, checked-in `w500` logo, then safe emoji fallback | Shared Poster/Landscape choice; exact runtime orientation, checked-in `w500` logo, then safe emoji fallback | Shared Landscape-default/Poster choice over explicit static `wide`/`vertical` mappings, then same-orientation visible-title plus `🎬` fallback | New unknown artwork stays unassigned; reused artwork/focus fields stay exact; provider logos remain transient UI identity only |
| Preview | Ordering schematics and generated hierarchy detail | Optional bounded poster-only title preview, separated into applicable Movies and Series views | Optional bounded contained-title poster preview | Explicit lazy Movie/Series Discover preview; never automatic | Explicit lazy single-view Series Discover preview; never automatic | Explicit exact-source-draft lazy Movie/Series Discover Preview with canonical `include_adult=false`; never automatic and never approximates Advanced/exclusion state | Explicit exact Region/media simple-Streaming Preview; lazy selectors, canonical `include_adult=false`, never automatic |
| Identity | Exact canonical Discover recipe identity | TMDB person ID plus exact `PERSON`/`DIRECTOR` media identities | Exact TMDB Collection ID with `COLLECTION`/`MOVIE` | Logical Company ID; physical Company ID plus media | Logical Network ID; physical Network ID plus `TV` | Exact configured Movie/Series Discover source set per official Genre concept | Logical provider, plus Region for separate folders; physical provider + Region + media + Sort |

When a Preview is a true nested modal, reuse the structural `NestedPreviewDialog` seam for the body portal, nested backdrop, dialog semantics, focus containment, initial focus, Close, Escape, and outer-event isolation. Keep trigger restoration and family request/data state with the owning flow. Do not force People, Franchise, Studio, Network, or a future family into one provider/result model. Preview requests must remain explicit where the family contract requires it; unopened media or views do not authorize prefetching.

When both Movies and Series are applicable, Preview must separate them into media-specific views. Show only applicable views, load a view lazily if its family requires requests, report the count for that media only, and never present one combined cross-media total. Within each media view, combine all applicable source roles, deduplicate by physical title identity, and apply that family's semantic sort. Studio follows this rule through its separate Discover requests and cache. People follows it over already-loaded combined credits, so switching its Movies/Series view makes no new People request. Franchises remains Movies-only, Networks remains Series-only without a media control, and Decades exposes no title Preview. Genre Preview is source-draft-authoritative: it maps the exact compiled Genre/media/sort/Advanced/exclusion configuration through DISCOVER Core descriptors, adds exactly one canonical `include_adult=false`, keys cache entries by the complete canonical query, requests only the initial media until the user switches, and relies on a distinct fail-closed Worker Genre allowlist rather than generic Discover forwarding. Streaming hierarchy Preview is likewise exact-source-authoritative, with Region and media views shown only when multiple choices exist and each unvisited exact provider/Region/media/Sort query deferred until explicit selection.

Every current and future title Preview result grid is **poster-only**. A successful individual result contributes only its usable poster image: no title, year, date, media label, rating, vote count, description, source wording, or technical metadata is rendered on the poster item. Results without a valid poster are omitted before the accepted maximum of 10 at every viewport; do not create `No poster` cards or filler items. If no usable posters remain, the modal shows one calm **No posters available.** state instead of textual placeholder cards. Phones use five columns and up to two rows without horizontal poster-grid scrolling. The modal shell may retain the entity name, applicable Movies/Series controls, reliable media-specific counts, Close, loading, recoverable error/Retry, and accessibility semantics. Single-media families do not add a pointless media tab. Title Preview surfaces centre in the usable visual viewport when they fit and use one bounded Preview scroll owner when short height requires overflow.

## 9. Review information hierarchy

Where applicable, Review follows this composition:

1. summary, counts, and status;
2. generated names or captured destination;
3. **Title options**;
4. **Layout**;
5. generated Folder appearance/options;
6. bounded or collapsed generated-item details.

Keep ordinary controls for a simple family directly visible. Use disclosure for genuinely advanced or potentially large detail, not as a default container for the normal Review decision.

Candidate rows remain visually neutral. Communicate ready, already at destination, partial logical match, and elsewhere match through concise shared status text. Use a semantic notice when explanation, locations, or an override action is necessary.

Streaming issue #162 distinguishes full creation from mutation delta in Review. New Collection uses **What will be created**, reports the full hierarchy, and separately surfaces ordinary project-wide exact-source overlap. Where that overlap identifies safe relevant existing Collections, Streaming alone offers an explicit destination chooser: exact duplicate inspection supplies raw evidence, each candidate is qualified and fully planned through the same existing-Collection Streaming planner, candidates rank by exact overlap then project order, and no route is auto-selected. Unsafe ambiguous candidates are omitted while ordinary Sort conflicts remain visible and blocking. Equal visible Collection titles receive UI-only project-order `· Collection N` labels, reused consistently on cards, disclosures, selected Review, and zero-change notices; unique titles remain clean and internal IDs remain authoritative. Cards use plain already-here/will-be-added copy and may show reliable Folder/Source counts. Choosing an existing Collection changes the active Review to **What will change** and reports only existing folders updated, new folders, and sources to add. A complete route shows **Nothing to add**, states that no project changes are needed, and closes without mutation; **Create new collection instead** preserves the explicit duplicate-Collection confirmation. This is a focused Streaming behavior, not a generic destination-routing contract for the other hierarchy families. Placement rows keep status and count explanation separate. Streaming also permits initially collapsed, stable-logical-key naming for active new folders only; route switching preserves dormant drafts, reused existing folder titles and artwork/focus fields stay read-only and exact, and title validation reuses the ordinary Folder rule.

## 10. Title options and Layout

Title visibility and layout are separate presentation concerns. Reuse the shared **Title options** composition where applicable.

Title options may contain:

- Collection title visibility for New Collection;
- generated Folder title visibility.

The canonical visible label for the ordinary generated-folder control is **Folder title visibility**. The shared Title options composition owns this label, so hierarchy families reuse it without family-specific prefixes. Ordinary **Edit Folder** uses the same label. No helper text is required beneath it.

Generated Folder title visibility must reuse the canonical existing states:

- **Show everywhere**;
- **Hide on home screen only**;
- **Hide everywhere**.

Do not replace these semantics with a family-only boolean.

**Layout** follows Title options and may contain Tabs/Rows, Show All tab, and Pin to top. **Show All tab is a Tabs-specific visible control:** expose and normally toggle it while Tabs is selected; hide it while Rows is selected. Hierarchy plans always retain/generated `showAllTab: true` in Rows mode so changing that Collection back to Tabs later restores an enabled All tab by default. Switching Rows → Tabs inside creation therefore shows the enabled control. Do not display an irrelevant control merely because its serialized field exists. Show only controls relevant to the current scope. New Folder inherits the parent Collection's presentation as read-only evidence and must not mutate it.

## 11. Artwork boundary

Bulk hierarchy creators expose only batch-safe artwork and presentation choices. Family canonical artwork/defaults should populate the generated ordinary Folders automatically.

- Do not add per-item artwork URL editors, focus toggles, or reset controls to a bulk creator merely to expose every ordinary Folder field.
- Individual artwork customization belongs to ordinary **Edit Folder** unless a future family demonstrates a genuine batch-edit requirement.
- Reuse existing presentation controls such as Poster/Landscape where applicable. Family evidence may instead fix one shape; Franchises is Poster-only and Studios is Landscape-only, so those families expose no shape selector. Networks exposes the shared shape selector because its runtime contract supports exact Poster and Landscape resolution. Genre hierarchy exposes that selector for Genre-bearing structures because the published asset repository has explicit official-concept `wide` and `vertical` mappings; Landscape remains the default, missing assets never borrow the other orientation, and selected-folder Add Source remains Landscape. Genre Media folders are fixed visible-title `Movies`/`Series` containers with a safe emoji fallback, so they do not expose arbitrary artwork or title-visibility choices.
- Shared control semantics do not require shared artwork providers or defaults.

## 12. Identity and duplicates

Use stable family identity; never infer logical identity from display names.

Review and planning distinguish:

- ready;
- already at the destination;
- partial logical match at the destination;
- matching identity elsewhere.

Do not silently create a second logical entity where the family contract considers the destination already represented. Exact duplicate strictness and whether differently configured variants are ordinarily addable remain family-specific.

Genre issue #130 demonstrates structure-specific planning without persisted recipe nodes. It can produce Genre folders, Media folders, separate media-specific Genre folders, or—only for New Collection with both media effective—separate Movie and Series collections. The planner derives all displayed counts, rebuilds against the current destination, and applies the complete multi-collection plan atomically. New Folder omits exact physical source occurrences where the chosen structure can still be represented safely. Genre-folder planning treats a completely represented logical Genre as already present and a partial Genre as a safe omission. The three evidenced composite TV concepts—Action & Adventure, Sci-Fi & Fantasy, and War & Politics—may stay standalone, merge into their evidenced Movie target with a self-describing source title, or intentionally add the same ordinary Source node to both destinations. Composite controls are unavailable when the New Folder destination cannot safely represent their placement; arbitrary merges remain outside the contract.

## 13. Responsive, scale, and interaction verification

Every new hierarchy family must cover the standard widths:

- 360, 384, 393, 402, and 412;
- 899, 900, and 901;
- 1280.

Where bulk selection exists, cover representative small, approximately 20, approximately 50, and 100+ selections. Also verify:

- Back state preservation;
- keyboard and pointer selection;
- partially clipped card focus and selection;
- selected-list disclosure, removal, and reselection;
- sticky navigation and primary actions;
- exactly one intentional scroll owner;
- stable outer modal and document/body;
- visible focus and non-colour selection state;
- no horizontal overflow;
- atomic large-plan application;
- representative late-bundle rollback with no partial mutation or revision;
- stale plan rejection immediately before apply.

Follow [`docs/TESTING.md`](../TESTING.md): narrow pure unit tests use deterministic injected data when external integration is not under test, while mounted, integration, end-to-end, owner-review, and live-behaviour checks that exercise TMDB or another external service use the approved live production integration path. Canonical Network, Genre, and Streaming hierarchy mounted suites therefore use the production Worker, real TMDB, and real image resources; an unavailable or not-yet-deployed service contract is reported as an external failure rather than replaced with fabricated behavior.

If a hierarchy Preview needs a Worker source change, deterministic implementation and validator tests come first. Before live validation or further owner review, supply the complete reviewed working-tree Worker source, exact source-byte SHA-256, branch/HEAD context, and deterministic evidence, then stop. Codex never deploys the production Worker. Dave manually deploys and replies `Worker deployed`; only then may mounted/live scenarios exercise the production Worker, real TMDB, and real image CDN.

## 14. Owner-review and publication gate

For visible hierarchy implementation work:

1. keep implementation unstaged and uncommitted during owner UI review unless Dave explicitly authorizes otherwise;
2. rebuild the local and LAN preview used for review;
3. stop at the owner-review gate with exact files, checks, responsive/scale evidence, preview details, and git status;
4. stage, commit, push, and open a pull request only after explicit approval;
5. use the established normal merge-commit workflow for meaningful V2 pull requests unless Dave explicitly changes it.

Owner review does not broaden the issue. Follow-up fixes stay within the same focused issue and branch; each later creation family requires its own focused issue.
