# Issue #74 Builder People current-client review

Status: the first Nuvio Desktop run passed the source-contract checks. On 2026-08-02, the regenerated final fixture also passed owner visual review and immediate-export validation for distinct tab titles, curated artwork, grouping, order, and material source identity.

## Files

- `builder-generated-people-sources.json` is the exact sanitized input generated through the production Builder controller, People source service, and serializer.
- `results/` is the location for the exact immediate Nuvio Desktop export and the completed results record.
- `RESULTS_TEMPLATE.md` is the short owner checklist and result template.
- `ASSET_GAPS.md` records genuine curated People artwork gaps without guessing TMDB identities or changing the asset repository.

The fixture contains no account data, credentials, private endpoints, raw TMDB responses, Builder internal IDs, or addon projections. It has one collection and two Poster folders:

- Tom Hanks, TMDB person `31`: `PERSON / MOVIE`, then `PERSON / TV`.
- Steven Spielberg, TMDB person `488`: `DIRECTOR / MOVIE`, then `DIRECTOR / TV`.

Folder titles remain canonical person names. Source titles use the stable v1 People convention so Nuvio tabs remain distinct: `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series`.

The final fixture includes the published, SHA-versioned curated Poster URLs for Tom Hanks and Steven Spielberg and sets `hideTitle: true`. The generator contains the retained published runtime evidence and never fabricates an unavailable asset.

Verify that the tracked input still matches deterministic production Builder output:

```powershell
node scripts/check-builder-people-fixture.mjs
```

Regenerate it only after an intentional People source contract change:

```powershell
node scripts/check-builder-people-fixture.mjs --write
```

## First Desktop source-contract result

Dave's first import resolved Tom Hanks `PERSON / MOVIE`, Tom Hanks `PERSON / TV`, Steven Spielberg `DIRECTOR / MOVIE`, and Steven Spielberg `DIRECTOR / TV`. Numeric IDs, source types, media types, `popularity.desc`, source order, folder grouping, and the immediate Nuvio export all survived. Nuvio normally expanded the compact source objects with verbose null filter fields and `catalogSources: []`.

That fixture intentionally contained empty `coverImageUrl` values and repeated canonical-name source titles. It therefore confirms the native source contract and runtime behavior, but not curated artwork or final tab naming. Do not treat it as the final fixture import.

## Final Nuvio Desktop result and reproducible procedure

Dave imported the unchanged regenerated fixture into current Nuvio Desktop on Windows 11. The Tom Hanks and Steven Spielberg curated Posters rendered, the four stable-v1 tab titles remained distinct, and the catalogues populated for the intended Acting and Directing media combinations. The owner-supplied immediate export is retained in `results/nuvio-desktop-immediate-export.json`; the checker confirms its exact SHA-versioned artwork URLs, `hideTitle: true`, grouping, source order, titles, identities, and empty native `catalogSources`. Nuvio Desktop version/build was not supplied.

The completed procedure was:

1. Open the current Nuvio Desktop client and use its collection import workflow.
2. Import `builder-generated-people-sources.json` without editing it.
3. Confirm the two folders remain grouped and ordered as Tom Hanks, then Steven Spielberg.
4. Confirm the folders use the curated Tom Hanks and Steven Spielberg Poster artwork, their titles are hidden on the artwork, and each source tab has the distinct title shown below.
5. Open each source and confirm it resolves titles matching the role and media mapping below. Record observations; do not infer a pass from import success alone.
6. Immediately export the imported collection before changing any source or folder.
7. Save that exact export as `results/nuvio-desktop-immediate-export.json`.
8. Complete `RESULTS_TEMPLATE.md`, including the client version/build when available.
9. Run `node scripts/check-builder-people-fixture.mjs` again. When the export exists, the checker verifies grouping, source order, distinct titles, material identities, and final curated artwork while allowing the client's normal null/default expansion.

## Expected source behavior

| Folder | Order | Source title | Provider | Source type | Person ID | Media | Sort | Expected content |
| --- | ---: | --- | --- | --- | ---: | --- | --- | --- |
| Tom Hanks | 1 | `Movie Credits` | `tmdb` | `PERSON` | `31` | `MOVIE` | `popularity.desc` | Acting movie credits |
| Tom Hanks | 2 | `Series Credits` | `tmdb` | `PERSON` | `31` | `TV` | `popularity.desc` | Acting series credits |
| Steven Spielberg | 1 | `Directed Movies` | `tmdb` | `DIRECTOR` | `488` | `MOVIE` | `popularity.desc` | Directed movies |
| Steven Spielberg | 2 | `Directed Series` | `tmdb` | `DIRECTOR` | `488` | `TV` | `popularity.desc` | Directed series |

For every folder, `sources` is authoritative and `catalogSources` must remain empty. The fixture contains no `BOTH` media type and no generic all-credits source.

## Review checklist

- Provider is `tmdb` on all four sources.
- Source types are two `PERSON` entries for Tom Hanks and two `DIRECTOR` entries for Steven Spielberg.
- Person IDs remain numeric `31` and `488` respectively.
- Each person has `MOVIE` followed by `TV`.
- Sort remains `popularity.desc` on all four sources.
- Source titles remain `Movie Credits`, `Series Credits`, `Directed Movies`, and `Directed Series` in order.
- Folder artwork remains the exact SHA-versioned curated URL in the generated fixture and `hideTitle` remains `true`.
- Folder order and within-folder source order are unchanged.
- Sources remain grouped under the correct person folder.
- No addon-backed `catalogSources` projection is introduced.
- Immediate export is saved exactly in the documented `results` location.

Runtime result ordering is provider-defined. The material acceptance question is whether each distinctly titled native identity resolves the appropriate role/media catalogue and the curated folder art renders correctly. The 2026-08-02 owner run passed that final visual gate, and its immediate export passed the deterministic fixture checker.
