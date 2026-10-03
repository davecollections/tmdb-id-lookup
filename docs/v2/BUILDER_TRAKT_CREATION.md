# Trakt Lists creation

[B3 #282](https://github.com/davecollections/tmdb-id-lookup/issues/282) implements the approved design from [#281](https://github.com/davecollections/tmdb-id-lookup/issues/281), beneath [#276](https://github.com/davecollections/tmdb-id-lookup/issues/276). B3 includes the Phase A foundation and owner-approved visible Trakt Lists creation flows. The Phase A foundation was approved in commit `3b2b144266a6f94489576b94e84bb17e87f0f561`. Owner UI review and bounded real Builder production-path acceptance are complete. C remains separate from B3.

## C Phase A foundation — local owner-review gate

[C #284](https://github.com/davecollections/tmdb-id-lookup/issues/284) adds nonvisual foundations after B3 merged. Visible result cards, Preview, Source Edit controls and About & Credits remain unchanged. Phase A is pending owner code review; C is not complete.

- `getItems(id, { signal, limit = 15, refresh = false })` extends the existing client. It requests only page 1, accepts limits 1–50 and strictly normalizes matching v1 first-page samples, including nullable movie/show/season/episode fields. Service order and repeated rows survive. The existing 40-entry, five-minute success cache, invalidation, cancellation, timeout and cooldown remain shared.
- The opt-in local middleware accepts only canonical numeric `/lists/<id>/items` with page 1 and limit 1–50. Existing fixed target, same-origin/host, GET, omitted-credential and redirect restrictions remain. Phase A does not enable live review.
- `normalizeTraktPreview` preserves sample text/order and adds position, type label, honest missing-title fallback, season/episode detail and optional poster identity. Season 0 survives. Parent artwork uses only `show_tmdb`; no parent title is invented. This adapter owns no selection, media detection or project state.
- `createTmdbJsonRequester` extracts only the existing collection provider transport. Collection normalization and caller behavior remain unchanged. `createTmdbTitlePosterProvider().getPosters(identities, { signal })` returns a separate outcome per sample row, dedupes by movie/TV plus ID, caps concurrent work at three across batches, and caches successful detail results for five minutes (40 entries). Rate-limit responses stop further queued dispatch in that batch. No automatic retry, persistence or Trakt artwork is introduced.
- Artwork failures never replace or erase sample text. Both the adapter and poster provider remain unwired; Phase B must invoke them only after explicit Preview and a successful items response. It must use the existing request coordinator to reject late/closed results. Samples never prove composition or saved-sort fidelity.
- Canonical authored sources allow the eight supported sorts and both directions. The creation draft validator adds rank/asc requirements. The Source Edit domain owns title/sort/direction; provider/List/media remain immutable. Changed fields alone are patched; unsupported imports remain preservation-only.

Phase A verification is pure/injected: focused client/proxy, normalization/poster, creation, native-source serialization and Source Edit regressions, affected static contracts, production build and code-only artifact validation. No live Trakt or production TMDB requests are authorized in this phase. The new `tests/builder-trakt-preview.test.mjs` is registered alongside the existing Trakt tests.

### Locked Phase B credit placement

The approved copy is: “Public list data is supplied by Trakt. Dingo is not affiliated with or endorsed by Trakt.” Link Trakt as text, with no new logo.

This belongs **only** in the existing **About & Credits → Data credits** section. Do not add attribution, branding, badges or disclaimer copy to result cards, Preview dialogs, Source Edit, creation flows or exports. Keep the existing Trakt List Lookup related-tool link separate. Phase A changes no visible credit UI.

## Current boundary

Trakt Lists is registered in the existing New Collection, New Folder and selected-Folder Add Source launchers. One `TraktSourceFlow` uses the Phase A client, selection session and planner. Construction and opening remain request-free; discovery and selected-only media work require explicit actions. The visible Source Edit remains name-only; C Phase A extends its nonvisual domain as described above. The mounted and deterministic owner-review fixtures provide explicitly owner-authorized injected mechanics evidence, with zero production Trakt requests. Separate bounded real Builder production-path acceptance has passed using the same production client and flow. Service code, Cloudflare configuration, CORS, credentials, dependencies and v1 are unchanged.

## Visible flow and reuse

Hierarchy uses Select → Media → Names → Appearance → Create; Add Source uses Select → Media → Review → Add. Select offers explicit Keyword/User searches, Popular/Trending actions and multiline URL/ID resolution. Search uses page 1, limit 30 and explicit Load more in service order. Numeric keywords remain keywords. Selection persists across modes/pages and stages. Selected-list removal and Clear selected lists are separate from Clear input.

Media shows known counts and Automatic/Movies/Series/Both choices. Unverified failures require explicit Verify list before manual recovery; unavailable lists stay blocked until verification succeeds. Zero counts explain potentially empty or season/episode-only output. Cooldowns gate requests, expire without automatic retries, and have no per-second announcements. More than 25 selected lists exposes explicit continuation only after a batch; 25 is not a selection cap.

Ready-only names reuse `RequiredNameInput`, `useSourceNames` and the collapsed `SourceNamesDisclosure`. Physical duplicate outcomes drive neutral review rows and shared location notices. Complete overlap has Nothing to add and no Create/Add button. New Folder partial overlap creates a new sibling containing only missing media. Add Source variants/unknown imported settings remain addable with concise explanations.

`GuidedPresentationControls` is extracted unchanged from TMDB Lists for the two real consumers. It reuses the existing Collection/Folder controls and exact artwork note. No artwork or sort controls are added. The outer creation shell, focus trap, viewport handling, body lock, creation headings, output summary and selected-list disclosure are reused. Each stage has one content scroll owner; initial focus goes to a heading, not Search.

The workspace provides current project/revision to the Trakt flow separately from other families' opening snapshots. Final submission supplies current options to `applyTraktCreationPlan`, verifies the active destination/session, and performs one existing atomic operation. A changed reviewed project returns to current review without mutation.

Phase B extends the Phase A media batching rule to skip a valid verified manual choice after failure. This prevents repeated checks on Back/forward while another selected list still needs checking. A focused regression covers that behavior; the approved Phase A commit is intact.

## Client and discovery

`builder/src/config/trakt-api.js` owns the fixed `https://api.dingo.build` origin. `createTraktClient` in `source-add/trakt-client.js` exposes `searchKeyword`, `searchUser`, `browse`, `resolve`, `getMedia` and the C Phase A `getItems` method. Items remain unwired from the UI. Requests use GET, Accept JSON, omitted credentials, rejected redirects, AbortSignal and a 25-second timeout covering response-body reads. Strict v1 normalization validates canonical numeric IDs, required structures, nullable values and consistent media counts. Errors are sanitized typed values, never raw upstream messages. Retry-After delta seconds and HTTP dates become a not-before timestamp; there are no automatic retries.

The existing bounded success cache holds at most 40 entries for five minutes in session memory. It does not own selections. An authoritative `LIST_NOT_FOUND` replaces this small cache so cached URL aliases cannot restore old public access; explicit public verification bypasses success-cache reads. A superseded cache cannot be repopulated by older pending requests. There is no extra coalescer or persistence.

Keyword input retains Keyword semantics, including numeric text. User mode accepts only a username, with an optional leading `@`; filtered-user behavior is absent. Popular and Trending use the browse route. Pagination follows the existing service limits (page 1–25, limit 1–50, default 30).

URL/ID input is split by line, trimmed, ordered and deduplicated only for identical lines or canonical numeric IDs. URL strings go to the service's authoritative resolver. This retains `trakt.tv/users/:user/lists/:slug`, `app.trakt.tv/users/:user/lists/:slug`, the existing `www.trakt.tv` alias, numeric IDs and supported-host `/lists/:id` forms without copying a host/path input grammar. Unsupported strings are left for service validation. Returned links are independently checked for safe origins as response validation.

## Selection and media

`createTraktSelectionSession` reuses ordered selection and async request coordinators. Canonical list IDs appear once in first-selected order; removal and reselection append anew. There is no selection cap. Metadata refresh preserves media overrides and session name drafts. `setNames` stores Folder/source text drafts; final Nuvio validation belongs to planning. Removing or clearing selections removes their derived state. Clearing input preserves selections. Resolution retains line-specific errors and completed successes; repeated active submission is ignored and replacement/cancel suppresses late responses. Resolve work is also deliberately bounded to 25 lines per call; generic Resume processes pending and retryable-failed rows only.

Media has five statuses: not-checked, checking, known, failed, unavailable. Public-read evidence, composition, manual override and sanitized error are separate. Successful media supplies public access directly; ordinary discovery selections do not resolve first. Automatic maps movie-only to MOVIE, show-only to TV and mixed to MOVIE then TV. Zero or failure stays unresolved. Manual Movies/Series/Both requires positive public access. An authoritative unavailable response revokes access and remains blocking through later transient failures until successful explicit verification. Discovery metadata cannot undo that revocation.

`checkMediaBatch` checks selected pending/failed lists lacking a valid effective media choice, two concurrently and at most 25 per deliberate call. It retains successes and does not drain later batches. Shared budget/rate/abuse/configuration/busy refusals stop new dispatch; dispatched requests may settle. Retry-After blocks new work until its timestamp. Back/close uses `cancel`; canceled media restores the pre-check state and current override. The visible flow connects these calls to its existing dialog/request ownership.

## Planning and atomic apply

`createTraktCreationPlan` takes the current project, revision, scope, destination, ordered selected rows and presentation/name drafts. It requires resolved media/public access, unique canonical IDs and media associated with the same list. It reuses B2 `buildNativeTraktSourceDraft`, physical identity, configuration keys and source occurrences. New sources retain the exact B2 fields and rank/asc defaults.

| Operation | Placement rule |
| --- | --- |
| New Collection | One new Collection, one Folder per list, one or two physical sources. All elsewhere matches are informational. |
| New Folder | Omit physical matches anywhere in the destination Collection. Partial Both creates a new sibling Folder with only missing media. Complete overlap creates no Folder; all-overlap apply returns Nothing to add without a revision. |
| Add Source | Omit only proven equivalent same-Folder configurations, excluding title. Known variants and unknown comparison remain addable; elsewhere matches are informational. No new Folder. |

There is no Folder affinity, existing-node rewrite or duplicate override. Outcomes retain ready/omitted and location/comparison evidence for later neutral review rows. Folder names default to the list name or `Trakt List <id>`; hierarchy sources use `Movies`/`Series`; Add Source uses `<list name> · Movies/Series`. Only ready-output names must validate. Names never define identity.

Plans capture immutable configuration and project authority. `validateTraktCreationPlan` rebuilds and compares the full plan, and `applyTraktCreationPlan` revalidates before one existing atomic controller operation. **The visible flow supplies current dialog options at final validation/apply**, rather than passing only an old plan: the domain cannot observe UI selection/media/destination changes by itself. Project/revision changes, changed options and tampered plans fail closed. No new transaction type was added.

## Local live-review transport

Production CORS does not permit local/LAN browser origins. `builder/trakt-preview-proxy.js` therefore supplies a local Vite middleware under `/__trakt_preview__`, enabled for the Vite dev server (`npm run dev`) only with `TRAKT_LIVE_REVIEW=1`. Vite derives one boolean for both middleware installation and the real Builder workspace client’s `localPreview` option. The client retains its localhost/private-LAN fail-closed guard and its existing workspace lifetime; injected review clients are unchanged. Outside the opted-in local dev-server mode, the client calls `https://api.dingo.build` directly. Production builds and previews of built assets always disable this seam, even when the shell flag is set; there is no runtime or user-facing switch. The fixed target is the production Dingo API; allowed paths are search, browse, resolve, media and the bounded C first-page items route. GET-only path/query allowlisting, local Host/same-origin checks, omitted credentials, no Authorization/Cookie/Origin forwarding and rejected redirects keep it narrow. It forwards Retry-After and is not a production route or CORS change. Merely enabling it makes no request. Phase A did not enable or exercise it against the live service.

## Validation and later work

The B3 canonical pure suites are `tests/builder-trakt-client.test.mjs` and `tests/builder-trakt-creation.test.mjs`. They are in `check-all` and the Core test-path registry; production foundation/configuration changes retain conservative full CI routing. Phase B also updates existing capability/launcher contracts and the existing `builder-source-edit-mounted.test.mjs` harness. Run the focused injected matrix with `TRAKT_CREATION_ONLY=1` and `--test-name-pattern="mounted Trakt Lists creation"`. The matrix covers all three entry points at 360, 384, 393, 402, 412 and 1280 pixels, short height, enlarged text, forced colours, reduced motion, keyboard selection and atomic output, with dedicated batching/recovery/cancellation/stale/duplicate scenarios at phone and desktop widths. Browser interception blocks and counts external attempts; the fixture also rejects uninjected fetches.

Owner review uses the same fixture at `tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review`, served by the extracted `createSourceEditMountedServer` helper with `reviewOnly: true`. The helper is shared with the existing automated harness; no production mock switch exists. Review-only CSP restricts connections/images to local assets. Choose lists 101, 102 and 103 for A: New Collection (3 Folders/4 Sources), B: New Folder (2 new sibling Folders/2 Sources), and C: Add Source (3 new Sources). Review Keyword, User, multiline URL/ID, Popular/Trending, overrides, Back and phone layout. All data is explicitly deterministic. `TRAKT_LIVE_REVIEW` remains disabled. This fixture remains mechanics evidence, separate from the completed real Builder production-path acceptance.

C owns an explicit-open, first-page `/items` sample, Source Edit sorting and restrained credits. Text/list data stays authoritative; optional posters must use existing TMDB infrastructure only, never Trakt artwork URLs, and failures retain usable text. Samples do not prove composition, exact physical-source output or saved-sort fidelity. The nonvisual C Phase A foundation is described above; visible UI and live acceptance require subsequent owner gates. Service deployment-status documentation was corrected separately without runtime changes.
