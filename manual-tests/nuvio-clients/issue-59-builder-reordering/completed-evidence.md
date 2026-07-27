# Issue #59 completed Nuvio client evidence

Test date: 2026-07-27

| Field | Nuvio Desktop | nuvio.tv/web | Nuvio mobile | Nuvio TV |
| --- | --- | --- | --- | --- |
| Evidence method | Owner visual + exact export | Owner visual + exact export | Owner visual + exported JSON text | Owner visual + synced verified web profile |
| Version/build | 0.1.11-alpha build 11, based on Nuvio 0.2.19 | Unknown | Unknown | Unknown |
| OS/device/browser | Windows 11 | Unknown | Unknown | Unknown |
| Profile visible | Yes | Yes | Yes | Yes |
| Visible collections | C, A, D, B | C, A, D, B | C, A, D, B | C, A, D, B |
| Raw collection array | D, B, C, A | D, B, C, A | D, B, C, A from reviewed export text | Not independently exported |
| Pin grouping | C/A pinned; D/B ordinary | C/A pinned; D/B ordinary | C/A pinned; D/B ordinary | C/A pinned; D/B ordinary |
| D folder order | C, A, B | C, A, B | C, A, B | C, A, B |
| Folder C source order | C Movies, A Series, B Anime | C Movies, A Series, B Anime | C Movies, A Series, B Anime | C Movies, A Series, B Anime from synced web data |
| Projection order | C, A, B | C, A, B | C, A, B | C, A, B from synced web data |
| Export artifact | Exact raw file | Exact raw file | Raw file unavailable; JSON text reviewed | No independent export |
| Result | Passed | Passed with normalization | Passed; raw artifact limitation recorded | Passed; no-independent-export limitation recorded |

## Exact returned export hashes

| Client | Repository filename | Size (bytes) | SHA-256 |
| --- | --- | ---: | --- |
| Nuvio Desktop | `nuvio-desktop-export.json` | 7157 | `da1c093936c3034bdfd06db20673c264919d3f166cd16be79b7e26d1b1f2ea7b` |
| nuvio.tv/web | `nuviotv-web-export.json` | 6674 | `3c9f2f107f23b582ed2e17b60012e9c973086f7b891b5a29e833a59c68c946c9` |
| Nuvio mobile | None | Not available | Not available |
| Nuvio TV | None | Not available | Not available |

## Desktop observations

Nuvio Desktop `0.1.11-alpha` build `11`, based on Nuvio `0.2.19`, was observed on Windows 11. Its management/export array remained D, B, C, A while the home presentation was C, A, D, B because C/A remained pinned and D/B remained ordinary. Collection D retained folders C, A, B. Folder C visibly presented C Movies, A Series, B Anime, and the exact export retained both `sources` and `catalogSources` in C, A, B order.

The exact export retained collection, folder, source, and projection sentinels. Desktop added only explicit default/null properties; the deterministic checker calculates and constrains the complete raw semantic difference. The expected addon-not-found result for `example.sanitised.issue59.ordering` is acceptable.

## Web observations

The web profile retained raw collection order D, B, C, A, visible order C, A, D, B, the C/A pinned group, D folders C, A, B, and both source and projection order C, A, B.

The exact web export records known normalization rather than an ordering failure: source `genre` changed from `null` to `""`; optional null properties were omitted; folder `focusGifEnabled` changed from Desktop's `true` to `false`; collection `focusGlowEnabled: false` was added; source sentinels remained; and collection, folder, and projection sentinels were dropped. Browser and web build details were not captured.

## Mobile observations

Owner visual review and owner-supplied exported JSON text showed the same home order as Desktop, raw collection order D, B, C, A, unchanged pins, folders C, A, B, and both source and projection order C, A, B. All sentinel levels, collection/folder IDs, and parent relationships remained. `genre: null` remained, explicit null/default artwork and source properties were added, and `focusGifEnabled` remained `true`. No meaningful hierarchy or order loss was observed.

No exact raw mobile export file was found in the requested local locations, so the repository intentionally contains no mobile raw artifact and records no mobile hash. Version, build, operating system, and device are unknown.

## TV observations

Owner visual review showed the synced profile in collection order C, A, D, B with C/A pinned and collection D folders C, A, B. The exact synced web export supplies the C, A, B source and projection arrays. TV supplied no independent export, so source-array proof is explicitly attributed to synced web data rather than to a TV serializer. Version, build, operating system, and device are unknown.

## Gate

The required issue #59 Nuvio client-ordering evidence gate is complete. Pull-request creation remains pending Dave's separate approval.
