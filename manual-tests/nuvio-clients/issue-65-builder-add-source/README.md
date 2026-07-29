# Issue #65 Builder Add Source client review

Status: owner physical-iPhone and current Nuvio Desktop acceptance complete on 29 July 2026.

The owner performed the client reviews recorded here. No iPhone model, iOS version, Safari build, or Nuvio Desktop version/build was supplied, so none is inferred.

## Evidence files

- `builder-generated-tmdb-collection.json` is the sanitized production-generated input fixture. It contains one native TMDB `COLLECTION` source for public collection ID `1241`, generated through the production Builder controller, issue #65 source recipe/service, and serializer.
- `nuvio-desktop-immediate-export.json` is the exact JSON exported immediately by current Nuvio Desktop after importing that fixture.

The input contains no account data, credentials, private endpoints, raw provider response, Builder internal IDs, or addon projections. Both files are repository-only manual evidence and are excluded from the Pages artifact by the existing explicit public-path allowlist.

Regenerate the input only after an intentional production contract change:

```powershell
node scripts/check-builder-add-source-fixture.mjs --write
```

Verify the production-generated input and the recorded Desktop export identity:

```powershell
node scripts/check-builder-add-source-fixture.mjs
```

## Physical-iPhone Builder acceptance

Dave confirmed the final physical-iPhone review passed: the opaque full-screen task surface exposed no underlying Builder panel, cyan decoration, or background bleed. Initial opening, Search → Review → Back, keyboard opening/closing, Safari address-bar changes, portrait and landscape, safe areas, poster layout, contained-title expansion, the fixed Add Source action, source creation, duplicate handling, and general mobile usability all passed.

Poster URLs, overview text, and contained-title rows remain normalized UI-only data. They do not change the fixture or canonical native TMDB source shape.

## Current Nuvio Desktop result

On 29 July 2026, Dave imported `builder-generated-tmdb-collection.json` into current Nuvio Desktop. The source resolved the Harry Potter franchise and displayed the expected Harry Potter movie titles. Nuvio Desktop then immediately produced `nuvio-desktop-immediate-export.json`.

The immediate export expanded compact absent or empty fields into Nuvio's fuller null/default representation. It preserved every material source-identity value:

- provider `tmdb`;
- source type `COLLECTION`;
- TMDB ID `1241`;
- media type `MOVIE`;
- sort value `original`;
- title `Harry Potter Collection`;
- no addon projection.

This is a successful current Nuvio Desktop import, runtime-resolution, and immediate round-trip result. A second current Nuvio client was not tested and is not claimed; it is non-blocking for issue #65 unless later conflicting client behavior appears.

## Owner-observed COLLECTION sort behavior

Dave also tested the same Harry Potter source in current Nuvio Desktop with three sort values:

- `original` preserves the order supplied by the TMDB collection API. It is not guaranteed to be chronological, franchise-story order, or the same order displayed on TMDB's website.
- `primary_release_date.desc` works and sorts newest release to oldest release.
- `primary_release_date.asc` is not supported by the current collection resolver and falls back to TMDB-provided/API order.

Issue #65 deliberately retains `"sortBy": "original"`. The Builder fixed-recipe display describes this as `TMDB-provided order`; it adds no sort control or local reordering workaround.
