# TMDB ID Lookup v2 — Builder Knowledge Base

Status: Planning and contract groundwork

Last reviewed: 2026-07-11

This is a living record of confirmed v2/Nuvio findings, current decisions, unsupported behaviour, and open questions. GitHub issues remain the source of truth for implementation scope.

## 1. Product direction

- v1 is working and stable.
- v2 changes the product from primarily an ID lookup/export utility into a visual Nuvio Collection Builder powered by TMDB.
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

`scripts\check.cmd` remains the Windows entry point. It and the dedicated GitHub Actions workflow both execute `node scripts/check-all.mjs`, which runs the frontend checks and the Nuvio contract, builder domain, importer, serializer, and migration tests without secrets or network requests.

## 10. Current architecture decision

- Preserve v1 at the repository root.
- Keep builder source and dependencies isolated under `builder/`; no root npm package is needed.
- Use `builder/dist/` only as generated local/CI output and `.pages-site/` only as generated combined deployment staging. Neither directory is committed.
- Use Vite's relative `./` base so generated JavaScript, CSS, and imported local assets resolve from `/tmdb-id-lookup/builder/` without hard-coding the repository name or incorrectly targeting `/assets/` at the domain root.
- The Pages staging process preserves tracked v1 files at the artifact root and replaces the public `builder/` path with the contents of `builder/dist/`, producing `.pages-site/index.html` and `.pages-site/builder/index.html` without a public `builder/dist/` level.
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
- Twenty migration test functions plus the unchanged regression suites cover the 76 requested migration, integration, fixture, and regression behaviours. The newly generated sanitised migration output still requires a recorded Nuvio Desktop follow-up; existing private pairs are the current manual client evidence.

## 11. Open questions

- Can a future Nuvio source model support direct individual movies or series?
- Can multiple direct item references ever be exposed as a folder source?
- Which Discover filters work identically across mobile and TV clients?
- How should existing v1 exporters be consolidated without changing output?
- Which future controls need explicit property-removal semantics beyond assigning supported empty or null values?
- Can the builder and v1 safely share pure modules?
- How should known TMDB list IDs be validated?
- How should future public TMDB list search slot into the architecture?

## 12. Update rules

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

## Decision history

- **2026-07-10 — Planning checkpoint:** treat `sources` as authoritative, use `catalogSources` only as the addon compatibility projection/fallback, preserve unknown imported data, and gate the isolated React/Vite candidate behind contract and deployment proof.
- **2026-07-10 — Contract baseline:** add evidence-classified fixtures and stable invariant checks before any builder framework, production parser, serializer, or exporter work.
- **2026-07-10 — Deployment coexistence:** completed branch validation and recorded live GitHub Pages checks confirmed stable v1 at the project root and the isolated React/Vite builder under `/builder/`, including generated assets, the v1 backlink, mobile-width behaviour, and the unlinked `noindex, nofollow` state. Adopt isolated React/Vite under `/builder/` as the confirmed direction while leaving history-based direct subroutes unsupported.
- **2026-07-10 — Builder domain model:** adopt a framework-independent plain-data hierarchy with stable builder-only IDs, explicit source categories, authoritative editable `sources`, detached raw import snapshots, and small immutable operations before importer or serializer work.
- **2026-07-11 — Preservation-first importer:** accept JSON text and parsed collection arrays through an atomic importer; hydrate only recognised editable fields, classify from explicit providers, preserve unknown and unsupported sources as opaque, retain complete detached raw snapshots, and detect `catalogSources`-only compatibility data without migration or export assumptions.
- **2026-07-11 — Preservation-first serializer:** serialize compact new nodes and preservation-based imported nodes atomically; replace raw child arrays from current domain state; generate projections only for addon-category sources; preserve matched projection metadata; warn when unmatched projections are removed; and block unresolved legacy projection-only data without migration. Explicit property deletion, Ultra MAX conversion, language support, and visible UI integration remain deferred.
- **2026-07-11 — Evidence-based addon projection migration:** add an explicit atomic migration for the confirmed addon projection-only shape; create compact authoritative addon sources in projection order; normalize only exact `"None"` to `null`; preserve raw projection evidence for serializer overlay; and use a narrow no-genre identity alias for matching. Keep import automaticity, manifests, networking, UI, Ultra MAX conversion, and AIO Metadata runtime integration deferred.
