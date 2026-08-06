# TMDB ID Lookup v2 — Builder Knowledge Base

Status: Active isolated builder and contract groundwork

Last reviewed: 2026-08-05

This is a living record of confirmed v2/Nuvio findings, current decisions, unsupported behaviour, and open questions. GitHub issues remain the source of truth for implementation scope. See [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md) for durable product direction and [`PROJECT_WORKFLOW.md`](./PROJECT_WORKFLOW.md) for the Dave/ChatGPT/Codex process.

## 1. Product direction

- v1 is working and stable.
- v2 changes the product from primarily an ID lookup/export utility into the visual **TMDB Collection Builder**, built for Nuvio collections and powered primarily by TMDB.
- The active React/Vite builder remains isolated under `/builder/`, unlinked, and `noindex, nofollow`; it is not a released replacement for v1.
- **Confirmed owner requirement — issue [#85](https://github.com/davecollections/tmdb-id-lookup/issues/85):** before that `noindex` state is removed or V2 is released or promoted for public use, the Builder shell must include visible TMDB attribution using an official TMDB logo, with the TMDB mark less prominent than the application identity, and the exact notice: **“This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.”** Issue #85 documents the V2 requirement only and does not implement Builder attribution UI.
- Lookup and copy-ID tools remain available.
- v2 should be mobile-first, modern, and sleek.
- No login is required for the complete core build-and-export journey. Any future Nuvio connection must remain optional.
- Playback is outside project scope and should normally remain unmentioned.
- Startup routes, Dave’s 1-Click Setup, templates/recipes, the Kaptain onboarding comparison, product privacy, branding, and the optional Nuvio connection are maintained in the product plan rather than duplicated here. Exact template contents, final naming, and the connection product contract remain open.

## 2. Evidence levels

Future findings must use one of these labels:

- **Manually confirmed in Nuvio:** observed in an actual Nuvio client using a recorded input.
- **Confirmed from current Nuvio source code:** directly supported by the reviewed, pinned Nuvio source revision.
- **Confirmed by current official Nuvio documentation:** explicitly documented by Nuvio on the cited page and review date; this does not prove undocumented client behaviour.
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

**Confirmed from pinned current Nuvio source code, reviewed 2026-07-23:** both current clients still declare exactly these 14 fields, but request behavior is not uniform. Thirteen map to official Movie parameters and all fourteen map to official TV parameters; Movie `withNetworks` is omitted by NuvioTV and sent as an undocumented query by NuvioMobile. Five fields are media-mapped or conditional, and provider filtering injects a non-selectable all-monetization union. See [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md) for the complete official inventory, pinned client evidence, preservation findings, and manual-test boundary.

**Owner-supplied Windows visual evidence, reviewed 2026-07-23 but not version-pinned:** screenshots of the current Nuvio Windows TMDB Sources > Custom editor show exactly the same 14 fields and no additional Windows-only Discover field. Movies/Series/Both is a media/source control, the four visible sorts are Popular/Top Rated/Most Voted/Recent, and quick chips are convenience inputs rather than fields. Network IDs remains visible for Movies with the helper “For series only.” Genre and watch-provider help explicitly says comma=AND and pipe=OR. Language/country comma examples are placeholders only and do not establish official delimiter semantics. Because the exact app version was not captured, this evidence confirms visible UI wording/surface only and does not change mapping or result-effect counts.

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
- The browser entry injects a secure environment-specific factory: it uses `crypto.randomUUID()` when available and generates RFC 4122 version 4 UUIDs with `crypto.getRandomValues()` for same-network HTTP previews where `randomUUID()` is unavailable. The strict framework-independent defaults remain unchanged.
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
- Project and diagnostic snapshot commits increment revision once and notify a stable listener snapshot once. Successful selection-only commits create and notify a frozen snapshot without incrementing revision or dirty state. True no-ops retain the previous snapshot identity, and previous snapshots remain unchanged.
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

### Collection and folder presentation settings — issue #53

**Confirmed by repository tests — issue [#53](https://github.com/davecollections/tmdb-id-lookup/issues/53), 2026-07-25:** owner visual review superseded the original inline-editor direction. The corrected workflow now uses one compact Edit action on every collection and folder card plus one responsive collection/folder settings modal. Selection-only snapshots no longer advance project revision. The shared collection known-field contract now includes the evidence-backed `focusGlowEnabled` boolean; folder and source inventories remain unchanged.

- Manual blank collections explicitly receive `pinToTop: false`, `focusGlowEnabled: true`, `viewMode: "TABBED_GRID"`, and `showAllTab: true`. Manual blank folders explicitly receive `tileShape: "POSTER"` and `hideTitle: true`; automatic Nuvio IDs and unique draft titles remain unchanged.
- At the issue #53 checkpoint, every collection and folder card owned one always-visible Edit text button and the earlier quick-rename form was absent. Issue #63 supersedes only that action placement by moving Edit into an in-card overflow menu and adding a smaller mobile selected-context rename variant; the large selected-entity blocks remain absent and source cards still gain no editing.
- At the shared 900px UI breakpoint, desktop draft creation retains its original select-and-advance behavior. Mobile collection creation stays on Collections without selecting the new card; mobile folder creation keeps the parent collection selected and stays on Folders. Repeated mobile creation preserves insertion order, IDs, defaults, one revision per creation, and the absence of source creation. New cards scroll into view with reduced-motion awareness where supported.
- Edit directly selects and targets its exact card without a preliminary click, project mutation, dirty change, or revision increment. It opens the modal with initial Title focus; Apply and Cancel retain selection and restore the exact Edit trigger.
- The modal is a single accessible DOM instance with bounded desktop scrolling, full/near-full-screen mobile presentation, contained focus, safe Escape cancellation, non-discarding backdrop clicks, exact trigger focus restoration, body-scroll control, and an inert/dimmed workspace with a non-blur fallback.
- Collection editing offers source-level Tabs and Rows: each folder presents each source as a tab or streaming-style row. For a folder with two or more sources, Tabs plus Include an All tab when using Tabs adds an All tab combining those sources; a one-source folder has no visible All tab. Rows shows no tabs, but the saved All-tab preference remains visible and editable for a later switch to Tabs. Pin to top forms the group shown before unpinned collections; Builder exports retain each group's relative collection-list order and store no separate interactive pin sequence. Issue #69 supersedes this checkpoint's source-layout wording and removes the visible focus-glow switch; deliberate replacement of the collection title with exactly one U+200E LEFT-TO-RIGHT MARK remains independent.
- Folder editing places one Folder title visibility radio-card group immediately below Title, followed by Poster/Landscape. Show everywhere maps a valid visible title to `hideTitle: false`; Hide on home screen only maps a valid visible title to `hideTitle: true`; Hide everywhere maps the title to exactly one U+200E and maps `hideTitle: true`. The former two interacting switches are absent.
- Imported titles containing only repeated U+200E are recognised and preserved exactly while untouched. An imported invisible folder opens with an empty disabled Title field and Hide everywhere selected; its raw title is absent from draft/DOM state. Unrelated edits preserve the exact title and every supported, absent, or unusual `hideTitle` presence state. Either visible choice requires valid visible text; returning to Hide everywhere without a replacement restores exact preservation, while re-hiding after a deliberate replacement emits canonical one-character U+200E and `hideTitle: true` only when needed. A visible-mode → Hide everywhere → original visible-mode cycle is a clean no-op, and no modal-only visibility field enters serialization. Empty/whitespace titles never become invisible automatically; U+200B and other format-only alternatives are not recognised. Builder cards, actions, and summaries use `Hidden title` / `Invisible in Nuvio` display-only fallbacks and meaningful accessible names, none of which enter Nuvio JSON.
- Imported `focusGlowEnabled: true|false` values, absence, and unusual values retain their exact preservation behavior and are never stringified. Issue #69 removes the visible switch and its replacement guidance; programmatic canonical replacement support remains internal compatibility plumbing, and summaries show Focus glow enabled only for supported values.
- Imported `FOLLOW_LAYOUT` and `SQUARE` remain preservation-only. Supported imported choice casing remains unchanged while untouched. Absent, unsupported, and unusual JSON-compatible values are not copied or rendered and survive unrelated edits.
- Draft construction, touched tracking, validation, and minimal patch generation remain UI-only helpers. Actual changes still commit once through `controller.updateNode(internalId, patch)`, while opening, cancel, no-op apply, and touched-then-reverted values remain controller-free.
- Preservation tests cover raw evidence, unknown/community fields, identity, children, source order/category, compatibility projections, artwork fields, repeated invisible titles, second-cycle serialization stability, and absence of builder-only flags/fallbacks.
- Artwork, focus GIF, cover, logo, backdrop, hero, source creation, and screenshot-evidenced expanded Nuvio controls remain deferred. Future focus-GIF support defaults off unless deliberately enabled.
- Source-specific Search/Add, template, and recipe defaults are recorded in [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md) but remain unimplemented.
- Collection/folder/source reordering is desired as a separate focused milestone and is recommended before Search/Add; issue #53 contains no reordering implementation.
- Bulk presentation settings are desired but deferred to a separate focused issue; issue #53 contains no bulk implementation.
- The mandatory next gate is independent review plus Dave's focused UI/flow review. No pull request, reordering implementation, or source creation begins within this issue.

### Collection and Folder settings polish — issue #69

**Confirmed by focused repository tests on the issue branch — issue [#69](https://github.com/davecollections/tmdb-id-lookup/issues/69), 2026-07-30:** the established settings schema and touched-only lifecycle remain unchanged while the Collection and Folder settings presentation is clearer and more compact.

- The Collection source-presentation heading is **How sources appear in this collection**, its helper is **Choose how each folder in this collection displays its sources in Nuvio.**, and the visible **Tabs (recommended)** option still stores and serializes `viewMode: "TABBED_GRID"`. Rows remains `ROWS`; imported `FOLLOW_LAYOUT` remains preservation-only.
- The visible focus-glow control is removed. `focusGlowEnabled` remains in the shared recognised collection field inventory and serializer overlay. Manual blank collections still explicitly create `focusGlowEnabled: true`; imported explicit `false` remains false, explicit `true` remains true, missing stays missing, and unusual values remain raw-preserved. Opening/cancelling settings creates no revision, and changing another setting does not touch the field.
- Full Folder settings use **Basic details** for Title and **Display** for title visibility plus tile shape. The section component is the narrow future-group seam; no Artwork heading, placeholder, media picker, preview pane, control, or schema field is added.
- Folder title visibility keeps the existing `title`/`hideTitle` mapping and all three outcomes, but presents them as compact native radios with one accessible fieldset name and normal radio keyboard behavior.
- Poster and Landscape keep `tileShape: "POSTER" | "LANDSCAPE"` and are presented as compact visual cards with CSS aspect-ratio previews, native checked state, an additional visible check mark, and the existing focus ring. Imported `SQUARE` remains preservation-only.
- Focused rendered-component, helper, serializer, lifecycle, CSS-contract, and no-artwork assertions cover the revised copy, unchanged stored values, hidden focus control, preservation behavior, semantic groups, radio naming/check state, visual shape cards, mobile boundaries, and no-op revision behavior.
- V1, Worker routes, Add Source providers/recipes, sources/catalog projections, node IDs, deletion/reordering, dependencies, lockfiles, Pages boundaries, artwork runtime, and `nuvio-assets` remain unchanged.

### Accessible hierarchy reordering — issue #59

**Confirmed by repository tests, completed owner local browser/visual review, and bounded Nuvio client evidence — issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59), implementation commit `326efe0bf78ee095f1d9efd5420b18d509d5c14f`, 2026-07-27:** the existing collection, folder, and source hierarchy cards now provide one compact six-dot handle for pointer/touch dragging and keyboard-accessible movement without permanent arrow controls, ordering metadata, or a second domain mutation path.

- Folder and source visible siblings use their authoritative array order. Collections display the stable `pinToTop: true` group before the stable ordinary group; absent, false, and unusual preserved pin values remain ordinary.
- Collection movement is bounded inside the current visible pin group and never changes `pinToTop`. The UI retains both group-relative movement positions and overall visible-list positions, maps the adjacent visible collection back to that sibling's raw-array index, and announces the completed overall position. This covers interleaved imported arrays where visual and raw neighbors differ without exposing raw indexes.
- A completed pointer drop or successful keyboard arrow action delegates exactly once to `controller.moveNode(internalId, targetIndex)`. Hovering, cancellation, lost capture, same-position drops, and invalid keyboard boundaries remain controller-free. Stable internal IDs retain the selected node and React card identity; folder moves cannot change collection, and source moves cannot change folder or source category.
- The 18px six-dot grip and its 46px target sit inside the visual card, while collection/folder Edit remains a compact independent action beside that card. Pointer Events begin on the handle only and use a small vertical threshold. A pointer session is created only after the handle successfully establishes and, where supported, confirms Pointer Capture; a failed attempt declines that pointer gesture without overlay, data change, or loss of keyboard availability. After the threshold, a fixed clone of the complete associated row follows the pointer at its original grab offset above panel clipping; the measured original row becomes a same-sized provisional placeholder, and crossed siblings shift with a restrained 150ms FLIP-style transform. The insertion line remains secondary emphasis. These transforms and the overlay are UI-only until the final drop, while reduced-motion mode retains the overlay and placeholder without sliding or settle animation.
- Pointer destinations clamp to the current pin group and provide restrained viewport-edge auto-scroll. `touch-action` is scoped to the handle so ordinary page scrolling remains available elsewhere. While a captured pointer session is active or its 150ms drop settle is pending, hierarchy selection, Edit, creation, workspace/root navigation, and keyboard-mode entry are ignored; the active handle remains enabled so capture is retained, and Escape can still cancel before settling. Changed drops settle the overlay toward the provisional placeholder before one controller call; same-position drops settle home without a call, and cancellation removes the overlay, placeholder, sibling transforms, and grabbing state immediately. Normal interaction resumes as soon as completion or cancellation clears the session.
- The same handle is focusable and named `Reorder …`; Enter or Space toggles keyboard reorder mode, Arrow Up/Down moves one valid position, and Escape exits. Hidden instructions, meaningful blank/hidden-title fallbacks, focus restoration to the moved handle, and one polite live region avoid a drag-only accessibility dependency.
- A valid changed move advances project revision exactly once. Same-index and cancelled pointer actions do not advance revision, and invalid or out-of-range controller targets retain structured diagnostics without advancing project revision.
- The former desktop and mobile Selection details summaries are removed. Source cards remain read-only hierarchy entries with one reorder handle and no Edit action.
- Preservation tests cover collection/folder/source identity and selection, pin values, folder artwork, unknown/community fields, opaque sources, native/addon categories, authoritative source order, addon compatibility projections, second-cycle serialization stability, and the absence of Builder-only movement metadata.
- Search/Add, source editing/creation, deletion, bulk movement, artwork-runtime consumption, v1, Worker, dependencies, Pages allowlists, and `nuvio-assets` remain unchanged.

#### Nuvio client ordering evidence — 2026-07-27

The deterministic evidence bundle is recorded under [`manual-tests/nuvio-clients/issue-59-builder-reordering/`](../../manual-tests/nuvio-clients/issue-59-builder-reordering/). The checker replays the six production controller moves from the preserved seed, verifies revision 7, exact final serialization, second-cycle stability, hierarchy/pin/parent/source/projection order, exact raw hashes, normalization, and privacy fully offline.

| Client | Result | Evidence method |
| --- | --- | --- |
| Nuvio Desktop `0.1.11-alpha` build `11`, based on `0.2.19`, Windows 11 | Passed | Owner visual review plus exact raw export |
| nuvio.tv/web, build/browser unknown | Passed with normalization | Owner visual review plus exact raw export |
| Nuvio mobile, version/OS/device unknown | Passed with raw-artifact limitation | Owner visual review plus owner-supplied exported JSON text |
| Nuvio TV, version/device unknown | Passed with no independent export | Owner visual review plus synced profile backed by the verified web export |

Desktop retained raw D/B/C/A, visible C/A/D/B, pin groups, D folders C/A/B, C/A/B source and projection arrays, parents, IDs, and all sentinel levels; its raw export contains exactly 102 approved default/null additions and no removals, changed values, array-length changes, or order changes. Web retained the same hierarchy and order while normalizing source `genre` from `null` to `""`, omitting optional nulls, changing folder `focusGifEnabled` from Desktop's `true` to `false`, adding collection `focusGlowEnabled: false`, retaining source sentinels, and dropping collection/folder/projection sentinels. Mobile retained the required hierarchy, parents, IDs, pins, sentinels, and `genre: null` in the reviewed export text, but no exact raw mobile file was available and no hash is claimed. TV supplied no independent export; its C/A/B source-array proof is explicitly the synced exact web export.

The issue #59 client-ordering gate is complete. Its implementation is integrated through PR #60, and issue #61 / PR #62 integrated the Windows line-ending-safe evidence check without changing hierarchy behavior.

### Persistent hierarchy creation and safe deletion — issue #63

**Confirmed by focused repository tests on the issue branch; owner desktop/mobile review pending — issue [#63](https://github.com/davecollections/tmdb-id-lookup/issues/63), 2026-07-28:** populated collection and folder panels retain their header actions and now add one visually secondary full-row Add button beneath the final card. Sources deliberately have no Add action until the next Search/Add and source-creation issue.

- Bottom Add buttons call the existing `createDraftCollection()` and `createDraftFolder()` flows, preserving automatic titles/IDs, defaults, viewport-aware selection, mobile drill-down, scrolling, ordering, and one revision per creation. They remain outside semantic lists and reorder calculations.
- Every collection, folder, and existing source row owns one in-card overflow trigger named `Actions for <type> “<safe name>”`. Collection/folder menus contain Edit and Delete; source menus contain Delete only. The visual card order is grip, primary identity/navigation, chevron where applicable, and the vertical-dots trigger. The former external Edit/Delete rail is absent.
- Only one reusable actions menu can be open. Its body portal and fixed positioning escape card/panel clipping; pure geometry measures the complete rendered menu against `visualViewport` offsets and dimensions (falling back to the layout viewport), flips upward when the full menu will not fit below, and clamps to a 10px visible margin. Placement precedes prevent-scroll first-item focus, so opening last and second-last visible cards does not move the page. Pointer, Enter/Space, Escape, outside press, arrow navigation, exact trigger focus restoration, selection/node/modal/viewport-change closure, keyboard-reorder exit, drag locking, and pointer-inert drag clones remain explicit interaction contracts.
- Below 900px, the selected collection context above Folders and selected folder context above Sources each add one pencil action using the safe accessible name. It opens a rename-only form containing Title, the relevant invisibility switch, diagnostics, Apply, and Cancel. Desktop has no duplicate pencil.
- The collection rename switch hides the title in Nuvio. The folder switch hides it everywhere; switching it off restores the original non-invisible `SHOW_EVERYWHERE` or `HIDE_HOME_SCREEN` outcome rather than silently changing home-screen visibility.
- One pure impact helper resolves target identity/type/name, parent and visible sibling order, descendant folders, active sources, imported `sources` entries, legacy/projection `catalogSources` evidence, confirmation copy, and selection/mobile/focus recovery before mutation.
- Empty collections and folders without active or imported source evidence delete immediately. A collection with any folder and a folder with active or imported/legacy source evidence require the focused Cancel-first confirmation dialog. Every individual source also confirms, using `This source will be permanently removed from this folder.` and `Delete source`. Projection-only imported content is never treated as empty.
- The dialog uses the existing inert/dimmed modal pattern, contains focus, cancels on Escape, restores the exact trigger, and prevents double submission. Cancel performs no controller action or revision.
- `controller.removeNode(internalId)` remains the only project mutation. One successful deletion advances revision once. Selection-only recovery then prefers next sibling, previous sibling, or parent without advancing revision; collection recovery follows the complete pinned-then-ordinary visible order. Unaffected selection is preserved.
- Mobile remains at the same visible hierarchy level when a sibling survives and falls back to the parent/empty level only when needed. Focus moves to the nearest sibling card, relevant Add action, or parent/back control, and a polite live region announces success.
- Removing a subtree leaves unrelated identities, order, presentation, pin state, artwork, unknown/community fields, and raw imported values unchanged. Removing an addon source rebuilds `catalogSources` from surviving authoritative sources, removes only the matching projection, preserves unrelated projection values/order, passes canonical validation, and remains textually stable through a second import/serialize cycle. No deletion metadata is serialized.
- Add/menu/rename/Delete share the existing editor, delete-confirmation, return-confirmation, pointer-drag, and 150ms settle gate. Opening a menu or delete confirmation exits keyboard reorder mode.
- Focused hierarchy and node-editor tests cover impact rules, names/plurals, menu semantics, rename-only scope and visibility restoration, selection/revision recovery, double-submit/failure/cancel behavior, subtree preservation, addon projection removal, canonical/cycle stability, locking, accessibility, and responsive static contracts.
- Search/Add, source creation/editing, bulk deletion, multi-select, reparenting, undo/redo, presentation changes, artwork-runtime consumption, Network Poster, v1, Worker, dependencies, workflows, Pages boundaries, and `nuvio-assets` remain unchanged.

### Add Source foundation with TMDB movie franchises — issue #65

**Confirmed by focused repository tests, final owner physical-iPhone acceptance, and successful current Nuvio Desktop import/runtime/round-trip evidence on the issue branch — issue [#65](https://github.com/davecollections/tmdb-id-lookup/issues/65), 2026-07-29:** a selected folder now exposes one staged Search/Add flow for a native TMDB movie `COLLECTION` source. The focused contract is documented in [`BUILDER_SOURCE_ADD.md`](./BUILDER_SOURCE_ADD.md).

- Sources shows `Add source` in its header and either `Add first source` or `+ Add another source` in its body only when a folder is selected. All three controls open one body-portalled dialog and no disabled placeholder appears without a folder.
- Movie franchise · TMDB is the only visible mode. No disabled or hidden future provider/mode implementation was added.
- A framework-independent parser accepts positive decimal IDs and strict HTTPS `/collection/{id}` or `/collection/{id}-{slug}` URLs on exactly `themoviedb.org` and `www.themoviedb.org`. It rejects unsafe or non-whole IDs, non-HTTPS and lookalike hosts, other entity paths, query-only IDs, embedded URLs, credentials, ports, and malformed paths. Eligible remaining text searches after two trimmed characters.
- The provider adapter uses only the existing `/3/search/collection` and `/3/collection/{id}` Worker routes. Vite extracts exactly one anchored Worker declaration from root v1 `js/config.js`; after trimming, build-time and runtime validation accept only the parsed HTTPS origin or that exact origin plus one trailing slash, rejecting credentials, explicit ports, paths, queries, fragments, and raw normalization aliases. Vite injects only the canonical origin without executing the classic script or adding a second endpoint literal.
- Search always sends `include_adult=false`, including in its cache identity. Search normalization excludes only result objects explicitly marked with boolean `adult: true`; otherwise it preserves TMDB's returned result set and order without local word, prefix, singular/plural, accent, spelling, or mature-text admission rules. The Builder relies on TMDB's collection results and is not an age-classification service or age guarantee.
- Every result selected from search receives a collection-details request before Review. Search remains visible while only that result shows and locks its loading state. Failure preserves query/results/page/scroll and exposes a persistent focused/scrolled alert before the results; a retry can proceed. Exact ID/URL input also resolves through the same details policy. Structurally valid details are not rejected from collection/contained-title wording or collection/part adult flags. Normalization keeps only collection identity, bounded overview, validated poster path, movie count, and ordered contained movie title/release-year rows. The UI builds only `w185`/`w342` URLs under the already-approved TMDB image origin. Posters, overview, and contained titles are UI-only and never serialize.
- The official name seeds the editable title, while the recipe remains fixed to `native-tmdb`, `provider: "tmdb"`, `tmdbSourceType: "COLLECTION"`, `mediaType: "MOVIE"`, `sortBy: "original"`, positive numeric `tmdbId`, and explicit empty `filters`.
- Semantic validation requires the exact draft shape and rejects extra, raw, addon, Trakt, or UI-only fields. New native sources have no Nuvio-facing source `id`, no `rawImported`, no serialized Builder `internalId`, and no `catalogSources` projection.
- Duplicate identity is `tmdb|COLLECTION|numeric tmdbId|MOVIE` within the selected folder; title is irrelevant. The first Apply warns without mutation and names the existing source. Explicit Add anyway retains both only when its approval carries the exact duplicate identity still under review; imported duplicates remain untouched.
- Apply revalidates, checks interaction locks and the still-selected/still-existing folder, activates a synchronous one-shot gate before any async boundary, appends through exactly one `controller.createSource()` call, then selects the created source without another content revision. Success closes the modal, scrolls and focuses the source control, and announces through a polite status region. Close, lookup/validation failures, duplicate warning, missing-folder, lock, and repeat-tap paths make no source mutation.
- Existing source reorder and Delete continue through their established controller paths immediately after insertion. Canonical validation, addon projection stability, unrelated raw/unknown preservation, and textually stable second-cycle serialization pass in focused tests.
- Search and Review are explicit stages in one semantic dialog. Search contains no empty action footer and hides pagination for a single page. Review adds Back/Close, poster or placeholder, TMDB ID, count, editable title, fixed recipe, contained-title disclosure, and exactly one contextual Add action. Back restores query, results, page, selected result, scroll, and focus without another request.
- Below 900px the responsive dialog uses an isolated z-indexed portal with an opaque layout-viewport guard behind an opaque Visual-Viewport-sized task surface; the mobile surface removes desktop translucency and cyan decoration. Initial geometry is available during render, and a pre-paint layout effect establishes body locking, live Visual Viewport observation, and focus before the first visible frame. The same guard remains while Search/Review, keyboard, browser-chrome, portrait, and landscape geometry changes. From 900px the intentional centered desktop backdrop remains. The dialog has one DOM implementation and one scroll owner, four-edge safe-area padding, focus containment, Escape/Close, exact invoking-trigger restoration, inert hierarchy locking, no-scroll focus, and exact pre-existing body-style/class/scroll restoration. The uncropped mobile review poster uses a responsive 180–220px maximum, can shrink further in short keyboard-height viewports, and moves beside the editable content where short landscape width permits. The mobile Sources heading renders its count inline to protect Add-source space.
- Dave's final physical-iPhone review passed initial opening, opaque layer isolation without Builder/cyan bleed, Search → Review → Back, keyboard and Safari address-bar changes, portrait/landscape safe areas, poster layout, contained-title expansion, fixed Add action, source creation, duplicate handling, and usable interaction. No device model, OS version, or browser build was supplied or inferred.
- On 29 July 2026, Dave imported the production-generated fixture into current Nuvio Desktop. The source resolved the Harry Potter franchise and expected movie titles. Its exact immediate export expanded compact absent/empty fields into null/default fields while preserving provider `tmdb`, `COLLECTION`, ID `1241`, `MOVIE`, sort `original`, title, and no addon projection.
- Owner-observed current Desktop sorting is: `original` preserves TMDB collection API order; `primary_release_date.desc` works newest-first; unsupported `primary_release_date.asc` falls back to TMDB-provided order. The Builder keeps serialized `original` and displays `TMDB-provided order`; it exposes no sort control.
- Forty-one foundation tests and twenty-two UI tests cover the corrected deterministic boundary, including strict canonical Collection/People review links and responsive long-title handling. The production-generated sanitized fixture, exact Desktop export, and read-only checker live under [`manual-tests/nuvio-clients/issue-65-builder-add-source/`](../../manual-tests/nuvio-clients/issue-65-builder-add-source/). A second current Nuvio client is not tested and remains desirable but non-blocking unless conflicting behavior appears.
- TMDB lists, companies, networks, people, directors, Discover, genres, decades, direct movies/TV/seasons, addons, manual/opaque sources, bulk creation, automatic hierarchy, source editing/sort/artwork, artwork-runtime integration, Trakt, v1, Worker, Pages contracts, dependencies, workflows, and `nuvio-assets` remain unchanged.

### Unified People Search/Add — issue #74

**Confirmed by focused deterministic repository tests, both owner Nuvio Desktop runs, final visual evidence, and the owner-supplied immediate export — issue [#74](https://github.com/davecollections/tmdb-id-lookup/issues/74), completed 2026-08-02:** People has a short selected-folder quick add and a collection-level multi-person folder action backed by the same provider, count, source, validation, duplicate, and artwork modules. The focused contract is documented in [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md).

- Name search preserves TMDB result order and displays canonical name/ID plus `Known for <department>`. Normalized state retains every valid TMDB-supplied `known_for` row without sorting or another request; desktop renders the first three and the 520px mobile breakpoint renders only the first, with natural wrapping and retained media/year metadata. Empty arrays render no known-for row. Exact TMDB IDs/links omit those rows when unavailable. Missing paths visibly say `No profile image`; failed expected images say `Image unavailable`, with distinct accessible announcements.
- Folder `Add source → People` selects one person and directly configures Acting Movies/Series and Directed Movies/Series. An empty Builder-generated `Untitled Folder`/numbered default with no raw snapshot or deliberate artwork is atomically renamed to the canonical person, receives independently resolved final artwork, and receives the sources in one revision. Named, populated, imported, and deliberately artworked folders remain preservation-only and perform no artwork request/preview.
- Folders exposes `Add people` for the selected collection. Exact-ID checkbox selection persists across query/page/scroll/Back, is independently removable, rejects duplicates, and caps at 20 with visible copy. Only selected people receive details plus combined credits. One canonical-name Poster folder per person and one-to-four sources per folder validate and commit in one controller revision; created IDs preserve selection order and any failure leaves the document unchanged.
- The four direct combination controls show friendly title-count states without a separate count matrix. Acting/Directing defaults select every positive media combination in the indicated role. Unsupported departments select the strictly larger non-zero supported role; ties, unavailable, and all-zero counts select nothing. Defaults run once and Retry/Refresh/Back/rerender preserve manual choices.
- `PERSON` counts distinct cast Movie/TV IDs only; `DIRECTOR` counts distinct crew Movie/TV IDs with case-insensitive `Director` jobs. Zero/unavailable counts remain selectable and non-blocking. No sidecar, scheduled work, per-result credit request, or issue #71 Company/Network contract changed.
- Native identity remains `tmdb|sourceType|personId|mediaType`. Source titles now match stable v1 exactly: `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series`; the folder retains the canonical person name. `BOTH`, generic all credits, unsupported crew roles, source/Builder IDs, counts, UI metadata, and native `catalogSources` projections remain rejected or absent.
- Destination-folder duplicates are actionable, elsewhere matches informational, the main quick-add inserts missing identities only, and Add all anyway is bound to the exact selected folder plus current identities. Validation previously presented on Review remains at the final Configure submission gate.
- New and promoted-folder artwork resolves independently per exact person ID plus creation context: validated runtime orientation first, TMDB `w500` Poster second, then empty URL/visible title/`👤`. Configuration replaces the TMDB profile with one final applied artwork representation rather than repeating an artwork panel. Exact keyed tokens prevent previous-person, failed-person, concurrent-person, and reopened-flow leakage. Existing-folder quick add performs no artwork request or preview.
- Content-based source chooser and short Search sizing remove empty vertical space while shared body lock, Visual Viewport geometry, single scroll owner, focus recovery, live regions, keyboard controls, safe areas, reduced motion, and one-column 360–412px behavior remain.
- The first Tom Hanks/Steven Spielberg Desktop import resolved all four role/media catalogues and preserved person IDs, source/media types, sort, order, grouping, and the immediate-export contract; explicit empty artwork and duplicate person-name tabs keep it bounded to source-contract evidence. On 2026-08-02, Dave imported the regenerated fixture into current Nuvio Desktop on Windows 11. Screenshots confirmed the curated Tom Hanks and Steven Spielberg Posters, four distinct stable-v1 tabs, and populated role/media catalogues. The owner-supplied immediate export preserved the exact SHA-versioned URLs, `hideTitle: true`, grouping, source order/titles/identities, and empty `catalogSources` with normal Desktop null/default expansion. The client version/build was not supplied. [`ASSET_GAPS.md`](../../manual-tests/nuvio-clients/issue-74-builder-add-people/ASSET_GAPS.md) records John Cena's missing curated Poster with an owner-test ID confirmation gate. V1, Worker, production data, dependencies, `nuvio-assets`, and issue #73 remain unchanged.

### Durable typed-count writer recovery — issue #73

**Confirmed by deterministic repository tests on the issue branch; hosted August drill and owner runbook review pending — issue [#73](https://github.com/davecollections/tmdb-id-lookup/issues/73), 2026-08-05:** positive-consumption `collect`-mode Company Movie, Company Series, Network Series, Company repair, and Network repair outputs now have a commit-only recovery contract before September activation. The full operator and security contract is documented in [`ENTITY_COUNT_RECOVERY.md`](./ENTITY_COUNT_RECOVERY.md).

- A completed writer or scheduled slice is the recovery unit. The writer emits its exact immutable progress and usage paths; one shared validator packages those files plus every fixed legacy path owned by that workload after collection and before the first output push.
- Packages live only in runner temporary storage and upload as unique `maintenance-recovery-v1-<run-id>-<run-attempt>-<writer-job>` Actions artifacts with requested 90-day retention subject to repository-policy capping, missing-file failure, overwrite disabled, canonical schema-v1 manifests, per-file SHA-256, sorted-inventory SHA-256, and base hashes for mutable legacy paths.
- Recovery is manual and selects one of five statically routed writer jobs, each under the established dimension concurrency group. It API-resolves only a completed failed/cancelled allowlisted source run and one exact live artifact ID, uses a clean full-history latest-main checkout, and validates repository/run/attempt/workflow/event/ref/SHA/job/workload/date/month/reservation/usage/target/parser/progress/path/inventory/hash identities before writes.
- Absolute paths, traversal, normalization aliases, unexpected members, missing members, duplicates, case collisions, links, junctions/reparse points, non-regular files, inside-checkout artifacts, zero consumption, sample/retry output, and immutable conflicts fail closed.
- Absent immutable usage and progress bytes restore together; identical bytes are a no-op. Mutable legacy paths restore only as one exact base-relative cohort. A structurally and target-validated strictly newer cache/CSV/scan-or-repair cohort is preserved; mixed, stale, incomplete, target-conflicting, or ambiguous state fails before immutable writes.
- Recovery writes from a detached exact remote SHA, stages only validated owned output, confirms remote `main` has not advanced, and pushes normally as a fast-forward. Remote advance or rejection starts a clean reconciliation attempt; no recovery pull, merge, rebase, automatic content merge, or force-push exists.
- The recovery workflow contains no TMDB secret, collector, reservation creation, target initialization, repair writer, or request-client path. Successful recovery, including an idempotent no-op, invokes the existing file-only publisher from latest main in a separate `tmdb-count-publication` job.
- Deterministic synthetic drills cover exact restore, repeat no-op, corrupt payload/manifest, wrong identities, unsafe paths and inventories, remote advance/rejection, same-file hybrid rejection, complete newer legacy preservation, mixed legacy failure, positive-usage reconciliation, and zero-consumption exclusion. Windows denied creation of the optional symlink probe locally; the hosted read-only Linux drill remains the required real artifact, expiry, and symlink gate. Issue #73 Actions references are pinned to reviewed full SHAs.
- Schedules, September 2026 activation, request allowances, partitions, production schemas, stable v1, Builder source, Worker, genre flow, dependencies, lockfiles, production data, and `nuvio-assets` remain unchanged. Existing monthly refreshes continue; any later activation decision remains separately reviewed and must not disable stable legacy refresh behavior unnecessarily.

### Preservation-safe native physical-source editing — issue #78

**Confirmed by focused deterministic repository tests, bounded local desktop/mobile browser QA, and completed owner Round 2 desktop/physical-iPhone review; current-client evidence pending — issue [#78](https://github.com/davecollections/tmdb-id-lookup/issues/78), reviewed 2026-08-03:** supported Movie Collection and People source cards expose an exact physical-source editor. The focused contract and remaining evidence gate are documented in [`BUILDER_SOURCE_EDITING.md`](./BUILDER_SOURCE_EDITING.md).

- A framework-independent registry resolves a source to a family adapter. Movie Collection and People own their draft, normalized identity, validation, and minimal patch rules without branching the controller, importer, serializer, or domain. Unsupported native, addon, and opaque sources retain Delete only.
- Movie Collection edits title and, only after explicit picker activation, the TMDB collection ID. Provider `tmdb`, `COLLECTION`, `MOVIE`, sort, and filters remain fixed. Merely opening/cancelling stays offline. Selecting another franchise immediately makes its canonical TMDB name the draft title and primary readable label, with `TMDB collection <id>` secondary; typing may customize it and **Use selected collection name** restores it.
- People keeps the person ID fixed while the physical source may change among `PERSON/MOVIE`, `PERSON/TV`, `DIRECTOR/MOVIE`, and `DIRECTOR/TV`. Approved default titles auto-follow role/media until manual typing makes them custom; **Use default title** restores session-local auto-management. The editor also owns `sortBy` only for stable-v1 `Popular`, media-specific `Recent`, and `Top rated`; untouched imported values preserve exact casing/value.
- People opens immediately from stored data, then reuses the shared issue #74 successful person-details cache or performs one bounded non-blocking combined-credit request. All four distinct cast/Director counts appear without refetching on choice changes; failure is sanitized and retryable, Save stays enabled, and no folder artwork request occurs.
- Title remains difference-only. Untouched missing, null, unusual, and custom imported values remain untouched; deliberate or approved automatic title intent must satisfy the existing Nuvio title rule, including the established intentional U+200E value. A real save patches only changed owned fields through exactly one `controller.updateNode` call and one revision. Cancel, unchanged save, failure, duplicate, and conflict paths make zero mutations.
- The edit session binds immutable project reference, exact collection/folder/source IDs, physical source index/category, adapter, and original identity. Save re-resolves and refuses deleted, moved, reordered, reclassified, identity-changed, or otherwise stale state rather than merging it.
- Duplicate identity is folder-local, excludes the edited physical source, and blocks only a changed identity. Existing imported duplicate identities therefore do not prevent a title-only or sort-only correction. Editing has no duplicate override. Duplicate, validation, and conflict failures use a prominent bordered alert; failed Save scrolls/focuses it and retains the draft.
- Existing source/folder order, raw IDs, unknown/community fields, addon projections, null/default fields, untouched sort/filters, presentation, compact/verbose representation, and unrelated sources survive deterministic and second-cycle checks. Builder internal/edit/count/title-mode state remains absent from serialization.
- The dedicated portalled modal uses natural content height on desktop/tablet, capped by the viewport with the action footer attached and one content scroll region only when needed. Below 900px it retains the established full-height surface, inert underlay, body lock, Visual Viewport geometry, sticky header/footer, safe areas, focus trap, Escape/Cancel, trigger restoration, alert focus, and mobile single-column patterns. Count resolution does not switch sizing modes. Success retains selection, returns focus to the exact source card, and uses a polite source-edit status.
- Add Source Collection Review and People Configure now turn only validated positive numeric collection/person IDs into canonical `themoviedb.org` entity links. The shared allowlist excludes Discover, watch providers, internal/unsupported types, and malformed IDs; links open in a new tab with `noopener noreferrer`, visible external indication, meaningful accessible names, keyboard focus styling, and long-name mobile wrapping.
- The sanitized manual package covers Collection identity/canonical-title change, People automatic-title/role/media/sort/count evidence, separate custom-title preservation, and one no-op cycle. Dave completed Round 2 desktop and physical-iPhone review and confirmed mobile passed; no device/version details were supplied or inferred. No Nuvio client result is claimed yet.

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
- `js/artwork-runtime.mjs` is deployed with the existing v1 `js/` tree and supports a thin v1 module adapter plus a future direct Vite import. Issue #45 itself did not change any consumer.

### V1 company and network artwork migration — issue #46

**Confirmed by repository tests, owner testing, and live development smoke verification — issue [#46](https://github.com/davecollections/tmdb-id-lookup/issues/46), refined 2026-07-22:** v1 company and network exports consume the shared published runtime and degrade automatically without changing v2 or people exports.

- `js/artwork-runtime-v1.mjs` creates one shared client per page and exposes only explicit company/network landscape batch resolution to the classic scripts. Module loading is harmless; runtime JSON loading remains lazy until a company/network export modal prepares its payload.
- Ready published artwork supplies the exact SHA-versioned runtime URL. `fallbackUsed: true` remains approved published artwork and always wins over the cached TMDB logo.
- Missing or unexpected non-ready results next use the selected cached entity's standard `w500` TMDB `logo_path` URL without a new API request and keep the title visible. Entities with neither image use an empty `coverImageUrl`, visible selected cached name, and 🎬/📺 fallback. This TMDB fallback is interim and remains outside the shared runtime.
- Runtime load or validation failure logs one concise warning and prepares the same valid TMDB-or-emoji fallback output. Copy/Download are disabled only during transient preparation; there is no technical count/error panel, artwork toggle, or manual retry loop.
- Prepared export caching preserves Copy/Download JSON and ID parity for unchanged selection/settings, deduplicates concurrent preparation, and invalidates on relevant changes. Company remains `COMPANY/MOVIE`; network remains `NETWORK/TV`; folder and preset order remain stable.
- The borrowed v1 network focus-GIF option, maps, URLs, and LuckyNumbers claims/credit were removed. Exported `focusGifUrl` remains empty and `focusGifEnabled` remains false; `focusGlowEnabled` and builder import/preservation support are unchanged.
- Ordinary v1 company/network lookup-table logos remain TMDB thumbnails. People runtime migration and Builder artwork consumption remain pending.
- The existing tomato transparent-covers credit is retained temporarily because the older self-hosted genre artwork commits do not record per-asset provenance. The artwork project should confirm whether any current genre assets derive from that pack before the credit is removed.

### Strict artwork runtime v1/v2 resolver compatibility — issue #55

**Confirmed by repository tests against the separately reviewed assets-side schema-v2 contract — issue [#55](https://github.com/davecollections/tmdb-id-lookup/issues/55), 2026-07-26:** the shared consumer resolver now accepts exactly numeric runtime schema versions 1 and 2. At the issue #55 merge checkpoint, the live `nuvio-assets` runtime was still schemaVersion 1.

- Schema v1 remains unchanged: Company and Network support Landscape only, while Person supports Landscape and Poster.
- Schema v2 preserves those orientations and adds required Network Poster. Every v2 Network entry must contain both Landscape and Poster. Company Poster remains unsupported in both versions.
- Required artwork paths must exactly match the entity family, entry ID, and orientation: Company and Network Landscape retain their existing paths; Network Poster uses `assets/collection_covers/networks/poster/{id}.webp`; Person retains separate `people/landscape/` and `people/poster/` paths.
- Missing required orientation data, forbidden orientation data, exact path mismatches, malformed schema versions, and non-lowercase or non-64-character SHA-256 values remain hard validation failures with stable resolver error codes. A valid unsupported orientation request remains the non-error `unsupported-orientation` result.
- Ready URLs retain `?v=` plus the first 12 characters of the exact orientation SHA-256. Existing schema-v1 ready, missing, unsupported, cache, retry, and result-shape behaviour remains unchanged.
- `js/artwork-runtime-v1.mjs` remains company/network Landscape-only with the same public batch interface. Tests prove that it consumes both v1 and test-only v2 lookups without selecting Network Poster.
- Cached company/network exports remain byte-identical between equivalent v1 and test-only v2 lookups, preserve configured nonblank backdrop artwork and existing fallback order, and require no production exporter change.
- At that checkpoint, runtime v2 had not been published by issue #55; its tests used explicit test-only v2 fixtures, and assets publication still required its own review, push, merge, and atomic publication process. Network Poster was not exposed in Builder UI, source creation, Search/Add, templates, recipes, or stable v1 exports.

### Live artwork runtime v2 publication — assets PR #3

**Confirmed by the completed assets publication and bounded live verification — assets [PR #3](https://github.com/davecollections/nuvio-assets/pull/3) and TMDB issue [#57](https://github.com/davecollections/tmdb-id-lookup/issues/57), 2026-07-26:** runtime schemaVersion 2 is now publicly live with `status: "published"`.

- All 572 Network entries contain published Landscape and required Poster data. Network Landscape paths remain `assets/collection_covers/networks/{id}.webp`; Network Poster paths use `assets/collection_covers/networks/poster/{id}.webp`.
- Company retains Landscape only and Company Poster remains unsupported. Person retains both Landscape and Poster.
- The shared TMDB resolver passed live validation and representative Company, Network and Person resolution against the published runtime. The external v1 bridge also passed live verification, remains Company/Network Landscape-only, does not select Network Poster, and continues to reject Person.
- Builder UI, source creation, Search/Add, templates and recipes do not yet consume Network Poster. Stable v1 company/network exports remain Landscape-only.
- The release is `studio-network-posters-v2-2026-07-26`, published at `2026-07-26T03:19:39.353Z`. It contains 1,820 companies, 572 networks and 817 people: 3,209 entities and 4,598 assets.
- The runtime SHA-256 is `3b04e76eec24922c59404712a46245ff9fd8da1c7c1f508c19f6f69d4884f4af`, with fingerprint `900b25771f70365218754af18588ed1212e7669903027795d613eb427c143c58`.
- The studio/network manifest SHA-256 is `9c214428194d24653892177919f60d3e070b6f5d9491aac4bd70045bae5c7079`, with fingerprint `b1460d79e4ecc73a836676c85a1294bd424af4d58c69014e352073b830d4098c`.
- Publication commit [`815c0d5ada61c88a8f681cd12edaa8932ea320e4`](https://github.com/davecollections/nuvio-assets/commit/815c0d5ada61c88a8f681cd12edaa8932ea320e4) was merged as [`d34560a06469ce13af6fe1a3a5b299ffb3748560`](https://github.com/davecollections/nuvio-assets/commit/d34560a06469ce13af6fe1a3a5b299ffb3748560). These release values are recorded evidence rather than hardcoded consumer rules.

## 13. TMDB Discover compatibility audit — issue #47

**Confirmed from official TMDB documentation/OAS, pinned NuvioTV/NuvioMobile source, and repository tests — issue [#47](https://github.com/davecollections/tmdb-id-lookup/issues/47), 2026-07-23:** the Discover compatibility boundary is now normalized without expanding production schema or UI.

- Official inventories contain 38 Movie and 33 TV parameters, including request controls and `sort_by`; filter/context subsets are 35 and 29.
- Current Nuvio collection JSON has 14 common filter fields, 0 TV-only fields, and 0 Mobile-only fields. Static request construction maps 13 fields to official Movie parameters and all 14 to official TV parameters.
- Movie has 22 and TV has 15 official filter/context parameters that are not independently controllable through current JSON. Automatic localization/pagination and hidden provider monetization behavior remain distinct from user fields.
- Both pinned current clients accept raw `sortBy`; all 14 official Movie and 12 official TV values can reach the correct endpoint in code, but only four per media are offered in current client editors. Owner evidence now covers the official S1/S2/S3/S4C/S5/S6C rows on two specific builds; other official sorts and current-client parity remain pending.
- Owner-supplied current Windows editor screenshots visually confirm the same 14 fields, the four visible sort choices, the Movie-visible “For series only” Network IDs helper, and explicit genre/provider comma-AND and pipe-OR help. The exact app version was not captured, so this is UI-only evidence and does not change any static or controlled-result count; language/country comma placeholders remain non-authoritative.
- Owner-controlled 2026-07-23 testing covered 29/29 sources on Nuvio Desktop `0.1.14-alpha` (14), Windows 11 Home 25H2 build `26200.8875`, and 29/29 on retained official iOS `1.2.23` (96). The retained official build was previously installed before distribution was removed, with no sideload; it is frozen historical evidence rather than current/future NuvioMobile proof. NuvioTV remains 0/29 pending because a practical device run was unavailable.
- Controlled pairs visibly distinguished M2/M1, T2/T1, W2/W1, genre AND/OR, keyword AND/OR, and provider AND/OR on both tested builds. S3 `original_title.asc` worked on retained iOS but produced an endless spinner on Desktop alpha; date aliases matched correct-media comparators; S7/S8 matched the popularity baseline without identifying the fallback layer.
- The earlier unpaired Shark Movies observation remains valid at its narrower unknown-client/version scope. A3/A4 now add build-scoped paired keyword evidence, but neither observation becomes universal current-both-client proof.
- NuvioTV alone adds `with_status=0|3|4` and a null-to-current-date upper bound for native NETWORK sources. Mobile alone sends Movie `withNetworks`; NuvioTV omits it.
- NuvioTV typed persistence and Desktop alpha import/export drop unknown filter keys. Pinned current NuvioMobile source accepts them during decode but loses the entire unknown nested portion through a shallow `filters` overlay. Retained official iOS `1.2.23` (96) instead preserved U1–U6 in Copy/Export without visibly applying them; preservation does not prove forwarding. The builder preserves unknown imported filter keys on unrelated edits, but that does not make them usable or durable in Nuvio.
- The builder still recognizes the same 14 fields, validates only a plain filter object, preserves raw imported data through its overlay, and exposes no source/filter editing UI. No builder preservation defect was found and no production code changed.
- The manual package contains a deterministic combined fixture that is the exact ordered concatenation of four retained component collections: 4 collections, 4 folders, 29 sources total, 19 essential. A generated presentation-only variant retains the same collection/source objects and order in 29 one-source folders for clients that import without multiple source tabs. The alternate is recorded separately and does not double the 29-source audit count.
- Desktop export preserved recognized fields/order, normalized structure/default/null fields, removed U1–U6, and retained raw sorts. Retained iOS Copy/Export preserved all unknown/provider/raw/alias/unofficial/invalid values on both fixture shapes without source/folder loss.
- A Nuvio.tv account-management profile export removed provider/region and U1–U6 fields, changed S2/S3/S5/S8 sorts, retained S4/S4C/S6/S6C/S7, and added structural/default fields. The responsible layer was not isolated, so this remains pipeline evidence rather than attribution to iOS sync, account storage, web normalization, or export serialization.
- Direct TMDB evidence remains pending because no local bearer token was available. The offline plan contains exactly 60 bounded requests at its hard cap, including exact US/AU provider-8 effective-query shapes and the required all-monetization union on every provider case; no live request is part of repository checks.

## 14. V2 collection compatibility regression corpus — issue #49

**Confirmed by repository tests — issue [#49](https://github.com/davecollections/tmdb-id-lookup/issues/49), 2026-07-24:** the builder now has a small, manifest-driven, file-backed compatibility corpus that connects the existing focused import, domain, migration, serialization, validation, ID, and controller contracts without changing production modules.

- Eight manifest entries separate canonical, preservation, identity, migration, and invalid pipelines and record counts, exact traversal/projection order, diagnostics, assertion mode, field policy, coverage tags, and references to existing Discover and migration evidence.
- The compact canonical profile covers all seven supported native TMDB types across the evidence-backed Movie/TV combinations plus basic, genre, multiple, and duplicate-identity addon projections in two ordered collections, three folders, and fifteen sources.
- The comprehensive preservation profile combines native, addon, imported Trakt, and opaque/community evidence across two collections, three folders, and six sources. It covers presentation/artwork fields, raw-only collection/source fields, unknown fields at every supported preservation level, missing/null/empty/false/zero distinctions, Discover-filter replacement, and stable second-cycle serialization.
- File-backed identity cases distinguish permissive direct import from deterministic controller repair of missing, invalid, whitespace-padded, non-string, and duplicate collection/folder IDs. Builder-only internal IDs remain unique and absent from output, while serializer-required ID/title diagnostics stay explicit.
- A controller removal/insertion case proves stable unaffected-source order, removal of the deleted source and its raw evidence, and no transfer of that evidence to the inserted source or projection.
- The corpus reuses the issue #37/#38 projection-only addon migration and Desktop artifacts, asserting deterministic promotion order, exact `"None"` to `null` normalization, unknown projection preservation, and migration idempotence. It also reuses the issue #31 invalid fixtures instead of duplicating them.
- Ten focused tests validate the manifest, fixture coverage, taxonomy, safety, Pages exclusion, exact/semantic/targeted policies, round trips, migration, and validation diagnostics. No production module, dependency, v1 runtime, Worker, route, or deployment policy changed.
- No confirmed source-artwork field exists in current repository or client evidence. The corpus records that boundary and does not invent one.

## 15. Official Nuvio API and integration boundary

**Confirmed by current official Nuvio documentation, reviewed 2026-07-25:** the [Nuvio Public API](https://nuvio.tv/docs) documents Supabase-based email/password authentication, access/refresh tokens, up to six profiles, profile-scoped resources, and collection pull/push operations. A collection push replaces the profile's complete `collections_json` blob; omission removes collections and an empty array clears it. No separate collection import, merge, or targeted-update endpoint was identified on the reviewed page. This confirms an authenticated collection transport, but not a safe merge/update UI, device-pairing contract, or approved Builder credential-storage design.

The official API's small addon-backed collection example is not presented as a complete collection-source schema. It does not override repository tests and manual evidence that `sources` is authoritative and `catalogSources` is an addon compatibility projection/fallback.

Keep three manifest/source concepts separate:

- **Collection sources** are source objects inside Nuvio collection/folder JSON and follow this repository's evidence-backed source rules.
- **Stremio-style addons** are profile-scoped addon manifest URLs documented by the API's addon sync.
- **Nuvio integrations/plugins** are supplementary profile-scoped URLs. The separate [Nuvio Integration Development Guide](https://nuvio.tv/docs?doc=plugins-repo) documents repository `manifest.json` files that register integration JavaScript for local Hermes execution.

The API documents addon and plugin sync as full-replace operations too. Plugin-repository manifests are not collection sources or Stremio addon manifests, and plugin repositories are not core TMDB Collection Builder scope. The official account page at [nuvio.tv/account/login](https://nuvio.tv/account/login) confirms an account-management surface for synced integrations and collections, but it was not used for authenticated testing. The reviewed public documentation did not establish device-pairing endpoints or behaviour; device pairing remains unverified.

## 16. Roadmap checkpoint

The current dependency-aware sequence is:

1. product/workflow recovery — complete;
2. collection/folder presentation settings and owner-review corrections — complete on the issue branch;
3. focused Dave UI/flow review and independent follow-up review — complete for issue #53;
4. bulk presentation settings remain desired but deferred to a separate focused issue;
5. collection/folder/source reordering — integrated through issue #59 / PR #60, with Windows evidence-check hardening through issue #61 / PR #62; owner local review and the bounded Desktop/web/mobile/TV evidence gate are complete;
6. persistent hierarchy creation and safe deletion — implemented on issue #63's branch pending owner desktop/mobile review;
7. first source creation and Search/Add — issue #65 owner UI and current Nuvio Desktop evidence gates complete on the dedicated branch; integration remains subject to the normal owner commit/PR workflow;
8. Collection and Folder settings polish — implemented on issue #69's branch with independent and owner UI/flow review pending.
9. Unified People Search/Add — implemented on issue #74's dedicated branch; the first Desktop source-contract evidence passed, then the regenerated distinct-title/curated-artwork fixture passed owner visual/import/immediate-export validation. Both curated Posters, all four distinct tabs, populated Acting/Directing catalogues, exact SHA-versioned URLs, `hideTitle: true`, IDs, grouping, source order, and native `catalogSources: []` survived; the client version/build remains unknown.
10. Native physical-source editing — implemented on issue #78's dedicated branch for Movie Collection and People through a registry/adapters seam. Focused checks, bounded local desktop/mobile browser QA, and the sanitized fixture package pass; owner review plus current-client edit/import/export evidence remain pending.

Quick Setup, Dave's 1-Click Setup, templates/recipes, the Kaptain comparison, privacy positioning, branding, and optional Nuvio connection are product-plan topics in [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md). They do not change the current technical implementation gate.

## 17. Open questions

- Can a future Nuvio source model support direct individual movies or series?
- Can multiple direct item references ever be exposed as a folder source?
- Which build-scoped Discover observations reproduce on current NuvioTV and current NuvioMobile?
- How should existing v1 exporters be consolidated without changing output?
- Which future controls need explicit property-removal semantics beyond assigning supported empty or null values?
- How should known TMDB list IDs be validated?
- How should future public TMDB list search slot into the architecture?
- Can the documented full-replace collection API support a safe product-level Add, Merge, or targeted Update journey, and what backup/conflict protocol would be required?
- Does Nuvio publish a supported device-pairing or browser-handoff contract suitable for third-party builders?

## 18. Update rules

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
| 2026-07-22 | V1 company/network lazy runtime consumption, automatic curated/TMDB/emoji fallback, async preparation, Copy/Download parity, and focus-GIF removal | [TMDB ID Lookup issue #46](https://github.com/davecollections/tmdb-id-lookup/issues/46) |
| 2026-07-23 | Official TMDB Discover inventory/OAS, pinned NuvioTV `dev` and `0.7.19-beta`, pinned NuvioMobile `cmp-rewrite` and `0.3.1`, builder preservation audit, normalized compatibility matrix, bounded manual/direct test plans, and 29/29 owner observations on Desktop alpha plus retained official iOS | [TMDB ID Lookup issue #47](https://github.com/davecollections/tmdb-id-lookup/issues/47), [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md), and [`OWNER_RESULTS_2026-07-23.md`](../../manual-tests/tmdb-discover/OWNER_RESULTS_2026-07-23.md) |
| 2026-07-24 | Manifest-driven canonical, preservation, identity, migration, and invalid profile corpus connecting current builder compatibility contracts without production changes | [TMDB ID Lookup issue #49](https://github.com/davecollections/tmdb-id-lookup/issues/49) and [`v2-compatibility/README.md`](../../tests/fixtures/nuvio/v2-compatibility/README.md) |
| 2026-07-24 | Full owner-supplied V1 and V2 conversation histories, reviewed to recover explicit product and workflow intent without committing or reproducing the exports | Private owner-supplied research evidence for [issue #51](https://github.com/davecollections/tmdb-id-lookup/issues/51) |
| 2026-07-25 | Current public authentication, profiles, full-replace collection sync, addon/plugin sync, account-management surface, and integration-repository boundary | [Nuvio Public API](https://nuvio.tv/docs), [Nuvio Integration Development Guide](https://nuvio.tv/docs?doc=plugins-repo), and [Nuvio account login](https://nuvio.tv/account/login) |
| 2026-07-25 | Collection/folder presentation defaults, direct per-card Edit actions, responsive inert-background modal, collection/folder U+200E creation, three-outcome folder title visibility, imported hidden-title preservation, home-screen-only `hideTitle` scope, collection `focusGlowEnabled`, touched-only canonical patches, Follow Layout/Square preservation, accessible fallbacks, and serializer-cycle preservation | [TMDB ID Lookup issue #53](https://github.com/davecollections/tmdb-id-lookup/issues/53) |
| 2026-07-26 | Strict numeric artwork runtime schema-v1/v2 dispatch, exact entity/ID/orientation paths, v2 Network Poster requirements, unchanged v1 adapter interface, and cached-export parity against test-only v2 fixtures | [TMDB ID Lookup issue #55](https://github.com/davecollections/tmdb-id-lookup/issues/55) and the separately reviewed `nuvio-assets` commits `366bb3e` / `f627428` |
| 2026-07-26 | Completed public artwork runtime-v2 publication, all 572 Network Landscape/Poster records, release hashes and counts, and live shared-resolver/v1-bridge verification | [`nuvio-assets` PR #3](https://github.com/davecollections/nuvio-assets/pull/3) and [TMDB ID Lookup issue #57](https://github.com/davecollections/tmdb-id-lookup/issues/57) |
| 2026-07-27 | Compact pointer/touch and keyboard collection/folder/source reordering plus bounded Desktop/web/mobile/TV ordering evidence, exact Desktop/web exports, explicit mobile raw-artifact and TV no-export limitations, deterministic normalization checks, and completed same-issue client gate | [TMDB ID Lookup issue #59](https://github.com/davecollections/tmdb-id-lookup/issues/59) and [`issue-59-builder-reordering/`](../../manual-tests/nuvio-clients/issue-59-builder-reordering/) |
| 2026-07-28 | Persistent populated-list collection/folder Add actions; viewport-aware body-portalled collection/folder/source menus with upward flipping and no-scroll initial focus; mobile context quick rename; mandatory source confirmation; imported/projection-aware collection/folder confirmation; deterministic selection/mobile/focus recovery; addon projection removal; canonical and second-cycle stability | [TMDB ID Lookup issue #63](https://github.com/davecollections/tmdb-id-lookup/issues/63) |
| 2026-07-29 | First selected-folder Search/Add flow; final owner physical-iPhone acceptance; successful current Nuvio Desktop import, Harry Potter runtime resolution, and exact immediate export; bounded `original`/descending/unsupported-ascending sort observations; strict exact input, TMDB-backed result classification, normalized poster/contained-title review data, visible selection failure recovery, robust Worker configuration and async contracts; exact native `COLLECTION` recipe; duplicate/submit protection; and isolated mobile Visual Viewport coverage | [TMDB ID Lookup issue #65](https://github.com/davecollections/tmdb-id-lookup/issues/65), [`BUILDER_SOURCE_ADD.md`](./BUILDER_SOURCE_ADD.md), and [`issue-65-builder-add-source/`](../../manual-tests/nuvio-clients/issue-65-builder-add-source/) |
| 2026-07-30 | Exact Collection source-presentation wording, `Tabs (recommended)` over unchanged `TABBED_GRID`, hidden focus-glow control with true manual default and preservation-first import/export behavior, Folder Basic details/Display groups, compact title-visibility radios, visual tile-shape cards, and no Artwork controls/schema expansion | [TMDB ID Lookup issue #69](https://github.com/davecollections/tmdb-id-lookup/issues/69) |
| 2026-07-31 | Reuse-first typed Company Movie, Company Series, and Network Series maintenance contract; total-TMDB request reservations; immutable progress; strict count semantics; compact range-based sidecar; and last-known-good automatic publication, without a Builder consumer | [TMDB ID Lookup issue #71](https://github.com/davecollections/tmdb-id-lookup/issues/71) and [`ENTITY_TITLE_COUNT_PIPELINE.md`](./ENTITY_TITLE_COUNT_PIPELINE.md) |
| 2026-08-05 | Requested-90-day collect-writer artifacts with API-recorded expiry; canonical manifest, payload and inventory hashing; exact API/run/reservation/usage/target/progress identity validation; no-rebase compare-and-swap recovery; complete newer legacy-cohort preservation; idempotent no-op; and zero-request publication, with hosted drill pending | [TMDB ID Lookup issue #73](https://github.com/davecollections/tmdb-id-lookup/issues/73) and [`ENTITY_COUNT_RECOVERY.md`](./ENTITY_COUNT_RECOVERY.md) |
| 2026-08-01 | Unified People Search/Add final owner refinement; untouched-default-folder atomic promotion; preservation-only existing folders; stable v1 tab titles; one final artwork representation; per-person/context artwork isolation; successful first Desktop source-contract run; subsequent regenerated SHA-versioned curated-art fixture visual/import/immediate-export acceptance; and explicit asset-gap tracking | [TMDB ID Lookup issue #74](https://github.com/davecollections/tmdb-id-lookup/issues/74), [`BUILDER_PEOPLE.md`](./BUILDER_PEOPLE.md), and [`issue-74-builder-add-people/`](../../manual-tests/nuvio-clients/issue-74-builder-add-people/) |
| 2026-08-02 | Registry-backed physical Movie Collection and People source editing; automatic/default/custom title intent; bounded People count/cache reuse; evidenced People sort editing; bounded identity changes; prominent duplicate/stale/validation alerts; exact-target/stale-state and same-folder duplicate guards; one-shot minimal controller updates; raw/unknown/order/projection preservation; responsive accessible modal; and a sanitized pending client-evidence package | [TMDB ID Lookup issue #78](https://github.com/davecollections/tmdb-id-lookup/issues/78), [`BUILDER_SOURCE_EDITING.md`](./BUILDER_SOURCE_EDITING.md), and [`issue-78-source-editing/`](../../manual-tests/nuvio-clients/issue-78-source-editing/) |

## Decision history

- **2026-08-06 — TMDB attribution release gate:** make V1 attribution compliant with the official TMDB mark and exact notice; record the same visible attribution as mandatory V2 shell work before `noindex` removal, release, or public promotion; and keep V2 UI implementation outside issue #85.

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
- **2026-07-21 — V1 company/network runtime migration:** route classic company and network export artwork through one thin module adapter and the shared runtime; prepare and cache exports asynchronously; accept published text fallbacks; use visible title/emoji for missing or disabled artwork; block and retry runtime failures; remove borrowed focus animations; and leave people plus v2 consumption deferred.
- **2026-07-22 — V1 automatic artwork refinement:** remove runtime-facing artwork controls and permanent status panels; automatically prefer published curated landscape artwork, then cached TMDB logos with visible titles, then title/emoji; degrade runtime failures into valid fallback exports; keep transient preparation feedback and Copy/Download parity; and leave the shared runtime, people migration, v2 integration, and tomato provenance question unchanged.
- **2026-07-23 — Discover compatibility boundary:** treat official TMDB acceptance, client deserialization, request construction, hidden transformations, persistence, direct result effects, and visible device effects as separate evidence levels; retain the 14-field production contract unchanged; use the generated row-level matrix as the normalized research source; and defer all UI/schema expansion until bounded owner evidence and a separately approved issue.
- **2026-07-23 — Discover owner-evidence checkpoint:** retain the official counts, 14-field contract, and static mappings; record the complete Desktop alpha and retained official iOS runs as build-specific observations; add a deterministic one-source-per-folder presentation without changing source identity or aggregate counts; keep NuvioTV/direct TMDB pending; and attribute account-export changes only to the observed pipeline until its responsible layer is isolated.
- **2026-07-24 — Profile-level compatibility corpus:** connect existing focused builder contracts through a small manifest-driven fixture taxonomy; use exact equality only for intentional canonical output, semantic cycle stability for preservation profiles, and targeted assertions for identity, removal, migration, and invalid boundaries; reuse the existing Discover and addon-migration artifacts; and retain a strict test-only production boundary.
- **2026-07-24 — Product and workflow history recovery:** review the complete owner-supplied V1 and V2 conversation exports to recover explicit product and process intent; reconcile it through current implementation, tests, manual evidence, and GitHub history; preserve unaccepted proposals as proposals or open decisions; and keep the private exports and conversational material outside the repository.
- **2026-07-25 — Official Nuvio documentation review:** recognise the documented authenticated, profile-scoped, full-replace collection transport while keeping optional connection design deferred; distinguish collection sources, Stremio-style addon manifests, and Nuvio plugin-repository manifests; keep plugin repositories outside core Builder scope; and leave device pairing, safe merge/update semantics, token handling, and recovery unverified.
- **2026-07-25 — Collection and folder presentation settings:** after owner visual review superseded the original inline-editor direction, place one compact Edit action on every collection and folder card and remove the Rename/Settings pair, then-current quick rename, and large selected-entity blocks; directly target unselected cards without dirtying or advancing revision; use one responsive, focus-contained modal over an inert workspace; describe Tabs/Rows as each folder's source presentation and limit the visible All tab to tabbed folders with two or more sources; allow deliberate U+200E creation for both collection titles and folder titles while preserving imported repeated values; combine the folder's title and native home-screen-only `hideTitle` behavior into Show everywhere, Hide on home screen only, and Hide everywhere outcomes with restoration and minimal-patch guarantees; default manual folders to `hideTitle: true`; retain conditional All-tab preference, Pin to top, Poster/Landscape, Follow Layout/Square preservation, and touched-only `updateNode` patches; recognise collection-level `focusGlowEnabled` with a true manual default and preservation-first imported behavior; retain desktop creation drill-down while mobile collection/folder creation stays at its current hierarchy level through the shared 900px UI breakpoint; simplify startup wording around collections without changing import contracts; defer artwork/focus-GIF controls, bulk settings, and reordering; recommend a separate reordering milestone before Search/Add; and require focused owner review before PR consideration. Issue #63 later supersedes only the action placement and introduces a smaller mobile context rename variant.
- **2026-07-26 — Strict artwork runtime v1/v2 compatibility:** accept exactly numeric shared runtime schemas 1 and 2; preserve v1 results and URL versioning; require exact entity, ID, and orientation paths; reject forbidden Company Poster and v1 Network Poster data; require both Network orientations in v2; keep the classic adapter and cached exporter Landscape-only; and leave the live schema-v1 runtime, Builder controls, assets, and publication process unchanged.
- **2026-07-26 — Live artwork runtime v2 publication:** adopt the completed assets PR #3 publication as the current public baseline; record its release identity, counts, hashes and fingerprints as evidence rather than consumer rules; keep Company Poster unsupported and the external v1 bridge Landscape-only; and leave Builder Network Poster consumption, UI and source creation for a separate issue.
- **2026-07-26 — Accessible hierarchy reordering:** add one compact six-dot handle to existing collection, folder, and source rows for pointer/touch dragging plus Enter/Space and Arrow-key reordering; keep pinned and ordinary collections as stable visible groups and map final visible destinations back to authoritative raw-array indices; preserve parent/category boundaries, stable internal identity, selection, raw/unknown/artwork/projection evidence, and serialized order; retain exactly one revision for a changed drop or keyboard move and none for hover, cancellation, invalid boundaries, or same-position movement; keep focus on the moved handle and announce successful moves politely; remove the redundant Selection details surfaces; and defer Nuvio client evidence, bulk movement, Search/Add, artwork-runtime consumption, client packages, PR, and release work until the required review gates.
- **2026-07-27 — Reordering client-evidence checkpoint:** accept the bounded Desktop and web visual-plus-exact-export results, the mobile visual-plus-export-text result with no raw artifact or hash, and the TV visual-plus-synced-web result with no independent export; constrain observed normalization without treating sentinel loss as order loss; mark the issue #59 client gate complete; and retain the separate owner approval requirement before creating a PR or beginning Search/Add.
- **2026-07-28 — Persistent hierarchy creation and safe deletion:** retain the existing header and empty-state creation actions while adding secondary collection/folder Add rows below populated lists; replace the external Edit/Delete rail with one reusable in-card overflow menu; portal the measured menu below modal layers, place it within current Visual Viewport bounds with upward flipping and a 10px margin, and focus without automatic page scroll; add mobile selected-context quick rename with preservation-correct invisibility switches; confirm every source deletion and only populated/import-bearing collection/folder deletions; calculate visible-order selection, mobile level, and focus recovery before one existing `removeNode` mutation; rebuild addon projections from surviving authoritative sources; and keep source Add/Search, source creation/editing, bulk operations, undo/redo, broader presentation, artwork runtime, Network Poster, v1, Worker, Pages, workflow, dependency, and assets work deferred.
- **2026-07-29 — First Add Source slice and owner-acceptance checkpoint:** show Add Source only for a selected folder; expose only Movie franchise · TMDB through explicit Search and Review stages in one responsive, body-portalled, focus-contained dialog; accept title search or strict exact collection ID/URL input; resolve through only the existing collection Worker routes with `include_adult=false`, exclusion only for search result objects explicitly marked `adult: true`, provider-returned result admission/order, no custom word classifier or age guarantee, safe poster paths, ordered contained titles, Search-resident selected-result loading and visible failure recovery, abort, timeout, monotonic stale protection, conditional pagination, retry, rate-limit handling, and bounded success-only memory caching; derive and strictly validate the Worker HTTPS origin from the stable v1 configuration at Builder build time without executing it; keep poster/title-part data UI-only; construct and semantically validate exactly one native `COLLECTION`/`MOVIE` recipe with serialized `sortBy: "original"` and visible `TMDB-provided order`; bind Add anyway to the exact current duplicate identity and gate rapid submission synchronously; preserve Search state on Back; isolate opaque mobile layout-viewport and Visual Viewport coverage above Builder layers; establish body lock/geometry pre-paint; constrain the uncropped mobile poster to 180–220px; restore exact body state; perform one existing controller source insertion plus selection-only focus recovery; preserve raw data and addon projections; accept the completed owner physical-iPhone gate and successful current Nuvio Desktop import/runtime/immediate-export evidence; record `original` as TMDB API order, descending release date as working newest-first, and ascending release date as unsupported/falling back; and leave all later providers, source editing, Quick Add/multi-add, bulk lookup, suggestions, sort controls, automatic hierarchy/artwork controls, v1, Worker, Pages, dependency, workflow, and assets changes deferred.
- **2026-07-30 — Collection and Folder settings polish:** keep the issue #53 recognised fields, defaults, minimal-patch lifecycle, and export meanings; present `TABBED_GRID` as **Tabs (recommended)** beneath the approved Collection heading/helper; remove only the user-facing focus-glow control while retaining explicit-true manual creation and exact imported missing/true/false/unusual preservation; group Folder Title under **Basic details** and visibility/shape under **Display**; use compact native visibility radios and CSS-preview shape cards with non-colour selected state; add only a reusable semantic-section seam for future groups; and leave Artwork, source editing, provider expansion, recipes, V1, Worker, dependencies, Pages, and assets unchanged.
- **2026-07-31 — Typed entity title counts:** keep the existing Company days 1–14 process authoritative for Company details/Movie counts and the Network days 1–2 process authoritative for Network details/Series counts; add Company Series days 15–28 as the only new full-data pass; activate scheduled typed production collection in September 2026 (with no automatic August catch-up); count all TMDB API/export attempts and retries through run/date/month/dimension-bound immutable UTC-date reservations while protecting the unchanged 36-request genre schedule; share one frozen Company target across both Company dimensions; use immutable slices/patches and strict positive/zero/failed/unavailable semantics; and atomically publish a compact combined sidecar only when every dimension is complete. Leave `builder/src/` integration deferred until real data exists.
- **2026-08-05 — Durable typed writer recovery correction:** keep the established monthly collectors, reservations, usage, progress, maintenance commit action, publication, schedules, activation, allowances, partitions, and Company/Network count semantics; API-resolve only completed failed/cancelled allowlisted source runs and exactly one live artifact; bind readiness, workflow file, event, main ref/head SHA, and collect-package mode into the canonical manifest; prove packaged bytes against normal worktree/index/commit trees; recover through a dedicated clean-latest-main no-rebase compare-and-swap push; validate complete scan or repair legacy producer cohorts without mixing evidence; pin issue #73 Actions to immutable SHAs; and provide a read-only fixture-only cross-run hosted drill. Retain the Company total plus Movie and Series outcome, leave Network redundancy undecided, exclude Networks from the later separately approved Company live smoke, and defer the read-only Network comparison until after issue #73.
- **2026-08-01 — Unified People Search/Add final owner refinement:** promote only empty Builder-generated Untitled defaults, with canonical person title, final artwork, and sources in one rollback-safe revision; preserve every non-eligible destination; use stable v1 role/media source titles; show only final applied artwork for new/promoted folders; key artwork by exact person and context; record missing curated assets by exact identity; retain the first Desktop run as source-contract evidence; retain the subsequent regenerated-fixture owner visual/import/immediate-export acceptance as final artwork and tab evidence; defer generic multi-item creation and native source editing; and leave v1, Worker, Company/Network, Basic Discover, dependencies, production data, and assets unchanged.
- **2026-08-02 — Same-network owner preview transport:** RFC1918 HTTP preview origins route Builder TMDB requests through a reserved Vite development/preview proxy on the same PC. The proxy forwards only to the existing Worker, which retains its current method/path validation and receives an already-approved localhost development origin. GitHub Pages and localhost behavior remain direct, and no Worker route, production CORS allowlist, credential, dependency, or production-data change is involved.
- **2026-08-02 — People final Nuvio Desktop acceptance:** accept the regenerated issue #74 fixture as owner-validated current Desktop evidence for curated Tom Hanks/Steven Spielberg Posters, hidden external titles, distinct stable-v1 source tabs, populated Acting/Directing Movie/TV catalogues, canonical grouping/order, and immediate-export preservation. Retain the supplied expanded export as reproducible evidence; record the unreported client version/build as unknown rather than inferring it; and keep v1, Worker policy, dependencies, production data, and `nuvio-assets` unchanged.
- **2026-08-02 — People mobile search-card refinement:** retain every valid TMDB `known_for` entry in normalized provider order, render at most the first three on desktop, and use the existing 520px CSS breakpoint to show only the first row on mobile. Allow its title to wrap without ellipsis or horizontal overflow, retain supplied media/year metadata, omit the row when absent, and add no sorting, total inference, responsive data mutation, or request.
- **2026-08-02 — First native physical-source editing, owner-approved Round 2:** expose Edit source only for recognised Movie Collection and People sources; keep the editor registry and per-family draft/validation/patch logic framework-independent; bind one exact physical source and reject stale project, parent, order, category, adapter, or identity state; auto-apply a newly selected Collection's canonical name while preserving Cancel/custom/reset behavior; auto-manage only approved People default titles until manual customization; reuse the shared bounded successful People count cache/request without artwork or Save blocking; expose only stable-v1 Popular/Recent/Top-rated People sorts while preserving untouched imported values; render and focus prominent duplicate/validation/stale alerts; reject changed folder-local duplicates without an override; delegate a real minimal patch through one existing controller update and keep no-op/failure paths mutation-free; preserve raw/unknown IDs, ordering, projections, defaults, filters, presentation, and deterministic cycles; prepare but do not fabricate current-client evidence; and leave logical bundle editing, additional adapters, Collection sort/filter controls, v1, Worker, dependencies, workflows, production data, and `nuvio-assets` unchanged.
