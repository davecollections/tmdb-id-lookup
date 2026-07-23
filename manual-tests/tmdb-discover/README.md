# TMDB Discover compatibility manual tests

These fixtures test Nuvio behavior without adding artwork, Trakt, addons, credentials, or production networking. They are deliberately small and use only native TMDB `DISCOVER` sources. Static expectations are in `fixture-manifest.json`; record future observations in one client-specific copy of `RESULTS_TEMPLATE.md`.

The completed 2026-07-23 owner evidence is separate from the blank template:

- [`OWNER_RESULTS_2026-07-23.md`](./OWNER_RESULTS_2026-07-23.md) is the readable report.
- [`owner-results-2026-07-23.json`](./owner-results-2026-07-23.json) is the normalized machine record.

Import into a disposable collection profile or back up existing collections first. NuvioTV imports/upserts by collection ID, but the reviewed NuvioMobile implementation replaces the current collection list with the newly imported list. Preservation differs by client/build: pinned current source predicts loss of unknown nested filters, Desktop `0.1.14-alpha` removed them, while retained official iOS `1.2.23` (96) preserved them without visibly applying them. Do not use these fixtures as a personal collection.

## Complete fixture choices

- `fixtures/00-complete-audit.json`: generated exact ordered concatenation of the four component collections; 4 collections, 4 folders, 29 sources.
- `fixtures/00-complete-audit-one-source-per-folder.json`: generated presentation-only variant; the same 4 collections and source objects/order, but 29 folders with one source each.

The alternate fixture does not add to the 29-source audit total. Use it only when a client imports the original combined fixture but does not expose multiple source tabs. Folder IDs are deterministically derived from the original folder ID plus the lowercase source test code.

## Essential run

Estimated time: **20–30 minutes per client**, including screenshots and one export/preservation check.

1. Copy `RESULTS_TEMPLATE.md` to a dated result file outside the committed fixture directory and record one client version/build, platform/device, OS, fixture, and test date. Keep the disposable-profile/backup safeguard in place.
2. On NuvioTV, import `fixtures/00-complete-audit.json` once. Confirm all four ordered audit collections, their single plain folders, and 29 total sources appear. NuvioTV's collection-ID upsert behavior allows all four to coexist.
3. Open each of the **19** sources marked `essential` in `fixture-manifest.json`. Record the first five visible titles or TMDB IDs in source order; do not infer success from import acceptance alone. Align the client TMDB language with `en-US` before using the W1/W2 direct-query rows as exact expected items.
4. While the complete combined audit is still installed, export or sync once. Inspect whether `withoutGenres` remains under `U1` and record the observation. The pinned source predicts loss after typed persistence.
5. On a Mobile/iOS client, first try `fixtures/00-complete-audit.json`. If all 29 sources import but multiple source tabs are unavailable, import `fixtures/00-complete-audit-one-source-per-folder.json` instead. Do **not** import the four component files sequentially: a replacement-style import leaves only the last component.
6. Repeat the 19 essential observations and the unknown-filter export/sync check while one complete fixture remains installed. Imported TMDB cards are removal-only in the pinned current editor; observation does not require editing the source.
7. Compare the structured `compareTo` pairs recorded in the manifest and reflected in the template. Mark `inconclusive` if localization, pagination, account region, cache, client post-filtering, or an HTTP error prevents a fair comparison.
8. Save screenshots or exported JSON outside the repository unless they have been sanitized and independently approved for commit.

The 19 essential cases cover a recognized Movie filter, recognized TV network filter, Movie `withNetworks` client divergence, watch-region defaulting, documented genre AND/OR, one unknown-field preservation case, the required popularity sort baseline, raw sorts, date-sort aliases with correct-media comparators, `original` client divergence, and invalid-sort handling.

The four numbered component fixtures remain available only for targeted reruns. On NuvioTV, importing one component upserts that collection by ID while the others remain. On a replacement-style Mobile import, one component replaces the full list: use a component alone only for preservation-only observations or when its required `compareTo` source is in that same component. Use/re-import one complete fixture for every cross-component comparison—especially essential U1, whose M1 baseline is in component 01—before resuming the audit. Always perform the unknown-filter export/sync check with a complete fixture installed.

## Optional run

Estimated additional time: **20–30 minutes**.

Run every source marked `optional` to add keyword/provider composition evidence, more unknown candidate fields, and another raw Movie sort. These cases are useful but do not ask the owner to retest every official parameter that source inspection already proves cannot be deserialized or forwarded.

## Interpretation rules

- Import accepted: proves only that the surrounding JSON was accepted.
- Field visible after export/sync: proves preservation, not request forwarding.
- Different first items or count: useful effect evidence, but check the paired baseline and repeat once before calling it confirmed.
- HTTP 200 or an unchanged list: does not distinguish ignored input from a valid no-op without a controlled comparison.
- An unknown filter disappearing matches Desktop and the pinned current client implementations; retained official iOS `1.2.23` (96) instead preserved all six candidates without a visible effect. Neither result proves whether TMDB received the parameter.
- `D1` is intentionally high-risk evidence: NuvioTV omits Movie `withNetworks`, while NuvioMobile forwards an undocumented parameter. Record error, silent baseline equivalence, or changed results exactly.

## Completed and pending evidence

The 2026-07-23 owner run covered 29/29 sources on Nuvio Desktop `0.1.14-alpha` (14) and 29/29 on retained official iOS `1.2.23` (96). The iOS result is historical, version-specific evidence and is not current/future NuvioMobile proof. NuvioTV `0.7.19-beta` device coverage remains 0/29 because the device run was impractical; pinned source evidence remains separate, and a later TV addendum is preferred but does not block completion of issue #47 research. Direct TMDB remains 0/60 live requests.

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
