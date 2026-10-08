# Trakt Lists creation

**Completion status — 2026-10-05:** B3 [#282 / PR #283](https://github.com/davecollections/tmdb-id-lookup/pull/283) and C [#284 / PR #285](https://github.com/davecollections/tmdb-id-lookup/pull/285) are merged, including the separately delivered service dependency and bounded production/physical acceptance. Parent #276 is complete. #288 / PR #289 subsequently extends supported imported Source Edit Preview metadata; see [the current source contract](./BUILDER_TRAKT_SOURCES.md). Dated phase gates below are historical; the Product Plan owns [current completion status](./BUILDER_PRODUCT_PLAN.md#current-state) and the [canonical roadmap](./BUILDER_PRODUCT_PLAN.md#18-roadmap-and-mandatory-gates).

## C #284 count clarity and physical acceptance — 2026-10-03

Discovery labels Trakt `itemCount` as **item/items**. Media review shows the existing
Trakt total first (`215 items in this Trakt List`), then existing movie/show counts
(`In Nuvio: 46 Movies · 3 Series`), then the unchanged “Will create” line. Null totals
are omitted, zero and singular values survive, and no total is inferred. The quiet
44px information button appears only when both counts are known and the Trakt total
is greater than Movies + Series. Equal or reversed totals omit it without correcting
either authoritative value. The shared nested dialog explains whole Movies/Series
versus individual Seasons/Episodes and normal episode access inside a Series; it
never invents a remainder or sends a request. “Preview titles” and the separate
stage-level rank/asc note retain their existing meaning and behavior.

The owner reported a real Nuvio Desktop import and re-export of a Builder-created
Collection for **MARVEL Cinematic Universe**, Trakt List **1248149**: Trakt metadata
reported **215 items**; Media and Nuvio displayed **46 Movies and 3 Series**.
Individual Season/Episode entries did not appear as separate Collection items.
The round-trip retained both physical sources (`provider=trakt`, List ID 1248149,
`mediaType=MOVIE` and `TV`, each `sortBy=rank`, `sortHow=asc`). Nuvio added its normal
nullable compatibility fields.

Physical Nuvio Desktop acceptance for C is now **complete**. The subsequent
Builder export with Series `TV/title/desc` imported successfully; its visible order
matched the real sorted Builder Preview. Nuvio's re-export preserved provider,
List ID, media, sort and direction: Movies remained `MOVIE/rank/asc`, and Series
remained `TV/title/desc`. Normal nullable compatibility fields and
`focusGifEnabled=true` were additive and did not change Trakt source semantics.
The mixed rank/asc and edited-sort cases together complete the required physical
acceptance; neither needs repeating for integration.

<a id="c-284-current-local-preview-refinement--2026-10-03"></a>

## Historical C #284 local Preview refinement — 2026-10-03

The approved shared poster-only discovery Preview is also available explicitly on each
selected List's Media card. Its standard Preview titles button occupies the reserved
right-hand region on wide screens and wraps on phones; remove remains top-right.
Entering Media, media detection and choice changes never request an item sample.
Discovery and Media share the combined first-page/50-item sample and bounded cache.

The single stage helper says: “New Trakt sources use List order · Ascending. You can
change the sorting later by editing the Source.” All three creation scopes still author
`rank` / `asc`, with no creation sort controls. The [current Source Edit contract](BUILDER_TRAKT_SOURCES.md#c-284-current-local-refinement--2026-10-03)
adds an explicit upstream-sorted Preview of the unsaved fixed-media draft through the
narrow Dingo sorted-items extension. It supersedes earlier Source Edit Preview deferral,
no-service-change and text-fallback assumptions; historical foundation notes below remain
as the record of that earlier gate. The sorted-items dependency merged in
[service PR #28](https://github.com/davecollections/trakt-list-lookup/pull/28) and is
deployed. Real Source Edit TV/title/desc Preview passed with one Trakt GET/cost one,
three TV detail requests and preserved poster order. Preview used the unsaved draft
while the saved source stayed rank/asc until explicit Save.

The historical owner-review fixture injected both the item client and TMDB poster provider. Its source sort
examples are synthetic service-order samples used only for the authorized local review;
they are not real external data or a product-side sorting implementation.


[B3 #282](https://github.com/davecollections/tmdb-id-lookup/issues/282) implements the approved design from [#281](https://github.com/davecollections/tmdb-id-lookup/issues/281), beneath [#276](https://github.com/davecollections/tmdb-id-lookup/issues/276). B3 includes the Phase A foundation and owner-approved visible Trakt Lists creation flows. The Phase A foundation was approved in commit `3b2b144266a6f94489576b94e84bb17e87f0f561`. Owner UI review and bounded real Builder production-path acceptance are complete. C remains separate from B3.

<a id="c-phase-a-foundation--local-owner-review-gate"></a>

## Historical C Phase A foundation — local owner-review gate

[C #284](https://github.com/davecollections/tmdb-id-lookup/issues/284) Phase A was owner-approved and committed as `1be435b19c0208137d3c3b78ca4156c93c34d234`. The following foundation notes describe that historical nonvisual gate. The current visible contract and completed live/physical acceptance are recorded above; C integration subsequently completed through PR #285.

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

Trakt Lists is registered in the existing New Collection, New Folder and selected-Folder Add Source launchers. One `TraktSourceFlow` uses the Phase A client, selection session and planner. Construction and opening remain request-free; discovery and selected-only media work require explicit actions. Source Edit now exposes title, the eight supported sorts, direction and explicit unsaved-draft Preview; provider/List/media stay fixed. The historical mounted and deterministic owner-review fixtures supplied explicitly owner-authorized injected mechanics evidence, with zero production Trakt requests; those records are not a standing exception to the current live-service policy in [Testing](../TESTING.md#live-external-service-boundary). Separate bounded real Builder production-path acceptance has passed using the same production client and flow. B3 left service code/configuration unchanged; C consumes the separately delivered sorted-items extension recorded above. Credentials remain server-side, and V1 is unchanged.

## Visible flow and reuse

Hierarchy uses Select → Media → Names → Appearance → Create; Add Source uses Select → Media → Review → Add. Select offers explicit Keyword/User searches, Popular/Trending actions and multiline URL/ID resolution. Search uses page 1, limit 30 and explicit Load more in service order. Numeric keywords remain keywords. Selection persists across modes/pages and stages. Selected-list removal and Clear selected lists are separate from Clear input.

Media shows known counts and Automatic/Movies/Series/Both choices. Unverified failures require explicit Verify list before manual recovery; unavailable lists stay blocked until verification succeeds. Zero counts explain potentially empty or season/episode-only output. Cooldowns gate requests, expire without automatic retries, and have no per-second announcements. More than 25 selected lists exposes explicit continuation only after a batch; 25 is not a selection cap.

Ready-only names reuse `RequiredNameInput`, `useSourceNames` and the collapsed `SourceNamesDisclosure`. Physical duplicate outcomes drive neutral review rows and shared location notices. Complete overlap has Nothing to add and no Create/Add button. New Folder partial overlap creates a new sibling containing only missing media. Add Source variants/unknown imported settings remain addable with concise explanations.

`GuidedPresentationControls` is extracted unchanged from TMDB Lists for the two real consumers. It reuses the existing Collection/Folder controls and exact artwork note. No artwork or sort controls are added. The outer creation shell, focus trap, viewport handling, body lock, creation headings, output summary and selected-list disclosure are reused. Each stage has one content scroll owner; initial focus goes to a heading, not Search.

The workspace provides current project/revision to the Trakt flow separately from other families' opening snapshots. Final submission supplies current options to `applyTraktCreationPlan`, verifies the active destination/session, and performs one existing atomic operation. A changed reviewed project returns to current review without mutation.

Phase B extends the Phase A media batching rule to skip a valid verified manual choice after failure. This prevents repeated checks on Back/forward while another selected list still needs checking. A focused regression covers that behavior; the approved Phase A commit is intact.

## Client and discovery

`builder/src/config/trakt-api.js` owns the fixed `https://api.dingo.build` origin. `createTraktClient` in `source-add/trakt-client.js` exposes `searchKeyword`, `searchUser`, `browse`, `resolve`, `getMedia` and the C Phase A `getItems` method. Explicit discovery, Media and Source Edit Preview use `getItems`. Requests use GET, Accept JSON, omitted credentials, rejected redirects, AbortSignal and a 25-second timeout covering response-body reads. Strict v1 normalization validates canonical numeric IDs, required structures, nullable values and consistent media counts. Errors are sanitized typed values, never raw upstream messages. Retry-After delta seconds and HTTP dates become a not-before timestamp; there are no automatic retries.

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

<a id="validation-and-later-work"></a>

## Historical validation and owner-review procedure

The B3 canonical pure suites were `tests/builder-trakt-client.test.mjs` and `tests/builder-trakt-creation.test.mjs`. They were registered in `check-all` and the Core test-path registry; production foundation/configuration changes retained conservative full CI routing. Phase B also updated existing capability/launcher contracts and the existing `builder-source-edit-mounted.test.mjs` harness. At the B3 review gate, the focused injected matrix ran with `TRAKT_CREATION_ONLY=1` and `--test-name-pattern="mounted Trakt Lists creation"`. The matrix covered all three entry points at 360, 384, 393, 402, 412 and 1280 pixels, short height, enlarged text, forced colours, reduced motion, keyboard selection and atomic output, with dedicated batching/recovery/cancellation/stale/duplicate scenarios at phone and desktop widths. Browser interception blocked and counted external attempts; the fixture also rejected uninjected fetches.

Owner review used the same fixture at `tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review`, served by the extracted `createSourceEditMountedServer` helper with `reviewOnly: true`. The helper was shared with the existing automated harness; no production mock switch was added. Review-only CSP restricted connections/images to local assets. The procedure selected lists 101, 102 and 103 for A: New Collection (3 Folders/4 Sources), B: New Folder (2 new sibling Folders/2 Sources), and C: Add Source (3 new Sources). Review covered Keyword, User, multiline URL/ID, Popular/Trending, overrides, Back and phone layout. All fixture data was explicitly deterministic. `TRAKT_LIVE_REVIEW` remained disabled. This fixture remains historical mechanics evidence, separate from the completed real Builder production-path acceptance.

C owns explicit first-page `/items` Preview, Source Edit sorting and restrained credits. The shared Preview is poster-only, uses existing TMDB infrastructure and omits missing posters; no Trakt artwork is used. Samples do not prove composition. Real sorted Source Edit Preview and physical Nuvio Desktop rank/asc and title/desc round trips have passed. The sorted-items service dependency is merged/deployed; Builder C integration subsequently completed through [PR #285](https://github.com/davecollections/tmdb-id-lookup/pull/285). Current validation policy is owned by [Testing](../TESTING.md#live-external-service-boundary); the historical injected procedure above establishes no exception.
