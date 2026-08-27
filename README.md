# TMDB ID Lookup

[![Deploy Pages](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/deploy-pages.yml)
[![TMDB Audit](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/audit-tmdb-export-coverage.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/audit-tmdb-export-coverage.yml)
[![Daily Repair](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/daily-repair-cache-from-audit.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/daily-repair-cache-from-audit.yml)
[![Genre Counts](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/update-genre-counts.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/update-genre-counts.yml)
[![Monthly Company Refresh](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-company-refresh.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-company-refresh.yml)
[![Monthly Network Refresh](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-network-refresh.yml/badge.svg)](https://github.com/davecollections/tmdb-id-lookup/actions/workflows/monthly-network-refresh.yml)

Live site: [https://davecollections.github.io/tmdb-id-lookup/](https://davecollections.github.io/tmdb-id-lookup/)

A simple lookup tool for finding useful TMDB IDs for production companies, TV networks, genres, movies, official movie collections, people, and TV series.

The site is designed for people building media libraries, curated collections, discovery rows, metadata lists, or other TMDB-based workflows where the correct ID matters.

## Common uses

* Find TMDB production company IDs
* Find TMDB TV network IDs
* Find individual TMDB movie IDs
* Find official TMDB movie collection IDs
* Find TMDB TV series IDs
* Find actor, director, writer, and general person IDs
* Browse official TMDB genre IDs
* Check company and network title counts
* Copy IDs quickly while building media collections
* Export cached company, network, and genre results as CSV or Nuvio collections JSON
* Import pasted names, pasted CSV text, or CSV/text files for bulk people lookup
* Export bulk people matches as CSV or Nuvio collections JSON
* Combine multiple Nuvio collection JSON files into one downloadable JSON
* Build Nuvio collections JSON from selected companies, networks, genres, movie collections, and people
* Copy generated JSON or download it as a file

## Features

* Search cached production company and TV network databases
* Search cached official TMDB genre IDs and curated genre-style list references
* Filter company, network, and genre results
* Sort cached results by ID, name, type, media, country, headquarters, and title count where available
* Search TMDB movies by title or ID
* Search TMDB movie collections by name or ID
* Search TMDB people by name or ID
* Search TMDB TV series by name or ID
* Filter TMDB lookup results by actors, directors, movies, movie collections, TV series, or all results
* Bulk lookup people, official movie collections, and TV series from pasted text, pasted CSV, or uploaded CSV/text files
* Split larger bulk lists into clear 50-item chunks
* Create Nuvio collections JSON from matched bulk people and movie collection results
* Combine or merge Nuvio collection JSON files, with duplicate ID fixes and preservation-first handling
* Append uploaded folders into an existing Nuvio collections JSON file
* Create Nuvio collections JSON from selected companies, networks, and genres
* Copy or download generated Nuvio JSON, with visible button-level copy feedback
* Automatically choose published curated, cached TMDB, or title/emoji artwork for Nuvio company and network exports
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

Selected company, network, and genre results can also be exported as Nuvio collections JSON. Those export modals support both Copy JSON and Download JSON, and both actions use the same generated output for the current export settings.

Title counts are intended as a practical guide when deciding which company, network, or genre references may be useful. They are based on TMDB data and may change as TMDB updates its records.

For cached TV networks, a numeric title count is the latest successfully collected TMDB result: zero means TMDB explicitly returned no matching series, while an unavailable count is shown as `Unknown` and left blank in the downloadable CSV. The existing nightly Network repair retries unknown counts without treating them as confirmed zero.

## Genres

The genre lookup includes official TMDB movie and TV genre IDs, plus curated TMDB list references for useful categories that TMDB does not expose as official genres.

Genre Nuvio JSON export can create a single Genres collection from selected movie genres, TV genres, and curated list references. Export options include:

* Tabbed, rows, or follow-layout view mode
* Poster or wide folder artwork
* Optional date, rating, language, and country filters
* Movie-only and TV-only quick select buttons
* Merge choices for overlapping TV/movie categories such as Action & Adventure, Sci-Fi & Fantasy, and War & Politics

## Movie, Movie Collection, People, And TV Series Lookup

The top TMDB lookup can search for individual movies, official movie collections, people, and TV series.

Movie lookup searches individual TMDB movies by title or TMDB movie ID. It is intended for quickly copying a movie ID only; it does not add bulk movie lookup or Nuvio JSON export for individual movies.

Movie collection lookup searches **TMDB official movie collections only**. In TMDB, a collection usually means an official franchise or grouped movie series, not an individual movie or a custom user list.

For example, searches like these are more likely to return collection results:

* Harry Potter
* Lord of the Rings
* Jurassic Park
* Mission Impossible

People lookup can search by name or TMDB person ID, and results can be filtered by actors, directors, or all people results.

TV series lookup can search by series name or TMDB TV series ID. This is useful when building Nuvio folders for specific shows, such as favorite animated series.

## Bulk Lookup

Bulk lookup helps resolve multiple pasted or uploaded items into TMDB IDs.

The bulk area has three tabs:

* **People** resolves person names to TMDB person IDs.
* **Movie Collections** resolves official TMDB movie collection names or IDs. It does not search individual movies.
* **TV Series** resolves TV series names or IDs.

Paste names, paste CSV text, or load a CSV/text file, then select the matching resolve button. People CSV imports use a `name`, `person`, `actor`, `director`, or first/last name column when one exists. Movie Collection and TV Series CSV imports use a `name`, `title`, type-specific column, or the first column. Plain comma-separated lists are also accepted.

Each lookup uses the first 50 items and tells you the last included item so larger lists can be split into chunks. If the active people chunk includes partial names, the page warns that matches may not be accurate. Results include the matched title/name, TMDB ID, match type, and type-specific details.

Matched results from all three tabs can be downloaded as CSV. TV Series CSV exports include one row per TMDB season when season summary data is available, using the same TMDB series ID plus the season number and season URL.

The People tab can create people-based Nuvio collections for actors, directors, or mixed people lists. It can auto-select movie, series, or movie-plus-series sources per person from TMDB credit data, use the same source type for every person, or let you manually choose sources per person. It also includes optional default collection artwork, folder hero artwork, sort options, copy/download JSON actions, and a hide-title setting for TMDB person images.

The Movie Collections tab can create one Nuvio collection with one folder per matched TMDB movie collection. It uses the confirmed Nuvio `COLLECTION` source schema and can export either landscape backdrop artwork or poster artwork.

Nuvio's built-in TMDB integration does not currently support direct TMDB TV series sources in collection JSON, so TV Series bulk export stays CSV-only. The tool does not create TV Series Nuvio JSON yet.

If a list needs to be split into multiple 50-item chunks, or you have several Nuvio collection exports to manage, the combiner can create one clean Nuvio JSON download. Files can be added, reviewed, and removed if needed. Merge mode combines every folder into one collection, with optional name/title sorting or last-name sorting for people lists. Name/title sorting ignores leading English articles such as `The`, `A`, and `An`. Keep-separate mode combines uploaded collections into one file without merging their folders. The combiner preserves original collection data where possible, normalizes duplicate or missing collection/folder IDs, and preserves community metadata when collections are kept separate.

## Nuvio JSON Exports

Nuvio JSON exports are portable collection files that can be imported into Nuvio. The site currently supports:

* People collections from bulk people lookup matches
* Movie collection exports from bulk movie collection lookup matches
* Studio collections from selected production companies
* Network collections from selected TV networks
* Genre collections from selected official genres and curated list references
* Combined Nuvio collection JSON exports from uploaded Nuvio files

Company and network exports include quick select presets and automatically choose the best available folder artwork. They prefer published curated landscape artwork, including approved published text fallbacks, then use the selected entity's cached TMDB `logo_path`, and finally use a visible title with the existing 🎬 or 📺 emoji when neither image exists. TMDB logo fallbacks are interim, keep the folder title visible, and require no additional TMDB request. Ordinary company and network lookup-table logos remain TMDB thumbnails.

The published runtime remains lazy and starts preparing only when a company or network export modal opens. Copy and Download briefly show a preparing state; if the runtime cannot load or validate, export continues automatically with cached TMDB logos or title/emoji fallbacks. The old borrowed network focus-GIF option remains removed, and generated company and network folders retain empty/disabled focus-GIF fields.

JSON export flows support Copy JSON and Download JSON where available. Copy actions show immediate button-level feedback, and matching Copy/Download actions reuse the same generated JSON output for the current export state so generated IDs stay consistent.

Each Nuvio export modal includes a help button with current import steps for Nuvio web and TV app flows. Nuvio is in beta, so those import steps may change.

## Data Freshness

Cached company, TV network, and genre data is maintained automatically from TMDB data and API responses.

The project runs daily checks for TMDB export changes, repairs small cache differences automatically, and refreshes genre title counts weekly. Production company and TV network caches also run scheduled full-refresh passes at the start of each month so the local lookup data stays aligned with TMDB's exported ID lists.

The site is deployed with GitHub Pages.

## Feedback And Privacy

Feedback, bug reports, data issues, and feature requests are tracked through
[GitHub Issues](https://github.com/davecollections/tmdb-id-lookup/issues/new/choose).
The live site links to the issue chooser instead of collecting feedback by email or embedded forms.

The live site uses GoatCounter for privacy-focused aggregate analytics. This helps estimate whether the tool is being used without adding account tracking, Nuvio access, or TMDB API keys to the page.

TMDB API requests from the live lookup tools go through the Cloudflare Worker proxy. Imported Nuvio JSON files and generated collection JSON are processed locally in the browser unless the user explicitly downloads or copies the output.

## Local Checks

Run `scripts\check.cmd` before pushing changes on Windows. This runs the shared validation sequence for frontend JavaScript syntax, cached JSON parsing, duplicate HTML IDs, duplicate cached IDs, Nuvio export preset references, genre artwork/count coverage, unsafe rendering patterns, deterministic Nuvio contract fixtures, and the mounted Builder suite. Mounted checks that exercise TMDB use the production Worker, real TMDB, and real image resources, so an external-service outage is reported as an external failure rather than replaced with fabricated data; see [docs/TESTING.md](docs/TESTING.md).

On any platform, the equivalent command is `node scripts/check-all.mjs`. To run only the Nuvio contract suite, use `node --test tests/nuvio-contracts.test.mjs`.

Browser-owning test conventions and focused lifecycle checks are documented in [docs/TESTING.md](docs/TESTING.md).

## TMDB Collection Builder

A new React/Vite TMDB Collection Builder is being developed under `builder/`. The existing TMDB ID Lookup remains available at the site root, while `/builder/` provides the current development-preview welcome and collection-building interface. The Builder development preview includes a shared Blank, Decades, People, Franchises, Studios, Networks, and Genres launcher for New Collection and New Folder. Guided families generate ordinary editable Collection → Folder → Source nodes through revalidated atomic plans while selected-folder Add Source remains a separate physical-source operation. That ordinary picker now offers Movie franchise, People, Studios, Networks, Streaming service, Genres, and singular Decade; Decade selects one whole period or multiple individual years and always retains a general source for every selected period while optional Genre choices add separate canonical Movie, Series, or Movie-then-Series sources in one atomic bundle. The cross-family contract is documented in [`docs/v2/BUILDER_HIERARCHY_CREATION.md`](./docs/v2/BUILDER_HIERARCHY_CREATION.md); family-specific behavior remains in the focused [Decades](./docs/v2/BUILDER_DECADES.md), [People](./docs/v2/BUILDER_PEOPLE.md), [Franchises](./docs/v2/BUILDER_FRANCHISES.md), [Studios](./docs/v2/BUILDER_STUDIOS.md), [Networks](./docs/v2/BUILDER_NETWORKS.md), and [Genres](./docs/v2/BUILDER_GENRES.md) documents. Genre hierarchy merged through issue #130 / PR #131 after owner Worker deployment and live production-Worker/TMDB/image-CDN validation. The overall V2 Builder remains governed by its separate release and noindex boundary rather than replacing the stable root application.

For builder architecture, compatibility decisions, and contributor guidance, read [`AGENTS.md`](./AGENTS.md) and [`docs/v2/BUILDER_KNOWLEDGE.md`](./docs/v2/BUILDER_KNOWLEDGE.md).

To build and validate the combined site locally:

```powershell
npm ci --prefix builder
npm run build --prefix builder
node scripts/prepare-pages-site.mjs
node scripts/validate-pages-site.mjs
```

GitHub Pages publishes the stable root application and compiled builder output only. Builder source, tests, documentation, and manual evidence remain in the repository but are not deployed as website content.

## Local TMDB Testing

The app uses a Cloudflare Worker proxy for live TMDB API calls. Local static testing still works without extra setup, but live TMDB lookups from `localhost` or `127.0.0.1` require that local origin to be allowed by the Worker CORS rules.

If local lookup requests fail while the live site works, check the Worker origin allowlist before changing frontend code. The top lookup currently needs the Worker to allow TMDB movie paths `/3/search/movie` and `/3/movie/{movie_id}` as well as the existing collection, person, and TV paths.

The tracked Worker source is in `cloudflare-worker/tmdb-proxy.js`. Issue [#81](https://github.com/davecollections/tmdb-id-lookup/issues/81) / PR [#82](https://github.com/davecollections/tmdb-id-lookup/pull/82) synchronized that canonical source with the already deployed narrow People service-token behavior. Its TMDB credential and narrow People generator credential stay in Cloudflare as separate `TMDB_BEARER_TOKEN` and `NUVIO_PEOPLE_SERVICE_TOKEN` secrets. Secret values must never be committed to Git. Browser access remains CORS-controlled; origin-free service access is limited to the exact `/3/person/{id}` pathname and is documented in `cloudflare-worker/README.md`.

## TMDB Attribution

The V1 site displays the official TMDB logo with this required notice:

> This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

V2 must include visible TMDB attribution UI before its `noindex` state is removed or it is released or promoted for public use. That UI must use an official TMDB logo, keep the TMDB mark less prominent than the application identity, and display the same notice exactly.

## Notes

Company names, logos, posters, and trademarks remain the property of their respective owners.

Project maintained by [Dave Collections](https://github.com/davecollections).

## Built Something With This Project?

If you’ve used or adapted TMDB ID Lookup in your own app or project, attribution is appreciated, and we’d love to hear what you built. Feel free to let us know through a [GitHub issue](https://github.com/davecollections/tmdb-id-lookup/issues/new/choose).

Simply using the hosted tool to create your own collections does not require attribution or notification.

## License

MIT License
