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
- **Currently unsupported:** no first-party Trakt catalog manifest was confirmed.

## 7. Source-array behaviour

**Confirmed from current Nuvio source code:**

- `sources` is authoritative.
- `catalogSources` is an addon compatibility projection/fallback.
- Runtime does not execute both arrays independently.
- Native-only canonical folders use populated `sources` and empty `catalogSources`.
- Addon-backed folders use full addon entries in `sources` and matching projections in `catalogSources`.
- A mixed folder mirrors only addon-backed entries into `catalogSources`.
- Never emit an empty `sources` array while placing active addon data only in `catalogSources`.
- Multiple sources resolve independently.
- The optional All presentation interleaves and deduplicates results rather than combining them into one TMDB query.

Source and folder order is meaningful and must be preserved.

## 8. Preservation contract

- **Confirmed from current Nuvio source code:** Mobile Nuvio preserves unknown fields more strongly than TV.
- The future builder must retain raw imported objects and overlay only edited known paths.
- Unknown collection, folder, source, filter, and community fields must survive unrelated edits.
- Imported opaque sources must remain preservable, movable, and removable without being guessed into a known provider type.
- Each source needs an internal stable identity independent of mutable filter values.

## 9. Current architecture decision

- Preserve v1 at the repository root.
- An isolated `/builder/` React/Vite app is the leading candidate, not a final decision.
- Contract fixtures and a deployment/coexistence spike are required before committing to the framework direction.
- Framework-independent Nuvio source, parsing, validation, migration, serialization, and ID modules should stay outside React components.
- Initial builder navigation should avoid direct-history subroutes until GitHub Pages refresh handling is proven.

## 10. Open questions

- Can a future Nuvio source model support direct individual movies or series?
- Can multiple direct item references ever be exposed as a folder source?
- Which Discover filters work identically across mobile and TV clients?
- How should existing v1 exporters be consolidated without changing output?
- How should imported unknown data be preserved across edits?
- Should the future builder emit complete explicit-null source envelopes or a compact canonical form?
- Can the builder and v1 safely share pure modules?
- How should known TMDB list IDs be validated?
- How should future public TMDB list search slot into the architecture?
- When, if ever, should Trakt become part of the combined builder?

## 11. Update rules

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

## Decision history

- **2026-07-10 — Planning checkpoint:** treat `sources` as authoritative, use `catalogSources` only as the addon compatibility projection/fallback, preserve unknown imported data, and gate the isolated React/Vite candidate behind contract and deployment proof.
