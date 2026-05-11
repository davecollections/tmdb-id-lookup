# TMDB ID Lookup

A lightweight TMDB helper tool for finding useful TMDB IDs.

The site helps users look up TMDB production company IDs, official movie collection IDs, and person IDs in a clean searchable interface.

## What it does

- Search cached TMDB production companies
- Copy company IDs with one click
- Sort companies by ID, name, parent company, country, headquarters, and movie count
- Filter company results by minimum movie count
- Search TMDB official movie collections by name or ID
- Search TMDB people by name or ID
- Filter TMDB ID results by actors, directors, collections, or all results
- Bulk lookup person names and export matching TMDB person IDs as CSV
- Show known-for department, credit count, and match type for bulk person results
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

- Official movie collections
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

### Movie collection searches

Movie collection lookup searches **TMDB official movie collections only**.

In TMDB, a collection usually means an official franchise or grouped movie series, not an individual movie or a custom user list. This means a search for a standalone movie may return no results, even if the movie exists on TMDB.

For example, searches like these are more likely to return collection results:

- Harry Potter
- Lord of the Rings
- Jurassic Park
- Mission Impossible

A standalone movie title may not return anything unless TMDB has it grouped as part of an official movie collection.

The tool returns matching TMDB collection IDs, poster previews, movie counts, and direct TMDB links.

## Bulk people ID lookup

The bulk people lookup helps resolve person names into TMDB person IDs.

Users can paste up to 50 names, one per line, then select **Resolve People IDs**.

The tool returns the best TMDB person-name match, along with:

- Input name
- Matched name
- TMDB person ID
- Known-for department
- Known credit count
- Match type
- TMDB link

Match type helps users review the result quality. Current match types include:

- Exact match
- TMDB best result
- No match

Matched results can be downloaded as a CSV.

Bulk people lookup uses TMDB search results and TMDB's known-for department data. Some people may be best known for acting, directing, writing, production, or another department.

## Useful for

- Finding TMDB company IDs
- Finding TMDB official movie collection IDs
- Finding TMDB actor, director, writer, and general person IDs
- Building curated media collections
- Creating discovery rows or metadata lists
- Checking studio/movie counts
- Exporting person ID lists as CSV

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.
