# TMDB Discover compatibility manual tests

These fixtures test current Nuvio behavior without adding artwork, Trakt, addons, credentials, or production networking. They are deliberately small and use only native TMDB `DISCOVER` sources. Static expectations are in `fixture-manifest.json`; record observations in `RESULTS_TEMPLATE.md` or a copy of it.

Import into a disposable collection profile or back up existing collections first. NuvioTV replaces or merges stored data through a typed import path, and both clients can discard unknown nested filter keys. Do not use these fixtures as a personal collection.

## Essential run

Estimated time: **40–55 minutes** across both clients, including screenshots and one export/preservation check.

1. Copy `RESULTS_TEMPLATE.md` to a dated result file outside the committed fixture directory and record both app versions, platform/device, OS, and test date.
2. On NuvioTV, use the app's collection JSON import flow and import each fixture file in numeric order. Confirm the audit collection and its single plain folder appear.
3. Open each source marked `essential` in `fixture-manifest.json`. Record the first five visible titles or TMDB IDs in source order; do not infer success from import acceptance alone.
4. Export or sync once after importing `03-unknown-filter-candidates.json`. Inspect whether `withoutGenres` remains under `U1` and record the observation. The pinned source predicts loss after typed persistence.
5. Repeat steps 2–4 on NuvioMobile using its collection JSON import flow. Imported TMDB cards are removal-only in the pinned editor; observation does not require editing the source.
6. Compare the paired cases in the template. Mark `inconclusive` if localization, pagination, account region, cache, client post-filtering, or an HTTP error prevents a fair comparison.
7. Save screenshots or exported JSON outside the repository unless they have been sanitized and independently approved for commit.

The essential cases cover a recognized Movie filter, recognized TV network filter, Movie `withNetworks` client divergence, watch-region defaulting, documented genre AND/OR, one unknown-field preservation case, raw sorts, date-sort aliases with correct-media comparators, `original` client divergence, and invalid-sort handling.

## Optional run

Estimated additional time: **20–30 minutes**.

Run every source marked `optional` to add keyword/provider composition evidence, more unknown candidate fields, and another raw Movie sort. These cases are useful but do not ask the owner to retest every official parameter that source inspection already proves cannot be deserialized or forwarded.

## Interpretation rules

- Import accepted: proves only that the surrounding JSON was accepted.
- Field visible after export/sync: proves preservation, not request forwarding.
- Different first items or count: useful effect evidence, but check the paired baseline and repeat once before calling it confirmed.
- HTTP 200 or an unchanged list: does not distinguish ignored input from a valid no-op without a controlled comparison.
- An unknown filter disappearing matches the pinned client implementations; it does not show that TMDB rejected the official query parameter.
- `D1` is intentionally high-risk evidence: NuvioTV omits Movie `withNetworks`, while NuvioMobile forwards an undocumented parameter. Record error, silent baseline equivalence, or changed results exactly.

## Direct TMDB research

The separate research plan contains **58 requests** under a hard cap of **60**. It is never part of CI.

Dry-run the full plan first:

```powershell
node scripts/research-tmdb-discover.mjs --dry-run --max-requests 60
```

For an actual run, first report the planned count, then set the token only in the current PowerShell process and choose a new output path. The script refuses to overwrite a report:

```powershell
$env:TMDB_BEARER_TOKEN = "<local token>"
node scripts/research-tmdb-discover.mjs --max-requests 60 --output "$env:TEMP\tmdb-discover-results-2026-07-23.json"
Remove-Item Env:TMDB_BEARER_TOKEN
```

To run a smaller named subset, use a comma-separated list and lower cap:

```powershell
node scripts/research-tmdb-discover.mjs --dry-run --ids movie-baseline,movie-genre-and,movie-genre-or --max-requests 3
```

The bearer token is trimmed, character-validated, and sent only in the authorization header. It is never placed in a URL, console line, error field, or report. A requested output path is reserved before networking so an existing file cannot consume the request budget. Reports contain sanitized query URLs, timestamps, HTTP status, `total_results`, first-page TMDB IDs, and paired comparison flags; failed or malformed responses are marked non-comparable, and response bodies are never stored.
