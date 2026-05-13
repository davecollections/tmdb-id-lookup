# TMDB ID Lookup

A lightweight TMDB helper tool for finding useful TMDB IDs.

The site helps users look up TMDB production companies, TV networks, genres, official movie collections, and people in a clean searchable interface.

## What it does

* Search cached TMDB production companies
* Search cached TMDB TV networks
* Search TMDB genres and curated genre references
* Copy IDs with one click
* Sort cached results by ID, name, country, headquarters, and title count
* Filter company and network results by minimum title count
* Search TMDB official movie collections by name or ID
* Search TMDB people by name or ID
* Filter TMDB ID results by actors, directors, collections, or all results
* Bulk lookup person names and export matching TMDB person IDs as CSV
* Open matching TMDB pages directly
* Download cached company and network data as CSV

## Cached databases

### Production companies

The production company database is built from TMDB production company exports and enriched in batches using the TMDB API.

Movie counts are based on TMDB movie credit/discover results and are intended as a useful guide when deciding which studio IDs may be worth using.

Company search uses the cached local dataset. Cached company data can be downloaded as a CSV.

### TV networks

The TV network database is also built from TMDB export files and enriched using the TMDB API.

Network results include:

* TMDB network IDs
* TV title counts
* Country
* Headquarters
* Logos
* Direct TMDB links

Cached network data can also be downloaded as CSV.

### Genres & curated references

The genre lookup includes:

* Official TMDB movie genres
* Official TMDB TV genres
* Curated TMDB list references for categories TMDB does not officially expose as genres

Examples include:

* Musicals
* Space
* Disaster
* Holiday themes

Genre references include cached title counts where available.

## TMDB ID lookup

The TMDB ID lookup uses the TMDB API directly.

It can search for:

* Official movie collections
* Actors
* Directors
* People by TMDB person ID
* Movie collections by TMDB collection ID

Results can be filtered by:

* All
* Directors
* Actors
* Collections

Each result includes the TMDB ID, useful metadata, a copy button, and a direct TMDB link.

### Movie collection searches

Movie collection lookup searches **TMDB official movie collections only**.

In TMDB, a collection usually means an official franchise or grouped movie series, not an individual movie or a custom user list. This means a search for a standalone movie may return no results, even if the movie exists on TMDB.

For example, searches like these are more likely to return collection results:

* Harry Potter
* Lord of the Rings
* Jurassic Park
* Mission Impossible

A standalone movie title may not return anything unless TMDB has it grouped as part of an official movie collection.

The tool returns matching TMDB collection IDs, poster previews, movie counts, and direct TMDB links.

## Bulk people ID lookup

The bulk people lookup helps resolve person names into TMDB person IDs.

Users can paste up to 50 names, one per line, then select **Resolve People IDs**.

The tool returns the best TMDB person-name match, along with:

* Input name
* Matched name
* TMDB person ID
* Known-for department
* Known credit count
* Match type
* TMDB link

Match type helps users review the result quality. Current match types include:

* Exact match
* TMDB best result
* No match

Matched results can be downloaded as a CSV.

Bulk people lookup uses TMDB search results and TMDB's known-for department data. Some people may be best known for acting, directing, writing, production, or another department.

## Automation

The project includes GitHub Actions workflows for:

* Daily genre count updates
* Monthly rolling company refreshes
* Monthly TV network refreshes
* Weekly TMDB export coverage audits
* Automatic GitHub Pages deployments

The cache system is designed to keep datasets reasonably fresh without requiring extremely large TMDB API runs.

## Useful for

* Finding TMDB company IDs
* Finding TMDB TV network IDs
* Finding TMDB genre and curated list IDs
* Finding TMDB official movie collection IDs
* Finding TMDB actor, director, writer, and general person IDs
* Building curated media collections
* Creating discovery rows or metadata lists
* Checking studio/network title counts
* Exporting person ID lists as CSV

## Notes

This project uses the TMDB API but is not endorsed or certified by TMDB.

Company names, logos, posters, and trademarks remain the property of their respective owners.

## License

MIT License

-----text
[https://github.com/davecollections](https://github.com/davecollections)

```
```
