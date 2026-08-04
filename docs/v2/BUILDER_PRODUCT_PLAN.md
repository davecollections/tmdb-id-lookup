# TMDB Collection Builder — Product Plan

Status: Durable product direction for the isolated v2 Builder

Last reviewed: 2026-08-02

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
- V2 is the mobile-first visual **TMDB Collection Builder**, made for Nuvio and powered primarily by TMDB.
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

- The product name remains **TMDB Collection Builder**.
- A supporting line such as **Made for Nuvio** may be used; final wording needs later review.
- The visual direction is modern, dark, sleek, and mobile-first, with restrained TMDB-inspired blue, cyan, and green accents. It is not warm or cosy.
- No account, personal TMDB API key, or personal information is required to complete the core build-and-export journey.
- Core importing and editing remain local-first in the browser.
- **Copy JSON** and **Download JSON** are complete supported paths, not fallback-only features.

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

The useful lesson is the separation of audiences before exposing complexity. Kaptain primarily starts with a large curated collection and lets users remove or customise it. TMDB Collection Builder is broader: a user may start with guided setup, a template, entity/search creation, manual creation, or preservation-first import.

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

Search/Add should cover, within the confirmed compatibility contract:

- Actor;
- Director;
- Company or Studio;
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

**Implemented first slice on issue #65's branch, with owner desktop/final physical-iPhone acceptance and successful current Nuvio Desktop import/runtime/round-trip evidence:** Add Source appears only for a selected existing folder and exposes one Movie franchise · TMDB mode. It uses explicit full-screen Search and Review stages on phones, an isolated opaque mobile surface/coverage guard, responsive uncropped posters or stable placeholders, bounded result context, pagination only when needed, contained movie titles on demand, TMDB-backed `include_adult=false` search plus exclusion only for result objects explicitly marked `adult: true`, one canonical native `COLLECTION` source, and an identity-bound selected-folder duplicate override. It does not infer collection age suitability from wording or contained-part flags, provide an age guarantee or age gate, or implement destination branching, bulk selection, automatic collection/folder creation, or any other listed source type.

**Implemented unified People slice on issue #74's branch, with final owner Nuvio Desktop visual/import/export acceptance:** the mode chooser offers selected-folder `Add person` alongside Movie franchise, while Folders exposes collection-level `Add people`. Folder quick add configures direct Acting Movies/Series and Directed Movies/Series choices. An empty Builder-generated Untitled default is atomically promoted into a canonical-name, final-artwork person folder; every other destination preserves its presentation and receives sources only. Collection add retains up to 20 exact-ID selections across search/page/Back, independently resolves one final artwork representation, and creates one canonical-name folder per person in one revision. Automatic defaults use department plus positive distinct counts once; manual choices persist. Generated source titles match stable v1 role/media wording so Nuvio tabs remain distinct. The regenerated fixture imported successfully: both curated Posters rendered, all four distinct tabs and their Acting/Directing catalogues worked, and the immediate export preserved the exact SHA-versioned artwork URLs, `hideTitle: true`, IDs, grouping, source order, and native `catalogSources: []`. The client version/build remains unknown. The slice does not create collections, edit sources, expose other crew roles or sort controls, or implement generic multi-add.

**Implemented first native source-editing slice plus owner-approved Round 2 refinements on issue #78's branch, with deterministic checks, bounded local desktop/mobile browser QA, and owner desktop/physical-iPhone acceptance passing; current-client acceptance remains pending:** supported Movie Collection and People source cards expose `Edit source` before Delete. One physical source is edited in place through a registry-backed adapter and one minimal controller update. Selecting another Movie Collection immediately applies its canonical TMDB name to the draft while retaining custom/reset/Cancel behavior; provider/type/media/sort/filters stay fixed. People keeps the person ID fixed, allows the same four Acting/Directing and Movie/Series identities, auto-manages only approved default titles until manual customization, reuses one shared bounded non-blocking combined-credit count result, and exposes only stable-v1 Popular/Recent/Top-rated sort values while preserving untouched imports. Desktop/tablet editors now use natural content height capped by the viewport while the reviewed mobile shell remains full-height with one scroll owner and sticky actions. Add Source Collection Review and People Configure expose only validated canonical TMDB collection/person ID links, with external/new-tab semantics and mobile-safe wrapping; unsupported IDs remain plain or absent. Prominent focused duplicate/stale/validation alerts, difference-only title/sort patches, same-folder duplicate rejection, stale-session refusal, exact source focus recovery, and imported raw/unknown/order preservation are required. Unsupported native, Discover, addon, and opaque sources remain Delete-only. Logical bundle editing, person replacement, Collection sort/filter controls, and additional adapters remain separate work.

**Retained future considerations:** `Add generic multi-item folder creation to the V2 Builder` should place the current People batch behind a generic launcher and later admit Movie franchises and compatible entity types. Quick Add/multi-add may keep Search open for several independent results with clear Added/duplicate states; atomic behavior applies only where a future operation commits several sources together. Bulk collection lookup may use bounded one-name-per-line input, controlled concurrency, ambiguous/unmatched handling, duplicate review, and multi-source insertion. Optional spelling or singular/plural suggestions must be transparent and must not blindly append or remove `s`.

Future collection sort controls must remain evidence-based. For current Nuvio Desktop `COLLECTION` resolution, `original` means TMDB-provided/API order rather than chronological or website order; `primary_release_date.desc` is owner-observed newest-first; `primary_release_date.asc` is currently unsupported and falls back to TMDB order. Oldest-first must not be exposed until supported and verified.

## 9. Search-result information

**Confirmed direction**

Results must contain enough context to distinguish similar entities without reproducing every column from the V1 lookup tables.

For companies and networks, useful fields may include:

- name;
- TMDB ID where it assists identification;
- entity type;
- title count;
- logo or approved artwork preview when available.

Title counts should reuse the existing V1 cache and maintenance tooling where appropriate instead of creating unnecessary live requests. People is the focused exception: only after a person is selected for configuration, its details request appends combined credits and derives distinct cast/director Movie/Series counts locally; it creates no sidecar, background scan, per-result credit request, or request solely to recreate `known_for` display rows. People result state retains TMDB's valid `known_for` order; desktop may render the first three while mobile renders only the first with natural wrapping and no empty placeholder. Result detail must remain proportionate to the choice being made.

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

- one in-card overflow trigger on every hierarchy card, with a body-portalled menu that uses full rendered height, the current Visual Viewport, upward flipping, edge clamping, and prevent-scroll initial focus; collections/folders expose Edit/Delete, sources expose Delete only, and actions directly target unselected cards;
- one mobile-only selected-context quick-rename pencil for collections and folders;
- one responsive modal for collection title, intentional invisible Nuvio title, source-level Tabs/Rows, the saved Include an All tab when using Tabs preference, and Pin to top; the source group is headed **How sources appear in this collection**, and `TABBED_GRID` is labelled **Tabs (recommended)**;
- the same modal with Folder **Basic details** and **Display** groups, compact native radios for the three title-visibility outcomes, and Poster/Landscape visual selection cards.

Manual blank collections default to Tabs with All enabled, Pin off, and `focusGlowEnabled: true`. Focus glow is no longer exposed as a settings control: imported explicit booleans remain unchanged, absence stays absent, unusual values stay raw-preserved, and unrelated settings edits omit the field. Manual blank folders default to Poster with `hideTitle: true`, so the title beneath the card is hidden by default while the actual folder name remains visible. Imported Follow Layout and Square values are preserved while untouched but are not offered as normal new choices.

U+200E LEFT-TO-RIGHT MARK is the confirmed intentional invisible Nuvio title character. The collection setting and folder Hide everywhere choice deliberately emit one U+200E, and blank titles never become invisible automatically. The folder group presents three complete outcomes: Show everywhere uses a visible title with `hideTitle: false`; Hide on home screen only uses a visible title with `hideTitle: true`; Hide everywhere uses one U+200E with `hideTitle: true`. Imported repeated U+200E titles remain byte-for-byte preservation cases until the user deliberately replaces their intent. The Builder uses a display-only fallback rather than rendering blank cards or headings.

Issue #59 adds a restrained ordering foundation directly to existing hierarchy cards: each collection, folder, and source has one compact six-dot handle contained inside its visual card for pointer/touch dragging and keyboard-accessible one-position movement. Issue #63 keeps that grip and folds entity actions into the same visual card through an overflow trigger; drag clones expose no active menu controls. During pointer movement, the complete associated row follows the pointer above panel clipping, a matching placeholder shows its proposed position, and surrounding siblings visually make space without changing project data; insertion lines remain secondary feedback and reduced-motion mode removes nonessential sliding. Pinned collections remain a stable displayed group before ordinary collections, movement stays inside the current pin group, and moving never changes `pinToTop`. Folders remain within their collection and sources remain within their folder and category-bearing source objects; stable internal IDs retain selection and card identity. A completed pointer drop or successful keyboard arrow movement performs one authoritative move, while hover, cancellation, invalid boundaries, and same-position drops remain data no-ops. Bulk movement and new ordering metadata remain absent. The redundant Selection details panel is removed so the source hierarchy uses the available workspace width; detailed review remains part of the later Create JSON journey.

**Confirmed direction**

The TV / phone / both Quick Setup answer may select safer initial presentation defaults. Defaults must stay editable and be based on current client evidence rather than assumptions. Exact per-device defaults remain open.

Future Search/Add, template, and recipe defaults must begin from this planning matrix unless a later focused issue deliberately changes it:

| Source or creation type | Default tile shape |
| --- | --- |
| Manually created blank folder | Poster |
| Company | Landscape |
| Network | Poster |
| Actor / person / director | Poster |
| TMDB movie collection / franchise | Poster |
| Genre | Landscape |
| Decade / general Discover | Poster unless a later recipe deliberately specifies otherwise |

The manual blank-folder default is implemented. Issue #65 implements the TMDB movie-collection source recipe inside an already selected folder without automatic hierarchy or artwork. Issue #74 implements the Actor/person/director Poster default for a new People folder plus exact People runtime/TMDB/emoji fallback; adding to an existing folder preserves its presentation. The remaining rows do not authorise source creation or entity-aware generation.

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

See [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md) for the current evidence boundary.

## 13. Artwork behaviour

**Confirmed direction**

Artwork should normally feel automatic rather than technical:

1. use approved published curated artwork when available;
2. otherwise use a suitable cached TMDB image or logo where the applicable consumer supports it;
3. otherwise retain a visible title and emoji fallback.

Imported or custom nonblank artwork must be preserved unless the user changes it. Runtime-owned automatic artwork may refresh under a later approved policy. Builder-only ownership metadata must never leak into Nuvio JSON. Missing artwork must not prevent collection creation.

The separate `nuvio-assets` project owns artwork production, replacement, review, publication, runtime schema, and asset-contract decisions. TMDB ID Lookup consumes its published runtime. Questions owned by that project must be taken there instead of guessed in V2.

This plan does not add or alter artwork behaviour.

Owner-supplied current Nuvio evidence confirms collection-level `focusGlowEnabled`. The Builder continues to recognise, import, preserve, serialize, and default that field, while issue #69 removes its visible control. Backdrop, cover, focus GIF, logo, hero, and related artwork controls remain deferred. Future focus-GIF support defaults off unless deliberately enabled.

## 14. Import and editing

**Confirmed and partly implemented**

- Existing JSON import is a first-class startup route.
- The preservation-first importer and serializer are core product advantages.
- Unknown and community fields survive unrelated edits.
- Opaque sources remain preservable, movable, and removable without being guessed into known source types.
- Supported native Movie Collection and People sources can be edited as one exact physical source with touched-only titles, bounded identity choices, duplicate rejection, stale-session protection, and minimal patches; unsupported sources remain preservation-only.
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

The third concept is documented in the [Nuvio Integration Development Guide](https://nuvio.tv/docs?doc=plugins-repo), reviewed 2026-07-25. Plugin repositories are not part of the TMDB Collection Builder’s core scope. Their manifests must not be treated as collection sources or Stremio addon manifests.

## 17. Branding

**Deferred product direction**

- A Dave Collections master brand is preferred to a product logo that could imply official TMDB endorsement.
- Product colourways may distinguish Nuvio and possible future tools.
- The product title should remain ordinary UI text rather than being permanently embedded in a logo.
- Final logo design is deferred and must not delay functional Builder work.

Trakt integration remains outside current project scope; a possible future colourway is not approval to begin Trakt work.

## 18. Roadmap and mandatory gates

**Confirmed current dependency-aware direction**

1. Product-plan and workflow recovery — complete.
2. Collection/folder presentation settings — implemented on issue #53's branch pending review.
3. First mandatory Dave UI and flow review — complete.
4. Resolve the review findings, including direct per-card hierarchy actions — implemented on the issue branch; owner local UI/browser review complete.
5. Bulk presentation settings remain desired but deferred to a separate focused issue.
6. Collection/folder/source reordering — integrated through issue #59 / PR #60; owner local review and the bounded Desktop/web/mobile/TV ordering evidence gate are complete. The evidence is under [`manual-tests/nuvio-clients/issue-59-builder-reordering/`](../../manual-tests/nuvio-clients/issue-59-builder-reordering/), with Windows line-ending verification integrated through issue #61 / PR #62.
7. Persistent collection/folder creation actions and safe collection/folder/source deletion — integrated through issue #63 / PR #64. Collection/folder/source actions live in one in-card overflow pattern whose body-portalled menu measures its full height against the current Visual Viewport, flips upward or clamps within a 10px margin, and focuses without automatic page scroll. Mobile selected collection/folder contexts provide preservation-safe quick rename, empty collection/folder deletion is immediate, and every source deletion plus populated/import-bearing collection/folder deletion is confirmed. Selection, mobile level, focus, raw preservation, addon projection removal, and deterministic cycles remain explicit contracts.
8. First source creation and Search/Add slice — TMDB movie franchises are implemented on issue #65's dedicated branch; owner UI acceptance and the required current Nuvio Desktop import/runtime/round-trip gate are complete. A second client is desirable but non-blocking unless conflicting behavior appears. Future source types, automatic hierarchy, source editing, multi-add, bulk lookup, suggestions, and sort controls remain separate focused work.
9. Collection and Folder settings polish — issue #69 updates wording and compact grouping while preserving the issue #53 schema and export contract; independent and owner UI/flow review remain the next gates.
10. Unified People Search/Add — issue #74 implements selected-folder quick add with untouched-default promotion, preservation-only existing folders, collection selection of up to 20 people, direct source combinations and one-time defaults, atomic single-folder/multi-folder batches, independently keyed final artwork, and stable v1 source tab titles. The first Desktop source-contract run passed, and the regenerated distinct-title/curated-artwork fixture subsequently passed owner visual/import/immediate-export validation; the client version/build remains unknown.
11. First native source editing — issue #78 implements preservation-safe physical Movie Collection and People editors through a reusable adapter seam. Deterministic checks, the sanitized fixture package, and owner desktop/physical-iPhone review are complete; current-client import/edit/export evidence remains the mandatory gate before integration.
12. Advanced Discover creation.
13. Further deliberate V2 artwork-runtime integration at appropriate typed-source stages.
14. Quick Setup, templates, and recipe engine after underlying creation flows are reliable.
15. Review/export usability.
16. Optional Nuvio connection only after its product, authentication, security, and replacement contract is verified.

This is a dependency map, not a rigid release schedule. Each step requires its own approved issue and may be refined by stronger evidence.

## 19. Open decisions

| Decision | Why it remains open |
| --- | --- |
| Final public name for the one-click feature | Dave’s 1-Click Setup is the working name; final product copy needs review. |
| Final template names | Essential, Complete, Full, and Dave’s Setup are recovered concepts, not approved public labels. |
| Exact Essential / Complete / Full contents | Requires a dedicated recipe-design issue and size/performance judgement. |
| Category toggles before generation | The right balance between speed and control has not been designed. |
| Default collection ordering | Recovered examples differ and should be tested with real setups. |
| Region/provider questions | Regional relevance and provider-filter semantics need product and compatibility decisions. |
| Exact TV / phone / both defaults | Must follow current client evidence and owner UI review. |
| Startup-screen visual layout | The four routes are decided; their presentation is not. |
| Future Search/Add destination and action wording | Issue #65 fixes selected-folder Movie franchise labels; issue #74 fixes selected-folder People quick add and collection-level `Add people`. New-collection and later-mode branching still need UX work. |
| Direct Nuvio connection flow | Transport exists, but full replacement, authentication, safe updates, and recovery need design and verification. |
| Saved Builder project format | Not needed for the current local JSON flow; revisit only when persistence needs justify it. |
| Removal of `noindex` | Requires explicit release-readiness approval. |
| Final Dave Collections branding | Preferred direction is recorded; design remains deferred. |

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
