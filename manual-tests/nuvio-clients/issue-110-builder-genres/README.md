# Issue #110 Builder Genres current-client review

Status: deterministic Builder input prepared; current Nuvio Desktop execution and owner results are pending.

This bounded fixture contains the current-client evidence requested by issue [#110](https://github.com/davecollections/tmdb-id-lookup/issues/110):

- one pre-existing `Genre Sources` folder;
- one reviewed multi-select operation producing `Comedy Movies`, `Comedy Series`, then `Action & Adventure Series`;
- Top Rated order for all three physical sources;
- representative release-year, user-rating, vote-count, original-language, origin-country, and excluded-Genre filters;
- media-aware comma-separated exclusions in deterministic user selection order;
- no new Genre folder, artwork change, addon projection, curated List, account data, credential, private endpoint, or Builder internal ID.

`builder-generated-genre-sources.json` is generated through the production Builder controller, existing-folder Genre service, and serializer. Verify that it remains deterministic and contract-valid offline:

```powershell
node scripts/check-builder-genre-fixture.mjs
```

Regenerate it only after an intentional Genre contract change:

```powershell
node scripts/check-builder-genre-fixture.mjs --write
```

## Owner procedure

1. Import the unchanged fixture into the current Nuvio Desktop client.
2. Confirm there is one `Genre Sources` folder and its presentation remains unchanged.
3. Confirm the source order is Comedy Movies, Comedy Series, then Action & Adventure Series.
4. Confirm the Movie and Series sources retain their intended official `withGenres` IDs.
5. Confirm the advanced year, rating, vote, language, country, and media-aware exclusion filters remain present and behave as expected.
6. Confirm the exclusion order is `99,27` for Movie and `99,10762` for Series.
7. Immediately export without editing and save the exact result as `results/nuvio-desktop-immediate-export.json`.
8. Re-import that immediate export and confirm the same grouping, order, filters, and runtime behavior.
9. Complete `RESULTS_TEMPLATE.md`, including the actual client version/build, then rerun the checker.

Client normalization may expand compact filters with null/default fields. The material gate is the folder/source order, titles, provider, source type, null TMDB ID, media, sort, approved filters, empty native `catalogSources`, and runtime behavior. Do not describe the current-Nuvio gate as passed until the owner performs it.
