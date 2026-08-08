# Native Source Editing

Status: foundation merged through issue [#78](https://github.com/davecollections/tmdb-id-lookup/issues/78) / PR [#79](https://github.com/davecollections/tmdb-id-lookup/pull/79); Studio Movie/Series name-and-sort adapter added on issue [#92](https://github.com/davecollections/tmdb-id-lookup/issues/92)'s review branch. A complete current-client V2 edit/export round trip is deliberately deferred until V2 exposes export and was not an unfinished merge gate.

Last reviewed: 2026-08-07

## Scope

The first source-editing slice edits one existing physical source in place. It supports only:

- native TMDB movie collections with identity `tmdb|COLLECTION|<collection id>|MOVIE`;
- native TMDB People sources with one of the four supported Acting/Directing and Movie/Series identities;
- native TMDB Studio Movie or Series sources with identity `tmdb|COMPANY|<studio id>|MOVIE` or `tmdb|COMPANY|<studio id>|TV`.

Addon-backed, opaque/community, Discover, List, Network, incomplete Company, and other unsupported native source shapes remain readable, movable, preservable, and removable, but do not expose Edit. The editor never treats several sources as one logical bundle.

## Architecture

Source editing is framework-independent under `builder/src/source-edit/`:

- `source-editors.js` owns the adapter registry and supported-source lookup;
- `movie-collection-editor.js` owns the movie-collection draft, validation, identity, and minimal patch;
- `people-editor.js` owns the People draft, four supported combinations, validation, identity, and minimal patch;
- `people-edit-counts.js` reuses the issue #74 People provider, success cache, count state, and exact combined-credit semantics for one bounded non-blocking edit-session check;
- `studio-editor.js` owns the fixed media-specific Studio identity, display title, supported sort inventory, validation, and difference-only minimal patch;
- `studio-edit-counts.js` reuses the issue #92 Studio count provider and success cache for one bounded non-blocking automatic media-specific count check;
- `source-edit-actions.js` binds the exact physical source, performs stale-state and duplicate checks, and delegates a real change to `controller.updateNode()` exactly once;
- `source-edit-utils.js` contains shared canonicalisation, title validation, and safe-label helpers.

The registry is deliberately independent of Add Source. A future native editor can be added through another adapter without adding a conditional branch to the controller or changing the importer/serializer/domain contract. UI modules consume only the public source-edit entry point.

## Editable fields

| Source | Editable | Fixed and preserved |
| --- | --- | --- |
| Movie Collection | title; TMDB collection identity selected through the existing collection search/details boundary | provider, source type, media type, sort, filters, category, raw snapshot, unknown fields, Nuvio-facing source ID |
| People | title; one of Acting Movies, Acting Series, Directed Movies, or Directed Series; evidenced sort order | person TMDB ID, provider, filters, category, raw snapshot, unknown fields, Nuvio-facing source ID |
| Studio Movie/Series | display title and evidenced media-correct sort order | Studio TMDB ID, provider, `COMPANY`, `MOVIE`/`TV`, filters, category, raw snapshot, unknown fields, Nuvio-facing source ID |

The People title starts auto-managed only when the imported value is one of the existing stable v1 labels: `Movie Credits`, `Series Credits`, `Directed Movies`, or `Directed Series`. While auto-managed, every role/media change immediately applies the corresponding label. Typing makes the title custom, so later role/media changes preserve it. **Use default title** applies the current default and restores auto-management for the remainder of that edit session. No title-mode flag is serialized.

Selecting another Movie Collection immediately applies the result's canonical TMDB name to the draft title. The user may then type a custom title or use **Use selected collection name** to restore the canonical name. No picker action mutates the project before Save, and Cancel discards both identity and title changes.

The verified People sort inventory is the stable v1 trio: `Popular` → `popularity.desc`; `Recent` → `primary_release_date.desc` for Movies or `first_air_date.desc` for Series; and `Top rated` → `vote_average.desc`. The adapter owns `sortBy`, but patches it only after an intentional sort change and only to the correct verified value for the final media. Imported null, unusual, mixed-case, or otherwise unsupported values remain visible as the preserved current value and are not normalized while untouched.

The verified Studio inventory is presented as four compact no-icon semantic pills with only the selected description visible. Movie uses Popular → `popularity.desc`, Recent → `primary_release_date.desc`, Top rated → `vote_average.desc`, and Most voted → `vote_count.desc`; TV uses the same mappings except Recent → `first_air_date.desc`. Both pinned current resolvers pass through those correct-media values and their current UIs expose the four choices. The Studio adapter patches only intentional supported changes; an untouched unusual imported value remains exact. Source name is prepopulated and patches only `title`, never Studio identity or media.

Title patching remains difference-only. Opening and saving an imported unusual, null, absent, or otherwise untouched custom title does not coerce it. Once the user edits or an approved automatic/default action changes it, the draft must satisfy the existing Nuvio title rule—including the established intentional U+200E title—and `title` is included only when the final value differs from storage.

## Identity, duplicates, and stale-state safety

Opening an editor binds:

- the exact collection, folder, and source builder `internalId` values;
- the physical source index and category;
- the selected adapter and original canonical identity;
- the immutable opening project reference.

Save re-resolves that binding before validation. It refuses to mutate when the source was deleted, moved to another parent, reordered, changed into another category/editor shape, had its identity changed elsewhere, or the controller project changed after the modal opened. Conflict copy asks the user to close and reopen rather than merging stale intent. These guards remain above the controller and add no edit-session metadata to Nuvio JSON.

Duplicate identity is evaluated only inside the destination folder and excludes the physical source being edited. A changed movie-collection identity collides on `tmdb|COLLECTION|id|MOVIE`; a changed People combination collides on `tmdb|PERSON|person id|media` or `tmdb|DIRECTOR|person id|media`; a Studio name/sort save retains `tmdb|COMPANY|studio id|MOVIE|TV` with its existing final media segment and ignores only its own physical source, not a second same-identity source. Unlike Add Source, editing has no `Add anyway` override. The failed Save renders a bordered `role="alert"` panel headed **Source already exists**, describes the identity-derived conflict without relying on the other source's custom title, scrolls/focuses the panel, retains the draft, and performs zero mutations.

## Mutation and preservation contract

Cancel, validation failure, duplicate rejection, stale-state rejection, and an unchanged save perform zero controller mutation calls and advance no project revision. A real edit builds only changed owned fields and calls `controller.updateNode(sourceInternalId, patch)` once, producing one content revision.

The existing preservation-first controller/domain/serializer path remains authoritative. Source and folder order, raw IDs, compact or verbose imported representation, unknown/community fields, null/default fields, untouched sort/filter values, addon compatibility projections, collection/folder presentation, and unrelated sources remain untouched. Serialization continues to overlay recognised edited fields onto imported raw snapshots and emits no builder `internalId`, title-management mode, count state, or source-edit state.

## UI and accessibility

Supported source overflow menus contain `Edit source` before Delete. Unsupported sources retain Delete only. The dedicated `Edit source` modal is portalled to the document body and reuses the established opaque mobile surface, body-lock, Visual Viewport, inert-underlay, focus-containment, Escape, and exact-trigger restoration contracts.

The modal names the containing folder and current identity. At desktop/tablet widths it uses natural content height capped by the current viewport, so a short Collection form keeps its Save/Cancel footer attached instead of inheriting the taller Add Source shell; content becomes scrollable only when the cap is reached. Below 900px it deliberately remains a full-height task surface with one scroll owner, sticky header/footer, safe-area handling, and live Visual Viewport/keyboard geometry. People editing opens immediately from stored data and shows all four role/media combinations, title-management action, and evidenced sort choices. In parallel it reuses a successful cached combined-credit result for the same person and provider language scope or makes one bounded person-details/combined-credits request for the edit session. Counts use issue #74 semantics: distinct cast Movie IDs, distinct cast TV-series IDs, distinct Director-crew Movie IDs, and distinct Director-crew TV-series IDs. Switching choices never refetches. Loading and sanitized failure remain non-blocking, Retry is explicit, and no folder artwork request occurs. Resolving counts does not replace the shell sizing mode or introduce a second scroll owner.

Studio editing opens from stored identity with a prepopulated Source name but no identity picker. It hydrates available catalogue presentation by exact ID, uses the same normalized contained logo/text fallback and upper-right canonical TMDB Company link as Add/Configure, and automatically shows the current media count. Failure renders the quiet `Count unavailable` state without Retry or Refresh and remains non-blocking. User-facing labels are **Movies** and **Series** while the fixed source contracts remain `MOVIE` and `TV`. Save changes only display title and/or the evidenced media-correct sort on that physical source and never inserts another source.

Movie Collection editing starts offline with the current source title as the readable primary label and `TMDB collection <id>` as secondary metadata; this does not claim that a custom title is canonical. The existing picker is mounted only after `Choose another franchise`. After selection, the canonical collection name is primary, the ID remains secondary, and copy states that this is the collection that will be saved.

Duplicate, validation, and stale/conflict diagnostics use the Builder's prominent bordered `role="alert"` panel. The editable `title` is labelled **Source name** without changing the serialized property. Auto-managed People and selected-Collection values explain that the name updates until customized; custom values use the general Nuvio-name helper. A required-name failure keeps the alert rendered and announced with **Enter a name for this source before saving.**, then focuses the first mapped invalid field after React renders its invalid state. The explicit path-to-ref map currently maps `$sourceEdit.title` to the mounted Source name input. Unmapped validation diagnostics and every duplicate, stale, picker, or global failure retain alert focus. Successful no-op and changed saves close the dialog, retain the exact source selection, restore focus to its card, and announce the outcome through a polite source-edit status region. The single-column mobile layout retains large tap targets at the required 360–412px widths.

## Deterministic and client evidence

- `tests/builder-source-edit-foundation.test.mjs` covers adapter recognition, exact targeting, automatic/custom/default titles, Collection title adoption/reset/Cancel, all supported identity changes, People and Studio sort inventories and exact patches, imported-value preservation, shared count cache/semantics/failure, Studio self/second-source duplicate handling, no-op/one-revision behavior, stale conflicts, ordering, and deterministic second cycles.
- `tests/builder-source-edit-ui.test.mjs` covers menu exposure/order including Studio, Source name and helper copy, immediate prepopulation, friendly count states, enabled Save after count failure, fixed People/Studio identities, verified/imported sort presentation, Studio logo/link/automatic current count without Retry or Refresh, name-first Collection presentation, prominent duplicate alert presentation, explicit picker activation, inert/portal/focus lifecycle, dismissal, announcements, natural-height desktop sizing, attached footer/sort visibility, and full-height mobile responsive contracts.
- `tests/builder-source-edit-mounted.test.mjs` mounts the actual React editor in headless Chromium and performs real People and Collection required-name interactions plus a duplicate failure. It asserts `document.activeElement`, rendered invalid and alert state, retained drafts, zero controller updates, unchanged revision and serialization, and the shared field-ref/fallback focus behavior.
- `scripts/check-builder-source-edit-fixture.mjs` validates the sanitized fixture package under [`manual-tests/nuvio-clients/issue-78-source-editing/`](../../manual-tests/nuvio-clients/issue-78-source-editing/).

Bounded local browser QA on 2026-08-02 covered desktop plus 360px, 393px, and 412px modal geometry, source-menu exposure, Collection title/no-op/Save/picker/Back, People role-media/default title, duplicate rejection, Cancel/Escape/backdrop safety, validation focus, trigger/source focus recovery, body locking/restoration, Visual Viewport resize, horizontal overflow, and console warnings/errors. It made no TMDB lookup request. Dave subsequently completed the Round 2 desktop and physical-iPhone review and confirmed the mobile flow passed; no device model, OS version, or browser build was supplied or inferred. The final owner-requested closeout keeps desktop/tablet editors at natural height and adds canonical TMDB entity links to the separate Add Source review/configuration surfaces.

The manual package defines a Movie Collection identity/title change, a default-title People role/media/sort change with editor counts, a separate custom-title preservation People change, and a no-op import/export round trip. Repository validation and owner desktop/physical-phone review are complete. Because V2 does not yet expose export, a complete current-client V2 edit/export round trip is deliberately deferred until export exists; no Nuvio Desktop, web, mobile, or TV result is claimed for that round trip, and the deferral is not a blocker or unfinished pre-merge gate.

## Deliberate exclusions

This slice does not add logical multi-source/bundle editing, person replacement, Collection sort or any filter controls, duplicate overrides, source creation, new provider/source types, artwork changes, collection/folder settings, export UI, persistence, migration actions, v1 changes, Worker routes or policy, dependencies, lockfiles, Pages contracts, workflows, production data, or `nuvio-assets` changes.
