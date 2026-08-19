# Builder hierarchy creation standards

Status: Durable cross-family architecture, product, UX, accessibility, scale, presentation, and verification standard

Established by: Decades issues [#112](https://github.com/davecollections/tmdb-id-lookup/issues/112) and [#113](https://github.com/davecollections/tmdb-id-lookup/issues/113), then reconciled with People issue [#118](https://github.com/davecollections/tmdb-id-lookup/issues/118) / PR [#119](https://github.com/davecollections/tmdb-id-lookup/pull/119) through issue [#120](https://github.com/davecollections/tmdb-id-lookup/issues/120), with Franchises applied in issue [#122](https://github.com/davecollections/tmdb-id-lookup/issues/122)

Last reviewed: 2026-08-19

This document owns the rules shared by guided **New Collection** and **New Folder** hierarchy families. Family documents such as [`BUILDER_DECADES.md`](./BUILDER_DECADES.md), [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md), and [`BUILDER_FRANCHISES.md`](./BUILDER_FRANCHISES.md) continue to own family-specific source contracts, defaults, naming, artwork authority, duplicate strictness, and optional features. Repository implementation, deterministic tests, and confirmed owner evidence override obsolete plans.

## 1. Entry points and persisted architecture

- **New Collection** and **New Folder** are the contextual hierarchy-creation launchers.
- **Add Source** remains the physical-source operation for the selected existing Folder. A family may support both entry types, but the flows must not be conflated.
- New hierarchy families register through the existing ordered, scope-aware creation-family registry. Do not create a panel-specific or family-specific launcher in parallel.
- The registry owns only family ID, label, description, supported scope, and ordering. Family components, planners, validators, constructors, duplicate rules, and mutations remain outside it.
- A hierarchy creator generates ordinary editable `Collection → Folder → Source` nodes. It must not persist a recipe, hierarchy, wizard, or family-only node merely to support creation.
- Each family prepares a framework-independent, ephemeral, validated hierarchy plan containing the concrete ordinary-node bundles and review evidence.
- Immediately before application, rebuild or revalidate the plan against current project and destination state. Materially stale placement, identity, presentation inheritance, or configuration evidence must return to Review without mutation.
- Apply the complete reviewed plan atomically through the existing controller batch operations. A late factory, validation, identity, or ID failure creates nothing and advances no content revision.

## 2. Reuse-first rule

Before adding a family-specific search or catalogue surface, selectable card, ordered-selection store, presentation or title control, layout control, review block, preview surface, source constructor, identity or duplicate helper, responsive shell, focus/scroll behavior, controller operation, fixture, or test harness, inspect the current Builder for substantially similar behavior.

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

| Concern | Decades | People | Franchises |
| --- | --- | --- | --- |
| Sort | Four evidenced Discover sorts, including Most Votes | Popular, Recent, and Top rated only; no evidenced native People Most Votes | Fixed TMDB-provided `original` order |
| Folder-title default | Show everywhere | Hide on home screen only | Hide on home screen only |
| Artwork in creator | Shared Poster/Landscape presentation only; no artwork request in #113 | Shared Poster/Landscape choice over canonical per-person manifest/fallback defaults | Fixed Poster tile from each TMDB Collection poster, then safe emoji fallback |
| Preview | Ordering schematics and generated hierarchy detail | Optional bounded poster-only title preview | Optional bounded contained-title poster preview |
| Identity | Exact canonical Discover recipe identity | TMDB person ID plus exact `PERSON`/`DIRECTOR` media identities | Exact TMDB Collection ID with `COLLECTION`/`MOVIE` |

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
- Reuse existing presentation controls such as Poster/Landscape where applicable. Family evidence may instead fix one shape; Franchises is Poster-only and therefore exposes no shape selector.
- Shared control semantics do not require shared artwork providers or defaults.

## 12. Identity and duplicates

Use stable family identity; never infer logical identity from display names.

Review and planning distinguish:

- ready;
- already at the destination;
- partial logical match at the destination;
- matching identity elsewhere.

Do not silently create a second logical entity where the family contract considers the destination already represented. Exact duplicate strictness and whether differently configured variants are ordinarily addable remain family-specific.

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

Tests should use deterministic fixtures and must not require live TMDB requests unless a focused issue explicitly owns bounded live evidence.

## 14. Owner-review and publication gate

For visible hierarchy implementation work:

1. keep implementation unstaged and uncommitted during owner UI review unless Dave explicitly authorizes otherwise;
2. rebuild the local and LAN preview used for review;
3. stop at the owner-review gate with exact files, checks, responsive/scale evidence, preview details, and git status;
4. stage, commit, push, and open a pull request only after explicit approval;
5. use the established normal merge-commit workflow for meaningful V2 pull requests unless Dave explicitly changes it.

Owner review does not broaden the issue. Follow-up fixes stay within the same focused issue and branch; each later creation family requires its own focused issue.
