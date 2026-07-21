# TMDB ID Lookup v2 — Builder Knowledge Base

Status: Planning and contract groundwork

Last reviewed: 2026-07-21

This is a living record of confirmed v2/Nuvio findings, current decisions, unsupported behaviour, and open questions. GitHub issues remain the source of truth for implementation scope.

## 1. Product direction

- v1 is working and stable.
- v2 changes the product from primarily an ID lookup/export utility into the visual **TMDB Collection Builder**, built for Nuvio collections and powered primarily by TMDB.
- Lookup and copy-ID tools remain available.
- v2 should be mobile-first, modern, and sleek.
- No login is required.
- Playback is outside project scope and should normally remain unmentioned.

## 2. Evidence levels

Future findings must use one of these labels:

- **Manually confirmed in Nuvio:** observed in an actual Nuvio client using a recorded input.
- **Confirmed from current Nuvio source code:** directly supported by the reviewed, pinned Nuvio source revision.
- **Confirmed by repository tests:** behaviour or an invariant demonstrated by deterministic repository tests and successful CI.
- **Confirmed by live deployment:** behaviour directly verified on the deployed production site through recorded HTTP or browser checks.
- **Strongly inferred:** consistent with available code or behaviour but not directly verified end to end.
- **Experimental:** a candidate shape or behaviour that still requires controlled testing.
- **Currently unsupported:** absent from, rejected by, or not reliably implemented in the published model currently under review. This does not mean impossible forever.

## 3. Confirmed Nuvio source types

**Confirmed from current Nuvio source code:** the published native TMDB source model exposes:

- `LIST`
- `COLLECTION`
- `COMPANY`
- `NETWORK`
- `DISCOVER`
- `PERSON`
- `DIRECTOR`

**Currently unsupported:** the current published source models do not expose native direct-movie, direct-series, season, or custom-item source types. Describe these as “currently unsupported by the published source model,” not “impossible forever.”

## 4. Native TMDB Discover

**Manually confirmed in Nuvio — Shark Movies experiment:** a folder using the following source loaded dynamic shark-movie results without the Nuvio Catalog Addon:

- provider: `tmdb`
- `tmdbSourceType`: `DISCOVER`
- `mediaType`: `MOVIE`
- `sortBy`: `popularity.desc`
- `filters.withKeywords`: `15097`
- TMDB keyword `15097`: `shark`

**Confirmed from current Nuvio source code:** the current Discover filter model includes:

- `withGenres`
- `releaseDateGte`
- `releaseDateLte`
- `voteAverageGte`
- `voteAverageLte`
- `voteCountGte`
- `withOriginalLanguage`
- `withOriginCountry`
- `withKeywords`
- `withCompanies`
- `withNetworks`
- `year`
- `watchRegion`
- `withWatchProviders`

**Strongly inferred:** movie and TV parameter handling differs internally. Each filter combination that the builder exposes must be tested for the relevant media type and client.

## 5. Nuvio Catalog Addon

**Confirmed from the published manifest (reviewed 2026-07-10):**

- Name: `Nuvio Catalog Addon`
- Addon ID: `com.nuvio.tmdb.catalogs`
- Manifest: <https://catalog.nuvio.tv/manifest.json>
- Types: `movie`, `series`
- Resources: `catalog`, `meta`
- Meta prefixes: `tt`, `tmdb:movie:`, `tmdb:series:`

The 16 confirmed catalog IDs are:

| Movies | Series |
| --- | --- |
| `trending-movies` | `trending-series` |
| `popular-movies` | `popular-series` |
| `critically-acclaimed-movies` | `critically-acclaimed-series` |
| `new-and-upcoming-movies` | `new-and-returning-series` |
| `international-cinema` | `international-series` |
| `independent-and-festival-picks` | `limited-series` |
| `documentaries` | `documentary-series` |
| `family-movies` | `family-series` |

**Manually confirmed in Nuvio:**

- A generated Trending Movies source worked.
- Addon genre filtering worked.
- `popular-movies` with `genre: "Horror"` loaded horror results.
- Disabling the addon caused addon-backed folders to return no results.
- Native TMDB Discover remained conceptually separate.

The addon is a convenient optional source, not the basis of all TMDB builder functionality.

## 6. Important failed or inconclusive tests

- **Currently unsupported:** `tmdb:series:456` and `tmdb:series:615` failed when incorrectly placed in addon `catalogId`. These are meta identifiers, not catalog IDs. The result does not prove that direct media can never be represented through another future model.
- **Experimental and inconclusive:** guessed addon search persistence using `filters.search` was accepted structurally but did not produce convincing filtered results. Do not treat persisted addon search as supported.

## 7. Source-array behaviour

**Confirmed from current Nuvio source code:**

- `sources` is authoritative.
- `catalogSources` is an addon compatibility projection/fallback.
- Runtime does not execute both arrays independently.
- Native-only canonical folders use populated `sources` and empty `catalogSources`.
- Addon-backed sources may have matching projections in both arrays when compatibility output requires them.
- In a mixed folder, compatibility output mirrors only addon-backed entries into `catalogSources`.
- All active source data must remain represented in `sources`; never emit an empty `sources` array while placing active addon data only in `catalogSources`.
- Do not change existing v1 exports merely to enforce this future policy.
- Multiple sources resolve independently.
- The optional All presentation interleaves and deduplicates results rather than combining them into one TMDB query.

Source and folder order is meaningful and must be preserved.

## 8. Preservation contract

- **Confirmed from current Nuvio source code:** Mobile Nuvio preserves unknown fields more strongly than TV.
- The future builder must retain raw imported objects and overlay only edited known paths.
- Unknown collection, folder, source, filter, and community fields must survive unrelated edits.
- Imported opaque sources must remain preservable, movable, and removable without being guessed into a known provider type.
- Each source needs an internal stable identity independent of mutable filter values.

## 9. Contract fixture baseline

**Confirmed from current Nuvio source code and existing v1 exporters — issue [#31](https://github.com/davecollections/tmdb-id-lookup/issues/31), 2026-07-10:** the repository now has deterministic Nuvio contract fixtures and Node built-in tests that establish a pre-builder baseline.

The positive fixture set proves that:

- all seven currently confirmed native TMDB source types have representative source envelopes;
- the manually confirmed Shark Movies Discover source retains `DISCOVER`, movie media, `popularity.desc`, and keyword `15097`;
- addon-backed active data remains in `sources`, with an optional matching compatibility projection in `catalogSources`;
- a mixed folder projects only its addon-backed source into `catalogSources`;
- source and folder array order is retained by the validation path;
- import-preservation mode accepts an opaque community source and leaves unknown collection, folder, and source sentinel fields untouched.

The negative fixture set detects:

- addon data placed only in `catalogSources`;
- a native TMDB source incorrectly copied into `catalogSources`;
- a guessed direct-movie TMDB source type used as canonical builder output.

The fixture suite deliberately does **not** prove a complete or final Nuvio schema, client rendering parity, live TMDB/addon responses, every Discover filter combination, or production parsing/serialization behaviour. The opaque community fixture is a synthetic preservation probe based on confirmed raw-object overlay behaviour; its sentinel fields do not claim to define a real community provider schema.

### Manual Desktop and Mobile verification — 2026-07-10

**Runtime source behaviour — manually confirmed in Nuvio Desktop for Windows and Nuvio Mobile on iOS:** importing `mixed-native-and-addon.json` loaded the native TMDB Discover source first and the addon-backed Trending Series source second. The addon-backed source was not duplicated despite its matching `catalogSources` compatibility projection. Disabling the Nuvio Catalog Addon removed only the addon-backed results while native Discover remained available; re-enabling the addon restored the addon-backed results. Export retained native-first, addon-second source order.

**Import/export preservation behaviour — manually confirmed in Nuvio Desktop for Windows and Nuvio Mobile on iOS:** `opaque-community-import.json` imported successfully, and its deliberately fake addon produced the expected addon-not-found runtime message. Export preserved `communityMetadata`, `communityLayout`, `communityOptions`, `unknownBoolean`, `provider`, `addonId`, `type`, and `catalogId`. This proves that the unknown sentinel fields survived import/export round trips on both tested clients. It does not prove byte-for-byte preservation and does not make the fake community provider a supported schema.

**Client normalisation behaviour — manually confirmed in both tested clients:** export added a matching `catalogSources` projection, expanded the compact imported source into a fuller explicit-null envelope, and added default collection and folder presentation fields. Compact valid input can therefore be accepted and normalised by these clients, but client-normalised imported data is not automatically the canonical shape the future builder should emit.

`scripts\check.cmd` remains the Windows entry point. It and the dedicated GitHub Actions workflow both execute `node scripts/check-all.mjs`, which runs the frontend checks and the Nuvio contract, builder domain, importer, serializer, migration, and application-controller tests without secrets or network requests.

## 10. Current architecture decision

- Preserve v1 at the repository root.
- Keep builder source and dependencies isolated under `builder/`; no root npm package is needed.
- Use `builder/dist/` only as generated local/CI output and `.pages-site/` only as generated combined deployment staging. Neither directory is committed.
- Use Vite's relative `./` base so generated JavaScript, CSS, and imported local assets resolve from `/tmdb-id-lookup/builder/` without hard-coding the repository name or incorrectly targeting `/assets/` at the domain root.
- The Pages staging process selects only the explicit v1 public contract—`index.html`, `robots.txt`, `sitemap.xml`, and the `css/`, `js/`, and `data/` trees—then places the contents of `builder/dist/` at the dedicated public `builder/` path. This produces `.pages-site/index.html` and `.pages-site/builder/index.html` without a public `builder/dist/` level.
- Preparation and validation import the same slash-normalized public-path contract. Unknown, absolute, traversal, repository-only, manual-evidence, source, documentation, and test paths fail closed instead of being deployed by default.
- Branch and pull-request CI builds the builder, runs existing frontend and Nuvio contract checks, and validates the combined artifact without calling `actions/deploy-pages` or using the `github-pages` environment.
- The existing Pages workflow remains the only publisher and retains its `main` push, manual dispatch, successful maintenance `workflow_run` triggers, permissions, concurrency, asset-version injection, and deployment steps.
- During development, the builder is intentionally not linked from v1 and its entry page requests `noindex, nofollow` from search engines.
- The robots directive controls discoverability, not security: the deployed builder URL remains publicly reachable, and no client-side login or fake password gate is being added.
- Genuine restricted testing would require a separately protected staging environment, which is outside issue [#33](https://github.com/davecollections/tmdb-id-lookup/issues/33). A future release-readiness issue can remove the noindex directive when the builder is ready to be advertised.
- Framework-independent Nuvio source, parsing, validation, migration, serialization, and ID modules should stay outside React components.
- **Confirmed by live deployment — issue [#33](https://github.com/davecollections/tmdb-id-lookup/issues/33), 2026-07-10:** recorded GitHub Pages HTTP and browser checks confirmed that stable v1 remained at the project root and the isolated React/Vite builder loaded successfully under `/builder/`. Generated JavaScript, CSS, and imported local assets loaded correctly, the backlink to v1 worked, and mobile-width checks passed. The builder remained unlinked from v1 and retained `noindex, nofollow`. Isolated React/Vite under `/builder/` is therefore the confirmed builder direction.
- **Currently unsupported:** history-based direct builder subroutes remain unproven and unsupported. Issue #33 did not test or adopt React Router or history fallback behaviour.

### Framework-independent builder domain — issue #34

**Confirmed by repository tests — issue [#34](https://github.com/davecollections/tmdb-id-lookup/issues/34), 2026-07-10:** builder editor state now uses a plain-data project → collection → folder → source hierarchy under `builder/src/domain/`.

- Every node has a stable builder-only `internalId` supplied by an injectable ID factory; the default uses `crypto.randomUUID()` with no weak fallback.
- Current known values live under `editable`, while optional deep-cloned imported JSON lives under `rawImported`. Editing and reordering do not mutate the raw snapshot.
- Sources require an explicit `native-tmdb`, `addon`, or `opaque` category. Fields such as `addonId`, `type`, `catalogId`, and `filters` are not used to guess a category.
- A folder has one authoritative editable `sources` array. Imported `catalogSources` may remain inside the raw folder snapshot, but the domain does not expose a second editable list or create a compatibility projection.
- Pure immutable helpers cover creation, editable updates, ordered insertion, sibling movement, removal, traversal, lookup, and project-wide duplicate-ID detection.
- The domain permits incomplete editor drafts and remains separate from import parsing, export validation, raw overlay, and serialization.
- Node tests prove deterministic identity, identity stability, ordering, immutability, opaque sentinel preservation, the `catalogSources` boundary, explicit categories, duplicate detection, `structuredClone`, and JSON encoding compatibility.

### Preservation-first Nuvio importer — issue #35

**Confirmed by repository tests — issue [#35](https://github.com/davecollections/tmdb-id-lookup/issues/35), 2026-07-11:** a framework-independent importer under `builder/src/import/` now converts JSON text or already-parsed collection arrays into the builder domain.

- Structural validation is atomic. Invalid roots and non-object collection, folder, or active source entries return stable diagnostics and no partial project.
- Collection, folder, and authoritative `sources` order is retained exactly. One injectable ID factory supplies every builder-only internal ID, and project-wide collisions reject the import.
- Recognised fields alone enter `editable`; complete detached collection, folder, and source objects remain in `rawImported`, including unknown/community fields and unknown Discover filter keys.
- Provider-led classification is conservative. Only explicit `tmdb` with one of the seven confirmed types becomes `native-tmdb`, and only explicit `addon` becomes `addon`.
- Unknown, missing, and `community` providers remain `opaque`. Addon-looking fields alone do not prove addon category.
- Explicit TMDB sources with missing or unsupported types remain importable as opaque sources with warnings rather than being rejected or guessed into support.
- `catalogSources`-only compatibility data is detected and preserved but is not promoted, merged, or migrated into authoritative active `sources`.
- Already-parsed sparse arrays are rejected recursively as invalid JSON values, producing a structured atomic importer failure rather than normalisation or partial hydration.
- Ultra MAX compatibility still requires a real exported sample in a later controlled compatibility issue. This importer does not establish a canonical export shape.
- Thirty-two importer tests cover JSON parsing, public diagnostic contracts, structural and sparse-array errors, all seven native types, addon and opaque classification, ordering, conservative editable extraction, filters, raw preservation, legacy projection detection, input immutability, ID collisions, and plain-data encoding.

### Preservation-first Nuvio serializer — issue #36

**Confirmed by repository tests — issue [#36](https://github.com/davecollections/tmdb-id-lookup/issues/36), 2026-07-11:** a framework-independent serializer under `builder/src/serialize/` now converts the builder domain into detached Nuvio collection values or deterministic JSON text.

- Imported unknown and community collection, folder, source, filter, and matched projection fields survive unrelated recognised edits through safe editable-over-raw overlays.
- Current domain collections, folders, and sources replace raw structural arrays and retain current order. Inserted nodes appear, removed nodes disappear, and raw child arrays are never authoritative.
- New nodes use compact supported output. Optional recognised values appear only when present; explicit null envelopes, presentation defaults, backdrop/glow defaults, language fields, and v1 exporter defaults are not invented.
- Recognised field lists are centralised under `builder/src/nuvio/known-fields.js` and shared with the importer without changing importer behavior.
- Only explicit addon-category sources generate `catalogSources` compatibility projections. Native TMDB and opaque sources never generate projections, even when opaque raw data contains addon-looking fields.
- Raw projections are matched deterministically by original identity first and current identity second. Matched unknown metadata survives, and duplicate identities consume projections in original order.
- A source moved between folders can carry only the approved `id`, `addonName`, `manifestUrl`, and `showInHome` compatibility metadata from its own raw snapshot when no folder projection matches.
- Unmatched old projections are removed with stable warnings because current authoritative sources no longer reference them.
- Unresolved `catalogSources`-only legacy data blocks serialization instead of being silently lost or promoted. The serializer does not establish Ultra MAX migration behavior.
- Opaque sources require raw import evidence and serialize with preservation warnings. Incomplete supported native or addon sources fail atomically with stable diagnostics and no partial output.
- Recognised Discover filters are replaced as a group from editable state while unknown raw filter keys survive. Explicit property-removal semantics beyond supported value replacement remain deferred.
- Fifty-six serializer tests cover the original 70 required API, compact-output, ordering, preservation, filter, native, addon, opaque, validation, prototype-safety, determinism, and contract-integration behaviors plus the narrow no-genre identity alias. The existing 8 contract, 14 domain, and 32 importer tests remain unchanged and passing.
- No visible UI calls the serializer yet.

### Evidence-based addon projection migration — issue #37

**Manually confirmed in Nuvio Desktop from owner-reviewed private import/export pairs, and confirmed structurally by repository tests — issue [#37](https://github.com/davecollections/tmdb-id-lookup/issues/37), 2026-07-11:** compact active addon sources and one deterministic legacy projection-only promotion are now separately evidenced.

- One active-addon pair retained 8 collections, 129 folders, 201 active compact addon sources, and 201 matching projections. Ordering and identities were unchanged while Nuvio added explicit defaults/nulls. A source `genre: ""` could correspond to a projection `genre: null`.
- One AIO Metadata-based projection-only pair retained 8 collections, 83 folders, and all 174 projections in order while Nuvio created 174 authoritative addon sources in the same order from `addonId`, `type`, `catalogId`, and normalized genre.
- In that projection-only pair, 140 exact `"None"` genre values became `null`; actual genres such as `"Action"` and `"Sci-Fi & Fantasy"` remained unchanged. The addon type `anime` was preserved alongside `movie` and `series`.
- The full third-party files and unique configuration URLs remain private manual evidence. Repository fixtures are small, sanitised structural reproductions using synthetic identities and `example.invalid` artwork.
- Migration is an explicit framework-independent step under `builder/src/migrate/`. The importer remains preservation-first and never invokes it. The serializer still blocks unresolved projection-only data and succeeds only after authoritative sources exist.
- The migration is atomic, immutable, deterministic with an injected ID factory, collision-checked across the whole project, and independent of addon manifests and networking.
- Addon projection matching now treats missing genre, `null`, empty string, and exact `"None"` as one no-genre identity. This is a narrow evidence-based compatibility alias, not a universal string-normalization rule, and unrelated serialized values are not rewritten.
- Manifest validation, live catalog validation, automatic import conversion, visible UI, Ultra MAX conversion, and AIO Metadata runtime integration remain outside this issue.
- Twenty migration test functions plus the unchanged regression suites cover the 76 requested migration, integration, fixture, and regression behaviours. Issue #38 now records the builder-generated sanitised Nuvio Desktop follow-up alongside the existing private-pair evidence.

### Reproducible Nuvio Desktop migration round trip — issue #38

**Manually confirmed in Nuvio Desktop and confirmed by repository verification — issue [#38](https://github.com/davecollections/tmdb-id-lookup/issues/38), 2026-07-11:** the reproducible sanitised manual-test evidence under `manual-tests/nuvio-desktop/addon-projection-migration/` completed a controlled round trip.

- The issue #37 migration implementation is complete, and its builder-generated client checkpoint is now recorded.
- `builder-migrated-input.json` is generated through the production `importNuvioCollections` → `migrateLegacyAddonProjections` → `serializeNuvioProject` path rather than being authored as an independent expected result.
- The committed input contains 1 collection, 3 folders, 3 authoritative addon sources, and 3 matching compatibility projections in movie, series, anime order with `null`, `"Action"`, `null` genres.
- Canonical contract validation succeeds, and `generation-report.json` records the deterministic input SHA-256 `c14d7e9f9c4c3becccb95718d5b91e94e059652adbd6f8192dbb0c5794491970`.
- Nuvio Desktop `0.1.11-alpha` build `11`, based on Nuvio `0.2.19` on Windows, accepted the collection; one collection and all three ordered folders appeared, every folder opened, and each showed the expected addon-not-found message for `example.sanitised.metadata`.
- The untouched export SHA-256 is `6390428217959af42572038fdd818def5fc9136a98285b6e879504826a0aa7bc`. It retained every collection, folder, source, projection, addon, catalog, genre, order, sentinel, and non-null presentation value.
- Nuvio added explicit source nulls, folder defaults and missing presentation nulls, and collection defaults, including lowercase `tileShape: "poster"`. The recursive semantic comparison found 52 approved additions and zero removals, changed values, array-length changes, order changes, or unexpected differences.
- `scripts/check-migration-round-trip-export.mjs` verifies both exact hashes, all semantic invariants, the deterministic Stage B report, and canonical validation fully offline.
- This is manually confirmed Nuvio Desktop compatibility for the sanitised generated collection shape only. It does not validate live addon resolution, playback, every future client version, automatic migration, Ultra MAX conversion, or AIO Metadata runtime behaviour.

### Pages publication boundary recovery — issue #38

**Confirmed by repository verification — issue [#38](https://github.com/davecollections/tmdb-id-lookup/issues/38), 2026-07-11:** the initial controlled merge `ebf2b8f523d862a80a45405c610d94115a7152ad` made the sanitised manual-test evidence reachable through GitHub Pages because `scripts/prepare-pages-site.mjs` began with `git ls-files` and copied almost every tracked path. The artifact validator checked required runtime files and compiled builder portability but did not reject unexpected paths. Commit `538d681e9c663be4e14f7ca7e28770f43bf3f2b0` immediately reverted the merge and restored the prior production artifact.

Stage C recovered the feature branch from that revert without rewriting the approved Stage A or Stage B commits, restored the evidence byte-for-byte, and hardened the publication boundary in the same pending change set. The reviewed v1 runtime inventory is limited to three root files plus `css/`, `js/`, and `data/`; compiled `builder/dist/` output is copied separately to `.pages-site/builder/`. A shared explicit allowlist now controls both selection and exhaustive artifact validation, and regression tests cover separators, prefix tricks, absolute paths, traversal, repository-only roots, and the dedicated compiled-builder path.

All four issue #38 evidence JSON files, including the untouched owner export, are explicitly forbidden from the Pages artifact. The owner export bytes and its recorded SHA-256 are also checked for absence. The sanitised evidence remains available in the public source repository for auditability, while `manual-tests/`, `tests/`, `docs/`, `scripts/`, builder source, and other repository-only material are not deployed as website content. No Pages workflow, v1 runtime behaviour, builder production module, Worker setting, dependency, or UI/controller behaviour changed.

### Framework-independent application controller — issue #39

**Confirmed by repository tests — issue [#39](https://github.com/davecollections/tmdb-id-lookup/issues/39), 2026-07-11:** the application/controller layer under `builder/src/application/` now coordinates the existing production modules without moving their rules into UI state.

- `createBuilderController` owns one current project plus deeply frozen, stable-identity snapshots containing revision, hierarchical selection, dirty state, migration preview, and four diagnostic scopes.
- One snapshot commit increments revision once and notifies a stable listener snapshot once. True no-ops retain the previous snapshot identity, and previous snapshots remain unchanged.
- New-project and import replacement are blocked while dirty until the caller explicitly supplies `discardChanges: true`; a blocked replacement does not consume the configured production ID factory.
- Import delegates to the production text/parser entry points, remains atomic and preservation-first, clears selection on success, stores importer diagnostics, and never applies migration automatically.
- Migration preview invokes the production migration with deterministic disposable IDs that avoid all current internal IDs and never consume the controller's real factory. It exposes only unavailable, available, or blocked status, potential counts, and preview errors.
- Migration application remains explicit, uses the real configured factory, retains production atomicity and diagnostics, and marks dirty only when sources are created.
- Creation, editable update, sibling move, and removal delegate to the existing domain factories and immutable operations. Controller insertion adds project-wide collision protection, while selection reconciliation retains surviving ancestors without choosing siblings.
- Serialization and stringification delegate to the production serializer, store export diagnostics, do not auto-migrate, and do not clear dirty state.
- The visible React placeholder does not import the application layer. Browser file reading and download, persistent project format, storage, undo/redo, networking, and visible editor UI remain deferred.
- Thirty-three controller test functions cover 85 requested behaviours. Together with the unchanged 141 existing functions, the Node suite contains 174 test functions.
- The next planned work is the first visible builder shell/list interface.

### First visible builder shell and hierarchy navigator — issue #40

**Confirmed by repository tests — issue [#40](https://github.com/davecollections/tmdb-id-lookup/issues/40), 2026-07-11:** the `/builder/` deployment placeholder has been replaced by the first controller-connected, mobile-first application shell.

- `builder/src/main.jsx` creates one production `createBuilderController` at module scope with the `Untitled project` title and passes it into `BuilderApp`; React StrictMode does not create additional controllers.
- React subscribes through `useSyncExternalStore` with a server/static snapshot reader. Project, selection, revision, dirty state, migration preview, and diagnostics remain controller-owned rather than mirrored into component state.
- Pure UI helpers derive safe collection, folder, source, count, selection, and read-only-detail values while preserving controller order and explicit source categories. Raw imported data and builder internal IDs are not shown.
- Desktop uses a three-panel collections, folders, and sources/details workspace. Mobile uses a selection-driven drill-down with explicit parent navigation and no routes or browser-history model.
- Deterministic UI helpers create the smallest available `collection-N` or project-wide `folder-N` draft identity through existing controller actions and select only successful creations. They never create sources automatically.
- Operation errors use one inline alert. Legacy migration preview can produce a small available or blocked notice, but no migration action or automatic migration was added.
- The builder keeps its relative marked v1 backlink and `noindex, nofollow` state. The generated Pages validation marker now checks the real product title and `data-builder-shell` while retaining the existing allowlist and evidence-containment safeguards.
- Twenty focused UI test functions preserve the bootstrap, shell, view-model, creation, hierarchy, diagnostics, metadata, environment, and style contract. Together with the unchanged 174-function baseline, the Node suite contains 194 test functions.
- Import/export, forms, source creation, deletion, reordering, storage, networking, routing, dependencies, v1, Worker, workflow, Pages allowlist, Ultra MAX, AIO Metadata, language, and Trakt work remain outside this shell milestone.

### Welcome screen and local JSON import — issue #41

**Confirmed by repository tests — issue [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41), 2026-07-12:** the public builder entry now opens on a real welcome screen under the corrected **TMDB Collection Builder** product name before entering the preserved issue #40 workspace.

- `BuilderApp` remains subscribed to the single production controller on both screens. Its local screen state is presentation-only and is absent from controller snapshots.
- Start New Project calls the existing controller replacement action with `Untitled project`, creates no hierarchy children, leaves the project clean, and enters the workspace only after success.
- Pasted JSON is passed unchanged to `controller.importJsonText` after a UI-only empty check. File import validates explicit selection, JSON filename/MIME support, and a 10 MiB limit before `file.text()` and the same controller call.
- File-derived project titles remove one final case-insensitive `.json` suffix and fall back to `Imported project`; imported hierarchy titles and order remain importer-owned.
- UI transport diagnostics use only stable `code`, `path`, and `message` fields. Controller parse/import diagnostics pass through without parser internals or partial-project replacement.
- Successful importer warnings enter the workspace as a collapsed, bounded details summary without becoming fatal or exposing raw JSON.
- Imported content remains local: no networking, upload, persistence, object URL, logging, query parameter, or original-text controller state is introduced.
- Welcome controls are labelled, keyboard-operable, busy-aware, and mobile-first at the required 360–412px widths; wider action columns remain restrained and the existing 1024/1280px workspace is preserved.
- Thirty-three focused welcome/import test functions cover 116 tracked behaviours. With the unchanged 194-function baseline, the Node suite contains 227 test functions.
- Export, persistence, dirty replacement UI, editing, source creation, deletion, reordering, migration actions, routing, dependencies, v1 runtime, Worker, Pages allowlist/preparation/deployment, Ultra MAX, AIO Metadata, language, and Trakt work remain outside this milestone.

### Essential collection and folder editing — issue #42

**Confirmed by repository tests — issue [#42](https://github.com/davecollections/tmdb-id-lookup/issues/42), 2026-07-12:** the workspace now supports one controlled inline editor for collection/folder Nuvio-facing IDs and titles.

- The editor targets stable builder-only internal identity but never displays or changes it. Duplicate Nuvio-facing IDs remain valid and independently selectable.
- Local React state contains only target identity/type, two form strings, original string/presence/support metadata, touched flags, and structured field diagnostics. Complete nodes, projects, children, sources, and raw imported snapshots remain outside the draft.
- Absent or non-string imported known values are not stringified or rendered. They remain untouched unless the user enters valid replacement text for both required fields.
- Validation checks trimmed length without trimming submitted data. Minimal patches contain only effectively changed `id` and/or `title` fields and are delegated through `controller.updateNode`.
- Opening, cancelling, and unchanged Apply are controller-free. Actual edits retain selection, mark the project dirty, and increment controller revision once; controller failure keeps the form and remains structured.
- While editing, hierarchy selection, both mobile back controls, collection/folder creation, both edit triggers, and selection-changing folder-summary navigation are natively disabled. Apply and Cancel stay available.
- Opaque/community and mixed native/addon fixtures confirm raw/unknown-field preservation, source category/order retention, `catalogSources` compatibility evidence, serializer overlay behavior, and unchanged migration eligibility.
- The single responsive editor keeps labelled fields, unique descriptions, one local alert, first-invalid-field focus, edit-trigger focus restoration, strong focus styles, and approximately 48px controls.
- Forty-five focused node-editing test functions cover 86 requested behaviours. With the existing 227-function baseline, the Node suite contains 272 test functions.
- Project/presentation/source editing, source creation, export, deletion, reordering, persistence, migration actions, networking, dependencies, v1, Worker, language, Ultra MAX, AIO Metadata, and Trakt remain outside this milestone.

## 11. Automatic IDs and workspace flow — issue #43

**Confirmed by repository tests — issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43), 2026-07-12:** collection/folder Nuvio IDs are securely generated, hidden, preserved when usable, and silently repaired when missing, invalid, or duplicated. Controller import remains clean and preservation-first, title editing is UI-only and title-only, visible project/dirty status is removed, workspace return is guarded by inline discard confirmation, and collection/folder empty-state creation controls are functional. Presentation settings must be completed next, followed by a mandatory owner UI/flow review before source creation.

- Twenty-seven focused automatic-ID/workspace-flow test functions bring the Node suite from the existing 272-function baseline to 299 test functions.

## 12. Shared artwork runtime foundation — issue #45

**Confirmed from the final `davecollections/nuvio-assets` publication handover and current published schema, and confirmed by repository tests — issue [#45](https://github.com/davecollections/tmdb-id-lookup/issues/45), 2026-07-21:** a pure shared runtime lookup client now establishes one future artwork resolution contract for v1 and the builder without changing either consumer yet. The focused contract and API documentation is in [`ARTWORK_RUNTIME.md`](./ARTWORK_RUNTIME.md).

- The public runtime is read from `https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/runtime-lookup.json`; the application does not hard-code its current fingerprint, file SHA, counts, or representative IDs.
- Exact positive TMDB numeric IDs are authoritative only inside the explicit `companies`, `networks`, or `people` map selected by `company`, `network`, or `person`. Names and aliases are display metadata, ID spaces remain separate, and the resolver never scans other maps.
- Company and network support landscape 1200×675 WebP only. People support landscape 1200×675 WebP and poster 1000×1500 WebP. Unsupported orientations return an expected result and are never substituted, stretched, or cropped.
- Repository-relative published paths resolve beneath a configurable base URL. Every ready URL appends `?v=` plus the first 12 characters of that orientation's lowercase SHA-256.
- Only globally published data and entries with `status: "published"` and `reviewRequired: false` are safe for automatic use. A published `fallbackUsed: true` record remains approved; the resolver propagates the flag rather than replacing the asset.
- A missing typed key returns `missing` without guessing a numeric path, searching another map, or substituting a TMDB image. Malformed, unpublished, or unsafe data throws a typed error and cannot be mistaken for absence.
- The loader uses injectable fetch, validates the minimum complete consumer contract, deduplicates simultaneous loads, caches only successful data in memory per client, and permits retry after failure. Tests use synthetic fixtures only and make no live requests.
- The browser needs no write credential, login, secret, or personal data. On-demand artwork requests and publication remain a deferred workflow outside browser code.
- Persistent browser caching, refresh intervals, manual refresh, and multi-tab behaviour remain separate later product decisions.
- `js/artwork-runtime.mjs` is deployed with the existing v1 `js/` tree and can later support a thin v1 module adapter and direct Vite import. No current v1 export, builder UI, Nuvio JSON, Worker, or visible artwork behaviour uses it in this issue.

## 13. Open questions

- Can a future Nuvio source model support direct individual movies or series?
- Can multiple direct item references ever be exposed as a folder source?
- Which Discover filters work identically across mobile and TV clients?
- How should existing v1 exporters be consolidated without changing output?
- Which future controls need explicit property-removal semantics beyond assigning supported empty or null values?
- How should known TMDB list IDs be validated?
- How should future public TMDB list search slot into the architecture?

## 14. Update rules

- Update this file when a test becomes confirmed or disproved.
- Include the evidence level, review/test date, and source.
- Do not silently replace prior conclusions.
- Move superseded findings into the decision history below.
- Keep large copied sections from GPL or unlicensed repositories out of this document.
- GitHub issues remain the source of truth for implementation scope.

## Evidence register

| Reviewed | Evidence | Source |
| --- | --- | --- |
| 2026-07-10 | Current Mobile collection model, resolver, folder loading, validation, and unknown-field preservation | [NuvioMobile at `4e17faa`](https://github.com/NuvioMedia/NuvioMobile/tree/4e17faa5b8c280f404ee77a811deb9eb7e160c87) |
| 2026-07-10 | Current TV collection model, resolver, folder loading, import, and export behaviour | [NuvioTV at `0a36607`](https://github.com/NuvioMedia/NuvioTV/tree/0a36607f949afc99b282829d7934f69730300311) |
| 2026-07-10 | Catalog IDs, resource types, and metadata prefixes | [Nuvio Catalog Addon manifest](https://catalog.nuvio.tv/manifest.json) |
| 2026-07-10 | Shark Movies, addon catalog, genre, disable-addon, and failed identifier tests | Project manual-test notes recorded during the v2 investigation |
| 2026-07-10 | Existing v1 generators, checks, deployment, and Worker boundaries | [TMDB ID Lookup at `62b0ba2`](https://github.com/davecollections/tmdb-id-lookup/tree/62b0ba25f1dd49ad1a1bb515ee2461f61bc18681) |
| 2026-07-10 | Deterministic canonical, invalid, and import-preservation contract fixtures | [TMDB ID Lookup issue #31](https://github.com/davecollections/tmdb-id-lookup/issues/31) |
| 2026-07-10 | Mixed native/addon runtime order, addon isolation, projection deduplication, and exported order | Manual tests in Nuvio Desktop for Windows and Nuvio Mobile on iOS using `mixed-native-and-addon.json` |
| 2026-07-10 | Opaque sentinel import/export preservation and client normalisation behaviour | Manual tests in Nuvio Desktop for Windows and Nuvio Mobile on iOS using `opaque-community-import.json` |
| 2026-07-10 | Isolated React/Vite build, combined v1 plus `/builder/` Pages staging, and successful live deployment checks for assets, the v1 backlink, mobile widths, and unlinked `noindex, nofollow` behaviour | [TMDB ID Lookup issue #33](https://github.com/davecollections/tmdb-id-lookup/issues/33) |
| 2026-07-10 | Plain-data builder hierarchy, stable internal identity, immutable operations, raw snapshot preservation, and explicit source categories | [TMDB ID Lookup issue #34](https://github.com/davecollections/tmdb-id-lookup/issues/34) |
| 2026-07-11 | Atomic preservation-first import, provider-led source classification, conservative editable extraction, raw snapshot detachment, and legacy compatibility detection | [TMDB ID Lookup issue #35](https://github.com/davecollections/tmdb-id-lookup/issues/35) |
| 2026-07-11 | Atomic preservation-first serialization, compact new-node output, editable-over-raw overlay, addon projection matching, legacy blocking, and deterministic JSON output | [TMDB ID Lookup issue #36](https://github.com/davecollections/tmdb-id-lookup/issues/36) |
| 2026-07-11 | Owner-reviewed Nuvio Desktop pairs for compact active-addon expansion and deterministic addon projection-only promotion, plus sanitised repository reproductions and explicit migration tests | [TMDB ID Lookup issue #37](https://github.com/davecollections/tmdb-id-lookup/issues/37) |
| 2026-07-11 | Manually confirmed sanitised builder-generated Nuvio Desktop migration round trip with untouched export, additive-only semantic comparison, exact hashes, and canonical validation | [TMDB ID Lookup issue #38](https://github.com/davecollections/tmdb-id-lookup/issues/38) |
| 2026-07-11 | Reverted Pages exposure, recovered unchanged issue #38 evidence, and shared allowlist enforcement for v1 runtime files, compiled builder output, and repository-only path exclusion | [TMDB ID Lookup issue #38](https://github.com/davecollections/tmdb-id-lookup/issues/38) |
| 2026-07-11 | Framework-independent controller ownership, frozen external-store snapshots, guarded replacement, hierarchical selection, disposable production migration preview, explicit migration application, coordinated edits, diagnostics, and export lifecycle | [TMDB ID Lookup issue #39](https://github.com/davecollections/tmdb-id-lookup/issues/39) |
| 2026-07-11 | First visible controller-connected builder shell, ordered hierarchy navigator, deterministic collection/folder drafts, read-only summaries, mobile drill-down, desktop panels, accessibility, and real-shell Pages markers | [TMDB ID Lookup issue #40](https://github.com/davecollections/tmdb-id-lookup/issues/40) |
| 2026-07-12 | Corrected TMDB Collection Builder naming, local-only welcome entry, controller-delegated new-project and JSON import flows, stable diagnostics, warning summary, responsive accessibility, and welcome Pages marker | [TMDB ID Lookup issue #41](https://github.com/davecollections/tmdb-id-lookup/issues/41) |
| 2026-07-12 | UI-only collection/folder ID and title drafts, minimal controller patches, navigation locking, unusual imported-value handling, accessibility, and raw/unknown/source-order preservation | [TMDB ID Lookup issue #42](https://github.com/davecollections/tmdb-id-lookup/issues/42) |
| 2026-07-12 | Hidden automatic collection/folder Nuvio IDs, deterministic import repair, title-only editing, guarded builder-home return, and functional hierarchy empty states | [TMDB ID Lookup issue #43](https://github.com/davecollections/tmdb-id-lookup/issues/43) |
| 2026-07-21 | Final published typed artwork identity, orientation, SHA-version, review-safety, and missing-key contract | [`davecollections/nuvio-assets` runtime lookup and schema](https://github.com/davecollections/nuvio-assets/tree/main/assets/collection_covers) |
| 2026-07-21 | Shared pure artwork validation, resolution, loading, in-memory caching, retry, and offline fixture behaviour | [TMDB ID Lookup issue #45](https://github.com/davecollections/tmdb-id-lookup/issues/45) |

## Decision history

- **2026-07-10 — Planning checkpoint:** treat `sources` as authoritative, use `catalogSources` only as the addon compatibility projection/fallback, preserve unknown imported data, and gate the isolated React/Vite candidate behind contract and deployment proof.
- **2026-07-10 — Contract baseline:** add evidence-classified fixtures and stable invariant checks before any builder framework, production parser, serializer, or exporter work.
- **2026-07-10 — Deployment coexistence:** completed branch validation and recorded live GitHub Pages checks confirmed stable v1 at the project root and the isolated React/Vite builder under `/builder/`, including generated assets, the v1 backlink, mobile-width behaviour, and the unlinked `noindex, nofollow` state. Adopt isolated React/Vite under `/builder/` as the confirmed direction while leaving history-based direct subroutes unsupported.
- **2026-07-10 — Builder domain model:** adopt a framework-independent plain-data hierarchy with stable builder-only IDs, explicit source categories, authoritative editable `sources`, detached raw import snapshots, and small immutable operations before importer or serializer work.
- **2026-07-11 — Preservation-first importer:** accept JSON text and parsed collection arrays through an atomic importer; hydrate only recognised editable fields, classify from explicit providers, preserve unknown and unsupported sources as opaque, retain complete detached raw snapshots, and detect `catalogSources`-only compatibility data without migration or export assumptions.
- **2026-07-11 — Preservation-first serializer:** serialize compact new nodes and preservation-based imported nodes atomically; replace raw child arrays from current domain state; generate projections only for addon-category sources; preserve matched projection metadata; warn when unmatched projections are removed; and block unresolved legacy projection-only data without migration. Explicit property deletion, Ultra MAX conversion, language support, and visible UI integration remain deferred.
- **2026-07-11 — Evidence-based addon projection migration:** add an explicit atomic migration for the confirmed addon projection-only shape; create compact authoritative addon sources in projection order; normalize only exact `"None"` to `null`; preserve raw projection evidence for serializer overlay; and use a narrow no-genre identity alias for matching. Keep import automaticity, manifests, networking, UI, Ultra MAX conversion, and AIO Metadata runtime integration deferred.
- **2026-07-11 — Reproducible manual migration round trip:** generate the sanitised checkpoint through production importer, explicit migration, and serializer APIs; preserve the untouched Nuvio Desktop export; verify exact hashes and additive-only normalization; and adopt manual compatibility evidence for this generated collection shape while keeping live addon resolution, playback, automatic migration, and broader runtime conversions outside scope.
- **2026-07-11 — Pages publication boundary recovery:** after the controlled issue #38 merge exposed repository-only manual evidence through broad tracked-file staging, revert production, recover the approved evidence unchanged, and replace default publication with one shared explicit v1-plus-compiled-builder allowlist enforced by preparation, exhaustive validation, and regression tests. Keep the evidence public in source control but absent from the deployed website, with no runtime or workflow change.
- **2026-07-11 — Application controller boundary:** place immutable current-project ownership, subscriptions, hierarchical selection, dirty-state replacement protection, explicit migration preview/application, coordinated domain edits, diagnostic scopes, and serialization calls under `builder/src/application/`. Keep domain, parsing, classification, migration eligibility/transformation, raw preservation, projection generation, and export validation in their existing production modules. Leave visible React integration, browser file handling, persistence, and undo/redo for later issues.
- **2026-07-11 — First visible builder shell:** connect React to the controller through one external-store adapter and one production controller singleton; derive mobile drill-down directly from hierarchical selection; display only safe known summaries; and permit deterministic draft collection/folder creation without starting editing, import/export, source creation, persistence, or migration workflows.
- **2026-07-12 — Welcome and local JSON import:** make TMDB Collection Builder the visible product name; keep welcome/workspace selection UI-only above one subscribed controller; delegate new-project and JSON parsing/import to public controller APIs; keep browser file transport local, explicit, size-limited, and structured; and preserve the existing workspace without adding export, editing, persistence, migration actions, or networking.
- **2026-07-12 — Essential hierarchy editing:** add one UI-only inline draft for collection/folder Nuvio-facing IDs and titles; target controller nodes only by stable internal ID; validate required text locally; send only minimal changed fields through `updateNode`; lock hierarchy navigation until Apply or Cancel; and preserve raw/unknown/source evidence without changing controller, domain, importer, serializer, migration, v1, Worker, or dependency contracts.
- **2026-07-21 — Shared artwork runtime foundation:** adopt one pure root-level ES module for typed published artwork validation, loading, and resolution; resolve only explicit company, network, and person maps; version every ready asset URL from its orientation SHA; keep successful caching memory-only per client; and defer v1 export, builder UI, persistent caching, refresh policy, and artwork-request integration to separately reviewed issues.
