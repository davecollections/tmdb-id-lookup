# TMDB ID Lookup

Live site: [https://davecollections.github.io/tmdb-id-lookup/](https://davecollections.github.io/tmdb-id-lookup/)

A simple lookup tool for finding useful TMDB IDs for production companies, TV networks, genres, official movie collections, and people.

The site is designed for people building media libraries, curated collections, discovery rows, metadata lists, or other TMDB-based workflows where the correct ID matters.

## Common uses

* Find TMDB production company IDs
* Find TMDB TV network IDs
* Find official TMDB movie collection IDs
* Find actor, director, writer, and general person IDs
* Browse official TMDB genre IDs
* Check company and network title counts
* Copy IDs quickly while building media collections
* Export cached company, network, and genre results as CSV
* Export bulk people matches as CSV or Nuvio collections JSON
* Build Nuvio collections JSON from selected companies, networks, genres, and people

## Features

* Search cached production company and TV network databases
* Search cached official TMDB genre IDs and curated genre-style list references
* Filter company, network, and genre results
* Sort cached results by ID, name, type, media, country, headquarters, and title count where available
* Search TMDB movie collections by name or ID
* Search TMDB people by name or ID
* Filter TMDB lookup results by actors, directors, collections, or all results
* Bulk lookup up to 50 person names at a time
* Create Nuvio collections JSON from matched bulk people results
* Create Nuvio collections JSON from selected companies, networks, and genres
* Add optional curated cover artwork and supported focus GIF artwork to Nuvio network exports
* Copy IDs with one click
* Open matching TMDB pages directly

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

## Movie Collection And People Lookup

The TMDB lookup can search for official movie collections and people.

Movie collection lookup searches **TMDB official movie collections only**. In TMDB, a collection usually means an official franchise or grouped movie series, not an individual movie or a custom user list.

For example, searches like these are more likely to return collection results:

* Harry Potter
* Lord of the Rings
* Jurassic Park
* Mission Impossible

A standalone movie title may not return anything unless TMDB has it grouped as part of an official movie collection.

People lookup can search by name or TMDB person ID, and results can be filtered by actors, directors, or all people results.

## Bulk People Lookup

Bulk people lookup helps resolve multiple person names into TMDB person IDs.

Paste up to 50 names, one per line, then select **Resolve People IDs**. Results include the matched name, TMDB person ID, known-for department, credit count, match type, and TMDB link.

Matched results can be downloaded as a CSV or exported as Nuvio collections JSON.

The Nuvio JSON export can create people-based collections for actors, directors, or mixed people lists. It includes optional default collection artwork, folder hero artwork, and a hide-title setting for TMDB person images.

## Nuvio JSON Exports

Nuvio JSON exports are portable collection files that can be imported into Nuvio. The site currently supports:

* People collections from bulk people lookup matches
* Studio collections from selected production companies
* Network collections from selected TV networks
* Genre collections from selected official genres and curated list references

Company and network exports include quick select presets. Network exports can optionally use curated cover images and supported LuckyNumbers focus GIF artwork. If cover images are turned off, exports use emoji fallbacks and visible folder titles.

Each Nuvio export modal includes a help button with current import steps for Nuvio web and TV app flows. Nuvio is in beta, so those import steps may change.

## Data Freshness

Cached company, TV network, and genre data is updated automatically from TMDB data and API responses.

The site is deployed with GitHub Pages.

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.

Some optional Nuvio export artwork references community artwork from the
[LuckyNumbers Nuvio setup guide](https://luckynumb3rs.github.io/stremio-perfect-setup/guide/Nuvio/)
and [tomato's transparent covers pack](https://www.reddit.com/r/Nuvio/comments/1sk3ks6/transparent_covers_pack/).

Project maintained by [Dave Collections](https://github.com/davecollections).

## License

MIT License
