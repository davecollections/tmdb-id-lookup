# TMDB ID Lookup v2 — Builder Knowledge Base

Status: Planning and contract groundwork

Last reviewed: 2026-07-10

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

`scripts\check.cmd` remains the Windows entry point. It and the dedicated GitHub Actions workflow both execute `node scripts/check-all.mjs`, which runs the existing frontend checks followed by the contract suite without secrets or network requests.

## 10. Current architecture decision

- Preserve v1 at the repository root.
- Keep builder source and dependencies isolated under `builder/`; no root npm package is needed.
- Use `builder/dist/` only as generated local/CI output and `.pages-site/` only as generated combined deployment staging. Neither directory is committed.
- Use Vite's relative `./` base so generated JavaScript, CSS, and imported local assets resolve from `/tmdb-id-lookup/builder/` without hard-coding the repository name or incorrectly targeting `/assets/` at the domain root.
- The Pages staging process preserves tracked v1 files at the artifact root and replaces the public `builder/` path with the contents of `builder/dist/`, producing `.pages-site/index.html` and `.pages-site/builder/index.html` without a public `builder/dist/` level.
- Branch and pull-request CI builds the builder, runs existing frontend and Nuvio contract checks, and validates the combined artifact without calling `actions/deploy-pages` or using the `github-pages` environment.
- The existing Pages workflow remains the only publisher and retains its `main` push, manual dispatch, successful maintenance `workflow_run` triggers, permissions, concurrency, asset-version injection, and deployment steps.
- Framework-independent Nuvio source, parsing, validation, migration, serialization, and ID modules should stay outside React components.
- **Strongly inferred — issue [#33](https://github.com/davecollections/tmdb-id-lookup/issues/33), 2026-07-10:** local builds and combined-artifact validation support adopting the isolated React/Vite direction for the next builder phase, provided the merged artifact receives a final public GitHub Pages check.
- **Experimental:** actual public delivery at `/tmdb-id-lookup/builder/` remains a post-merge confirmation because the feature branch is deliberately never deployed to the live Pages environment.
- History-based direct subroutes remain unproven and are not being adopted. The spike uses one entry page and no React Router.

## 11. Open questions

- Can a future Nuvio source model support direct individual movies or series?
- Can multiple direct item references ever be exposed as a folder source?
- Which Discover filters work identically across mobile and TV clients?
- How should existing v1 exporters be consolidated without changing output?
- How should imported unknown data be preserved across edits?
- Should the future builder emit complete explicit-null source envelopes or a compact canonical form?
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
| 2026-07-10 | Isolated React/Vite build, relative asset paths, combined v1 plus `/builder/` Pages staging, and branch-safe validation | [TMDB ID Lookup issue #33](https://github.com/davecollections/tmdb-id-lookup/issues/33) |

## Decision history

- **2026-07-10 — Planning checkpoint:** treat `sources` as authoritative, use `catalogSources` only as the addon compatibility projection/fallback, preserve unknown imported data, and gate the isolated React/Vite candidate behind contract and deployment proof.
- **2026-07-10 — Contract baseline:** add evidence-classified fixtures and stable invariant checks before any builder framework, production parser, serializer, or exporter work.
- **2026-07-10 — Deployment coexistence spike:** recommend isolated React/Vite for the next builder phase based on local and branch-artifact evidence, while reserving live `/builder/` confirmation for the post-merge Pages deployment and declining history-based routing.
