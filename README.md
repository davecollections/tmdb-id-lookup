# TMDB ID Lookup

[![Deploy Pages](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/deploy-pages.yml)
[![TMDB Audit](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/audit-tmdb-export-coverage.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/audit-tmdb-export-coverage.yml)
[![Daily Repair](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/daily-repair-cache-from-audit.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/daily-repair-cache-from-audit.yml)
[![Genre Counts](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/update-genre-counts.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/update-genre-counts.yml)
[![Monthly Company Refresh](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-company-refresh.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-company-refresh.yml)
[![Monthly Network Refresh](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-network-refresh.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-network-refresh.yml)

Live site: [https://davecollections.github.io/tmdb-id-lookup/](https://davecollections.github.io/tmdb-id-lookup/)

A simple lookup tool for finding useful TMDB IDs for production companies, TV networks, genres, official movie collections, people, and TV series.

The site is designed for people building media libraries, curated collections, discovery rows, metadata lists, or other TMDB-based workflows where the correct ID matters.

## Common uses

* Find TMDB production company IDs
* Find TMDB TV network IDs
* Find official TMDB movie collection IDs
* Find TMDB TV series IDs
* Find actor, director, writer, and general person IDs
* Browse official TMDB genre IDs
* Check company and network title counts
* Copy IDs quickly while building media collections
* Export cached company, network, and genre results as CSV
* Import pasted names, pasted CSV text, or CSV/text files for bulk people lookup
* Export bulk people matches as CSV or Nuvio collections JSON
* Combine multiple people Nuvio JSON batch files into one downloadable JSON
* Build Nuvio collections JSON from selected companies, networks, genres, and people

## Features

* Search cached production company and TV network databases
* Search cached official TMDB genre IDs and curated genre-style list references
* Filter company, network, and genre results
* Sort cached results by ID, name, type, media, country, headquarters, and title count where available
* Search TMDB movie collections by name or ID
* Search TMDB people by name or ID
* Search TMDB TV series by name or ID
* Filter TMDB lookup results by actors, directors, collections, TV series, or all results
* Bulk lookup person names from pasted text, pasted CSV, or uploaded CSV/text files
* Split larger people lists into clear 50-name batches
* Create Nuvio collections JSON from matched bulk people results
* Merge split people JSON batches into one Nuvio collection JSON
* Append people batch folders into an existing Nuvio collections JSON file
* Create Nuvio collections JSON from selected companies, networks, and genres
* Add optional curated cover artwork and supported focus GIF artwork to Nuvio network exports
* Copy IDs with one click
* Open matching TMDB pages directly
* Report feedback through structured GitHub issues

## Cached Company, Network, And Genre Data

Production company, TV network, and genre reference data is cached so it can be searched quickly without querying TMDB for every result.

Company, network, and genre results can include:

* TMDB ID
* Name
* Type or media category
* Country
* Headquarters
* Logo
* Title count
* Direct TMDB link

Cached company, network, and genre data can also be downloaded as CSV.

Title counts are intended as a practical guide when deciding which company, network, or genre references may be useful. They are based on TMDB data and may change as TMDB updates its records.

## Genres

The genre lookup includes official TMDB movie and TV genre IDs, plus curated TMDB list references for useful categories that TMDB does not expose as official genres.

Genre Nuvio JSON export can create a single Genres collection from selected movie genres, TV genres, and curated list references. Export options include:

* Tabbed, rows, or follow-layout view mode
* Poster or wide folder artwork
* Optional date, rating, language, and country filters
* Movie-only and TV-only quick select buttons
* Merge choices for overlapping TV/movie categories such as Action & Adventure, Sci-Fi & Fantasy, and War & Politics

## Movie Collection, People, And TV Series Lookup

The TMDB lookup can search for official movie collections, people, and TV series.

Movie collection lookup searches **TMDB official movie collections only**. In TMDB, a collection usually means an official franchise or grouped movie series, not an individual movie or a custom user list.

For example, searches like these are more likely to return collection results:

* Harry Potter
* Lord of the Rings
* Jurassic Park
* Mission Impossible

A standalone movie title may not return anything unless TMDB has it grouped as part of an official movie collection. The tool does not currently search individual movies.

People lookup can search by name or TMDB person ID, and results can be filtered by actors, directors, or all people results.

TV series lookup can search by series name or TMDB TV series ID. This is useful when building Nuvio folders for specific shows, such as favorite animated series.

## Bulk People Lookup

Bulk people lookup helps resolve multiple person names into TMDB person IDs.

Paste names, paste CSV text, or load a CSV/text file, then select **Resolve People IDs**. CSV imports use a `name`, `person`, `actor`, `director`, or first/last name column when one exists, and otherwise use the first column. Plain comma-separated name lists are also accepted.

Each lookup uses the first 50 names and tells you the last included name so larger lists can be split into batches. If the active batch includes partial names, the page warns that matches may not be accurate. Results include the matched name, TMDB person ID, known-for department, credit count, match type, and TMDB link.

Matched results can be downloaded as a CSV or exported as Nuvio collections JSON.

The Nuvio JSON export can create people-based collections for actors, directors, or mixed people lists. It includes optional default collection artwork, folder hero artwork, and a hide-title setting for TMDB person images.

If a people list needs to be split into multiple 50-name batches, the bulk people tool can combine exported Nuvio JSON files into one download. Files can be added in batches, reviewed, and removed if needed. Single-collection mode merges every folder into one collection, with optional first-name or last-name sorting. Keep-collections mode combines the uploaded collections into one file without merging their folders. Existing Nuvio JSON files can also be kept, skipped, or used as the target for appended people batch folders.

## Nuvio JSON Exports

Nuvio JSON exports are portable collection files that can be imported into Nuvio. The site currently supports:

* People collections from bulk people lookup matches
* Studio collections from selected production companies
* Network collections from selected TV networks
* Genre collections from selected official genres and curated list references

Company and network exports include quick select presets. Network exports can optionally use curated cover images and supported LuckyNumbers focus GIF artwork. If cover images are turned off, exports use emoji fallbacks and visible folder titles.

Each Nuvio export modal includes a help button with current import steps for Nuvio web and TV app flows. Nuvio is in beta, so those import steps may change.

## Data Freshness

Cached company, TV network, and genre data is maintained automatically from TMDB data and API responses.

The project runs daily checks for TMDB export changes, repairs small cache differences automatically, and refreshes genre title counts. Production company and TV network caches also run scheduled full-refresh passes at the start of each month so the local lookup data stays aligned with TMDB's exported ID lists.

The site is deployed with GitHub Pages.

## Feedback And Privacy

Feedback, bug reports, data issues, and feature requests are tracked through
[GitHub Issues](https://github.com/davecollections/tmdb-id-lookup/issues/new/choose).
The live site links to the issue chooser instead of collecting feedback by email or embedded forms.

The live site uses GoatCounter for lightweight page analytics. This helps estimate whether the tool is being used without adding account tracking, Nuvio access, or TMDB API keys to the page.

## Local Checks

Run `scripts\check.cmd` before pushing changes on Windows. This validates frontend JavaScript syntax, cached JSON parsing, duplicate HTML IDs, duplicate cached IDs, Nuvio export preset references, genre artwork/count coverage, and unsafe rendering patterns.

If you are not on Windows, run `node scripts/check-frontend.mjs` directly.

## Local TMDB Testing

The app uses a Cloudflare Worker proxy for live TMDB API calls. Local static testing still works without extra setup, but live TMDB lookups from `localhost` or `127.0.0.1` require that local origin to be allowed by the Worker CORS rules.

If local lookup requests fail while the live site works, check the Worker origin allowlist before changing frontend code.

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.

Some optional Nuvio export artwork references community artwork from the
[LuckyNumbers Nuvio setup guide](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Nuvio/)
and [tomato's transparent covers pack](https://www.reddit.com/r/Nuvio/comments/1sk3ks6/transparent_covers_pack/).

Project maintained by [Dave Collections](https://github.com/davecollections).

## License

MIT License
