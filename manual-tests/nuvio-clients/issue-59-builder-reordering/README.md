# Issue #59 Builder reordering client evidence

## Result

The 2026-07-27 client gate for issue [#59](https://github.com/davecollections/tmdb-id-lookup/issues/59) is complete for the sanitised Builder-reordered profile.

| Client | Result | Evidence |
| --- | --- | --- |
| Nuvio Desktop | Passed | Owner visual review plus exact raw export |
| nuvio.tv/web | Passed | Owner visual review plus exact raw export |
| Nuvio mobile | Passed | Owner visual review plus owner-supplied exported JSON text; exact raw artifact unavailable |
| Nuvio TV | Passed | Owner visual review plus the synced profile backed by the exact web export; no independent TV export |

This is a build- and evidence-specific ordering result, not a claim that every future Nuvio version preserves every unknown field.

## Files

- `builder-reordered-input.json` — exact Builder/controller/serializer output supplied to the clients.
- `seed-profile.json` — exact pre-move profile used to generate the final input.
- `expected-order.json` — machine-readable expected collection, folder, source, projection, pin, and parent contract.
- `generation-report.json` — unchanged provenance report created with commit `326efe0bf78ee095f1d9efd5420b18d509d5c14f`.
- `nuvio-desktop-export.json` — exact returned Desktop bytes.
- `nuviotv-web-export.json` — exact returned web bytes.
- `mobile-owner-evidence.json` — structured owner observations and the explicit missing-raw-artifact limitation.
- `tv-owner-evidence.json` — structured owner observations and the explicit no-independent-export limitation.
- `completed-evidence.md` — human-readable client matrix and normalization notes.
- `verification-report.json` — deterministic checker output.

No `nuvio-mobile-export.json` is included because no exact raw mobile file was found. No `nuvio-tv-export.json` is included because TV supplied no independent export. Neither missing file is fabricated.

## Expected order

Visible collections:

1. Issue 59 C - Pinned first
2. Issue 59 A - Pinned second
3. Issue 59 D - Regular first
4. Issue 59 B - Regular second

The exact serialized collection-array order is D, B, C, A. Within collection D, folders are C, A, B. Within folder C, authoritative sources and matching compatibility projections are C Movies, A Series, B Anime.

## Normalization boundary

Desktop retained the exact hierarchy, pins, IDs, parent relationships, all four sentinel levels, source order, and projection order. Its normalization is calculated from the exact raw export by the checker.

Web retained the exact hierarchy, pins, IDs, parent relationships, source sentinels, source order, and projection order. Relative to the Desktop-normalized form, it changed source `genre` from `null` to `""`, omitted optional null properties, changed folder `focusGifEnabled` from `true` to `false`, added collection `focusGlowEnabled: false`, and dropped collection, folder, and projection sentinels. Those are recorded normalization differences, not order failures.

The mobile export text retained all IDs, parents, pins, hierarchy arrays, and sentinel levels; it preserved `genre: null`, added explicit null/default artwork and source properties, and retained `focusGifEnabled: true`. Because the raw bytes are unavailable, that observation has no raw-file hash.

TV visibly retained the synced collection and folder order. Its source/projection-array evidence is the exact synced web export, not a separate TV export.

The synthetic addon identity `example.sanitised.issue59.ordering` may report unavailable or addon-not-found. That is expected and is not an ordering failure.

## Offline verification

Run:

```powershell
node scripts/check-builder-reordering-client-evidence.mjs
node --test tests/builder-reordering-client-evidence.test.mjs
```

To regenerate only the deterministic report:

```powershell
node scripts/check-builder-reordering-client-evidence.mjs --write-report
```

The checker performs no network requests. Its default mode is read-only. These repository-only files remain excluded from the Pages artifact by the existing explicit allowlist.
