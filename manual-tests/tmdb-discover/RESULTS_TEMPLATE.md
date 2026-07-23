# TMDB Discover manual Nuvio results

Test date: `YYYY-MM-DD`

Client / app version / build: `__________`

Platform / device / OS: `__________`

Fixture used: `fixtures/00-complete-audit.json` / `fixtures/00-complete-audit-one-source-per-folder.json`

Imported collections / folders / sources: `__ / __ / __`

Tester: `__________`

Use one copy of this template per client. Import one complete fixture, then record the first five visible titles in order. Use the one-source-per-folder variant only when the client imports all sources but does not expose multiple source tabs. Compare only with the manifest's `compareTo` source. A successful import, preserved field, or HTTP response is not proof of a visible filter effect.

For each source, replace the placeholders with:

- First five: `1. —; 2. —; 3. —; 4. —; 5. —`
- Comparison: `manifest compareTo source, or none`
- Verdict: `pass / fail / inconclusive`
- Notes: `errors, count, preservation, dynamic-result caveat, or evidence reference`

## Collection 1 — recognized baselines

### M1 Movie baseline

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### M2 Movie withGenres 28

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### T1 TV baseline

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### T2 TV withNetworks 49

- First five: `—`
- Comparison: `T1`
- Verdict: `—`
- Notes: `—`

### D1 Movie withNetworks 49 divergence

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### W1 Movie providers 8 no region

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### W2 Movie providers 8 region AU

- First five: `—`
- Comparison: `W1`
- Verdict: `—`
- Notes: `—`

## Collection 2 — delimiter cases

### A1 Movie genres 28,12 AND

- First five: `—`
- Comparison: `A2`
- Verdict: `—`
- Notes: `—`

### A2 Movie genres 28|12 OR

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### A3 Movie keywords 15097,9951 AND

- First five: `—`
- Comparison: `A4`
- Verdict: `—`
- Notes: `—`

### A4 Movie keywords 15097|9951 OR

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### A5 Movie providers 8,337 region US AND

- First five: `—`
- Comparison: `A6`
- Verdict: `—`
- Notes: `—`

### A6 Movie providers 8|337 region US OR

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

## Collection 3 — unknown candidate fields

### U1 Movie candidate withoutGenres 27

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### U2 Movie candidate withRuntimeGte 90

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### U3 Movie candidate voteCountLte 500

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### U4 Movie candidate withCast 31

- First five: `—`
- Comparison: `M1`
- Verdict: `—`
- Notes: `—`

### U5 TV candidate withStatus 0|3|4

- First five: `—`
- Comparison: `T1`
- Verdict: `—`
- Notes: `—`

### U6 TV candidate withType 0|2

- First five: `—`
- Comparison: `T1`
- Verdict: `—`
- Notes: `—`

## Collection 4 — sort pass-through

### S1 Movie UI sort popularity.desc

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### S2 Movie raw sort revenue.desc

- First five: `—`
- Comparison: `S1`
- Verdict: `—`
- Notes: `—`

### S3 Movie raw sort original_title.asc

- First five: `—`
- Comparison: `S1`
- Verdict: `—`
- Notes: `—`

### S4 Movie alias first_air_date.desc

- First five: `—`
- Comparison: `S4C`
- Verdict: `—`
- Notes: `—`

### S4C Movie canonical primary_release_date.desc

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### S5 TV raw sort name.asc

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### S6 TV alias primary_release_date.desc

- First five: `—`
- Comparison: `S6C`
- Verdict: `—`
- Notes: `—`

### S6C TV canonical first_air_date.desc

- First five: `—`
- Comparison: `none`
- Verdict: `—`
- Notes: `—`

### S7 Movie sort original client divergence

- First five: `—`
- Comparison: `S1`
- Verdict: `—`
- Notes: `—`

### S8 Movie invalid sort definitely_invalid.desc

- First five: `—`
- Comparison: `S1`
- Verdict: `—`
- Notes: `—`

## Import, export, and pending observations

- Import errors or presentation differences: `—`
- Collection/folder/source counts after import: `—`
- Recognized field preservation: `—`
- Unknown nested field preservation: `—`
- Raw/alias/unofficial/invalid sort preservation: `—`
- Source or folder loss: `—`
- Cross-client differences: `—`
- Evidence bundle location: `—`
