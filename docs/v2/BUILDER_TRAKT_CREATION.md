# Trakt Lists creation foundation

[B3 #282](https://github.com/davecollections/tmdb-id-lookup/issues/282) implements the approved design from [#281](https://github.com/davecollections/tmdb-id-lookup/issues/281), beneath [#276](https://github.com/davecollections/tmdb-id-lookup/issues/276). B3 has two internal phases on one issue/branch: foundation, then owner-approved visible creation flows. B3 receives one integration PR; C receives a later separate PR. This document covers the Phase A foundation. It does not authorize Phase B or integration.

## Current boundary

The modules are inert and have no creation-menu, launcher, component or startup imports. No visible Trakt creation flow exists. B2's Source Edit remains name-only. Phase A validation uses injected pure examples, with zero production Trakt data requests; it is not live-service acceptance. Service code, Cloudflare configuration, CORS, credentials, dependencies and v1 are unchanged.

## Client and discovery

`builder/src/config/trakt-api.js` owns the fixed `https://api.dingo.build` origin. `createTraktClient` in `source-add/trakt-client.js` exposes `searchKeyword`, `searchUser`, `browse`, `resolve` and `getMedia`. There is no `/items` client method. Requests use GET, Accept JSON, omitted credentials, rejected redirects, AbortSignal and a 25-second timeout covering response-body reads. Strict v1 normalization validates canonical numeric IDs, required structures, nullable values and consistent media counts. Errors are sanitized typed values, never raw upstream messages. Retry-After delta seconds and HTTP dates become a not-before timestamp; there are no automatic retries.

The existing bounded success cache holds at most 40 entries for five minutes in session memory. It does not own selections. An authoritative `LIST_NOT_FOUND` replaces this small cache so cached URL aliases cannot restore old public access; explicit public verification bypasses success-cache reads. A superseded cache cannot be repopulated by older pending requests. There is no extra coalescer or persistence.

Keyword input retains Keyword semantics, including numeric text. User mode accepts only a username, with an optional leading `@`; filtered-user behavior is absent. Popular and Trending use the browse route. Pagination follows the existing service limits (page 1–25, limit 1–50, default 30).

URL/ID input is split by line, trimmed, ordered and deduplicated only for identical lines or canonical numeric IDs. URL strings go to the service's authoritative resolver. This retains `trakt.tv/users/:user/lists/:slug`, `app.trakt.tv/users/:user/lists/:slug`, the existing `www.trakt.tv` alias, numeric IDs and supported-host `/lists/:id` forms without copying a host/path input grammar. Unsupported strings are left for service validation. Returned links are independently checked for safe origins as response validation.

## Selection and media

`createTraktSelectionSession` reuses ordered selection and async request coordinators. Canonical list IDs appear once in first-selected order; removal and reselection append anew. There is no selection cap. Metadata refresh preserves media overrides and session name drafts. `setNames` stores Folder/source text drafts; final Nuvio validation belongs to planning. Removing or clearing selections removes their derived state. Clearing input preserves selections. Resolution retains line-specific errors and completed successes; repeated active submission is ignored and replacement/cancel suppresses late responses. Resolve work is also deliberately bounded to 25 lines per call; generic Resume processes pending and retryable-failed rows only.

Media has five statuses: not-checked, checking, known, failed, unavailable. Public-read evidence, composition, manual override and sanitized error are separate. Successful media supplies public access directly; ordinary discovery selections do not resolve first. Automatic maps movie-only to MOVIE, show-only to TV and mixed to MOVIE then TV. Zero or failure stays unresolved. Manual Movies/Series/Both requires positive public access. An authoritative unavailable response revokes access and remains blocking through later transient failures until successful explicit verification. Discovery metadata cannot undo that revocation.

`checkMediaBatch` checks selected pending/failed lists only, two concurrently and at most 25 per deliberate call. It retains successes and does not drain later batches. Shared budget/rate/abuse/configuration/busy refusals stop new dispatch; dispatched requests may settle. Retry-After blocks new work until its timestamp. Back/close uses `cancel`; canceled media restores the pre-check state and current override. Phase B must connect those lifecycle calls to its existing dialog/request ownership.

## Planning and atomic apply

`createTraktCreationPlan` takes the current project, revision, scope, destination, ordered selected rows and presentation/name drafts. It requires resolved media/public access, unique canonical IDs and media associated with the same list. It reuses B2 `buildNativeTraktSourceDraft`, physical identity, configuration keys and source occurrences. New sources retain the exact B2 fields and rank/asc defaults.

| Operation | Placement rule |
| --- | --- |
| New Collection | One new Collection, one Folder per list, one or two physical sources. All elsewhere matches are informational. |
| New Folder | Omit physical matches anywhere in the destination Collection. Partial Both creates a new sibling Folder with only missing media. Complete overlap creates no Folder; all-overlap apply returns Nothing to add without a revision. |
| Add Source | Omit only proven equivalent same-Folder configurations, excluding title. Known variants and unknown comparison remain addable; elsewhere matches are informational. No new Folder. |

There is no Folder affinity, existing-node rewrite or duplicate override. Outcomes retain ready/omitted and location/comparison evidence for later neutral review rows. Folder names default to the list name or `Trakt List <id>`; hierarchy sources use `Movies`/`Series`; Add Source uses `<list name> · Movies/Series`. Only ready-output names must validate. Names never define identity.

Plans capture immutable configuration and project authority. `validateTraktCreationPlan` rebuilds and compares the full plan, and `applyTraktCreationPlan` revalidates before one existing atomic controller operation. **Phase B must supply current dialog options at final validation/apply**, rather than passing only an old plan: the domain cannot observe UI selection/media/destination changes by itself. Project/revision changes, changed options and tampered plans fail closed. No new transaction type was added.

## Local live-review transport

Production CORS does not permit local/LAN browser origins. `builder/trakt-preview-proxy.js` therefore supplies a local Vite middleware under `/__trakt_preview__`, installed only with `TRAKT_LIVE_REVIEW=1`. Future approved local review must also explicitly construct the client with `localPreview: true` on localhost/private LAN. The fixed target is the production Dingo API; allowed paths are search, browse, resolve and media only. GET-only path/query allowlisting, local Host/same-origin checks, omitted credentials, no Authorization/Cookie/Origin forwarding and rejected redirects keep it narrow. It forwards Retry-After and is not a production route or CORS change. Merely enabling it makes no request. Phase A did not enable or exercise it against the live service.

## Validation and later work

The two canonical pure suites are `tests/builder-trakt-client.test.mjs` and `tests/builder-trakt-creation.test.mjs`. They are in `check-all` and the Core test-path registry; production foundation/configuration changes retain conservative full CI routing. Narrow orchestration tests validate registration. The full repository suite and production-path acceptance remain for later authorized B3 integration.

C owns an explicit-open, first-page `/items` sample, Source Edit sorting and restrained credits. Text/list data stays authoritative; optional posters must use existing TMDB infrastructure only, never Trakt artwork URLs, and failures retain usable text. Samples do not prove composition, exact physical-source output or saved-sort fidelity. No C implementation is present. The Trakt service's stale deployment wording is deferred independent documentation housekeeping, not a B3 runtime dependency.
