# V2 Builder Genres contract

## 1. Status and scope

Issue [#110](https://github.com/davecollections/tmdb-id-lookup/issues/110) implements official TMDB Genres as a focused consumer of [`BUILDER_DISCOVER_CORE.md`](./BUILDER_DISCOVER_CORE.md):

```text
Selected folder → Add Source → Genres → Browse → Configure & review → Add or Create
```

This is the only Genre entry point. There is no Folders-header **Add genres** action. One selected Genre always adds its generated source or sources to the current folder. With two or more selected Genres, **Configure & review** also offers the explicit choice to create one sibling folder per selected Genre in that folder's collection. Genre Source Edit owns display name, **Sort titles by**, and the same approved advanced filters. The issue does not add a generic Discover form, Worker route, live Genre/count or artwork requests, dependencies, V1 changes, asset-repository changes, public Lists, recipes, or generic picker/help frameworks.

## 2. Immutable official catalogue and selection

`data/genres.csv` remains the repository authority. Builder consumes an immutable projection containing 19 official Movie references, 16 official TV references, 35 media-specific references total, 27 exact-name concepts, and eight exact shared Movie/TV names: Animation, Comedy, Crime, Documentary, Drama, Family, Mystery, and Western.

Only exact equal names pair. `Action & Adventure`, `Sci-Fi & Fantasy`, and `War & Politics` remain official Series-only concepts. They are not semantically merged with Movie genres. Musicals is excluded because V1 represents it with curated TMDB `LIST` 5916 rather than an official Genre.

Browse filters the complete local A–Z list by name and makes no runtime catalogue request. The Genre heading is followed by one compact toolbar containing `<selected> of 27 selected` and a grouped **Select all** / **Clear all** action pair; it has no selected chip cloud. The 360, 384, 393, 402, and 412 pixel layouts keep that action pair together without horizontal overflow. Search is browse-optional: opening Genres or returning from Configure never focuses it or summons the mobile keyboard, while an explicit Search interaction focuses it normally. Search never changes hidden selections. Manual selection order remains meaningful, deselect-and-reselect appends, and **Select all** chooses all 27 in catalogue A–Z order. There is no artificial 20-item Genre product limit.

## 3. Media, sorts, and capacity

One global **Movies / Series / Both** choice applies only **For genres available in both Movies and Series**. The heading is sufficient without a second helper sentence. The control is shown only when at least one selected Genre supports both media. Movie-only and Series-only concepts keep their official media without showing an irrelevant media explanation or disabled choice. The default is Both. Candidate order is selected Genre order, then Movie before Series within a paired Genre.

Selecting all 27 concepts with Both produces the current catalogue maximum of 35 ordered sources. The shared controller accepts the complete operation as either 35 sources in one existing folder or 27 folders containing 35 sources in total. This is tested current-catalogue capacity, not a new arbitrary generic maximum; nonempty-array, shape, unique-ID, deterministic-order, and atomicity validations remain.

The four Core-owned choices under **Sort titles by** are:

| Choice | Movie | TV |
| --- | --- | --- |
| Popular | `popularity.desc` | `popularity.desc` |
| Recent | `primary_release_date.desc` | `first_air_date.desc` |
| Top Rated | `vote_average.desc` | `vote_average.desc` |
| Most Votes | `vote_count.desc` | `vote_count.desc` |

Every generated source is native TMDB `DISCOVER`, has explicit `tmdbId: null`, one media-correct positive decimal `withGenres` value, and no native `catalogSources` projection. Default titles are `<Genre> Movies` and `<Genre> Series`.

## 4. Destination modes and duplicates

**Add all to this folder** is the default because the flow begins from that folder's Add Source action. It is the only destination for one selected Genre; destination controls appear only for multi-Genre selections. It uses one `controller.addSourcesToFolder` call for missing or explicitly approved candidates and never changes the folder's title, artwork, tile shape, hidden-title state, emoji, order, or other presentation.

**One folder per genre** creates one sibling folder for each ready Genre inside the selected folder's parent collection. The two destination cards are compact title-only choices; the section heading supplies their context. A paired Genre's Movie and Series sources stay together in that one folder. Each generated folder uses the exact Genre title, `LANDSCAPE`, and the existing published V1 wide Genre artwork mapping with `hideTitle: true`. An unmapped future Genre falls back to a visible title plus 🎬. Artwork lookup is static and non-blocking. One `controller.createFoldersWithSources` call creates every approved folder and source atomically.

Folder mode has one deliberately narrow startup cleanup. If the destination is the original generated `Untitled Folder`, it is removed in the same successful controller transaction as the final planned Genre folders. The predicate requires the exact generated blank-folder shape: direct child of the destination collection, empty, non-imported, exact default title/ID/presentation keys and values, and no custom artwork, emoji, hero, or extra editable field. Renamed, restyled, populated, imported, and otherwise customized folders are preserved. If final duplicate planning produces no new folders, the placeholder is preserved and no content revision advances. This is not a generic merge/copy or folder-promotion primitive.

Current-folder duplicate comparison uses full DISCOVER Core identity, including sort and filters and excluding title. Normal Add inserts only identities missing from that folder. Differently sorted, excluded, or date-bounded valid Genre sources remain ordinarily addable and receive no related-variant treatment in this issue. Exact elsewhere matches are informational. A single exact destination duplicate uses **Add anyway**; a reviewed bundle containing exact destination duplicates uses the exact folder/candidate-bound **Add all anyway** override.

Folder-mode planning is collection-scoped per Genre: no configured identities means ready; the complete configured set means **Already in this collection** and is omitted; a partial Movie/Series set means **Partly in this collection** and is also omitted to avoid a split duplicate folder. Matches only in another collection are informational. Folder mode has no bulk duplicate override.

Review headings and primary actions state the actual structure and counts, such as `35 sources will be added to “Mixed Genres”` / **Add 35 sources** or `27 folders will be created with 35 sources` / **Create 27 folders**. Empty normal outcomes use **No new sources to add** or **No new folders to create**.

## 5. Configure, review, and scaling

There are two screens: **Browse** and **Configure & review**. The standard header **Back** action is the only return path from Configure to Browse and preserves query, selection, destination, media, sort, and advanced values. There is no duplicate **Change genres** control. A single selection is shown as fixed context without a redundant `1 genre selected` heading; selections of two through six use compact removable pills; larger selections use **View selected genres** with a removable row for every Genre. Removing down to one immediately forces current-folder mode and prunes only configuration owned by removed Genres. Adding another Genre later reopens the multi-Genre choices with current-folder as the safe default.

Simple one/few-source reviews show the destination heading and compact result rows without a second redundant count/summary box. Every ordinary review row retains the same neutral source-row surface; state is communicated only by concise **Ready to add**, **Already in this folder**, **Exists elsewhere**, **Already in this collection**, or **Partly in this collection** status text. The shared blue/cyan informational notice supplies useful elsewhere locations and confirms that adding can continue. Above six candidates/groups, ordinary ready rows collapse behind **View all …** while duplicate, partial, conflict, and other attention rows remain visible. Expanded rows contain only the source/folder name, media and sort or source count, and outcome. Zero outcomes use **No new sources to add** or the matching folder wording rather than a `0 sources` block. This keeps a 35-source review usable without hiding warnings or recolouring complete rows.

## 6. Approved Advanced options

**Advanced options** is collapsed by default and shared by Add and Edit. Builder-styled dark inputs, selects, borders, radii, focus treatment, errors, and disabled states use a two-column desktop and one-column mobile layout. The short main-form introduction is **Fine-tune your results**; example placeholders are not saved values.

The shared pure conversion and validation support:

- optional From/To release year, serialized as inclusive `YYYY-01-01` / `YYYY-12-31` Core date bounds;
- optional minimum/maximum TMDB user rating from 0 to 10;
- optional nonnegative whole-number minimum vote count;
- optional named common original-language and origin-country choices, with lossless fallback labels for imported two-letter codes;
- zero or more excluded official Genres configured separately for each included Genre.

For one included Genre, **Exclude genres** is a compact summary plus **Choose** action. For multiple included Genres, the main form shows one **Genre exclusions** summary and **Configure** action; the secondary surface first lists the selected Genres, then opens the applicable exclusion picker for one included Genre at a time. The user-facing picker omits the included Genre and choices that cannot affect any generated media source. Selected Genres may still exclude one another when compatible. Self-exclusion remains rejected by validation. Years, ratings, votes, language, and country remain global operation settings.

Exclusions and help open as controlled secondary surfaces inside the existing Add/Edit session, not nested dialogs. Desktop uses a focused contained overlay with a crisp, sticky foreground header and completion-styled **Done** action; the underlying form is visibly dimmed, subtly blurred, and inert. The single-Genre exclusion surface uses the available width as a balanced choice grid, while multi-Genre configuration retains its useful two-pane layout. Overlay scrolling reuses the Builder's restrained scrollbar treatment. Mobile uses one opaque full task surface. The multi-Genre root owns overall **Done** and lists the selected Genres; an individual **Exclude from …** detail hides that Done action and uses a persistent **Back to Genres** header while its choices scroll beneath. In-surface Back or the mobile browser/session Back convention returns detail → root, while root Done/Back returns to Advanced options with state preserved. The secondary content is the only active scroll owner, underlying Back/Close/form actions are inert, and the Add/Save/Cancel footer is absent while a secondary surface is active.

**What do these options do?** uses that same controlled surface contract without a duplicate literal question-mark prefix. It contains only the approved concise meanings and the informational **Advanced Discover** future callout—no dead link, button, route, or issue. Add and Edit share the same Advanced component, including spinner-suppressed numeric inputs whose numeric semantics and validation remain unchanged.

Years must be 1000–9999 and ordered; ratings and years validate calmly when both bounds are present. A generated source cannot include and exclude its own media-specific Genre identity. Each included Genre compiles only its own ordered exclusion list. Exclusions translate separately for Movie and TV; an excluded concept without a mapping for that candidate media is omitted. Multiple IDs serialize as a comma-separated expression in user selection order. The official TMDB Top Rated reference publishes the equivalent Discover example `without_genres=99,10755`; imported pipe expressions remain outside this focused editable contract.

## 7. Genre Source Edit

The registry recognizes only an official media-correct single-Genre `DISCOVER` source whose meaningful fields are losslessly represented by this editor: one positive `withGenres` ID, one supported semantic sort, and only the approved date, rating, vote, language, country, and comma-separated official exclusion fields.

The editor owns display name, semantic sort, and those filters. Genre ID, media, provider, source type, category, raw evidence, source order, and Nuvio-facing source ID stay fixed. **Use default name** restores `<Genre> Movies` or `<Genre> Series`. Full DISCOVER Core identity drives duplicate rejection when sort or filters change. Add and Edit render the same Advanced component, exclusion/help secondary surfaces, validation, inert-underlay behavior, footer suppression, focus restoration, and one-primary-scroll-owner contract.

Partial dates, unsupported/mixed exclusion syntax, self-exclusion, compound included Genres, unsupported filters, unknown Genre IDs, invalid codes/ranges, non-null custom `tmdbId`, curated Lists, and unknown-rich/custom Discover recipes remain Delete-only. No-op, duplicate, and stale-session behavior reuse the established Source Edit contract.

## 8. Deterministic and manual evidence

Focused foundation, controller, and UI suites cover 35 → 27 → 8 catalogue parity; exact grouping; manual and Select-all ordering; 27-concept/35-source capacity; one-revision current-folder and folder-mode operations; one-Genre destination enforcement; strict pristine-placeholder replacement and customized-folder preservation; V1 wide artwork and fallback; sorts and every advanced field; per-Genre media-aware ordered exclusions; fail-closed imported recognition; both duplicate scopes; removable compact/large selection summaries; simplified reviews; responsive exclusion/help surfaces; shared Add/Edit Advanced UI; atomic failures; and serialization cycles.

The production-generated sanitized current-client package lives at [`manual-tests/nuvio-clients/issue-110-builder-genres/`](../../manual-tests/nuvio-clients/issue-110-builder-genres/). It deliberately stays small: Comedy Movie/TV plus Action & Adventure TV inside one existing folder, with representative advanced filters. It proves source semantics, not UI maximum capacity. The offline checker proves deterministic canonical Builder output.

Actual current-Nuvio import/runtime/immediate-export/re-import acceptance remains a gate. The owner completed the physical-phone Genre review that produced the final focus, compact-toolbar, exclusion-navigation, and neutral-status corrections; one short physical-phone confirmation of the revised implementation remains before PR consideration. No client, device-version, live catalogue, or live artwork result is claimed by the implementation branch.

## 9. Deferred work

Deferred work includes Musicals, curated/public Lists, public-list search, known-ID/URL List creation, live Genre requests or counts, generic Advanced Discover, logical pair editing, Genre identity/media editing, semantic V1 merges, generic folder merge/copy and promotion behavior beyond the strict original-placeholder cleanup, Worker/deployment changes, typed artwork-runtime expansion, source-led collection creation, recipes, and generic picker/form/navigation/help extraction.
