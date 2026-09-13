# Shared Advanced compatibility manual pack (#206)

These are small input recipes, not fabricated TMDB results. [Assessment and evidence](../../docs/v2/SHARED_ADVANCED_ASSESSMENT.md) distinguish endpoint behavior, current client code, preservation and physical-client acceptance. The first website test has owner-supplied input/output evidence. The Studio/Network test now separately has website preservation and Desktop visual evidence; People and compound-locale client tests remain unresolved.

**Received 13 September:** Dave supplied the exact first fixture (SHA-256 `efd9998fb4efed53568f539c80372413d21d32254a2519ce3bcfcf89e5d9eb49`) and `nuvio-collections-profile-4-2026-09-13.json` (3,851 bytes, SHA-256 `407b3592b97e069203871aa3484bd1a5bea96cf12ded34bbee47508b390f85d8`) with route **Collections → Import → Collections → Export**. Both Most voted sources change to their Movie Popular/Series Recent fallbacks; Top rated controls, canonical numeric thresholds, collection settings, identities and order survive. Only the matching List vote alias, unsupported folder probe keys and absent-to-false folder defaults account for the remaining differences. The screenshot referenced in the note was not provided here; version/build/sync details remain unverified. See [the complete result](../../docs/v2/SHARED_ADVANCED_ASSESSMENT.md#owner-supplied-website-reproduction---13-september-2026). The steps below are retained for reproducibility, not a request to repeat the completed file comparison. Builder must keep exporting the selected Most voted value.

## First test: clean Nuvio.tv round trip

Use [01-unchanged-round-trip.json](./fixtures/01-unchanged-round-trip.json). It contains one uniquely named collection, six folders and six sources. No artwork, account or personal export is included.

1. Use a **new empty test profile/account** whose collection destination is independent of your normal profiles. Confirm that it does not show existing collections. Do not import into the current library or choose Merge/Overwrite there. If an independent destination is unavailable, stop this test.
2. Record date/time/timezone, browser and version, displayed Nuvio version if available, account profile identifier, and whether collection sync is enabled. Keep a screenshot of the empty destination. Use a fresh page load; don't open another client on that profile during the test.
3. In Nuvio.tv, open Account → Collections → Import, choose `01-unchanged-round-trip.json`, choose **Add as new**, then **Add collections**. Record those exact choices and any additional required Save action. If the labels differ, record the actual sequence.
4. Without opening Edit, changing any setting, dragging anything or visiting a synced client, immediately use Export. Save it as `206-web-immediate-export.json`. Keep the original input unchanged. A second export after a reload is optional and must have a distinct name.
5. Send the output file with the recorded steps/version and the empty-destination screenshot. The two Most voted sources, two Top rated controls, List aliases and folder probes will be compared by identity, including absent/null and value types.

Expected questions, not assumed results:

- Did Movie Most voted become Popular, and Series Most voted become Recent? Did the Top rated controls remain Top rated?
- Does List `voteCountGte: 100` remain numeric while the duplicate `vote_count.gte` disappears? This does not test List filtering.
- Does collection glow/pin survive while the folder-level probe keys disappear? Those folder keys are **unsupported extension probes**, not approved Builder settings. `focusGifEnabled` is unrelated.
- Did Add as new regenerate any parent IDs? If so, retain the exported IDs; do not edit them to make the comparison pass. The comparator reports unmatched identities rather than guessing.

Do not delete the test destination until its evidence is saved. Cleanup is limited to the isolated test profile. No existing profile should need restoration.

## Native People: visible minimum-vote discrimination

Use [02-native-people-votes.json](./fixtures/02-native-people-votes.json) directly in a separate empty destination on the actual client under test. Do not route this file through the website first: that would combine two test paths. On TV, the normal installed-client file import is preferable; if Manage from phone is used, record it as a different route.

The eight one-source folders contain Tom Hanks (31), exact PERSON/Director and Movie/TV combinations, Top rated sorting, and zero versus 2,147,483,647 minimum votes. The high value is a valid int32 and intentionally exceeds every returned credit's votes.

1. Import once and export immediately without editing. Save as `206-people-<client>-immediate.json` with the client version and import route.
2. Open each zero-vote folder and its matching high-vote folder. Record whether each is empty and identify at least one visible title. Screenshot both members of a pair when the high threshold still shows a title.
3. If the high minimum is applied, all four high-threshold folders must be empty. The zero-vote baselines were nonempty in the dated production response: 186 acting Movies, 81 acting Series, 3 directing Movies and 5 directing Series. Counts can evolve; the extreme high-threshold distinction is the test.
4. If the minimum survives JSON but titles remain, record **preserved but ignored**. If it is removed or changed, record **preservation failed; filtering not isolated**. If a baseline cannot load, report the external/client failure without inventing a result.

Current source inspection predicts ignored filtering. No ineffective People setting is being proposed. Exact Director crew must not be replaced with generic crew or Movie Discover people criteria.

## Native Studio/Network result and optional route-specific follow-up

**Received and verified 13 September:** [03-native-studio-network-votes.json](./fixtures/03-native-studio-network-votes.json) is byte-identical to Dave's 3,369-byte input, SHA-256 `fa83e9044974ceace4aaec3998acfdd47772c91d1f4ad20aa01f8af7b7055aa0`. The website output `nuvio-collections-profile-4-2026-09-13 (1).json` is 3,794 bytes, SHA-256 `ad1747d0826b85de14d33a315c7a9814f9dc006f8792fb489f36a2ab9be15217`. Six sources compare minimum 0/100 with Top rated: COMPANY 174 Movie, COMPANY 3 TV and NETWORK 213 TV.

Actual route: **nuvio.tv Collections import → Collections export → view in Nuvio Desktop 0.1.23-alpha (23)**. **No Desktop import/export occurred.** All six complete source objects, including numeric thresholds, sort, media and entity IDs, are unchanged. One collection/six folders/six sources match without identity or order changes. Only absent presentation fields gain false defaults: two collection fields and two fields on each of six folders.

The seven supplied screenshots establish the displayed Desktop version (based on Nuvio 0.4.14) and differing visible 0/100 results for all three pairs. Studio Series at 100 shows five titles: Win or Lose, Dream Productions, Cars on the Road, Dug Days and Pixar Popcorn. Baseline SparkShorts and Inside Pixar do not appear in that five-title view. Movie and Network screenshots are partial viewports. See [exact observations and limits](../../docs/v2/SHARED_ADVANCED_ASSESSMENT.md#owner-studionetwork-evidence---13-september-2026); raw images and hashes are in the private handoff.

This supports minimum-vote application in the tested Desktop build. It does not audit every returned title's votes or establish direct Desktop import/export preservation. No repeat compatibility test is required before the bounded Studio implementation. Its focused scope and issue creation are now owner-approved; coding starts in its dedicated chat/branch after investigation closeout. People, compound locales and wider client parity remain separate.

For a later **direct-client preservation** investigation, use this fixture in an isolated destination through that client's direct import route, export immediately, then inspect each pair. Record that route separately from the completed website-to-Desktop test. The earlier production endpoint checks returned 3,127/668, 15/5 and 2,871/729 totals at their recorded time; these are dated endpoint observations, not fixed expected client counts. NuvioTV's native Network status/date defaults can make its catalogue differ. Record concrete titles, empty/error states and serialized thresholds independently of counts. This optional sequence is not a new gate for the first Studio slice.

## Compound language/country: four independent contracts

Use [04-compound-locale-probes.json](./fixtures/04-compound-locale-probes.json) only for the unresolved native-client investigation. It contains two sets of eight one-source folders, one Movie and one TV. Every source has year 2025, minimum 100 votes and Most voted sorting; changing a client sort invalidates a like-for-like ranked comparison. Direct import avoids the website sort-normalization path.

| Case suffix | Additional filter |
| --- | --- |
| 0 | None: baseline |
| 1 | Original language `es` |
| 2 | Original language `pt` |
| 3 | Original language `es\|pt` |
| 4 | Origin country `US` |
| 5 | Origin country `CA` |
| 6 | Origin country `US\|CA` |
| 7 | Both compound expressions together |

First export unchanged to establish literal expression preservation. Then open the individual controls and compound folders. Record version, exact media, titles/IDs and error/empty behavior. A screenshot or same count alone cannot prove Boolean semantics. If the complete bounded set is available, compare case 3 with the deduplicated union of 1 and 2, case 6 with the union of 4 and 5, and case 7 with the intersection of 3 and 6. Fetching/displaying only the first page is partial evidence and must be labeled. When complete results or origin metadata cannot be inspected, leave the semantic finding unresolved.

The current Builder editor and production gateway reject these compound values. No script bypasses that policy and no Worker deployment is part of this pack. After the representative contracts are established, verify the eight exact original regional expressions, all token memberships and original source settings from the **private 48-row audit** before expanding editability. Do not sort, replace, split, deduplicate or rewrite the original expressions to make them accepted. Mixed AND/OR remains out of scope.

## Reproduce repository evidence

All commands run from the repository root. Choose fresh output directory names outside Git; outputs contain private source metadata and must not be committed.

The September filename alone is insufficient: the original is **2,619,074 bytes / SHA-256 `e3baaefbb0de52639f5a7789a02989f74e9aa4827c6863a402dd50fc838818a7`**, with 18 `ROWS` collections. The previously compared Downloads version is 2,619,200 bytes / `d9a2edd9e295d91e7f397bde6b574010bbee5e6f55ecba17ad80f75729e6be0a`, with 18 `TABBED_GRID` collections. Preserve both; do not overwrite one with the other. The corrected private package contains separate snapshots and provenance. The checksum guard below refuses the other input version; set the original-input path to its preserved snapshot or directly supplied original.

```powershell
node scripts/investigate-shared-advanced.mjs audit `
  "$env:USERPROFILE\Downloads\nuvio_custom_collection_2026-08-30.json" `
  "$env:TEMP\206-original-audit-new-run"

$septemberInput = "$env:TEMP\tmdb-206-investigation\input-version-correction\inputs\september-original-ROWS-e3baaefb.json"
$septemberExport = "$env:USERPROFILE\Downloads\nuvio-collections-profile-4-2026-09-12(1).json"
if ((Get-FileHash -LiteralPath $septemberInput -Algorithm SHA256).Hash -ne 'e3baaefbb0de52639f5a7789a02989f74e9aa4827c6863a402dd50fc838818a7') { throw 'Wrong September input version' }
if ((Get-FileHash -LiteralPath $septemberExport -Algorithm SHA256).Hash -ne '5f2a3354cee61eb413f0a01e3bb2661dd9fa935a330f40d02f43d4e281a660f8') { throw 'Wrong September export' }
node scripts/investigate-shared-advanced.mjs compare `
  $septemberInput $septemberExport `
  "$env:TEMP\206-september-comparison-new-run"

node scripts/investigate-shared-advanced.mjs compare `
  manual-tests/shared-advanced/fixtures/01-unchanged-round-trip.json `
  "$env:USERPROFILE\Downloads\206-web-immediate-export.json" `
  "$env:TEMP\206-clean-round-trip-new-run"
```

The bounded production probe is optional for a later rerun; its completed evidence is already retained. It uses the current production Worker through the existing People and Advanced Discover providers, plus four explicit negative gateway probes. It makes eleven requests, saves actual responses before assertions and stops on unexpected success/failure. It does not request credentials, call TMDB directly or replace responses. It is not wired into the normal check.

```powershell
node manual-tests/shared-advanced/probe-production.mjs "$env:TEMP\206-live-new-run"
```

`generate-fixtures.mjs` documents exact recipe construction and validates real importer/serializer preservation; it refuses to overwrite existing fixture files. No regeneration is needed to run the supplied manual files.

Run the focused pure comparison and fixture contracts with `node --test tests/shared-advanced-investigation.test.mjs`. They use temporary local JSON to verify comparison behavior, not fabricated external service results. They are separate from the normal repository check because these tools are an optional investigation pack.

For every client run retain the unchanged input, exact output, SHA-256 hashes, client/build/browser version, time and sequence, import route/profile, sync state, visible evidence and any failed or incomplete steps. The repository's earlier #202/#204 acceptance remains historical regression evidence, not a result for this pack.
