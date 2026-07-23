# TMDB Discover compatibility manual tests

These fixtures test current Nuvio behavior without adding artwork, Trakt, addons, credentials, or production networking. They are deliberately small and use only native TMDB `DISCOVER` sources. Static expectations are in `fixture-manifest.json`; record observations in `RESULTS_TEMPLATE.md` or a copy of it.

Import into a disposable collection profile or back up existing collections first. NuvioTV imports/upserts by collection ID, but NuvioMobile replaces the current collection list with the newly imported list. Both clients can discard unknown nested filter keys. Do not use these fixtures as a personal collection.

## Essential run

Estimated time: **40–55 minutes** across both clients, including screenshots and one export/preservation check.

1. Copy `RESULTS_TEMPLATE.md` to a dated result file outside the committed fixture directory and record both app versions, platform/device, OS, and test date. Keep the disposable-profile/backup safeguard in place.
2. On NuvioTV, import `fixtures/00-complete-audit.json` once. Confirm all four ordered audit collections, their single plain folders, and 29 total sources appear. NuvioTV's collection-ID upsert behavior allows all four to coexist.
3. Open each of the **19** sources marked `essential` in `fixture-manifest.json`. Record the first five visible titles or TMDB IDs in source order; do not infer success from import acceptance alone. Align the client TMDB language with `en-US` before using the W1/W2 direct-query rows as exact expected items.
4. While the complete combined audit is still installed, export or sync once. Inspect whether `withoutGenres` remains under `U1` and record the observation. The pinned source predicts loss after typed persistence.
5. On NuvioMobile, import `fixtures/00-complete-audit.json` once. Do **not** import the four component files sequentially: each Mobile import replaces the current collection list, so only the last component would remain. Confirm the same four collections and 29 sources appear.
6. Repeat the 19 essential observations and the unknown-filter export/sync check on Mobile while the combined audit remains installed. Imported TMDB cards are removal-only in the pinned editor; observation does not require editing the source.
7. Compare the structured `compareTo` pairs recorded in the manifest and reflected in the template. Mark `inconclusive` if localization, pagination, account region, cache, client post-filtering, or an HTTP error prevents a fair comparison.
8. Save screenshots or exported JSON outside the repository unless they have been sanitized and independently approved for commit.

The 19 essential cases cover a recognized Movie filter, recognized TV network filter, Movie `withNetworks` client divergence, watch-region defaulting, documented genre AND/OR, one unknown-field preservation case, the required popularity sort baseline, raw sorts, date-sort aliases with correct-media comparators, `original` client divergence, and invalid-sort handling.

The four numbered component fixtures remain available only for targeted reruns. On NuvioTV, importing one component upserts that collection by ID while the others remain. On NuvioMobile, importing one component replaces the full list: use a component alone only for preservation-only observations or when its required `compareTo` source is in that same component. Use/re-import `00-complete-audit.json` for every cross-component comparison—especially essential U1, whose M1 baseline is in component 01—before resuming the full audit. Always perform the unknown-filter export/sync check with the combined fixture installed.

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

The separate research plan contains exactly **60 requests** under a hard cap of **60**. It is never part of CI. Every provider request carries an explicit region and the client-injected `flatrate|free|ads|rent|buy` monetization union. `movie-provider-8-us` and `movie-provider-8-au` reproduce the W1/W2 effective provider query shapes (with fixed `en-US`, page 1, and popularity-descending request controls) without the historical date/vote baseline constraints.

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
