# Issue #78 Nuvio Desktop results

Status: pending owner execution. Replace bracketed placeholders only with observed evidence.

## Client

- Test date: `[YYYY-MM-DD]`
- Nuvio client: `Desktop`
- Version/build: `[actual version and build]`
- Operating system: `[actual OS/version]`
- Tester: `[name]`

## Movie Collection identity change

- Result: `[pass / fail / blocked]`
- Original source raw ID: `issue-78-source-collection-edit`
- Original collection ID representation: string `"1241"`
- Selected collection: `[name]`
- Selected numeric collection ID: `[ID]`
- Canonical collection name displayed before numeric ID: `[observed result]`
- Title immediately changed to selected canonical name: `[observed result]`
- Optional custom title and **Use selected collection name** reset: `[observed result / not exercised]`
- Runtime changed to selected franchise: `[observed result]`
- Saved canonical title: `[observed result]`
- Provider/source/media/sort/filters preserved: `[observed result]`
- Unknown source/filter fields preserved: `[observed result]`
- Source position remained 2 of 7: `[observed result]`
- Immediate export saved: `results/movie-collection-identity-change-immediate-export.json` `[yes/no]`
- Immediate-export normalization: `[exact observed additions/removals/changes]`
- Notes: `[observations only]`

## People role/media change

- Result: `[pass / fail / blocked]`
- Edited source raw ID: `issue-78-source-people-edit`
- Original identity: `tmdb|PERSON|488|MOVIE`
- Destination identity: `tmdb|DIRECTOR|488|TV`
- Counts shown for Movie Credits / Series Credits / Directed Movies / Directed Series: `[four exact friendly values]`
- Count source: `[fresh bounded check / reused cache / failed then Retry]`
- Count loading/failure left Save enabled: `[observed result]`
- Automatic title changed from `Movie Credits` to `Directed Series`: `[observed result]`
- Sort changed from `popularity.desc` to `first_air_date.desc`: `[observed result]`
- Runtime changed to directed series: `[observed result]`
- Person ID remained `488`: `[observed result]`
- Provider/filters preserved: `[observed result]`
- Unknown source/filter fields preserved: `[observed result]`
- Duplicate source remained independent and unchanged: `[observed result]`
- Source position remained 4 of 7: `[observed result]`
- Immediate export saved: `results/people-role-media-change-immediate-export.json` `[yes/no]`
- Immediate-export normalization: `[exact observed additions/removals/changes]`
- Notes: `[observations only]`

## People custom-title preservation

- Result: `[pass / fail / blocked]`
- Edited source raw ID: `issue-78-source-people-custom`
- Original identity: `tmdb|PERSON|31|TV`
- Destination identity: `tmdb|DIRECTOR|31|MOVIE`
- Runtime changed to directed movies: `[observed result]`
- Person ID remained `31`: `[observed result]`
- Custom title `Preserve this custom People label` remained unchanged: `[observed result]`
- Untouched sort remained exact `vote_average.desc`: `[observed result]`
- Provider/filters/raw/unknown fields preserved: `[observed result]`
- Source position remained 6 of 7: `[observed result]`
- Immediate export saved: `results/people-custom-title-change-immediate-export.json` `[yes/no]`
- Immediate-export normalization: `[exact observed additions/removals/changes]`
- Notes: `[observations only]`

## No-op and round trip

- Builder pre/post serialized bytes identical: `[yes/no, comparison method]`
- Client import succeeded: `[observed result]`
- Immediate export saved: `results/no-op-round-trip-immediate-export.json` `[yes/no]`
- Client-normalized source order: `[seven raw source IDs in order]`
- Client-normalized source IDs: `[observed result]`
- Provider, IDs, source/media types, titles, sort, and filters: `[observed result]`
- Unknown source fields: `[observed result]`
- Unknown folder/collection/projection fields: `[observed result]`
- Notes: `[observations only]`

## Folder and collection presentation across all runs

- Collection title/id/pin/layout/All/focus glow/backdrop: `[observed result]`
- Folder title: `Preservation Lab` `[observed result]`
- Folder `hideTitle: false`: `[observed result]`
- Folder `tileShape: LANDSCAPE`: `[observed result]`
- Folder emoji/cover/focus/hero/logo fields: `[observed result]`
- Addon projection remained separate from native sources: `[observed result]`

## Evidence conclusion

`[Bounded conclusion tied to this exact client version/build; do not generalize beyond the observed run.]`
