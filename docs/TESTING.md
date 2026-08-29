# Repository Testing

## Live external-service boundary

Mounted-browser, integration, end-to-end, owner-review, and live-behaviour tests that exercise an external service must use the approved live service through the production integration path. Do not substitute fabricated titles, counts, response rows, resource or artwork paths, poster paths, URLs, response bodies, fake image/CDN servers, or fake Preview servers merely for determinism, convenience, request minimisation, offline execution, or a green result. When the approved service is unavailable, classify and report the external-service failure instead of manufacturing replacement behaviour.

Synthetic or injected data remains appropriate for narrow pure unit tests where external integration is not under test, including validators, sorting logic, plan construction, parsers, malformed-input rejection, cache TTL/LRU mechanics, stale-state logic, and abort/error mechanics. Do not rewrite those pure units to call live TMDB. A development-only mock may help inspect isolated presentation mechanics, but it is not mounted/integration/end-to-end, owner-acceptance, or live-behaviour evidence.

The canonical mounted Network Preview validation introduced through issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) deliberately uses the production Worker, real TMDB responses, and real `image.tmdb.org` resources. The normal repository check includes this mounted suite, so an external-service outage may make that check fail for an external reason.

Genre hierarchy issue [#130](https://github.com/davecollections/tmdb-id-lookup/issues/130) adds deterministic pure-unit coverage for exact source-draft query mapping, complete-query cache identity/lifecycle, and the narrow fail-closed Worker validator. Those injected units are not live evidence. After Dave manually deployed Worker version `857c1fa3-e62d-4fd8-9321-9573aedb1906` on 2026-08-21, the mounted Genre Preview scenario became an active required production-path check using the production Worker, real TMDB, and real `image.tmdb.org` posters for Movie, TV, lazy shared-media switching, Advanced filters, and exclusions at mobile and desktop widths. The second issue #130 correction makes exactly one canonical `include_adult=false` mandatory for every Genre Preview request and Worker acceptance. Dave confirmed deployment of the corrected 10,479-byte source on 2026-08-21; no second deployment version identifier was supplied. The production path then passed canonical-false Movie/TV/Advanced/exclusion behavior and rejected missing, true, duplicated, and generic Discover requests. This mounted scenario remains required; if the external path later fails, report it rather than bypassing, skipping, or replacing it with synthetic integrated responses.

Streaming hierarchy issue [#162](https://github.com/davecollections/tmdb-id-lookup/issues/162) extends the same canonical mounted suite across 360, 384, 393, 402, 412, 899, 900, 901, and 1280 pixels using the live three-response provider catalogue. The live matrix enters through New Collection with three same-title overlap candidates, proves overlap-first/project-order ranking, consistent UI-only **Collection 1/2/3** labels, exact partial deltas, reliable Folder/Source context, and no automatic choice. It switches New → existing → New while preserving Collection and logical new-Folder title drafts, selects the Apple TV Store/Dekkoo AU+US Both route, proves its one-existing/one-new/six-source Review delta, validates naming, leaves both unselected Collections byte-for-byte unchanged, preserves existing custom artwork/focus fields, leaves new unknown artwork unassigned, performs zero mutation before Apply, and updates only the selected Collection in one revision without creating a Collection. Responsive assertions cover label wrapping/no horizontal overflow, retain selected Region border/surface/tick while removing the redundant cyan left rail, and verify selected-service reconciliation for retained, partially pruned, and fully pruned Media/Region changes plus the compact three-folder name editor. Its 393px and 900px Preview cases use the production Worker, real TMDB Discover responses, and real `image.tmdb.org` posters for exact provider/Region/media/Sort drafts.

The same nine-width mounted suite has a deterministic owner-style import case for project-local affinity behavior that does not exercise an external service: two richly configured folders and six mixed preserved sources qualify the existing Collection from valid compound/alias Watch Provider plus Watch Region Discover content. A new Crunchyroll AU Movie/TV selection has zero exact overlap, remains unselected by default beside **Create new collection instead**, reports the explicit all-two-will-be-added copy, plans one new sibling Folder with no existing-Folder update, and applies once. It checks unchanged Collection identity/editable/raw data, exact existing Folder/source nodes and serialized output, and unassigned new artwork. Focused deterministic tests separately prove exact-before-affinity/project-order ranking, title/list/artwork/network-only negative cases, strict Collection-versus-Folder trust, unsafe exclusion, conflict visibility, stale rejection, project-order relabeling, artwork preservation, and New Collection no/partial/complete duplicate matching. A mounted deterministic unique-title complete-overlap case proves the unsuffixed label, exact no-project-changes copy, zero-change existing **Close** route, and separately confirmed duplicate-New route. Synthetic 20/50/100 provider data remains limited to deterministic selection/planning/scale mechanics and is not reported as live integration evidence. If the live catalogue, Worker, TMDB, or image CDN is unavailable, report that external failure rather than replacing the mounted response or resource path.

## Mounted browser lifecycle

Mounted-browser suites register their tests during module loading and start one isolated browser in a `before` hook. Keep browser setup out of top-level module evaluation so launch or cleanup failures are attributed to the suite instead of aborting test discovery. One browser per suite is preferred when the callbacks only assert results collected from the same mounted fixture.

Chrome owns DevTools port selection. Launch it with `--remote-debugging-port=0` and read the fresh profile's `DevToolsActivePort` file; do not reserve and release a port before launch. Browser and page WebSocket opens, fixture execution, cooperative shutdown, and forced shutdown must all remain bounded.

Mounted Chrome startup allows 10,000 ms by default. `DEVTOOLS_STARTUP_MS` may provide a positive integer millisecond override; an unset or blank value keeps the default, surrounding whitespace is ignored, and zero, negative, fractional, malformed, or unsafe integer values fail clearly. Nuvio Contract Validation sets the override to 30,000 ms for GitHub-hosted CI. Exceeding the allowance remains a test failure with bounded process, profile-directory, and Chrome-stderr diagnostics; mounted browser checks are not skipped or converted to success when Chrome starts slowly or cannot become ready.

The normal ownership path is:

1. request `Browser.close` through the browser-level DevTools connection;
2. await the direct Chrome child handle, its captured owned process tree, and browser socket closure;
3. close local DevTools connections and Vite;
4. remove the temporary Chrome profile and Vite cache.

If no browser connection was established, or cooperative close fails, use the bounded process-tree fallback. The fallback waits for the child and test-owned processes, not a potentially wedged client WebSocket. Process-group signaling is a fallback only and must remain limited to the isolated browser launch's process group plus explicitly captured browser PIDs.

Every asynchronous exit wait must be observed before cancellation can reject it. Check synchronous failure branches before creating waits, and wrap commands that may throw synchronously before combining them with other promises. Cleanup for one resource owner is idempotent: concurrent and repeated calls share one cleanup operation, while a failed cleanup may be retried.

Focused checks:

```powershell
node --test tests/mounted-browser-lifecycle.test.mjs
node --test tests/builder-source-edit-mounted.test.mjs
$env:TMDB_MOUNTED_BROWSER_DIAGNOSTICS = "1"
node --test tests/builder-source-edit-mounted.test.mjs
```
