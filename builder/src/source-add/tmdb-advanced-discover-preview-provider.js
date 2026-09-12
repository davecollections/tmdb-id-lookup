import { createTmdbDiscoverPreviewRequester } from "./tmdb-discover-preview-requester.js";
import { TMDB_PROXY_BASE_URL } from "./tmdb-collection-provider.js";
import { advancedDiscoverQuery } from "./advanced-discover.js";
export function createAdvancedDiscoverPreviewProvider(options = {}) {
 const requester = createTmdbDiscoverPreviewRequester({ baseUrl: TMDB_PROXY_BASE_URL, ...options, previewPaths: { MOVIE: "/builder/discover/movie", TV: "/builder/discover/tv" }, entityLabel: "Discover", entityType: "ADVANCED_DISCOVER" });
 return { getAdvancedDiscoverPreview(sourceDraft, { signal } = {}) {
  const query = advancedDiscoverQuery(sourceDraft);
  return query ? requester.getQueryPreview(query.mediaType, query.queryParameters, { signal }) : Promise.resolve({ ok: false, error: { kind: "invalid-request", message: "These filters cannot be previewed exactly.", retryable: false } });
 } };
}

let sharedProvider;
export function sharedAdvancedDiscoverPreviewProvider() { return sharedProvider ??= createAdvancedDiscoverPreviewProvider(); }
