# Builder People Search/Add

Status: merged through issue #74 / PR #75. Both the first Nuvio Desktop source-contract run and Dave's 2026-08-02 regenerated-artwork visual/import/export acceptance passed.

Issue: [#74 — Add unified People Search/Add to the V2 Builder](https://github.com/davecollections/tmdb-id-lookup/issues/74)

Last reviewed: 2026-08-06

This document records the focused People contract. [`BUILDER_KNOWLEDGE.md`](./BUILDER_KNOWLEDGE.md) remains the broader evidence record, and [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md) remains the durable product-direction source.

## Shared identity and provider

People is one TMDB-backed source mode shared by two creation contexts. Search accepts a name, TMDB person ID, or TMDB person link. The selected canonical numeric person ID is authoritative.

Search preserves TMDB result order. Each result shows canonical name and ID plus `Known for <department>` as disambiguation only. Normalized state retains every valid TMDB-supplied `known_for` entry without sorting or mutation. Desktop renders at most the first three entries; at 520px and below the same markup shows only the first entry. Titles wrap without forced ellipsis, and movie/series type plus year remain when supplied. No entry means no known-for row. These rows are never recomputed or fetched separately, and exact ID/link results omit the list when it is unavailable.

Search does not request combined credits for every result. Canonical details use `append_to_response=combined_credits` only after a person must be configured. A synchronous per-person in-flight guard is wired into the result activation path, so two rapid activations of the same result share the pending state rather than starting duplicate detail/combined-credit requests; independent people remain selectable after completion. The existing Worker origin and routes are reused unchanged. Requests retain abort/timeout behavior, bounded success caching, retry, and stale-response protection.

Same-network Vite development and preview sessions use a local same-origin proxy only when the Builder is opened over an RFC1918 HTTP address such as `192.168.x.x`. The local server forwards the existing allowlisted Worker paths with a localhost development origin, avoiding arbitrary private-IP CORS expansion. GitHub Pages and ordinary localhost sessions continue calling the existing Worker directly. The Worker routes, production origin allowlist, credentials, and TMDB request contract are unchanged.

Profile presentation distinguishes:

- loading details with the existing loading state;
- `No profile image`, announced as `No profile image available for <name>` when TMDB supplies no path;
- `Image unavailable`, announced as `Profile image unavailable for <name>` when an expected image fails.

## Two creation contexts

### Folder-level quick add

`Add source → People` opens `Add person` for the currently selected folder:

1. Search and choose one exact person.
2. Configure direct source combinations.
3. Add the missing selected sources.

There is no destination selector, new-folder option, or Review screen. The destination remains the selected folder.

An empty Builder-generated `Untitled Folder`, `Untitled Folder 2`, and later numbered default is promoted when it has no sources, imported raw snapshot, or deliberate artwork. Its title becomes the canonical person name and it receives the same final artwork resolution as a newly created People folder. A non-default tile shape is preserved; otherwise Poster remains the default. Rename, artwork, and every selected source commit in one controller revision, and any validation/construction failure leaves the original folder byte-identical.

Every other destination is an existing folder. Named folders, populated Untitled folders, imported folders, and Untitled folders with deliberate cover, emoji, focus, hero, or title-logo artwork keep title, artwork, tile shape, title visibility, emoji, raw/unknown values, source order, and all presentation state. Existing-folder quick add adds sources only and performs no folder-artwork request or preview.

### Collection-level bulk add

`Add people` in the Folders panel opens a shared People search configured for the selected collection:

1. Search and select up to 20 exact people.
2. Configure every selected person.
3. Add all folders and sources.

Each person creates one Poster folder named with the canonical person name. Its sources use the stable role-and-media tab titles documented below. Selection is insertion-ordered, exact-ID deduplicated, removable per person, and retained across query changes, result pages, scrolling, Back, and rerender. Result controls are explicit checkboxes; focusing or opening a card does not select it. Details and combined credits are fetched only for selected people when configuration begins.

The complete batch validates before construction and commits in one controller revision. A validation, parent, identity, generated-ID, or construction failure leaves the project unchanged. Created folder IDs are returned in selection order for focus and success messaging.

## Direct source combinations and defaults

The UI offers four independent checkbox rows:

| Friendly control | Source title | `tmdbSourceType` | `mediaType` |
| --- | --- | --- | --- |
| Acting Movies | `Movie Credits` | `PERSON` | `MOVIE` |
| Acting Series | `Series Credits` | `PERSON` | `TV` |
| Directed Movies | `Directed Movies` | `DIRECTOR` | `MOVIE` |
| Directed Series | `Directed Series` | `DIRECTOR` | `TV` |

Each row shows its distinct title count, `No titles found`, `Count unavailable`, or `Checking…`. Zero and unavailable counts remain selectable and never block creation. There is no separate role/media cross-product or repeated count matrix. Refresh requests that selected person's details again and does not overwrite manual choices.

Defaults apply once when the current details/counts first resolve:

- Acting preselects every positive Acting media combination and no Directing combination.
- Directing preselects every positive Directing media combination and no Acting combination.
- Other departments compare supported Acting and Directing totals, select the strictly larger non-zero role, and select every positive media combination inside it.
- A tie, all-zero set, or unavailable count set selects nothing.

`known_for_department` remains display context; defaults do not permanently classify a person. Users may choose any supported combination independently. Retry, Refresh, Back, and rerender preserve later manual choices.

## Source contract and naming

Expansion is deterministic in table order and produces one to four independent native sources. Source titles follow the stable v1 People exporter exactly so Nuvio renders distinct role/media tabs; the folder title, not each source title, carries the canonical person name.

```json
{
  "title": "Movie Credits",
  "sortBy": "popularity.desc",
  "tmdbId": 31,
  "filters": {},
  "provider": "tmdb",
  "mediaType": "MOVIE",
  "tmdbSourceType": "PERSON"
}
```

Source cards retain meaningful metadata such as `PERSON · MOVIE` and `DIRECTOR · TV`. People sources never serialize `BOTH`, generic all-credits behavior, unsupported crew roles, a Nuvio-facing source ID, Builder `internalId`, counts, search metadata, artwork metadata, or addon `catalogSources` projections. Native `sources` remains authoritative.

Count semantics remain:

- `PERSON` counts distinct positive-ID cast entries by Movie or Series.
- `DIRECTOR` counts distinct positive-ID crew entries whose job is `Director`, case-insensitively.
- Duplicate credits count once by media type and title ID.
- TV counts series IDs, not episodes.
- Other crew jobs are excluded.

## Duplicate behavior

Canonical identity remains:

```text
tmdb|tmdbSourceType|positivePersonId|mediaType
```

Provider/source/media casing and imported numeric-string IDs normalize for comparison. Exact identities in the quick-add destination folder are actionable; matches elsewhere are informational. The main action inserts only missing identities. `Add all anyway` remains bound to the exact destination folder and ordered current identities, so changing the person or any combination invalidates the override.

New collection-level folders cannot contain duplicate selected person IDs in one submitted batch.

## New and promoted-folder artwork

Collection-created folders and eligible untouched-folder promotions resolve artwork independently for every exact person ID and creation context:

1. exact published runtime `person` record for the final Poster or Landscape tile orientation;
2. validated TMDB `profile_path` at `w500`, including when a Landscape runtime record is unavailable;
3. empty `coverImageUrl`, visible title, and `👤`.

Curated artwork sets `hideTitle: true`. TMDB and emoji/no-art outcomes set `hideTitle: false`. Runtime results are accepted only when entity type, ID, orientation, SHA, path, and version query all match.

Search results keep TMDB profiles for identity. Configuration for a new or promoted folder replaces that profile with the one final representation that will be applied and labels it `Curated artwork`, `TMDB image`, or `No folder artwork available`; there is no repeated artwork panel. The preview uses the resolved folder shape rather than image dimensions: Poster remains `2 / 3`, while Landscape uses the Builder's `42 / 25` wide-tile proportion for curated, TMDB, and emoji outcomes alike. Artwork request state and generation tokens are keyed by exact person ID plus creation context. A second person, a failed runtime lookup, multiple bulk selections, or a reopened flow cannot reuse or suppress another person's artwork. Non-promotable existing-folder quick add requests and displays no folder artwork.

Missing curated records discovered in bounded owner QA are recorded in [`ASSET_GAPS.md`](../../manual-tests/nuvio-clients/issue-74-builder-add-people/ASSET_GAPS.md) with the exact selected identity and without changing `nuvio-assets`.

## Submission, modal, and accessibility

People has Search and Configure stages only. Configuration contains the selected people, combination controls, count status, duplicate context, applicable final artwork, and the final result summary. Each configured person's validated positive numeric ID links to `https://www.themoviedb.org/person/<id>` in a new tab with `noopener noreferrer`, a visible external indicator, meaningful accessible naming, and mobile-safe wrapping. Search-result cards keep their ID as plain metadata, and unsupported or malformed entity data never becomes a link. Final actions state the mutation, for example `Create Tom Hanks · 2 sources`, `Add Tom Hanks · 2 sources`, or `Add 4 folders · 7 sources`.

The source-mode chooser and short/empty People Search use content-based height. Results and bulk configuration expand only toward the existing maximum. The dialog retains one scroll owner, body lock, focus containment, safe areas, Visual Viewport keyboard handling, Escape/Close behavior, trigger restoration, status/alert regions, and reduced-motion support.

Checkboxes and buttons retain keyboard behavior and mobile tap targets. Combination controls collapse to one column on narrow screens. The 360, 384, 393, 402, and 412px widths require no horizontal scrolling.

## Current-client evidence gate

The prepared deterministic package is under [`manual-tests/nuvio-clients/issue-74-builder-add-people/`](../../manual-tests/nuvio-clients/issue-74-builder-add-people/):

- Tom Hanks (`31`): `Movie Credits` (`PERSON / MOVIE`), then `Series Credits` (`PERSON / TV`);
- Steven Spielberg (`488`): `Directed Movies` (`DIRECTOR / MOVIE`), then `Directed Series` (`DIRECTOR / TV`).

Dave's first Desktop import verified all four runtime catalogues, numeric person IDs, source/media types, `popularity.desc`, order, grouping, and immediate-export preservation. Desktop normally expanded compact sources with verbose null filter fields and `catalogSources: []`. That successful run used duplicate canonical-name tabs and explicit empty artwork, so it remains source-contract evidence only.

On 2026-08-02, Dave imported the regenerated final fixture into current Nuvio Desktop on Windows 11. Owner screenshots confirmed the curated Tom Hanks and Steven Spielberg Posters, distinct `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series` tabs, and populated role/media catalogues. The supplied immediate-export JSON preserved both exact SHA-versioned `coverImageUrl` values, `hideTitle: true`, folder/source grouping and order, numeric person IDs, source/media types, `popularity.desc`, and empty `catalogSources` while applying the expected null/default expansion. The client version/build was not supplied.

## Non-goals

- Only Acting and Directing are supported. Writer, creator, producer, and generic crew/all-credit sources are not generated.
- Count data is configuration-time context, not exported data or a persistent service.
- Issue #74's creation flow does not create a collection, edit existing sources, expose sort controls, implement Basic Discover, or implement generic collection-level multi-add. Issue #78 later adds an editor for one existing physical People source: the person ID remains fixed; the user may change among the same four Acting/Directing and Movie/Series combinations; approved default titles auto-follow until typing makes them custom; **Use default title** restores syncing; and only the stable-v1 Popular/Recent/Top-rated sort inventory is editable. Opening remains immediate from stored data while the shared successful person-details cache or one bounded non-blocking combined-credit request supplies all four issue #74 counts. Failure/Retry never blocks Save, no artwork request occurs, and logical person-folder/bundle editing remains future work.
- V1 People behavior, ordinary Company/Network catalogue workflows and legacy counts, Worker routes, dependencies, lockfiles, Pages allowlists, production data, and `nuvio-assets` remain unchanged.
