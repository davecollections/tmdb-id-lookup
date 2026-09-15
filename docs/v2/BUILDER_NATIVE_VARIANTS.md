# Native People, Studio and Network variants

Network [#213](./BUILDER_NETWORKS.md#shared-minimum-votes-213-local-owner-review-implementation), currently awaiting owner review, shares the bounded minimum-votes comparison and configured-plan semantics below with Studio; Network remains TV-only and uses the existing standalone TV Discover Preview gateway.

Studio [#208](./BUILDER_STUDIOS.md#shared-minimum-votes-208) adds optional Minimum votes to all creation contexts and the scalar physical editor. Its effective threshold participates in existing candidate, placement, plan, Preview and exact-duplicate handling. Supported numeric/string thresholds and matching minimum mirrors compare equivalently; explicit zero remains distinct from unset. Other native fields and family semantics are unchanged. No Worker change is required.

Issue [#200](https://github.com/davecollections/tmdb-id-lookup/issues/200), implemented on 2026-09-08 and refined through 2026-09-10. The revised flow and notice treatment passed owner review on 2026-09-10. Publication preparation is authorized; merge and client ranking acceptance remain separate.

This is the current contract for the three native families in ordinary Add Source, guided New Collection and guided New Folder, covering nine entry contexts. It supersedes historical single-sort, structural-only duplicate and guided Preview wrapper descriptions in the focused family documents.

## Creation and naming

**Sources to create** reuses the established semantic checkbox control with Popular initially selected. Canonical order is Popular, Recent, Top rated, Most voted. **Selected:** summarizes the selection; an empty selection displays **Choose at least one option.** and blocks creation. People and Studios use **Choose one or more options. Movies and Series get separate sources.** Networks use **Choose one or more options. Each option creates a separate Series source.**

Each selected option produces one ordinary scalar Source per eligible role/media combination, without multiplying folders. People preserves Automatic, shared and per-person choices, including zero/unknown-count behavior. Studios preserves Movies/Series selection; Networks remains Series-only. Output stays native `PERSON`/`DIRECTOR`, `COMPANY` and `NETWORK`. No saved source is converted into a Discover recipe.

Three-choice creation media controls use **Movies | Series | Both**, including Studios, Genres, Streaming and Decades. Standalone combined summaries use **Movies + Series**. Studio helper text says it creates Movie/Series sources in each folder without implying exactly one. This wording does not change enum values, generated names, source combinations or stored data.

| Family | Popular | Recent | Top rated | Most voted |
| --- | --- | --- | --- | --- |
| People Movies | `popularity.desc` | `primary_release_date.desc` | `vote_average.desc` | `vote_count.desc` |
| People Series | `popularity.desc` | `first_air_date.desc` | `vote_average.desc` | `vote_count.desc` |
| Studio Movies | `popularity.desc` | `primary_release_date.desc` | `vote_average.desc` | `vote_count.desc` |
| Studio Series / Network | `popularity.desc` | `first_air_date.desc` | `vote_average.desc` | `vote_count.desc` |

One selected option retains the exact existing base name. Multiple selected options append ASCII ` - <option label>`. Order is selected entity, established role/media order, then canonical option order. All four options can produce 16 People Sources, eight Studio Sources or four Network Sources per eligible entity. Source Edit does not automatically rename an existing Source when its sort changes.

## Exact comparison, placement and counts

Structural identity remains family-owned and unchanged. The shared native comparison helper derives an effective raw/editable view through the existing generic overlay; it does not use Discover identity or normalize Discover filters. Exact keys include native entity, role, media, sort and meaningful source/filter extras. Numeric-string IDs and safely equivalent casing, missing/default sorts and inactive known null placeholders can compare equivalently without rewriting imported data. Company/Network Recent date aliases compare by the effective media. Valid zero filters and unknown semantics remain meaningful; unknown sort strings never become Popular. Opaque sources do not become canonical native sources.

Ordinary Add reviews the complete configured set and appends only missing exact variants into the explicitly selected folder. Existing variants remain available in Preview. Elsewhere matches are informational. An explicit duplicate override inserts the complete configured set, is bound to the exact destination plus complete ordered candidate keys, and is revalidated immediately before atomic application.

Guided New Folder plans exact Sources across the destination Collection: create a folder for an entity with no recognized matching folder, append missing variants to one matching folder, and add nothing for fully present entities. When several folders match and Sources are missing, Configure requires an inline **Add new sources to** choice. Existing Sources stay in place; names, artwork, raw data and settings remain preserved.

Folder matching requires recognized native identity, never title, artwork or opaque Source claims. Renamed/imported folders can be reused. Exact comparison includes current role, media, sort and relevant effective filters. Exact coverage may be split across several folders; only missing Sources enter the chosen append bundle, with no duplication, movement or renaming. Folder choices retain Collection order and use visible title plus Folder position to disambiguate.

Configure shows one shared notice when exact duplicates exist: **Some sources already exist and won’t be created.** Entity rows use compact **Already added** / **Partly added** status. The obsolete separate-folder override and Open-existing-folder actions, state and handlers have been removed. One outcome summary distinguishes new folders from existing folders receiving Sources. No-addition plans show **No new sources to add.** and cannot progress; unresolved destinations also block apply, while a fully present entity does not block other valid additions.

Availability is derived separately from selection intent. A per-person role/media choice is labelled **Already added** and disabled only when every Source for its currently selected sorts is present. Adding a missing sort re-enables it. Shared sort/media controls stay usable for the batch. Full configured candidates, including already-present Sources, remain Previewable. Duplicate recalculation and navigation make no title requests. Back retains selection order, per-person choices, sorts, appearance drafts and still-valid inline folder destinations; invalid destinations are reconciled away.

An append-only batch applies directly from Configure with **Add sources**, skipping Appearance. Mixed/new batches use Appearance only for newly created folders and use **Apply changes** when existing folders also receive Sources. One ephemeral plan is rebuilt against the current project immediately before **extendCollectionWithFoldersAndSources** applies all new folders and existing-folder additions atomically. Its existing controller validation and rollback are reused; stale/invalid destinations cannot partially mutate the project. Internal accounting retains exact coverage, missing/unresolved Sources, new folders and distinct append targets without repeating that accounting in the UI.

This owner-approved 2026-09-09 correction supersedes earlier whole-entity omission, separate-folder override and deferred existing-folder addition statements. New Collection still creates the complete selected set with project matches informational. Ordinary Add retains its own deliberate duplicate control and untouched People-folder promotion.

## Scalar editing and preservation

The three adapters retain **Sort titles by**, one scalar sort and one-source Preview. A functional change into an exact sibling is rejected, excluding the physical node being edited. A no-op or title-only save remains possible beside intentional/imported duplicates. Different valid sorts coexist. Other adapters retain their duplicate protections.

The comparison hook uses the adapter's existing minimal proposed patch over the original source. Stale session/target checks, IDs, order, imported raw snapshots, unknown fields, compatibility data and null placeholders remain protected. Import, open, Cancel and no-op do not normalize source data. Only intended supported title/sort fields and, for Studio/Network, deliberately touched Minimum votes representations change on a real edit. Serialization policy and structural/internal identity are unchanged.

## Exact title Preview

The five creation flow components reuse one extracted lifecycle hook and the existing shared dialog/selector presentation. Family factories and validated complete candidates are reused before duplicate or placement omissions. People adds Role, applicable Media and Show; Studios uses Media and Show; Networks retains Series context and Show. Singleton selectors hide. Switching retains other valid choices and resolves exactly one stable functional candidate. The dialog stays mounted, and its selection never changes creation choices or output.

Checkbox changes make no title requests. Only explicitly visited uncached variants request titles. Studio/Network use the existing production Discover requester, exact entity/media/sort keys, success-only bounded cache including zero, abort and stale rejection. Retry uses the exact active candidate. Loading clears previous posters/counts. Counts inside Preview belong to the active response, with at most ten usable posters from that page and no pagination/backfill request. Existing Configure browsing counts remain informational and may retain a previous successful count.

People reuses loaded combined credits for exact cast or Director-crew and media filtering. Most voted has an explicit vote-count-first comparator, then rating/popularity/stable identity tie breaks. Distinct role/media title totals include posterless titles independently of the bounded poster sample. If credits are unavailable, the existing person provider/cache supplies them. No new endpoint, Worker route, host or query policy is needed.

## Nuvio evidence and acceptance boundary

Pinned evidence inspected for this issue:

- [NuvioTV resolver at 09670e448a5fcb93dbc98f156900a5788a52aa03](https://github.com/NuvioMedia/NuvioTV/blob/09670e448a5fcb93dbc98f156900a5788a52aa03/app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt): native cast/Director crew, media split, vote-count ordering, and sort-aware source key.
- [NuvioMobile resolver at a30bf5192c0aa56219c47dc964a9cbfd400d37a7](https://github.com/NuvioMedia/NuvioMobile/blob/a30bf5192c0aa56219c47dc964a9cbfd400d37a7/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/TmdbCollectionSourceResolver.kt): corresponding native roles, media filtering and vote-count sort.
- [Mobile CollectionModels at that commit](https://github.com/NuvioMedia/NuvioMobile/blob/a30bf5192c0aa56219c47dc964a9cbfd400d37a7/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt): scalar sort constants and sort/filter-aware route keys.

These sources establish static support, not installed-client acceptance. Popular may retain upstream order in Nuvio while the Builder sorts popularity; date granularity and rating/tie handling differ between clients. NuvioTV's native Network resolver adds status and date defaults absent from the inspected Mobile path. Preview does not promise identical ordering or counts across versions, and this issue does not alter Worker queries to conceal those differences.

### Owner-supplied comparisons, 2026-09-09

The personal export attachments were not present in this Codex environment. The following records Dave's supplied observations and JSON comparisons; these files were not independently inspected in this pass. The checked-in [sanitized People example](../../manual-tests/native-source-variants/people-most-voted.json) has eight Tom Hanks native Sources (ID 31): Acting/Directing, Movies/Series, Popular/Most voted.

| Import/export route | Supplied result |
| --- | --- |
| Original `people-most-voted.json` | Four Popular `popularity.desc` and four Most voted `vote_count.desc` values across the eight native Sources. |
| Website import/export | All four Most voted values changed: Movies to `popularity.desc`, Series to `first_air_date.desc`. Titles still say Most voted. |
| Synced TV | Received through account sync after website import. This does not independently establish a TV conversion. |
| Direct TV Manage-from-phone import/export | All eight original sorting values preserved; null compatibility fields added. |
| Desktop import/export | All eight original sorting values preserved. |
| Manually created website PERSON/MOVIE Top rated | Exports `vote_average.desc`. |

Dave reports the website selector offers Popular, Top rated and Recent for People, while the other tested apps also offer Most voted. Dingo retains Most voted and `vote_count.desc`. The website route needs an upstream report, but the rewriting stage is unknown; sync is not proof of an independent TV rewrite. JSON preservation does not prove displayed ranking. Client versions, independent inspection of personal exports and detailed title-list/playback evidence remain unavailable. No full personal exports/screenshots are checked in and no upstream report was posted. See the [recorded review evidence](../../manual-tests/native-source-variants/README.md).

## Warner Bros. Pictures Top rated diagnosis, 2026-09-09

The actual validated candidate is native `COMPANY`, TMDB `174`, `MOVIE`, `vote_average.desc`, with empty filters. The existing configured production Worker/provider sent `/3/discover/movie?with_companies=174&sort_by=vote_average.desc` and returned HTTP 200 with 3,125 titles. At 07:57 UTC, the first ten response rows all had a vote average of 10 from one vote. A small sample:

| TMDB ID | Response title | Vote average | Vote count |
| --- | --- | ---: | ---: |
| 1664346 | The Amazon Trader | 10 | 1 |
| 1474260 | Romance in the Air | 10 | 1 |
| 999295 | Survival of Spaceship Earth | 10 | 1 |
| 663138 | The Wedding of Jack and Jill | 10 | 1 |
| 595636 | Outcast | 10 | 1 |

The mounted browser then confirmed Company 174, Movies and Top rated in the active Preview and compared every displayed poster path with the usable posters from that exact live response, in order. The poster supplied for response title *Romance in the Air* visibly reads *Broadway Brevities*, explaining that observed artwork label without inventing a separate returned title. Posterless rows are omitted from the bounded poster sample by the existing normalizer. Most voted uses a separate candidate/key and `vote_count.desc`; its response starts with The Dark Knight (ID 155, 36,644 votes at the initial check). Switching back to Top rated reused the correct cache entry without another request.

The evidence supports correctly sorted high ratings from very few votes, with no confirmed Builder query, candidate, cache or display defect. No threshold, Preview-only filter, export rewrite, native-to-Discover conversion or Worker change was introduced. Live ratings/counts may change and this does not establish identical Nuvio ranking. Full bounded diagnostics and browser captures remain in the private local handoff area.

## Verification and exclusions

Focused family, hierarchy, editor, comparison and Preview suites cover generation, exact duplicates, minimal edits, preservation, stale/atomic behavior, selection keys, loaded People totals and existing provider cache/zero/error/abort contracts. The isolated `TMDB_NATIVE_SOURCE_VARIANTS_ONLY=1` mode in the existing mounted harness uses actual production Worker/TMDB responses and real image-CDN resources, without the #198 controlled-response exception. Its 20 cases cover all nine entry contexts, all three scalar editors, the required phone widths, short height, desktop and forced colors. One check delays delivery of an actual live response to prove stale rejection after switching; it does not invent service data.

The 348 focused tests, 20 browser cases and build from 2026-09-08, plus the earlier 122-test/seven-case refinement, are historical. The owner-approved Source-level correction passed 131 focused domain/UI tests, including full/partial/new selections, renamed imports, meaningful filters, opaque claims, split coverage, invalid/stale destinations and late mixed-batch rollback for all three families. A controlled pure 50-person case contains ten complete, ten partial and thirty new entities; resolving one ambiguous target retains all selections and commits exactly 70 new Sources in one revision.

The existing harness now uses **TMDB_NATIVE_SOURCE_LEVEL_ONLY=1** for ten bounded live cases: each family at 393×480 and 1280×900, plus 360, 384, 402 and 412 pixel phones. Actual production Worker/TMDB/image-CDN providers verify complete/no-addition and append-only plans, mixed plans with inline targets and split coverage, unchanged imported content, per-person/sort/destination/Appearance retention through Back, new-folder-only appearance, Preview candidates/cache and scalar no-op editing. Workspace completion verifies its announcement and visible folder focus. Focus uses the existing folder-restoration operation; disabled existing choices have neutral styling and explicit text. Screenshots confirmed compact placement and fitted narrow Appearance cards. No external responses, titles or artwork paths were fabricated. Final build/preview and full worktree inventory are recorded in the private owner handoff.

Publication preparation on 2026-09-10 invoked `scripts/check.cmd` exactly once. Targeted continuations corrected stale People sort, Network action and Genre wording assertions, updated the Studio placement selector, and restored the existing Network Preview guard during artwork preparation. All 90 required stages completed successfully, including the newly registered native-variant, shared sorting and Add/Preview parity suites. The final default mounted run passed 47 tests with seven unchanged skips: five opt-in matrices and two existing Decades deployment gates. The final production build passed after the guard correction, retaining the established bundle-size advisory. Earlier focused/browser totals remain historical evidence and are not added to these results. V1, Worker, dependencies, catalogue maintenance, serializer/schema output policy, global identity, alternate Collection routing, new name/filter controls, Lists/Franchises/MDBList, the 100-title Preview project and favicon maintenance are outside this issue.
