# Repository Testing

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
