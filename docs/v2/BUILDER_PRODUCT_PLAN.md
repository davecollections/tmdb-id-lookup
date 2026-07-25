# TMDB Collection Builder — Product Plan

Status: Durable product direction for the isolated v2 Builder

Last reviewed: 2026-07-25

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

## 9. Search-result information

**Confirmed direction**

Results must contain enough context to distinguish similar entities without reproducing every column from the V1 lookup tables.

For companies and networks, useful fields may include:

- name;
- TMDB ID where it assists identification;
- entity type;
- title count;
- logo or approved artwork preview when available.

Title counts should reuse the existing V1 cache and maintenance tooling where appropriate instead of creating unnecessary live requests. Result detail must remain proportionate to the choice being made.

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

- **Rows** presents folder/source groups as streaming-style rows.
- **Tabs** with Show All disabled presents individual tabs and defaults to the first tab.
- **Tabs** with Show All enabled adds **All** as the first/default tab.
- These are collection-level settings.

**Confirmed and implemented foundation**

The current owner-reviewed workflow exposes:

- one compact, always-visible Edit action on every collection and folder card, replacing the former Rename/Settings pair and directly targeting unselected cards;
- one responsive modal for collection title, intentional invisible Nuvio title, Tabs/Rows, conditional Include an All tab, Pin to top, and Enable focus glow;
- the same modal for folder title, Poster/Landscape, and positive Show folder title wording.

Manual blank collections default to Tabs with All enabled, Pin off, and focus glow on. Manual blank folders default to Poster with `hideTitle: true`, so the title beneath the card is hidden by default while the actual folder name remains visible. Imported Follow Layout and Square values are preserved while untouched but are not offered as normal new choices. Imported focus-glow booleans display accurately; absent and unusual values remain preserved until deliberate canonical replacement.

U+200E LEFT-TO-RIGHT MARK is the confirmed intentional invisible Nuvio title character. The collection setting deliberately emits one U+200E because Nuvio lacks a native collection-title visibility setting, and blank titles never become invisible automatically. The Builder does not expose invisible-folder-name creation: imported repeated U+200E folder names are preservation-only until explicitly replaced with visible text. Invisible folder names remain distinct from native `hideTitle`. The Builder uses a display-only fallback rather than rendering blank cards or headings.

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

Only the manual blank-folder row is implemented. The remaining rows do not authorise source creation, entity-aware generation, templates, recipes, or automatic artwork.

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

Owner-supplied current Nuvio evidence confirms collection-level `focusGlowEnabled`, now included in issue #53. Backdrop, cover, focus GIF, logo, hero, and related artwork controls remain deferred. Future focus-GIF support defaults off unless deliberately enabled.

## 14. Import and editing

**Confirmed and partly implemented**

- Existing JSON import is a first-class startup route.
- The preservation-first importer and serializer are core product advantages.
- Unknown and community fields survive unrelated edits.
- Opaque sources remain preservable, movable, and removable without being guessed into known source types.
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
4. Resolve the review findings, including direct per-card hierarchy actions — implemented on the issue branch, pending owner review.
5. Bulk presentation settings remain desired but deferred to a separate focused issue.
6. Collection/folder/source reordering in a separate focused issue.
7. Source creation and Search/Add.
8. Advanced Discover creation.
9. Deliberate V2 artwork-runtime integration at the appropriate typed-source stage.
10. Quick Setup, templates, and recipe engine after underlying creation flows are reliable.
11. Review/export usability.
12. Optional Nuvio connection only after its product, authentication, security, and replacement contract is verified.

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
| Exact Search/Add action wording | Destination concepts are known, but button labels and branching need UX work. |
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
