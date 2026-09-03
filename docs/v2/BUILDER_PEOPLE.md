# Builder People creation and source behavior

Status: issue #74 / PR #75 is the merged Add Source baseline. Issue #118 / PR #119 is the merged People hierarchy-family and canonical-artwork baseline. Issue #132 removes the legacy panel launcher and restores guided browse-first focus. Issue #176 adds selected-folder Sort parity and the cross-family capability regression contract.

Issues: [#74 — Add unified People Search/Add to the V2 Builder](https://github.com/davecollections/tmdb-id-lookup/issues/74); [#118 — Add People hierarchy creation and migrate People artwork authority](https://github.com/davecollections/tmdb-id-lookup/issues/118); [#132 — Remove legacy People launcher and restore browse-first hierarchy focus](https://github.com/davecollections/tmdb-id-lookup/issues/132); [#176 — Add People Sort parity and protect source capabilities across contexts](https://github.com/davecollections/tmdb-id-lookup/issues/176)

Last reviewed: 2026-09-03

This document records the focused People contract. [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md) owns the shared cross-family creation standard, [`BUILDER_KNOWLEDGE.md`](./BUILDER_KNOWLEDGE.md) remains the broader evidence record, and [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md) remains the durable product-direction source.

## Shared identity and provider

People is one TMDB-backed source mode shared by Add Source and the higher-level creation launcher. Search accepts a name, TMDB person ID, or TMDB person link. The selected canonical numeric person ID is authoritative.

For active V2 People identity/category/artwork enrichment, [`nuvio-people-assets`](https://github.com/davecollections/nuvio-people-assets) is canonical through its schema-v2 [`manifests/people.json`](https://raw.githubusercontent.com/davecollections/nuvio-people-assets/main/manifests/people.json). The Builder loads and validates that manifest once per workspace, indexes it by numeric `tmdbPersonId`, and uses `canonicalName`, `categoryMembership`, and the supplied asset records when an ID is registered. Search query/result ordering and TMDB detail/count behavior remain TMDB-owned. An absent manifest ID preserves the searched TMDB identity/details and uses the safe existing artwork fallback; it never reconstructs a legacy People URL.

Search preserves TMDB result order. Each result shows canonical name and ID plus `Known for <department>` as disambiguation only. Normalized state retains every valid TMDB-supplied `known_for` entry without sorting or mutation. Desktop renders at most the first three entries; at 520px and below the same markup shows only the first entry. Titles wrap without forced ellipsis, and movie/series type plus year remain when supplied. No entry means no known-for row. These rows are never recomputed or fetched separately, and exact ID/link results omit the list when it is unavailable.

Search does not request combined credits for every result. Canonical details use `append_to_response=combined_credits` only after a person must be configured. A synchronous per-person in-flight guard is wired into the result activation path, so two rapid activations of the same result share the pending state rather than starting duplicate detail/combined-credit requests; independent people remain selectable after completion. The existing Worker origin and routes are reused unchanged. Requests retain abort/timeout behavior, bounded success caching, retry, and stale-response protection.

Same-network Vite development and preview sessions use a local same-origin proxy only when the Builder is opened over an RFC1918 HTTP address such as `192.168.x.x`. The local server forwards the existing allowlisted Worker paths with a localhost development origin, avoiding arbitrary private-IP CORS expansion. GitHub Pages and ordinary localhost sessions continue calling the existing Worker directly. The Worker routes, production origin allowlist, credentials, and TMDB request contract are unchanged.

Profile presentation distinguishes:

- loading details with the existing loading state;
- `No profile image`, announced as `No profile image available for <name>` when TMDB supplies no path;
- `Image unavailable`, announced as `Profile image unavailable for <name>` when an expected image fails.

## Creation entry points

### Folder-level quick add

`Add source → People` opens `Add person` for the currently selected folder:

1. Search and choose one exact person.
2. Configure direct source combinations.
3. Add the missing selected sources.

There is no destination selector, new-folder option, or Review screen. The destination remains the selected folder.

Issue [#176](https://github.com/davecollections/tmdb-id-lookup/issues/176) gives this physical Add Source context the same shared **Sort** control as People New Collection/New Folder and People Source Edit. It exposes only the evidenced Popular/Recent/Top-rated inventory, starts on Popular, and retains the selected semantic option through role/media changes, Back/re-entry, exact draft construction, Preview, duplicate evaluation, and the final atomic Save. Network Add Source remains unchanged. The cross-family capability matrix is test-owned rather than a production registry, and Source-name parity remains a separate open product decision.

An empty Builder-generated `Untitled Folder`, `Untitled Folder 2`, and later numbered default is promoted when it has no sources, imported raw snapshot, or deliberate artwork. Its title becomes the canonical person name and it receives the same final artwork resolution as a newly created People folder. A non-default tile shape is preserved; otherwise Poster remains the default. Rename, artwork, and every selected source commit in one controller revision, and any validation/construction failure leaves the original folder byte-identical.

Every other destination is an existing folder. Named folders, populated Untitled folders, imported folders, and Untitled folders with deliberate cover, emoji, focus, hero, or title-logo artwork keep title, artwork, tile shape, title visibility, emoji, raw/unknown values, source order, and all presentation state. Existing-folder quick add adds sources only and performs no folder-artwork request or preview.

### New Collection / New Folder hierarchy

People is a first-class family in the shared hierarchy launcher. Its canonical hierarchy routes are `New Collection → People` and `New Folder → People`. The Folders header has only the ordinary `New folder` action and no People-specific shortcut.

1. Select ordered exact people with no artificial product ceiling.
2. Choose Automatic or Same for all and review every selected person in one bounded ordered configuration list; direct per-person changes are retained as internal overrides rather than a third visible mode.
3. Review names, counts, artwork and destination placement.
4. Create the ordinary hierarchy atomically.

New Collection defaults to an editable `People` collection using normal generated Collection defaults, with one Poster folder per selected person and no nested role/media folders. New Folder creates sibling person folders inside the captured Collection and exposes that parent presentation read-only; it never patches the parent. Review can change all generated person folders between Poster and Landscape and apply one canonical Folder title-visibility outcome to all of them. The accepted default is **Hide on home screen only**, retaining each canonical name with `hideTitle: true`; **Show everywhere** and **Hide everywhere** reuse the ordinary Folder semantics, including U+200E for the latter. Their cover, hero, title-logo, and optional focus fields stay on the shape-specific canonical manifest or fallback defaults; individual artwork links can be customised later through the ordinary Folder editor. Each person folder uses the canonical manifest/search name and the existing source ordering/titles. Selection is insertion-ordered, exact-ID deduplicated, removable, and retained across query changes, result pages, scrolling, and Back. Search shows one compact selected-summary row with the count and a separate `View selected people` disclosure instead of permanent person chips or repeated order copy. A tunable informational notice appears at 50 selections without blocking Continue or implying a maximum. Details and combined credits are fetched only for selected people when configuration begins.

Hierarchy Configure adapts the stable V1 batch concepts without importing V1 code, styling, or unsupported settings. Every person row always exposes the same four compact source pills with a tick, an inline count state, and restrained Acting-versus-Directing colour treatment. The only visible strategy choices are **Automatic** and **Same for all**. Automatic begins with each person's established Acting/Directing Movie/Series defaults from current manifest/category and count evidence. Editing any person's pill changes only that person and records an internal override while the visible strategy remains Automatic or Same for all; there is no Custom mode, transition notice, or explanatory helper copy. Shared changes apply to people without an override and preserve explicit per-person choices. Strategy changes retain both the shared set and individual overrides. All selected people remain visible in one bounded ordered list with poster, canonical name, category/department, direct source choices, Preview titles, and Remove actions.

One shared **Sort** control applies to all generated People sources and exposes only the three People values already verified by the physical-source editor: **Popular**, **Recent**, and **Top rated**. Recent maps to `primary_release_date.desc` for Movies and `first_air_date.desc` for Series; the other two use their common media values. `vote_count.desc` is evidenced for other source families but not for the retained native `PERSON`/`DIRECTOR` contract, so a speculative **Most votes** option is not added. The plan stores the concrete media-correct values. Sort deliberately remains outside People duplicate identity, matching existing edit behavior.

**Preview titles** reuses the selected person's already loaded combined credits and the current role/media pills plus shared sort. It makes no separate title-preview request or endpoint call; explicit Retry may repeat the existing person-details request after a failure. A body-portalled, bounded pop-out modal deduplicates by media type and TMDB title ID, includes Director crew entries only for Directing, and shows poster-only results capped at 10 above 520px or 5 at 520px and below. Posterless entries are omitted and a zero-usable-poster result becomes one modal-level empty state. It has loading, empty, and recoverable error states, contains focus, closes with its button or Escape, and restores focus to the exact Preview titles trigger. Individual posters have no title, year, role, media, or other result metadata, and Preview has no pagination.

The ephemeral People plan expands to ordinary Collection → Folder → Source bundles and is not serialized. It captures exact destination evidence, revalidates against current state immediately before apply, and delegates to the existing atomic multi-folder/multi-collection controller operations. A validation, stale destination, identity, generated-ID, or later-bundle construction failure creates nothing and advances no content revision.

## Direct source combinations and defaults

The source contract offers four independent choices. Add Source retains its established checkbox rows; hierarchy Configure presents the same choices as compact direct pills:

| Friendly control | Source title | `tmdbSourceType` | `mediaType` |
| --- | --- | --- | --- |
| Acting Movies | `Movie Credits` | `PERSON` | `MOVIE` |
| Acting Series | `Series Credits` | `PERSON` | `TV` |
| Directed Movies | `Directed Movies` | `DIRECTOR` | `MOVIE` |
| Directed Series | `Directed Series` | `DIRECTOR` | `TV` |

Each row shows its distinct title count, `No titles found`, `Count unavailable`, or `Checking…`. Zero and unavailable counts remain selectable and never block creation. There is no separate role/media cross-product or repeated count matrix. Refresh requests that selected person's details again and does not overwrite manual choices.

Defaults apply once when the current details/counts first resolve. For registered people, manifest `categoryMembership` is the V2 actor/director authority: actor selects positive Acting combinations, director selects positive Directing combinations, and dual membership may select positive combinations from both roles. For unregistered people, the established TMDB department/count fallback remains:

- Acting preselects every positive Acting media combination and no Directing combination.
- Directing preselects every positive Directing media combination and no Acting combination.
- Other departments compare supported Acting and Directing totals, select the strictly larger non-zero role, and select every positive media combination inside it.
- A tie, all-zero set, or unavailable count set selects nothing.

`known_for_department` remains display context and fallback rather than a second active registered-person catalogue. Users may choose any supported combination independently. Retry, Refresh, Back, and rerender preserve later manual choices.

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

New hierarchy selections cannot contain duplicate selected person IDs. For New Folder, all exact requested identities already in the destination yields **Already in this collection**; any partial requested match—or an existing logical person folder evidenced by another People source—yields **Partly in this collection**. Both outcomes omit that person folder rather than creating a duplicate. Exact matches only elsewhere are informational **Exists elsewhere** and remain creatable. New Collection treats elsewhere matches as informational. Add Source keeps its existing folder-local missing/add-all behavior.

## Canonical and fallback folder artwork

Hierarchy-created folders and eligible untouched-folder promotions resolve artwork independently for every exact person ID and creation context:

1. exact validated `nuvio-people-assets` manifest record for the final Poster or Landscape tile orientation;
2. validated TMDB `profile_path` at `w500` when the manifest has no registered record or is unavailable;
3. empty `coverImageUrl`, visible title, and `👤`.

Manifest artwork resolution starts with `hideTitle: true` for registered artwork and visible-title fallback values. Hierarchy planning then authoritatively applies the one selected canonical Folder title-visibility outcome to every generated person folder. `poster` or compatibility `landscape` maps to `coverImageUrl`; `hero` maps only to `heroBackdropUrl`; and `titleLogo` maps separately to `titleLogoUrl`. When both optional focus records exist, the matching static colour counterpart maps to `focusGifUrl` with `focusGifEnabled: true`. Review exposes only one shared Poster/Landscape control for generated person folders. Changing orientation recomputes each folder's manifest or fallback defaults synchronously; Review does not expose per-person artwork overrides, URL inputs, focus toggles, or reset controls. The ordinary manual Folder editor separately exposes the same known artwork fields, preserves untouched imported values, and emits minimal patches for later individual customisation. The current Builder persisted contract recognizes `focusGifUrl` as a generic optional string, and import/serialization apply no GIF extension or MIME restriction, so a static WebP URL is schema-compatible. This is Builder round-trip evidence, not a claim that issue #118 rendered the WebP in a current Nuvio client. If either focus record is absent, neither focus field is emitted by hierarchy creation. Asset SHA-256 values remain transient comparison/invalidation evidence; stable manifest URLs are not rewritten as cache-version paths.

Search results keep TMDB profiles for identity. Configuration for a new or promoted folder replaces that profile with the final applied representation and labels it `Canonical People artwork`, `TMDB image`, or `No folder artwork available`; there is no repeated artwork panel. The preview uses the resolved folder shape rather than image dimensions. Artwork request state and generation tokens remain keyed by exact person ID plus creation context. A second person, manifest failure, multiple selections, or a reopened flow cannot reuse or suppress another person's artwork. Non-promotable existing-folder quick add requests and displays no folder artwork.

The active V2 resolver no longer constructs `assets/collection_covers/people/poster|landscape|title-logo` paths in `nuvio-assets`. Company and Network remain owned by `nuvio-assets`. Historical issue #74 evidence and the legacy runtime remain intact for their recorded/V1 boundaries; no asset repository is written by the Builder. Deletion of legacy People assets is explicitly deferred until merged runtime/client/V1 migration evidence and separate owner approval.

## Submission, modal, and accessibility

People title Preview follows the shared media-separation rule. It shows only media represented by the person's current source combinations: Movies, Series, or separate Movies and Series tabs. Within each media, selected Acting and Directing credits are combined, Director crew entries are retained, and duplicate physical title IDs appear once before the current semantic sort is applied. Counts are media-specific and the surface never presents a combined Movie/Series total. The sample remains bounded to 10 posters above 520px and 5 at 520px and below. It reuses the combined credits already loaded for configuration, so opening or switching Preview media adds no People request.

Add Source retains Search → Configure. Hierarchy creation uses Search → Configure → Review & Appearance. New Collection Review exposes plan counts and editable name followed by one shared **Title options** card for Collection and generated-folder title visibility, then directly visible **Layout** controls for Tabs/Rows, Tabs-specific Show All, and Pin. Rows hides Show All while hierarchy output retains `showAllTab: true`; returning to Tabs shows it enabled. New Folder omits the Collection title switch, keeps its destination layout inherited/read-only, and applies only the generated-folder title choice. Both scopes expose only a shared generated-folder Poster/Landscape choice with concise canonical-default/later-Edit-Folder guidance, retain neutral placement status, collapse only `View person details · <count>`, and use a count-aware Create action. Each configured person's validated positive numeric ID retains the existing safe TMDB link behavior.

The source-mode chooser and short/empty People Search use content-based height. Selected people and configuration rows each use bounded internal lists, so 20–100+ selections do not expand the dialog by default. Configure gives the bounded People list the available vertical space, has no person dropdown or expanded per-person editor, and keeps every compact direct-pill row reachable. At most one body-portalled title-preview modal is mounted. The shared CreationDialog retains one scroll owner, body lock, focus containment, safe areas, Visual Viewport keyboard handling, Escape/Close behavior, trigger restoration, status/alert regions, and reduced-motion support. Result selection and native checkbox focus keep the outer dialog, document, and sticky Configure action fixed; only the inner `.add-source-scroll` owner may move to keep a partially visible result available.

The People result card remains one clickable positioned label around a focusable native checkbox. Position containment keeps the 1×1 visually-hidden checkbox in the card's coordinate and scroll context even when that result is clipped at the bottom of the inner viewport; browser-native focus scrolling therefore cannot reposition the fixed creation shell. The complete card carries visible focus and selected surface/border/inset without a circular substitute or tick, following [`BUILDER_UI_SHELL.md`](./BUILDER_UI_SHELL.md#selectable-choice-presentation-contract). The native checkboxes behind the marker-free source pills and all buttons likewise retain keyboard behavior and mobile tap targets. The four pills use two columns at 520px and below, while the preview uses five poster columns there. The 360, 384, 393, 402, and 412px widths require no horizontal scrolling; the 899/900/901px shell boundary remains intact.

Guided New Collection/New Folder People Search opens browse-first on the stable People heading; Search receives focus only after explicit interaction. Selected-folder `Add Source → People` remains typing-first and initially focuses Search.

## Current-client evidence gate

The prepared deterministic package is under [`manual-tests/nuvio-clients/issue-74-builder-add-people/`](../../manual-tests/nuvio-clients/issue-74-builder-add-people/):

- Tom Hanks (`31`): `Movie Credits` (`PERSON / MOVIE`), then `Series Credits` (`PERSON / TV`);
- Steven Spielberg (`488`): `Directed Movies` (`DIRECTOR / MOVIE`), then `Directed Series` (`DIRECTOR / TV`).

Dave's first Desktop import verified all four runtime catalogues, numeric person IDs, source/media types, `popularity.desc`, order, grouping, and immediate-export preservation. Desktop normally expanded compact sources with verbose null filter fields and `catalogSources: []`. That successful run used duplicate canonical-name tabs and explicit empty artwork, so it remains source-contract evidence only.

On 2026-08-02, Dave imported the regenerated final fixture into current Nuvio Desktop on Windows 11. Owner screenshots confirmed the curated Tom Hanks and Steven Spielberg Posters, distinct `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series` tabs, and populated role/media catalogues. The supplied immediate-export JSON preserved both exact SHA-versioned `coverImageUrl` values, `hideTitle: true`, folder/source grouping and order, numeric person IDs, source/media types, `popularity.desc`, and empty `catalogSources` while applying the expected null/default expansion. The client version/build was not supplied.

## Non-goals

- Only Acting and Directing are supported. Writer, creator, producer, and generic crew/all-credit sources are not generated.
- Count data is configuration-time context, not exported data or a persistent service.
- Issue #78 edits one existing physical People source only; logical person-folder/bundle editing remains future work.
- Franchises, Studios, Networks, Genres, Streaming, templates, recipes, generic picker infrastructure, new People roles, V1 People migration, Worker/deployment changes, live Nuvio sending, asset publication, and legacy asset deletion remain outside issue #118.
- V1 People behavior, Company/Network artwork resolution, Worker routes, dependencies, lockfiles, Pages allowlists, production data, `nuvio-assets`, and `nuvio-people-assets` remain unchanged by the Builder repository work.
