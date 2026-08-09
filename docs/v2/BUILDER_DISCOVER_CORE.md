# V2 DISCOVER Core contract

## 1. Status and purpose

Issue [#100](https://github.com/davecollections/tmdb-id-lookup/issues/100) establishes a thin, internal, non-user-facing V2 contract for native Nuvio/TMDB `DISCOVER` sources.

The Core lets later Streaming Services, Genres, Decades, and Advanced Discover work compile into one set of construction, sort, comparison, and identity rules. It does not implement any of those consumer features and introduces no visible Builder workflow.

The DISCOVER Core records the current canonical V2 interpretation of native Nuvio DISCOVER sources based on repository and client evidence. It is intentionally evolvable. Real consumer implementations may extend or correct these rules when new evidence appears. Preservation and current-client compatibility take priority over keeping an abstraction unchanged.

## 2. Ownership and preservation boundary

The framework-independent implementation is [`builder/src/nuvio/discover.js`](../../builder/src/nuvio/discover.js). It owns:

- canonical Builder-created source construction;
- filter descriptors and portable media applicability;
- the four semantic Movie/TV sorts;
- source inspection and small capability classification;
- detached effective-source materialization for imported Builder `SourceNode` values;
- comparison-only filter canonicalization;
- deterministic functional identity.

[`builder/src/nuvio/known-fields.js`](../../builder/src/nuvio/known-fields.js) remains the authoritative list of the 14 recognized filter field names. The Core imports that list and fails closed at module load if its ordered descriptors diverge. This avoids circular ownership and leaves the existing importer and serializer dependency direction unchanged.

The existing importer `rawImported` snapshot and serializer editable overlay remain authoritative for preservation. Core comparison output is ephemeral and must never be written into project state. Importing a source does not normalize it into the canonical Builder-created form.

`discoverSourceIdentity` and `inspectDiscoverSource` expect one complete native/effective DISCOVER payload. They must not be called with only an imported node's `editable` value because unknown imported filters live only in `rawImported`. Actual project nodes use `resolveEffectiveDiscoverSource`, `discoverSourceNodeIdentity`, and `inspectDiscoverSourceNode`. A behavior-preserving extraction placed the existing pure overlay helpers in [`builder/src/nuvio/source-overlay.js`](../../builder/src/nuvio/source-overlay.js); the old serializer module re-exports them, so serializer callers and behavior are unchanged. The resolver uses those shared helpers to clone `rawImported`, overlay current recognized source fields, retain unknown raw filters, and overlay current recognized editable filters. Its result is detached from the node and is never persisted automatically.

## 3. Canonical Builder-created source

The constructor emits the existing native source draft category and this serialized shape:

```json
{
  "title": "Netflix Australia Movies · Popular",
  "sortBy": "popularity.desc",
  "tmdbId": null,
  "filters": {
    "watchRegion": "AU",
    "withWatchProviders": "8"
  },
  "provider": "tmdb",
  "mediaType": "MOVIE",
  "tmdbSourceType": "DISCOVER"
}
```

Canonical construction requires:

- a nonblank trimmed title;
- `MOVIE` or `TV`;
- one supported semantic sort;
- a plain filter object containing only recognized fields;
- exact expected value types;
- trimmed strict positive-decimal ID expressions where an ID expression is modeled;
- `withNetworks` only for TV;
- `watchRegion` only with an active `withWatchProviders` value.

Null and blank known filter values are omitted. All 14 keys are not required. When both release-date bounds are strict valid `YYYY-MM-DD` calendar dates, canonical construction rejects `releaseDateGte > releaseDateLte`; equal bounds remain valid. This is a narrow relational check, not general date-format validation. `tmdbId` is explicitly `null`. Native sources are authoritative only in `sources` and never receive a `catalogSources` projection.

## 4. Filter descriptors

`valueType` is the expected Builder-created JSON type. Imported sources may contain other JSON values and remain preservation-first.

| Field | Type | Semantic kind | Movie mapping | TV mapping | Portability |
| --- | --- | --- | --- | --- | --- |
| `withGenres` | string | ID expression | `with_genres` | `with_genres` | Both; comma AND / pipe OR |
| `releaseDateGte` | string | date | `primary_release_date.gte` | `first_air_date.gte` | Both, media-mapped |
| `releaseDateLte` | string | date | `primary_release_date.lte` | `first_air_date.lte` | Both, media-mapped |
| `voteAverageGte` | number | rating | `vote_average.gte` | `vote_average.gte` | Both |
| `voteAverageLte` | number | rating | `vote_average.lte` | `vote_average.lte` | Both |
| `voteCountGte` | integer | vote count | `vote_count.gte` | `vote_count.gte` | Both |
| `withOriginalLanguage` | string | language code | `with_original_language` | same | Both |
| `withOriginCountry` | string | country code | `with_origin_country` | same | Both |
| `withKeywords` | string | ID expression | `with_keywords` | same | Both; comma AND / pipe OR |
| `withCompanies` | string | ID expression | `with_companies` | same | Both; comma AND / pipe OR |
| `withNetworks` | string | single ID | none portable | `with_networks` | TV only; Movie client-divergent |
| `year` | integer | year | `year` | `first_air_date_year` | Both, media-mapped |
| `watchRegion` | string | region code | conditional `watch_region` | same | Both; providers only |
| `withWatchProviders` | string | ID expression | `with_watch_providers` | same | Both; comma AND / pipe OR |

Active provider filtering also causes current clients to default a missing/blank region to `US` and inject `with_watch_monetization_types=flatrate|free|ads|rent|buy`. Those are effective runtime rules, not additional stored Core fields.

Desktop/Mobile currently forward Movie `withNetworks` as an undocumented parameter while Android TV and public NuvioWeb omit it. Therefore the Core rejects it for canonical Builder-created Movies but preserves and conservatively compares imported occurrences.

## 5. Semantic sorts

| Semantic ID | Label | Movie | TV |
| --- | --- | --- | --- |
| `popular` | Popular | `popularity.desc` | `popularity.desc` |
| `recent` | Recent | `primary_release_date.desc` | `first_air_date.desc` |
| `top-rated` | Top rated | `vote_average.desc` | `vote_average.desc` |
| `most-votes` | Most voted | `vote_count.desc` | `vote_count.desc` |

Missing, null, or empty sort compares as effective `popularity.desc`. Whitespace-only and unusual imported sorts remain exact because current-client behavior diverges. The Core does not refactor Studio or Network sort ownership.

## 6. Inspection and classification

Inspection returns one small classification and capability flags:

- `CANONICAL`: exact Builder-created envelope, supported sort, expected known filter forms, and portable media behavior;
- `PRESERVABLE`: recognizable native DISCOVER containing noncanonical casing/envelope, null known values, unknown filters, unusual sort, non-null `tmdbId`, extra fields, a proven contradictory strict full-date range, or other custom evidence;
- `NOT_NATIVE`: not safely recognizable as native TMDB DISCOVER.

Capabilities currently report:

- `comparisonSafe`: deterministic identity can be calculated;
- `knownFieldEditingSafe`: recognized values are safe for a future preservation-aware known-field editor.
- `editReadiness`: `FULLY_UNDERSTOOD`, `UNDERSTOOD_WITH_PRESERVED_EXTRAS`, or `PRESERVE_ONLY` for a recognized DISCOVER source;
- `editableKnownFields`: active recognized filter fields whose current representations are understood and portable;
- `preservedUnknownFields`: unknown filter keys that must remain read-only and preserved;
- `unsafeKnownFields`: recognized fields whose representation or media portability is not safe for structured editing;
- `preservedSourceFields`: extra source-level keys retained outside the canonical source envelope.

`FULLY_UNDERSTOOD` means every active filter and effective sort is understood even if the imported envelope itself is not byte-for-byte canonical. It describes field understanding and preservation-aware edit safety, not a guarantee that the current values are semantically valid. A contradictory pair of otherwise understood strict full-date bounds is therefore `PRESERVABLE` with reason `CONTRADICTORY_DISCOVER_DATE_RANGE`, while remaining `FULLY_UNDERSTOOD`, comparison-safe, and safe for known-field editing. `UNDERSTOOD_WITH_PRESERVED_EXTRAS` permits a future known-field overlay while retaining read-only unknown filters, unusual sorts, custom `tmdbId`, or extra source fields. `PRESERVE_ONLY` means a nonportable/invalid known-field representation or unsafe comparison prevents the Core from claiming structured-edit safety. The Core establishes edit-readiness only; it does not implement editing. Reasons remain stable machine-readable codes explaining why a source is not canonical or comparable.

Imported contradictory date bounds remain literal stored evidence: inspection does not swap, drop, or normalize either value, and identity continues to include both effective values. Partial or unusual imported strings such as `"1982"` or `"2020-1-1"` are not interpreted by this relational rule. A contradiction is diagnosed only when both bounds are independently proven valid strict `YYYY-MM-DD` calendar dates and the lower bound is lexically greater than the upper bound.

## 7. Comparison-only filter canonicalization

Comparison operates on a detached derived value:

- missing filters compare as an empty object;
- a non-object filter value is explicitly non-comparable;
- missing, null, and blank recognized fields are absent;
- a region is ignored without active watch providers;
- active providers plus missing/blank region compare with effective `US`;
- pure strict comma-AND and pipe-OR expressions normalize numeric token order;
- AND and OR remain distinct;
- duplicate tokens are retained;
- mixed delimiters, whitespace, leading zeros, empty tokens, and malformed expressions remain opaque exact strings;
- unknown filter keys participate conservatively;
- unknown object keys are recursively sorted;
- array order remains significant;
- primitive JSON types remain significant;
- non-finite, circular, sparse, or non-JSON values are non-comparable.

For example, `28,12` and `12,28` compare equally, while `28|12`, `28, 12`, `028,12`, and `28,12|35` do not collapse into that identity.

## 8. Functional identity

DISCOVER identity is a stable JSON representation of:

```text
normalized provider
+ DISCOVER
+ normalized media type
+ effective sort
+ canonical comparison filters
+ conservative custom tmdbId discriminator when present
```

Display title is excluded. Sort and media are included. Canonical absent/null `tmdbId` is excluded and equivalent. A non-null imported `tmdbId` makes the source preservable-custom and participates in identity so it cannot collide with the canonical form.

Unknown filter JSON participates after stable key ordering. For an imported Builder node, it participates only after the node-aware resolver has produced the authoritative effective view from `rawImported` plus recognized editable overlay. If the source or filters cannot be compared safely, identity returns an explicit non-comparable result with no key.

This keeps intentional rows such as Netflix AU Popular, Netflix AU Recent, Netflix AU Horror Popular, and Netflix AU Horror Recent distinct without changing entity-backed Studio, Network, People, or Franchise identity semantics.

## 9. Current-client evidence boundary

The issue #100 audit rechecked these public client revisions on 2026-08-09:

- NuvioDesktop `d6ad8788b106ea5e8efc6dce2c4bdae01a88c036`;
- NuvioMobile `ca7e54a4cc33c05334bb55f9ca61aec7c43ce7e4`;
- NuvioTV `062b6e0306969d600be229fd89650443b2e23c55`;
- NuvioWeb `3a0bbdadcbf7869e85f91a8e45452ce5752e2f95`.

Desktop, Mobile, and TV expose the 14-field Custom/Discover model and four semantic sorts. Public NuvioWeb recognizes the stored vocabulary at runtime but is the WebOS/Tizen/browser client repository; it does not establish the separate nuvio.tv account editor's UI capability.

The older complete compatibility evidence remains in [`TMDB_DISCOVER_COMPATIBILITY.md`](./TMDB_DISCOVER_COMPATIBILITY.md) and [`manual-tests/tmdb-discover/`](../../manual-tests/tmdb-discover/). Later evidence may revise this document and the Core in one focused issue.

## 10. Real-world import readiness

The checked-in evidence inventory scanned 48 JSON files under `manual-tests` and `tests/fixtures`, finding 94 DISCOVER occurrences across 12 files. Those occurrences deliberately repeat component and combined audit fixtures, so they are not 94 independent profiles. The highest-signal inputs are the 29-source owner-run compatibility audit, the issue #78 preservation profile, the comprehensive synthetic preservation profile, the Shark Movies fixture, and the canonical native profile.

The full third-party Kaptain collection is not in the repository and is not treated as direct evidence. Six sanitized Kaptain-derived/community hypotheses are retained in the manual audit. Owner evidence found no visible effect for them: Desktop `0.1.14-alpha` removed the unknown filters, retained historical iOS `1.2.23` preserved them without visibly applying them, and pinned typed client paths do not model or forward them. They therefore remain uneditable and are not promoted into the 14-field vocabulary.

| Extra field | Observed type | Local source/profile | Current client source support | Runtime application evidence | Preservation evidence | Recommended status |
| --- | --- | --- | --- | --- | --- | --- |
| `withoutGenres` | string | Kaptain-derived U1 / owner-run audit | No ordinary DISCOVER model | No visible effect; not forwarded by reviewed typed paths | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `withRuntimeGte` | number | Kaptain-derived U2 / owner-run audit | No | No visible effect | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `voteCountLte` | number | Community candidate U3 / owner-run audit | No | No visible effect | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `withCast` | string | Community candidate U4 / owner-run audit | No | No visible effect | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `withStatus` | string | Community candidate U5 / owner-run audit | No ordinary DISCOVER field; TV Network synthesizes separate status behavior | No visible ordinary-DISCOVER effect | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `withType` | string | Community candidate U6 / owner-run audit | No | No visible effect | Historical iOS retained; Desktop/current typed paths drop; Builder retains | `CLIENT-DIVERGENT` |
| `issue78UnknownDiscoverFilter` | string | Issue #78 preservation profile | No; explicit preservation sentinel | Not tested or claimed | Builder import/editable overlay/export retains it | `PRESERVE_ONLY` |
| `futureFlag` | boolean | Comprehensive synthetic preservation profile | No; synthetic sentinel | Not tested or claimed | Builder retains | `PRESERVE_ONLY` |
| `futureZero` | number | Comprehensive synthetic preservation profile | No; synthetic sentinel | Not tested or claimed | Builder retains | `PRESERVE_ONLY` |
| `futureNull` | null | Comprehensive synthetic preservation profile | No; synthetic sentinel | Not tested or claimed | Builder retains | `PRESERVE_ONLY` |
| `futureEmptyObject` | object | Comprehensive synthetic preservation profile | No; synthetic sentinel | Not tested or claimed | Builder retains | `PRESERVE_ONLY` |
| `futureEmptyArray` | array | Comprehensive synthetic preservation profile | No; synthetic sentinel | Not tested or claimed | Builder retains | `PRESERVE_ONLY` |

Actual imported-`SourceNode` tests establish all three readiness outcomes: recognized Movie/TV filters are fully understood; safely comparable unknown filters and unusual sorts are understood with preserved extras; Movie `withNetworks` and unsafe known representations are preserve-only. A known editable overlay changes effective identity while retained unknown raw fields survive unchanged through serialization.

Checked-in imported JSON directly exercises genres, ratings-minimum, vote-count minimum, keywords, TV Networks, watch providers/regions, Movie/TV media, Popular/Recent/Most-voted and unusual sorts, and several combinations. Owner-supplied post-Nuvio community exports retained outside the repository additionally exercise rating maximum, original language, origin country, strict release/air date ranges, Top-rated sorts, and six- or seven-filter combinations. One Decades source exposed a reversed strict full-date range; the deterministic regression shape records its preservation-first diagnostic without copying or depending on the external profile. Year and Company filters still lack real-world sample coverage; their descriptors remain grounded in pinned client-source evidence and deterministic all-14 SourceNode tests.

## 11. Explicit exclusions

Issue #100 adds no:

- Add Source, Advanced Discover, More Filters, or Source Edit UI;
- Streaming Services, Genre, Decade, language, country, date, region, keyword, provider, company, or network consumer flow;
- provider/genre catalogue, count, preview, artwork, multi-select, source-led hierarchy, generic EntityFlow, Creation Plan, or filter-form framework;
- Worker/API route, deployment, production data, dependency, or v1 behavior;
- change to importer/serializer preservation or existing source-family identity.

The immediate intended visual and production behavior difference is none.

## 12. Deterministic verification

[`tests/builder-discover-core.test.mjs`](../../tests/builder-discover-core.test.mjs) covers canonical Movie/TV construction, all descriptors and sorts, applicability and Movie Network divergence, comparison purity, precision-safe expression semantics, effective defaults, identity decisions, unknown JSON, actual imported-node overlay behavior, real-world readiness fixtures, custom imports, native projection exclusion, and representative Streaming, Genre, Decade, and combined-filter specification cases.

The repository-wide checks retain the existing importer, serializer, compatibility, Franchise, People, Studio, and Network regression suites. No browser/visual acceptance is required because no UI consumes the Core.
