# V2 Builder Genres contract

## 1. Status and scope

Last reviewed: 2026-09-06

Issue [#196](https://github.com/davecollections/tmdb-id-lookup/issues/196), in local owner review, allows otherwise valid Movie/Series Genre imports to retain Edit when unused optional filters contain null placeholders from Nuvio desktop. Those controls open empty, not as the text "null". Required official Genre/media identity, supported sort, malformed-value safeguards and field-specific blank handling remain unchanged. Importing/opening does not rewrite a Source; an intentional Advanced edit may replace unused known null placeholders with compact settings under the [Source editing preservation contract](./BUILDER_SOURCE_EDITING.md#desktop-round-trip-preservation).

Issue [#110](https://github.com/davecollections/tmdb-id-lookup/issues/110) is closed/completed through merged [PR #111](https://github.com/davecollections/tmdb-id-lookup/pull/111) after desktop and physical-iPhone owner acceptance. It implements official TMDB Genres as a focused consumer of [`BUILDER_DISCOVER_CORE.md`](./BUILDER_DISCOVER_CORE.md):

```text
Selected folder → Add Source → Genres → Browse → Configure & review → Add or Create
```

Issue [#130](https://github.com/davecollections/tmdb-id-lookup/issues/130) is closed/completed through merged [PR #131](https://github.com/davecollections/tmdb-id-lookup/pull/131) at `817b4b8c46ca135e2badcfc6ca903dde3f824222`. It adds a distinct guided hierarchy entry in both shared creation scopes. Both owner Worker deployment/live-validation rounds and final desktop/physical-phone owner acceptance completed before merge. The final Structure-card corrections were presentation-only and required no Worker change:

```text
New Collection / New Folder → Genres → Select → Configure → Structure → Appearance → Create
```

Selected-folder Add Source remains unchanged and there is no Folders-header **Add genres** shortcut. One selected Genre in Add Source always adds its generated source or sources to the current folder. With two or more selected Genres, **Configure & review** still offers the existing sibling-folder destination inside that Add Source operation, whose generated Genre folders remain Landscape. Guided Genre hierarchy is separately registered in New Collection and New Folder and does not alter Source Edit. Issue #130 adds exact-config title Preview, four guided structures where applicable, focused composite-TV placement precedent, and the corresponding fail-closed Genre Discover Worker query shape; it does not add a generic Discover form/forwarder, automatic count or artwork request, dependency, V1 change, asset-repository change, public List, recipe, or generic picker/help framework.

## 2. Immutable official catalogue and selection

`data/genres.csv` remains the repository authority. Builder consumes an immutable projection containing 19 official Movie references, 16 official TV references, 35 media-specific references total, 27 exact-name concepts, and eight exact shared Movie/TV names: Animation, Comedy, Crime, Documentary, Drama, Family, Mystery, and Western.

Only exact equal names pair. `Action & Adventure`, `Sci-Fi & Fantasy`, and `War & Politics` remain official Series-only concepts. They are not semantically merged with Movie genres. Musicals is excluded because V1 represents it with curated TMDB `LIST` 5916 rather than an official Genre.

Browse filters the complete local A–Z list by name and makes no runtime catalogue request. The Genre heading is followed by one compact toolbar containing `<selected> of 27 selected` and a grouped **Select all** / **Clear all** action pair; it has no selected chip cloud. The 360, 384, 393, 402, and 412 pixel layouts keep that action pair together without horizontal overflow. Search is browse-optional: opening Genres or returning from Configure never focuses it or summons the mobile keyboard, while an explicit Search interaction focuses it normally. Search never changes hidden selections. Manual selection order remains meaningful, deselect-and-reselect appends, and **Select all** chooses all 27 in catalogue A–Z order. There is no artificial 20-item Genre product limit.

## 3. Media, sorts, and capacity

One global compact-pill **Movies / Series / Both** choice applies only to exact shared concepts and uses the helper **Applies to Genres available in both Movies and Series.** The control is shown only when at least one selected Genre supports both media. Movie-only and Series-only concepts keep their official media. Movies or Series shows a calm named/count note when opposite fixed-media concepts remain; Both needs no note. The default is Both. Candidate order is selected Genre order, then Movie before Series within a paired Genre. **Sort titles by** reuses the same established Studio/Network semantic-pill treatment.

Selecting all 27 concepts with Both produces the current catalogue maximum of 35 ordered sources. The shared controller accepts the complete operation as either 35 sources in one existing folder or 27 folders containing 35 sources in total. This is tested current-catalogue capacity, not a new arbitrary generic maximum; nonempty-array, shape, unique-ID, deterministic-order, and atomicity validations remain.

The four Core-owned choices under **Sort titles by** are:

| Choice | Movie | TV |
| --- | --- | --- |
| Popular | `popularity.desc` | `popularity.desc` |
| Recent | `primary_release_date.desc` | `first_air_date.desc` |
| Top Rated | `vote_average.desc` | `vote_average.desc` |
| Most Votes | `vote_count.desc` | `vote_count.desc` |

Every generated source is native TMDB `DISCOVER`, has explicit `tmdbId: null`, one media-correct positive decimal `withGenres` value, and no native `catalogSources` projection. Add Source and Source Edit retain the self-describing `<Genre> Movies` / `<Genre> Series` defaults. Guided hierarchy uses contextual physical-source titles `Movies` / `Series` inside the already named Genre folder without changing source identity.

## 4. Destination modes and duplicates

**Add all to this folder** is the default because the flow begins from that folder's Add Source action. It is the only destination for one selected Genre; destination controls appear only for multi-Genre selections. It uses one `controller.addSourcesToFolder` call for missing or explicitly approved candidates and never changes the folder's title, artwork, tile shape, hidden-title state, emoji, order, or other presentation.

**One folder per genre** creates one sibling folder for each ready Genre inside the selected folder's parent collection. The two destination cards are compact title-only choices; the section heading supplies their context. A paired Genre's Movie and Series sources stay together in that one folder. Each generated folder uses the exact Genre title, `LANDSCAPE`, and the existing published V1 wide Genre artwork mapping with `hideTitle: true`. An unmapped future Genre falls back to a visible title plus 🎬. Artwork lookup is static and non-blocking. One `controller.createFoldersWithSources` call creates every approved folder and source atomically.

Folder mode has one deliberately narrow startup cleanup. If the destination is the original generated `Untitled Folder`, it is removed in the same successful controller transaction as the final planned Genre folders. The predicate requires the exact generated blank-folder shape: direct child of the destination collection, empty, non-imported, exact default title/ID/presentation keys and values, and no custom artwork, emoji, hero, or extra editable field. Renamed, restyled, populated, imported, and otherwise customized folders are preserved. If final duplicate planning produces no new folders, the placeholder is preserved and no content revision advances. This is not a generic merge/copy or folder-promotion primitive.

Current-folder duplicate comparison uses full DISCOVER Core identity, including sort and filters and excluding title. Normal Add inserts only identities missing from that folder. Differently sorted, excluded, or date-bounded valid Genre sources remain ordinarily addable and receive no related-variant treatment in this issue. Exact elsewhere matches are informational. A single exact destination duplicate uses **Add anyway**; a reviewed bundle containing exact destination duplicates uses the exact folder/candidate-bound **Add all anyway** override.

Folder-mode planning is collection-scoped per Genre: no configured identities means ready; the complete configured set means **Already in this collection** and is omitted; a partial Movie/Series set means **Partly in this collection** and is also omitted to avoid a split duplicate folder. Matches only in another collection are informational. Folder mode has no bulk duplicate override.

### Guided New Collection / New Folder hierarchy

The issue #130 flow reuses the complete local 27-concept catalogue, ordered uncapped full-card native-checkbox selection, media/sort/Advanced configuration, static artwork resolver, full Discover identity, shared title/layout/shape controls, the shared nested Preview shell/request coordinator/poster grid, and existing atomic controller batches. The native checkbox is visually hidden; the complete card carries focus and selected surface/border/inset without a circular substitute or tick, following [`BUILDER_UI_SHELL.md`](./BUILDER_UI_SHELL.md#selectable-choice-presentation-contract). Select is browse-first: it focuses a stable heading rather than Search, preserves query and ordered selection on Back, offers Select all/Clear all, and keeps one intentional inner scroll owner. Configure defaults shared Genres to Both, preserves the existing Advanced component, and always renders one compact logical row per selected Genre in selection order. Each row retains media/source count, placement status, Remove, elsewhere details where relevant, and one **Preview titles** action. It has no destination chooser or duplicate override.

Structure owns grouping and shows actual plan-derived Collection/Folder/Source-node counts. Issue [#186](https://github.com/davecollections/tmdb-id-lookup/issues/186) clarifies the visible choices in terms of the Nuvio Home result without changing any structure, count, default, ordering, or output:

- **Genre folders** is the default: one canonical Genre folder card contains its applicable contextual `Movies` and/or `Series` sources. The all-catalogue unmerged plan is 1 Collection, 27 Folders, 35 Sources.
- **Movies & Series folders** creates only nonempty `Movies` / `Series` folder cards. Their Genre sources use exact Genre names, receive no arbitrary Genre artwork, and use the safe visible-title/🎬 fallback. The all-catalogue plan is 1/2/35; a single-media configuration creates only its one applicable folder.
- **Separate Movie & Series Genre folders** creates `<Genre> Movies` / `<Genre> Series` folder cards with contextual sources and the underlying Genre artwork. Its untouched default is Show everywhere so paired artwork stays distinguishable; an explicit user title choice survives Structure switching. The all-catalogue plan is 1/35/35.
- **Separate Movie & Series collections** is New Collection-only and appears only for effective Both media. It atomically creates editable `Movie Genres` and `Series Genres` Home collections through the established multi-collection operation. The all-catalogue plan is 2/35/35, and a late second-collection failure leaves neither collection.

Each Structure option uses the established visual-choice-card language: first-time-user title and description, a compact illustrative Collection → Folder → content-choice wireframe, and live plan-derived Collection/Folder counts. Source totals remain part of the authoritative plan, validation, Appearance summary, and Create behavior but are deliberately omitted from these decision cards. The wireframe explains the hierarchy shape but never drives planning; native radio semantics, visible focus, the restrained selected border/surface, and the live count line remain authoritative. The Structure introduction has no redundant intermediate heading. Conditional placement below the cards explains that TMDB groups some Series genres separately from Movies, asks whether those Series sources should have their own folders or be added to matching Movie Genre folders, defaults to **Keep its own folder**, and retains the same exact target choices and planner values.

Only Genre folders exposes the focused V1 product precedent: `Action & Adventure` may stay standalone or target selected Action/Adventure folders, `Sci-Fi & Fantasy` may target selected Science Fiction/Fantasy folders, and `War & Politics` may target selected War. Merged sources become self-describing (`Action & Adventure Series`, etc.). **Add to both** deliberately plans two ordinary Source nodes with the same functional recipe under the two selected target folders; it is not a global identity relaxation. In New Folder, a target must itself be created in the reviewed atomic plan. An already represented/omitted target is unavailable with an explanation because the current controller cannot atomically append there while creating other bundles; standalone remains safe.

Duplicate semantics follow Structure. Genre folders retains complete/partial logical-folder omission. Separate Movie & Series Genre folders omits only the exact physical source/folder. Movies & Series folders performs exact per-source omission and creates only nonempty aggregate folders, with the omission surfaced in plan outcomes. New Collection matches remain informational/addable. New Folder preserves the parent presentation and existing Untitled folders byte-for-byte. Appearance defaults to a visible `Genres` collection using Tabs, Show All on, Pin off, **Landscape** Genre artwork, and **Hide on home screen only** titles where folders represent canonical Genres. Poster/Landscape remains one batch-safe choice; Movies & Series folders use only its tile shape and safe fallback.

The official 27-concept artwork mapping is explicit because filenames are not mechanically canonical:

| Canonical Genre | Landscape filename stem | Poster filename stem |
| --- | --- | --- |
| Action | `action wide` | `Action` |
| Action & Adventure | `action_and_adventure wide` | `action_and_adventure` |
| Adventure | `adventure wide` | `Adventure` |
| Animation | `animation wide` | `Animation` |
| Comedy | `comedy wide` | `Comedy` |
| Crime | `crime wide` | `crime` |
| Documentary | `documentary wide` | `Documentary` |
| Drama | `drama wide` | `Drama` |
| Family | `family wide` | `family` |
| Fantasy | `fantasy wide` | `Fantasy` |
| History | `history wide` | `history` |
| Horror | `horror wide` | `Horror` |
| Kids | `kids wide` | `kids` |
| Music | `music wide` | `Music` |
| Mystery | `mystery wide` | `Mystery` |
| News | `news wide` | `news` |
| Reality | `reality wide` | `reality` |
| Romance | `romance wide` | `Romance` |
| Sci-Fi & Fantasy | `sci-fi_and_fantasy wide` | `sci-fi_and_fantasy` |
| Science Fiction | `science fiction wide` | `Sci-Fi` |
| Soap | `soap wide` | `soap` |
| Talk | `talk wide` | `talk` |
| Thriller | `thriller wide` | `Thriller` |
| TV Movie | `tv movie wide` | `tv movie` |
| War | `war wide` | `War` |
| War & Politics | `war_and_politics wide` | `war_and_politics` |
| Western | `western wide` | `Western` |

Asset-only names such as Musicals, Disaster, Queer, and Rom Com do not expand the official catalogue.

**Preview titles** is explicit and never requested automatically. The exact current physical source draft is the authority: media, Genre ID, concrete sort, date/rating/vote/language/country values, and that included Genre's compiled `withoutGenres` exclusions are translated through the DISCOVER Core descriptors into media-correct TMDB query parameters. Every outgoing Preview request also explicitly includes canonical `include_adult=false`; this is a Preview transport requirement and does not invent a persisted Nuvio source filter. A paired Genre opens one modal with lazy Movies and Series views; only the initial view is requested until the user switches. Single-media Genres have no pointless tab. Results reuse the global poster-only maximum of 10 at every viewport, phone 5×2 layout, exact `No posters available.` empty state, loading, recoverable error/Retry, Close, and centred focus-contained geometry/restoration. The five-minute bounded success cache uses the complete canonical functional query, including the changed adult-required contract, so any filter, exclusion, media, or sort change produces a distinct identity; errors, aborts, timeouts, malformed responses, and stale completions never cache.

The tracked Worker admits a distinct Genre branch only for `/3/discover/movie` or `/3/discover/tv` with exactly one canonical positive `with_genres`, exactly one lowercase `include_adult=false`, zero or one of the four media-correct sorts, and only the currently approved media-correct date bounds, rating bounds, vote minimum, two-letter language/country codes, and canonical comma-separated `without_genres`. Missing, true, `0`, differently cased, or duplicated adult values fail closed. Company/Network mixtures, Watch Providers, keywords, paging, unknown parameters, compound included Genres, and generic Discover remain rejected. A service token does not authorize Discover. Production version `857c1fa3-e62d-4fd8-9321-9573aedb1906` with SHA-256 `6F67C0576470CE18901BCF7ADE433F38E411057CB27A2092D014D3185ED8A4B2` is the first correction deployment. Dave confirmed the second complete 10,479-byte source with SHA-256 `45AE6323195F067BCC6428CA8D70889640C35B661B509F47A6069EE906F12539` was deployed on 2026-08-21; no second deployment version identifier was supplied. Codex does not deploy.

Both scopes rebuild the selected structure and placement before apply and commit through one existing atomic batch; stale placement, generated-ID collision, or late bundle failure leaves project content and revision unchanged. Structure and Appearance totals report actual created nodes after destination omissions and deliberate repeated placement.

## 5. Configure, review, and scaling

Selected-folder Add Source has two screens: **Browse** and **Configure & review**. The standard header **Back** action is the only return path from Configure to Browse and preserves query, selection, destination, media, sort, and advanced values. There is no duplicate **Change genres** control. A single selection is shown as fixed context without a redundant `1 genre selected` heading; selections of two through six use compact removable pills; larger selections use **View selected genres** with a removable row for every Genre. Removing down to one immediately forces current-folder mode and prunes only configuration owned by removed Genres. Adding another Genre later reopens the multi-Genre choices with current-folder as the safe default. Guided hierarchy instead uses the five-stage Select → Configure → Structure → Appearance → Create flow described above.

Simple one/few-source reviews show the destination heading and compact result rows without a second redundant count/summary box. Every ordinary review row retains the same neutral source-row surface; state is communicated only by concise **Ready to add**, **Already in this folder**, **Exists elsewhere**, **Already in this collection**, or **Partly in this collection** status text. The shared blue/cyan informational notice supplies useful elsewhere locations and confirms that adding can continue. In selected-folder Add Source, above six candidates/groups, ordinary ready rows may still collapse behind **View all …** while attention rows remain visible. Guided hierarchy Configure is deliberately different after owner review: all selected logical Genre rows remain directly rendered in its one intentional scroll owner, including a 27-row selection, and no duplicate selected/configured disclosure is mounted. Zero outcomes use **No new sources to add** or the matching folder wording rather than a `0 sources` block.

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

Focused foundation, controller, UI, Preview-provider, and Worker suites cover 35 → 27 → 8 catalogue parity; exact grouping; manual and Select-all ordering; all four structures at full 27/35 capacity; structure-specific names, artwork, title defaults, and exact destination omissions; all three composite rules; self-describing merged sources; intentional Add-to-both nodes; multi-collection atomic rollback; explicit 27-concept Landscape/Poster mapping parity; unchanged Add Source Landscape default; all four media-correct sorts; exact Advanced/exclusion/adult query translation and complete cache identity; success/zero/expiry/eviction/error/timeout/abort/stale cache behavior; narrow Worker acceptance/rejection; always-visible guided Configure rows; shared nested poster Preview; responsive exclusion/help surfaces; stale/generated-ID/late-failure atomic rollback; and serialization cycles. Local browser review at 360, 384, 393, 402, 412, 899, 900, 901, and 1280 pixels confirms one scroll owner, reachable sticky actions, no horizontal overflow, bounded visual Structure cards and illustrative wireframes, readable live counts, clear radio/selected/focus states, correctly positioned composite controls, fixed-media notes, composite preservation, and title-default preservation with no console warnings/errors. The final shared grid correction makes each Structure card allocate its description/preview area consistently instead of bottom-aligning the preview after a wrapped title; measured description-to-diagram spacing is 12 pixels at 360, 393, 412, 899, 900, 901, and 1280 pixels, with row counts still aligned and no clipping, compression, or overflow.

The first owner deployment passed the former exact-config mounted live scenario at 393 and 900 pixels through the production Worker, real TMDB, and real `image.tmdb.org` resources. Before the second deployment, the corrected Builder emitted `include_adult=false` and received the expected HTTP 403 from the older Worker rather than fabricating a green result. After Dave confirmed the second deployment, bounded direct production acceptance returned HTTP 200 for canonical false and HTTP 403 for missing, true, duplicated, and generic Discover. The complete 29-scenario mounted suite passed through the production Worker, real TMDB, and real `image.tmdb.org`, including Movie first, lazy TV, exact Advanced/exclusion, posters, cache, mutation, focus, and responsive hierarchy behavior.

The production-generated sanitized current-client package lives at [`manual-tests/nuvio-clients/issue-110-builder-genres/`](../../manual-tests/nuvio-clients/issue-110-builder-genres/). It deliberately stays small: Comedy Movie/TV plus Action & Adventure TV inside one existing folder, with representative advanced filters. It proves source semantics, not UI maximum capacity. The offline checker proves deterministic canonical Builder output.

Owner desktop and physical-phone UI acceptance is complete for issue #110, which merged through PR #111. Final desktop and physical-phone UI acceptance is also complete for issue #130, which merged through PR #131 after both Worker deployment/live-validation rounds completed. Actual current-Nuvio V2 import/runtime/immediate-export/re-import evidence is deliberately deferred until V2 exposes export and was not an unfinished issue #130 gate.

## 9. Deferred work

Deferred work includes Musicals, public-list search, automatic Genre counts, generic Advanced Discover, logical pair editing, Genre identity/media editing, arbitrary merges beyond the three evidenced composite-TV rules, generic folder merge/copy and promotion behavior beyond the Add Source-only strict original-placeholder cleanup, typed artwork-runtime expansion, source-led collection creation, recipes, and generic picker/form/navigation/help extraction. TMDB List ID/URL creation is complete through issue #170 rather than a Genre milestone. Later current-client Genre hierarchy evidence remains deferred rather than assumed; issue #130 owner review, corrected Worker deployment, postdeployment live validation, PR, and merge are complete.
