# Collection preservation results, 13 September 2026

Issue [#206](https://github.com/davecollections/tmdb-id-lookup/issues/206), investigation branch `work/206-shared-advanced-investigation`. These are results from the new authored master, separate from the historical September library comparison and Studio/Network visual evidence. No title results, filter application, ranking, counts or Preview behavior were tested here.

## Main findings

Every supplied export contains **6 collections, 24 folders and 68 sources**. All are matched, with no missing or added nodes, ambiguous matches, reordered nodes or removed duplicate copies. Collection/folder IDs and names, native entity identities and addon catalogue identities survive. Three numeric/string TMDB ID conversions retain the same positive ID. Both deliberate identical source copies and the distinct settings control survive.

| Setting or case | Original | nuvio.tv | Desktop | TV normal import, direct export | TV Manage from phone export |
| --- | --- | --- | --- | --- | --- |
| Most voted selections | 17 selected values | **Changed: all 17** | Kept | Kept | Kept |
| Other explicit source sorts | Family-specific selected values | Kept | Kept | Kept | Kept |
| Populated and zero canonical filters | 134 field values | Kept | Kept | Kept | **24 exclusion values removed** |
| Existing presentation settings | Explicit collection/folder settings | Kept | Kept | Kept | Kept |
| Populated artwork and emoji | Explicit supplied values | Kept | Kept | Kept | Kept |
| Missing folder shape, 17 folders | Absent | Added default: LANDSCAPE | Added default: poster | Added default: POSTER | Added default: POSTER |
| Missing Focus GIF toggle, 17 folders | Absent | Added default: false | Added default: true | Added default: true | Added default: true |
| Missing collection Show All, C060 | Absent | Added default: true | Added default: true | Added default: false | Added default: false |
| Missing collection Focus Glow, C060 | Absent | Added default: false | Kept absent | Added default: true | Added default: true |
| Addon source titles, S062/S063 | Authored labels | Kept | Kept | Removed | Removed |
| Conflicting alias and unknown-field probe, S057 | Canonical 100, alias 101, unfamiliar field | Alias 101 and unfamiliar field removed | Same | Same | Same |

The website changes eight Movie Most voted selections to `popularity.desc`, eight TV selections to `first_air_date.desc`, and one List selection to `original`. These are selected values, not duplicate alias cleanup. The Builder must continue exporting the selected Most voted value.

The Manage from phone file omits `withoutGenres`, `withoutKeywords`, `withoutCompanies` and `withoutWatchProviders` from S046, S047, S049, S050, S058 and S059: **six sources times four populated fields = 24 removed values**. All 24 survive in the website, Desktop and direct TV files. The phone file also omits the eight corresponding matching aliases from S047/S050; that is not harmless alias cleanup because the canonical exclusions are missing too. S053's four empty exclusion strings are also omitted. Its null-valued fields are recorded separately.

All populated/zero canonical minimum-votes values survive in all four files. Imported People/List filter preservation is evaluated as saved data only. Populated compound language/country/network strings survive; this does not establish their query semantics or structured editability.

## Representation and probe differences

- No existing boolean or shape/layout value was flipped. Added defaults are separate from kept explicit choices and are not assumed to have equivalent meaning across clients.
- Desktop adds **1544 absent-to-null field rows**, plus presentation defaults and empty compatibility arrays. That accounts for most of its large field-change count; it does not mean that many user selections were lost. Original explicit null, zero and empty canonical filter values remain distinguishable.
- Website omits the explicit null/empty artwork probes and null/empty canonical filter probes. TV omits null probes but retains empty canonical filter strings in direct export; the phone file additionally drops its empty exclusions. Twenty-seven TV `tmdbId` removals are null Discover IDs, not loss of a positive native entity ID.
- The S057 conflicting alias value 101 and unfamiliar field disappear in every export while canonical `voteCountGte: 100` survives. This remains a visible preservation-probe finding; no automatic unsupported-feature bug classification is made.
- Matching aliases are equivalent cleanup only where the original canonical value and type remain. Website `filters.sortBy` removal is not marked equivalent when the retained selected sort changed.
- All routes add `catalogSources: []` to 22 folders that omitted it. The populated addon compatibility projection also changes: website/TV remove its authored titles; website omits its empty genres, Desktop/phone change those projection genres to null, and direct TV keeps them empty. Primary addon catalogue identities remain intact. Native sources are not moved into compatibility projections.

## Evidence and route provenance

The received `Nuvio Tests.zip` is 17,674 bytes, SHA-256 `2941d2f8136adf0348b2af88cec69c5f92c1eaf95dda1e01f4c546dc51848150`. Its included master is exactly **35,181 bytes**, SHA-256 `fdefa732786fdfebc63b297048b8ef5d75981d719c3fdeeb26cf2db10fa3d4b2`, matching the original authored file without reconstruction or modification.

| Supplied export | Bytes | SHA-256 |
| --- | --- | --- |
| nuvio.tv | 34,251 | `1bc890cc0d509e5a1c502022906b72f6831adaa139bf14c4dae05ac086fc6170` |
| Desktop | 52,652 | `b7089772210e8f74dc7e2517a1f401aa109090e121c5bbabaa27443707a69f4e` |
| TV normal import | 20,871 | `26831248984e6074ead91dcdcdba72542108a7f195eb13d060984c27bf012b96` |
| TV Manage from phone | 32,803 | `89f8c19bfae03cf263f29044c3891b3e1c93d33e9a06c4405b77ade812c9832b` |

- Desktop's supplied folder identifies `0.1.23-alpha (23)`; TV's folder and owner report identify `0.9.2-beta`. Installed binary commits and the website deployment version are not established.
- The owner confirmed normal TV URL import succeeded using the compressed route. The server recorded HTTP 200 and a 3,187-byte gzip transfer; local decoding was verified against the unchanged master. The request was observed at 03:01:00 UTC / 13:01:00 Sydney. That is a transfer timestamp, not a measured import completion time. The earlier uncompressed fetch failure's internal cause remains unconfirmed.
- The owner confirmed that every method started with a fresh import of the original master. Manage from phone imported and exported through that interface. Direct TV imported through the local network URL, exported on the TV, and the on-device export was retrieved using File Explorer. The compressed transfer decoded to the unchanged master. Exact run times, sync activity, destination isolation and other unrecorded procedural details remain unknown; no internal import/sync/export cause is inferred.
- ZIP entry times remain file timestamps, not verified run times. Completed status records receipt of each saved export; owner confirmation establishes the fresh imports and interface routes, without supplying missing timing, sync or internal-cause evidence.
- The owner reported the preservation findings in Nuvio Discord; no message link was supplied. Builder creation and export must continue using the correct supported JSON, with no workarounds for upstream sort rewrites, removed exclusions or differing defaults. These findings do not block the approved Studio minimum-votes work.

## Complete comparison and validation

The full field table, changes-only interpretation, typed snapshots, run log, exact original/export copies, ZIP and checksum manifest are retained in the owner's evidence folder outside Git. This repository file contains only the authored assessment and byte identities. Private exports, screenshots, filled logs and complete result payloads remain outside Git and are not uploaded with this summary.

| File comparison | Kept | Changed | Removed | Added default | Equivalent change |
| --- | --- | --- | --- | --- | --- |
| nuvio.tv | 1926 | 45 | 50 | 56 | 37 |
| Desktop | 811 | 1613 | 2 | 55 | 39 |
| TV normal import | 1936 | 26 | 56 | 56 | 39 |
| TV Manage from phone | 1908 | 26 | 92 | 56 | 31 |

Counts are field/order rows, including declared absences and object containers. They are not counts of broken settings. There are zero unresolved rows after comparing uniform identical duplicate groups without positional pairing. Unequal or differently configured ambiguous groups remain guarded by pure tests.

Focused comparator tests cover uniform duplicate changes, loss visibility, duplicate movement, explicit toggle changes and added defaults. The same local helper now provides both plain and gzip transfer of the identical master; its test verifies decoding, uncompressed fallback, HEAD and rejected unrelated paths/write requests. Required repository-check results and the complete changed-file inventory are recorded in [REVIEW.md](./REVIEW.md).

## Follow-up scope

The first runtime slice remains the [proposed shared Studio minimum-votes issue](../../docs/v2/STUDIO_MINIMUM_VOTES_ISSUE_DRAFT.md): optional and unset by default across New Collection, New Folder, Add Source and Edit Source; reuse Discover controls/validation; preserve native identity and untouched imported fields; reflect current drafts in Preview/Review/export/duplicate detection; no expected Worker change. These saved-JSON results add preservation evidence without replacing the earlier supplied Desktop filter-application evidence. Broader Advanced options, People and compound locale work remain recorded. The investigation is finished; accepted compatibility evidence is reused without repeating owner tests. Studio runtime implementation belongs to its dedicated issue and branch.
