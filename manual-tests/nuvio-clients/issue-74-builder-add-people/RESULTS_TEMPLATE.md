# Issue #74 current-client result

Status: final regenerated fixture passed owner visual review and immediate-export validation

## First source-contract run — owner reported

- Import succeeded: yes
- Tom Hanks `PERSON / MOVIE` resolved as expected: yes
- Tom Hanks `PERSON / TV` resolved as expected: yes
- Steven Spielberg `DIRECTOR / MOVIE` resolved as expected: yes
- Steven Spielberg `DIRECTOR / TV` resolved as expected: yes
- Provider/type/ID/media/`popularity.desc` preserved: yes
- Folder and source grouping/order preserved: yes
- Immediate Nuvio export preserved the material contract: yes
- Normal client expansion observed: verbose null filter fields and `catalogSources: []`
- Known limitations of that input: repeated canonical-name tabs and explicit empty `coverImageUrl`; curated artwork was not tested

## Final distinct-title and curated-artwork run

- Date/time: 2026-08-02 08:55 Australia/Sydney
- Nuvio Desktop version/build: not supplied
- Operating system: Windows 11
- Regenerated fixture import succeeded: yes, owner reported
- `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series` tabs preserved: yes
- Curated Tom Hanks and Steven Spielberg Posters rendered: yes
- SHA-versioned `coverImageUrl` and `hideTitle: true` preserved in immediate export: yes
- Owner-supplied export saved to `results/nuvio-desktop-immediate-export.json`: yes
- Unexpected behavior: none reported
- Overall final result: passed

The three owner screenshots visually confirm the final Poster artwork, distinct acting/directing tabs, and populated catalogues. The supplied immediate-export JSON confirms the exact artwork URLs, title visibility, grouping, order, and material source identities while retaining Nuvio Desktop's normal null/default expansion. The client version/build was not supplied and is not inferred.
