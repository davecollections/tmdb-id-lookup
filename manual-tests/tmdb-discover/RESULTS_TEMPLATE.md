# TMDB Discover manual Nuvio results

Test date: `YYYY-MM-DD`

Nuvio TV app version: `__________`

Nuvio TV device / OS: `__________`

Nuvio Mobile app version: `__________`

Nuvio Mobile platform / OS: `__________`

Tester: `__________`

Before testing, import `fixtures/00-complete-audit.json` once per client and replace each `—` with a concise observation. Do not sequentially import the component fixtures on NuvioMobile because each import replaces its current collection list. Use `pass`, `fail`, or `inconclusive` only after comparing the structured `compareTo` source recorded in the manifest. A successful import or HTTP response is not proof that a filter changed results. Exact first items are deliberately not fabricated: copy them from a same-day direct report only when its sanitized URL exactly matches the client's effective query; otherwise write `dynamic; paired comparison only`.

| Source title | Priority | Expected / paired comparison | Expected first items | TV import accepted | TV field preserved on export or sync | TV actual first items / visible effect | Mobile import accepted | Mobile field preserved on export or sync | Mobile actual first items / visible effect | Verdict | Screenshot / evidence path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 Movie baseline | essential | Baseline for M2, D1, W1, and W2 | — | — | — | — | — | — | — | — | — | — |
| M2 Movie withGenres 28 | essential | Compare with M1; expect Action filtering if applied | — | — | — | — | — | — | — | — | — | — |
| T1 TV baseline | essential | Baseline for T2 | — | — | — | — | — | — | — | — | — | — |
| T2 TV withNetworks 49 | essential | Compare with T1; both clients forward network 49 | — | — | — | — | — | — | — | — | — | — |
| D1 Movie withNetworks 49 divergence | essential | Compare with M1 separately on each client | — | — | — | — | — | — | — | — | — | — |
| W1 Movie providers 8 no region | essential | Default US region; compare with M1 and W2; exact-query case `movie-provider-8-us` when client language is `en-US` | — | — | — | — | — | — | — | — | — | — |
| W2 Movie providers 8 region AU | essential | Explicit AU region; compare with W1; exact-query case `movie-provider-8-au` when client language is `en-US` | — | — | — | — | — | — | — | — | — | — |
| A1 Movie genres 28,12 AND | essential | Compare with A2; AND should be narrower than OR | — | — | — | — | — | — | — | — | — | — |
| A2 Movie genres 28\|12 OR | essential | Compare with A1; OR should be broader than AND | — | — | — | — | — | — | — | — | — | — |
| A3 Movie keywords 15097,9951 AND | optional | Compare with A4 | — | — | — | — | — | — | — | — | — | — |
| A4 Movie keywords 15097\|9951 OR | optional | Compare with A3 | — | — | — | — | — | — | — | — | — | — |
| A5 Movie providers 8,337 region US AND | optional | Compare with A6 | — | — | — | — | — | — | — | — | — | — |
| A6 Movie providers 8\|337 region US OR | optional | Compare with A5 | — | — | — | — | — | — | — | — | — | — |
| U1 Movie candidate withoutGenres 27 | essential | Compare with M1; expect ignored and lost on persisted client export | — | — | — | — | — | — | — | — | — | — |
| U2 Movie candidate withRuntimeGte 90 | optional | Compare with M1; expect ignored and lost on persisted client export | — | — | — | — | — | — | — | — | — | — |
| U3 Movie candidate voteCountLte 500 | optional | Compare with M1; expect ignored and lost on persisted client export | — | — | — | — | — | — | — | — | — | — |
| U4 Movie candidate withCast 31 | optional | Compare with M1; expect ignored and lost on persisted client export | — | — | — | — | — | — | — | — | — | — |
| U5 TV candidate withStatus 0\|3\|4 | optional | Compare with T1; ordinary DISCOVER should ignore it | — | — | — | — | — | — | — | — | — | — |
| U6 TV candidate withType 0\|2 | optional | Compare with T1; expect ignored and lost on persisted client export | — | — | — | — | — | — | — | — | — | — |
| S1 Movie UI sort popularity.desc | essential | Sort baseline for S2, S3, S7, and S8 | — | — | — | — | — | — | — | — | — | — |
| S2 Movie raw sort revenue.desc | essential | Compare ordered first items with S1 | — | — | — | — | — | — | — | — | — | — |
| S3 Movie raw sort original_title.asc | optional | Expect alphabetic original-title ordering | — | — | — | — | — | — | — | — | — | — |
| S4 Movie alias first_air_date.desc | essential | Compare ordered first items with S4C | — | — | — | — | — | — | — | — | — | — |
| S4C Movie canonical primary_release_date.desc | essential | Correct-media comparator for S4 | — | — | — | — | — | — | — | — | — | — |
| S5 TV raw sort name.asc | essential | Expect alphabetic TV-name ordering | — | — | — | — | — | — | — | — | — | — |
| S6 TV alias primary_release_date.desc | essential | Compare ordered first items with S6C | — | — | — | — | — | — | — | — | — | — |
| S6C TV canonical first_air_date.desc | essential | Correct-media comparator for S6 | — | — | — | — | — | — | — | — | — | — |
| S7 Movie sort original client divergence | essential | TV forwards original; Mobile substitutes popularity.desc | — | — | — | — | — | — | — | — | — | — |
| S8 Movie invalid sort definitely_invalid.desc | essential | Record rejection, empty results, or apparent silent ignore | — | — | — | — | — | — | — | — | — | — |

## Overall observations

- Import errors: `__________`
- Export or sync preservation differences: `__________`
- TV versus Mobile result differences: `__________`
- Cases requiring a second run: `__________`
- Evidence bundle location: `__________`
