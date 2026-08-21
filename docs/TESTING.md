# Repository Testing

## Live external-service boundary

Mounted-browser, integration, end-to-end, owner-review, and live-behaviour tests that exercise an external service must use the approved live service through the production integration path. Do not substitute fabricated titles, counts, response rows, resource or artwork paths, poster paths, URLs, response bodies, fake image/CDN servers, or fake Preview servers merely for determinism, convenience, request minimisation, offline execution, or a green result. When the approved service is unavailable, classify and report the external-service failure instead of manufacturing replacement behaviour.

Synthetic or injected data remains appropriate for narrow pure unit tests where external integration is not under test, including validators, sorting logic, plan construction, parsers, malformed-input rejection, cache TTL/LRU mechanics, stale-state logic, and abort/error mechanics. Do not rewrite those pure units to call live TMDB. A development-only mock may help inspect isolated presentation mechanics, but it is not mounted/integration/end-to-end, owner-acceptance, or live-behaviour evidence.

The canonical mounted Network Preview validation introduced through issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) deliberately uses the production Worker, real TMDB responses, and real `image.tmdb.org` resources. The normal repository check includes this mounted suite, so an external-service outage may make that check fail for an external reason.

Genre hierarchy issue [#130](https://github.com/davecollections/tmdb-id-lookup/issues/130) adds deterministic pure-unit coverage for exact source-draft query mapping, complete-query cache identity/lifecycle, and the narrow fail-closed Worker validator. Those injected units are not live evidence. After Dave manually deployed Worker version `857c1fa3-e62d-4fd8-9321-9573aedb1906` on 2026-08-21, the mounted Genre Preview scenario became an active required production-path check using the production Worker, real TMDB, and real `image.tmdb.org` posters for Movie, TV, lazy shared-media switching, Advanced filters, and exclusions at mobile and desktop widths. The second issue #130 correction makes exactly one canonical `include_adult=false` mandatory for every Genre Preview request and Worker acceptance. Dave confirmed deployment of the corrected 10,479-byte source on 2026-08-21; no second deployment version identifier was supplied. The production path then passed canonical-false Movie/TV/Advanced/exclusion behavior and rejected missing, true, duplicated, and generic Discover requests. This mounted scenario remains required; if the external path later fails, report it rather than bypassing, skipping, or replacing it with synthetic integrated responses.

## Mounted browser lifecycle

Mounted-browser suites register their tests during module loading and start one isolated browser in a `before` hook. Keep browser setup out of top-level module evaluation so launch or cleanup failures are attributed to the suite instead of aborting test discovery. One browser per suite is preferred when the callbacks only assert results collected from the same mounted fixture.

Chrome owns DevTools port selection. Launch it with `--remote-debugging-port=0` and read the fresh profile's `DevToolsActivePort` file; do not reserve and release a port before launch. Browser and page WebSocket opens, fixture execution, cooperative shutdown, and forced shutdown must all remain bounded.

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
