# Issue #140 owner review

Import `owner-review.json` through the normal Builder startup route. The project deliberately covers seven source-semantic states; the names are review labels and are not used by the resolver.

Review in this order:

1. **People — blank with curated artwork** — confirm four compact, independent **Use curated artwork** actions; choosing Tile fills only its draft field and makes that assistance disappear. Clear the field and confirm the action returns.
2. **People — existing custom artwork** — confirm the existing exact Tile remains primary and has no curated or request action. Its other blank supported fields remain independently eligible.
3. **Network — existing TMDB fallback** — confirm the exact checked-in-catalogue `w500` logo is preserved with no curated or request action beneath the populated Tile field.
4. **Genre — curated already assigned** — confirm the populated curated URL has no selected/status/replacement row.
5. **Missing curated asset — requestable** — confirm Kátia Lund's blank Poster Focus slot shows **Request artwork**. Open it and inspect the prefilled `davecollections/nuvio-people-assets` issue without submitting it.
6. **Studio — supported orientation** — confirm Landscape has **Use curated artwork**; changing the blank Tile to Poster shows no action and does not invent or write a URL.
7. **Ambiguous — no action** — confirm a suggestive title and blank fields alone produce no assistance.

On the first People folder, choose one or more curated assets and change Poster/Landscape, then Cancel and reopen: the saved Folder must remain blank and Poster. Repeat one choice and Apply: only accepted/touched fields should change in one ordinary revision, while every `reviewSentinel` remains exact.

The review fixture requires public read access to the live People manifest, shared artwork runtime, checked-in Studio/Network catalogues, and image resources. An authority outage should be reported rather than replaced with synthetic mounted data.
