# Owner TMDB Discover results — 2026-07-23

Issue: [#47 — Audit TMDB Discover filter compatibility across Nuvio clients](https://github.com/davecollections/tmdb-id-lookup/issues/47)

These are owner-controlled, build-specific visible-result and import/export observations for all 29 fixture sources. They are not direct TMDB request captures and must not be generalized to every Nuvio release. The normalized record is [`owner-results-2026-07-23.json`](./owner-results-2026-07-23.json).

Screenshots were supplied in the owner conversation but are not committed. No screenshot path, personal profile data, credential, or token appears in this package.

## Test environments

### Nuvio Desktop

- App: Nuvio Desktop `0.1.14-alpha` (build `14`)
- OS: Windows 11 Home 25H2, build `26200.8875`
- Fixture: `fixtures/00-complete-audit.json`
- Imported shape: 4 collections, 4 folders, 29 sources
- Presentation: multiple source tabs were visible
- Coverage: 29/29 sources
- Scope: version-pinned owner evidence for this alpha build, not a final Desktop contract

Desktop export preserved the recognized fields and collection/folder/source order, added canonical structure/default/null fields, removed the six unknown nested candidates U1–U6, and retained all raw, alias, unofficial, and invalid sort strings even when visible loading failed or resembled a fallback.

### Retained official Nuvio iOS

- App: Nuvio iOS `1.2.23` (build `96`)
- OS: iOS
- Installation context: a previously installed official build retained after distribution was removed; no sideload was used
- Initial fixture: `fixtures/00-complete-audit.json`, which imported 4 collections, 4 folders, and 29 sources but exposed no multiple-source tabs
- Audited fixture: `fixtures/00-complete-audit-one-source-per-folder.json`
- Audited shape: 4 collections, 29 folders, 29 sources
- Coverage: 29/29 sources
- Scope: frozen historical evidence for this retained official build, not current or future NuvioMobile proof

Copy/export checks on both the original 4-folder fixture and the 29-folder variant were semantically equivalent. They preserved all six unknown nested fields, provider/region fields, raw/alias/unofficial/invalid sorts, order, and every source/folder. Copy displayed no acknowledgement, but pasting the copied output confirmed the result.

## Collection 1 — recognized baselines

Unless a row says otherwise, Desktop and retained iOS showed the same titles in the same order.

| Source | First visible results | Comparison and verdict | Notes |
| --- | --- | --- | --- |
| M1 — Movie baseline | The Odyssey; Moana; Disclosure Day; Obsession; Backrooms | Baseline observed | Same result set as S1, S7, and S8. |
| M2 — Movie `withGenres=28` | The Odyssey; Supergirl; The Mandalorian and Grogu; The Furious; Spider-Man: Brand New Day | Different from M1; visible Action effect confirmed | Version-specific visible evidence. |
| T1 — TV baseline | House of the Dragon; Rote Rosen; Tagesschau; Caressing My Hibernating Bear; Law & Order: Special Victims Unit | Baseline observed | Same result set as U5 and U6. |
| T2 — TV `withNetworks=49` | House of the Dragon; Game of Thrones; Sesame Street; Westworld; The Sopranos | Different from T1; visible effect confirmed | Version-specific visible evidence. |
| D1 — Movie `withNetworks=49` | Same as M1 | No visible difference | Supports the existing Desktop/NuvioTV usability divergence, but the retained iOS run does not prove its request path and cannot be upgraded to current NuvioMobile behavior. |
| W1 — provider 8, no region | Desire; Apex; Swapped; 23 000 Lives; Heartstopper Forever | Different from M1; visible provider effect | The visible result does not independently prove which hidden default region was applied. |
| W2 — provider 8, AU | Desire; Forgive Us All; Apex; Swapped; 23 000 Lives | Different from W1; visible provider/region effect | Supports a visible region difference without isolating the W1 default. |

## Collection 2 — delimiter cases

| Source | First visible results | Comparison and verdict | Notes |
| --- | --- | --- | --- |
| A1 — genres `28,12` | The Odyssey; Supergirl; The Mandalorian and Grogu; Spider-Man: Brand New Day; Mortal Kombat II | Different from A2; paired delimiter behavior observed | Comma is the documented AND form for this field. |
| A2 — genres `28\|12` | The Odyssey; Moana; Supergirl; Minions & Monsters; Toy Story 5 | Comparator for A1 | Pipe is the documented OR form for this field. |
| A3 — keywords `15097,9951` | Raging Sharks; 2025 Armageddon; Roboshark; Encounters in the Deep | Different from A4; paired delimiter behavior observed | Only four visible results were present. |
| A4 — keywords `15097\|9951` | Disclosure Day; Minions & Monsters; Project Hail Mary; Deep Water; Avatar: Fire and Ash | Comparator for A3 | Version-specific visible evidence. |
| A5 — providers `8,337`, US | Spider-Man; Spider-Man: Homecoming; Spider-Man 3; Spider-Man 2; The Fault in Our Stars | Different from A6; paired delimiter behavior observed | Version-specific visible evidence. |
| A6 — providers `8\|337`, US | Desire; Descendants: Wicked Wonderland; Avatar: Fire and Ash; Apex; The Punisher: One Last Kill | Comparator for A5 | Dynamic same-day catalog evidence. |

## Collection 3 — unknown candidate fields

All six Desktop observations matched their baseline and Desktop export removed the unknown nested field. Retained iOS also matched the baseline, but copy/export preserved each field exactly.

| Source | First visible results | Comparison and verdict | Notes |
| --- | --- | --- | --- |
| U1 — `withoutGenres=27` | Same as M1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |
| U2 — `withRuntimeGte=90` | Same as M1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |
| U3 — `voteCountLte=500` | Same as M1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |
| U4 — `withCast=31` | Same as M1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |
| U5 — `withStatus=0\|3\|4` | Same as T1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |
| U6 — `withType=0\|2` | Same as T1 | No visible difference | Preserved but not visibly applied on retained official iOS 1.2.23 (96). |

Preservation is not forwarding proof. The retained iOS observation must not be used to infer that these keys reached TMDB.

## Collection 4 — sort pass-through

| Source | First visible results | Comparison and verdict | Notes |
| --- | --- | --- | --- |
| S1 — Movie `popularity.desc` | Same as M1 | Sort baseline observed | Official Movie sort. |
| S2 — Movie `revenue.desc` | Avatar; Avengers: Endgame; Avatar: The Way of Water; Titanic; Ne Zha 2 | Different from S1; visible sort order confirmed | Official raw-only Movie sort. |
| S3 — Movie `original_title.asc` | Desktop: endless spinner, no content, no error. Retained iOS: “Sr.”; “Wuthering Heights”; `#1 Cheerleader Camp`; `#AnneFrank: Parallel Stories`; `#Horror`; then `#Iamhere` | Desktop alpha failure; retained iOS visible ordering | Official sort with a material client-build divergence. Desktop export still retained the raw value. |
| S4 — Movie alias `first_air_date.desc` | Descendants: Wicked Wonderland; The Odyssey; Heartstopper Forever; Moana; Evil Dead Burn | Exact match with S4C | Off-media alias case; not an official Movie sort row. |
| S4C — Movie `primary_release_date.desc` | Descendants: Wicked Wonderland; The Odyssey; Heartstopper Forever; Moana; Evil Dead Burn | Canonical comparator for S4 | Official Movie sort. |
| S5 — TV `name.asc` | `$#*! My Dad Says`; `'Allo 'Allo!`; `'Til Death`; `(Un)Well`; Darker than Black | Visible name ordering confirmed | Official raw-only TV sort. |
| S6 — TV alias `primary_release_date.desc` | Lucky; Little House on the Prairie; Elle; I Will Find You; The Polygamist | Exact match with S6C | Off-media alias case; not an official TV sort row. |
| S6C — TV `first_air_date.desc` | Lucky; Little House on the Prairie; Elle; I Will Find You; The Polygamist | Canonical comparator for S6 | Official TV sort. |
| S7 — Movie `original` | Same as S1 | Default-like, no visible difference | Unofficial value. The visible layer does not identify where fallback or normalization occurred. |
| S8 — Movie `definitely_invalid.desc` | Same as S1 | Default-like, no visible difference | Invalid value. The visible layer does not identify where fallback or normalization occurred. |

## Cross-client and pipeline differences

- S3 is the only visible result divergence: Desktop alpha stayed on an endless spinner, while retained iOS displayed the expected-looking title order.
- Desktop removed all six unknown nested candidates on import/export. Retained iOS preserved them in Copy/Export but showed no visible effect.
- Desktop exposed source tabs in each 4-folder collection. Retained iOS required the deterministic one-source-per-folder presentation.
- Both runs showed D1 equal to M1. This does not override pinned static evidence that the currently reviewed Mobile resolver sends undocumented Movie `with_networks`.
- Both runs showed S7 and S8 equal to S1. This does not attribute the fallback-like result to TMDB, request construction, storage, or UI.

The owner also inspected a Nuvio.tv account-management profile export. The responsible layer was not isolated; it could be iOS sync, account storage, web normalization, or export serialization.

| Case | Account-export transformation | Qualification |
| --- | --- | --- |
| W1 | Removed `withWatchProviders` | Pipeline observation only. |
| W2, A5, A6 | Removed `watchRegion` and `withWatchProviders` | Pipeline observation only. |
| U1–U6 | Removed each candidate field | Pipeline observation only. |
| S2 | `revenue.desc` → `popularity.desc` | Pipeline observation only. |
| S3 | `original_title.asc` → `popularity.desc` | Pipeline observation only. |
| S5 | `name.asc` → `first_air_date.desc` | Pipeline observation only. |
| S8 | `definitely_invalid.desc` → `popularity.desc` | Pipeline observation only. |
| S4 | Retained `first_air_date.desc` | Pipeline observation only. |
| S4C | Retained `primary_release_date.desc` | Pipeline observation only. |
| S6 | Retained `primary_release_date.desc` | Pipeline observation only. |
| S6C | Retained `first_air_date.desc` | Pipeline observation only. |
| S7 | Retained `original` | Pipeline observation only. |

Additional structural/default fields were added by that pipeline.

## Pending evidence

- NuvioTV `0.7.19-beta` device run: pending, 0/29 sources observed. A controlled TV run was impractical for this audit. Pinned static source remains evidence, and a later TV addendum is preferred but does not block completion of this research package.
- Direct TMDB: 0/60 live requests. The deterministic plan and hard cap remain 60.
- Current NuvioMobile runtime: not proven by the retained official iOS `1.2.23` (96) run.
- Exact request-path attribution for preserved/ignored fields and account-export transformations: not established.
