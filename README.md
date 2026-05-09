# TMDB Company & Collection Lookup

A lightweight TMDB helper tool for finding useful IDs

The site helps users look up TMDB production company IDs, collection IDs, and related metadata in a clean searchable interface.

## What it does

- Search cached TMDB production companies
- Copy company IDs with one click
- Sort companies by ID, name, parent company, country, headquarters, and movie count
- Search TMDB movie collections by name
- Copy collection IDs
- Open matching TMDB pages directly
- Download cached company data as JSON or CSV

## Company data

The company database is built from TMDB production company exports and enriched in batches using the TMDB API.

Not every TMDB company ID is cached yet. The site shows how many IDs are currently cached and searchable.

Movie counts are based on TMDB movie credit/discover results and are intended as a useful guide when deciding which studio IDs may be worth using.

## Collection lookup

The collection lookup uses the TMDB API directly.

Example searches:

- Harry Potter
- Lord of the Rings
- Jurassic Park
- Mission Impossible

The tool returns matching TMDB collection IDs, poster previews, movie counts, and direct TMDB links.

## Useful for

- Building collections
- Finding TMDB company IDs
- Checking studio/movie counts
- Finding TMDB collection IDs
- Creating curated media rows or discovery sections

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.
