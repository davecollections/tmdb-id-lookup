# TMDB Company & ID Lookup

A lightweight TMDB helper tool for finding useful TMDB IDs.

The site helps users look up TMDB production company IDs, movie collection IDs, and person IDs in a clean searchable interface.

## What it does

- Search cached TMDB production companies
- Copy company IDs with one click
- Sort companies by ID, name, parent company, country, headquarters, and movie count
- Filter company results by minimum movie count
- Search TMDB movie collections by name or ID
- Search TMDB people by name or ID
- Filter TMDB ID results by actors, directors, collections, or all results
- Bulk lookup actor or director names and export matching TMDB person IDs as CSV
- Open matching TMDB pages directly
- Download cached company data as CSV

## Company data

The company database is built from TMDB production company exports and enriched in batches using the TMDB API.

Not every TMDB company ID is cached yet. The site shows how many IDs are currently cached and searchable.

Movie counts are based on TMDB movie credit/discover results and are intended as a useful guide when deciding which studio IDs may be worth using.

Company search uses the cached local dataset. Cached company data can be downloaded as a CSV.

## TMDB ID lookup

The TMDB ID lookup uses the TMDB API directly.

It can search for:

- Movie collections
- Actors
- Directors
- People by TMDB person ID
- Movie collections by TMDB collection ID

Results can be filtered by:

- All
- Directors
- Actors
- Collections

Each result includes the TMDB ID, useful metadata, a copy button, and a direct TMDB link.

## Bulk people ID lookup

The bulk people lookup helps resolve actor or director names into TMDB person IDs.

Users can paste up to 50 names, one per line, then choose:

- Resolve Actor IDs
- Resolve Director IDs

The tool returns the best exact name match for the selected role, along with:

- matched name
- TMDB person ID
- known credit count
- match status
- TMDB link

Matched results can be downloaded as a CSV.

Bulk role matching uses TMDB’s “known for department” data, so some multi-role people may not appear in every category.

## Collection lookup

Collection lookup searches **movie collections only**.

In TMDB, a collection usually means a franchise or grouped movie series, not an individual movie. This means a search for a standalone movie may return no results, even if the movie exists on TMDB.

For example, searches like these are more likely to return collection results:

- Harry Potter
- Lord of the Rings
- Jurassic Park
- Mission Impossible

A standalone movie title may not return anything unless TMDB has it grouped as part of an official movie collection.

The tool returns matching TMDB collection IDs, poster previews, movie counts, and direct TMDB links.

## Useful for

- Finding TMDB company IDs
- Finding TMDB collection IDs
- Finding TMDB actor and director IDs
- Building curated media collections
- Creating discovery rows or metadata lists
- Checking studio/movie counts
- Exporting actor or director ID lists as CSV

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.
