import { genreArtworkUrl } from "./genre-folder-artwork.js";
import { officialGenreReference } from "./genre-catalogue.js";
import { planCuratedFolderTileShapeTransition, planCuratedFolderFocusShapeTransition } from "../folder-artwork-suggestions.js";
export function advancedDiscoverArtwork(draft, tileShape = "POSTER") {
 const filters = draft?.filters ?? {};
 if (!["POSTER", "LANDSCAPE"].includes(tileShape)) return null;
 if (!filters.withKeywords && /^[1-9]\d*$/.test(filters.withGenres ?? "")) {
  const genre = officialGenreReference(draft.mediaMode === "series" ? "TV" : "MOVIE", Number(filters.withGenres));
  if (genre) return genreArtworkUrl(genre.name, tileShape);
 }
 return null;
}
// Only an exact supported genre supplies assistance; arbitrary keyword text cannot imply artwork.
export function advancedDiscoverArtworkSuggestions(draft) {
 const poster = advancedDiscoverArtwork(draft, "POSTER"), landscape = advancedDiscoverArtwork(draft, "LANDSCAPE");
 return poster || landscape ? { curated: { coverImageUrl: { POSTER: poster, LANDSCAPE: landscape }, heroBackdropUrl: null, titleLogoUrl: null, focusGifUrl: {} } } : null;
}
export function changeAdvancedDiscoverArtworkShape(artwork, tileShape, suggestionSet) {
 const tile = planCuratedFolderTileShapeTransition({ suggestionSet, currentTileUrl: artwork.coverImageUrl, requestedShape: tileShape });
 const focus = planCuratedFolderFocusShapeTransition({ suggestionSet, currentFocusUrl: artwork.focusGifUrl, requestedShape: tileShape });
 return { ...artwork, tileShape, ...(tile.replacementTileUrl !== null ? { coverImageUrl: tile.replacementTileUrl } : {}), ...(focus.replacementFocusUrl !== null ? { focusGifUrl: focus.replacementFocusUrl } : {}) };
}
