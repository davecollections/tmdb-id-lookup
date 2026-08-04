# Issue #78 source-editing client evidence

Status: deterministic input prepared; current Nuvio Desktop execution and owner results are pending.

This package supports the bounded client gate for issue [#78](https://github.com/davecollections/tmdb-id-lookup/issues/78). It derives from the accepted issue #65 Movie Collection and issue #74 People source contracts without changing either accepted package.

## Files

- `source-edit-input.json` is the controlled preservation fixture.
- `RESULTS_TEMPLATE.md` records the owner-run observations and actual client version/build.
- `results/README.md` defines the exact locations for immediate exports. No result is present or claimed until Dave performs the tests.

The fixture contains one editable Movie Collection source, one default-title People source, one custom-title People source, a pre-existing duplicate People identity, and interleaved Discover, addon, and List sources. It also contains raw Nuvio source IDs, a numeric-string and casing variant, all three evidenced People sort families, explicit null/default fields, filters with unknown nested values, an addon projection, source-order sentinels, and complete folder presentation fields. Discover and the other unsupported sources must remain Delete-only even though some carry the `NATIVE TMDB` badge.

The `example.invalid` artwork and addon URLs are inert preservation sentinels. They are not production resources and successful loading is not expected.

Verify the package and production edit services offline:

```powershell
node scripts/check-builder-source-edit-fixture.mjs
```

## Controlled test 1: Movie Collection identity change

1. Import `source-edit-input.json` into the Builder.
2. In `Preservation Lab`, open the menu for `Preserve this franchise label` and choose **Edit source**.
3. Choose **Choose another franchise**, select a different official collection through Search, exact positive ID, or a strict TMDB collection URL, and return to the edit form.
4. Confirm the selected canonical collection name is now the prominent label, its numeric ID is secondary, the title field immediately uses that canonical name, and copy identifies it as the collection that will be saved.
5. Optionally type a custom title, confirm it remains editable, then choose **Use selected collection name** and confirm the canonical name is restored. For the primary evidence run, save the canonical name.
6. Save once and export the Builder output for comparison if useful.
7. Import the edited output into current Nuvio Desktop.
8. Confirm that the edited source resolves the newly selected franchise and uses the canonical selected title.
9. Immediately export without another client edit and save the exact output as `results/movie-collection-identity-change-immediate-export.json`.

Record the selected collection name and numeric TMDB ID in `RESULTS_TEMPLATE.md`. A separate optional repeat may save a custom title entered after selection, but it must be recorded separately and must not replace the canonical-title run.

## Controlled test 2: People role/media change

1. Re-import the unchanged `source-edit-input.json` into the Builder.
2. Open the primary source `Movie Credits`, not `Pre-existing duplicate identity`.
3. Confirm the editor opens immediately from stored data, then records friendly title counts beside all four People choices without requesting folder artwork. Loading or failure must not disable Save; use Retry only if the bounded check fails.
4. Change the physical source from `PERSON / MOVIE` to `DIRECTOR / TV` and confirm the auto-managed title immediately becomes `Directed Series`.
5. Change **Sort order** from **Popular** to **Recent** and confirm the final serialized value is `first_air_date.desc`.
6. Save once and export the Builder output for comparison if useful.
7. Import the edited output into current Nuvio Desktop.
8. Confirm that the edited source resolves Steven Spielberg's directed series, retains person ID `488`, and uses `Directed Series` with the verified sort.
9. Immediately export without another client edit and save the exact output as `results/people-role-media-change-immediate-export.json`.

The duplicate fixture remains `PERSON / MOVIE` and should not be merged, deleted, or rewritten.

## Controlled test 3: custom People title preservation

1. Re-import the unchanged `source-edit-input.json` into the Builder.
2. Open `Preserve this custom People label` (`PERSON / TV`, person ID `31`, `vote_average.desc`).
3. Confirm the custom title remains unchanged while switching to `DIRECTOR / MOVIE`.
4. Leave **Sort order** untouched and Save once.
5. Import the edited output into current Nuvio Desktop and confirm Tom Hanks' directed movies resolve while person ID `31`, the custom title, `vote_average.desc`, filters, raw/unknown fields, source ID, source position, and folder presentation survive.
6. Immediately export without another client edit and save the exact output as `results/people-custom-title-change-immediate-export.json`.

## Controlled test 4: no-op edit and round trip

1. Re-import the unchanged `source-edit-input.json` into the Builder.
2. Open either supported target and choose **Save changes** without changing any field.
3. Confirm that the Builder output remains byte-identical to the pre-open serialized output.
4. Import that unchanged output into current Nuvio Desktop and immediately export it.
5. Save the exact client output as `results/no-op-round-trip-immediate-export.json`.

Client normalization may add, remove, or normalize defaults. Record observed differences; do not describe client-normalized output as byte-identical unless an exact comparison proves it.

## Evidence boundary

Do not fabricate runtime or preservation results. Record the actual Nuvio Desktop version/build, operating system, selected identities, source order, raw source IDs, provider/type/media/ID/title/sort/filter values, unknown-field behavior, folder presentation, and immediate-export normalization. A second current client is desirable but non-blocking unless evidence conflicts.
