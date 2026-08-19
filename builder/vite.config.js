import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { extractTmdbProxyBaseUrl } from "./build-config.js";
import { TMDB_LOCAL_PREVIEW_PROXY_PREFIX } from "./src/source-add/tmdb-local-preview-proxy.js";

const rootV1ConfigPath = fileURLToPath(new URL("../js/config.js", import.meta.url));
const companyCataloguePath = fileURLToPath(new URL("../data/companies.min.json", import.meta.url));
const networkCataloguePath = fileURLToPath(new URL("../data/tv-networks.min.json", import.meta.url));
const rootV1Config = fs.readFileSync(rootV1ConfigPath, "utf8");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(rootV1Config);

function serveCachedEntityCatalogues(server) {
	server.middlewares.use((request, response, next) => {
		const pathname = new URL(request.url ?? "/", "http://builder.local").pathname;
		const cataloguePath = pathname === "/data/companies.min.json"
			? companyCataloguePath
			: pathname === "/data/tv-networks.min.json" ? networkCataloguePath : null;
		if (cataloguePath === null || !["GET", "HEAD"].includes(request.method ?? "GET")) {
			next();
			return;
		}
		response.statusCode = 200;
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.setHeader("Cache-Control", "no-store");
		if (request.method === "HEAD") {
			response.end();
			return;
		}
		const stream = fs.createReadStream(cataloguePath);
		stream.on("error", next);
		stream.pipe(response);
	});
}

function localCachedEntityCatalogues() {
	return {
		name: "local-cached-entity-catalogues",
		configureServer: serveCachedEntityCatalogues,
		configurePreviewServer: serveCachedEntityCatalogues,
	};
}

function localEntityCountMock(studioEnabled, networkEnabled) {
	return {
		name: "local-entity-count-mock",
		configureServer(server) { serveEntityCountMock(server, studioEnabled, networkEnabled); },
		configurePreviewServer(server) { serveEntityCountMock(server, studioEnabled, networkEnabled); },
	};
}

function serveEntityCountMock(server, studioEnabled, networkEnabled) {
	if (!studioEnabled && !networkEnabled) return;
	server.middlewares.use((request, response, next) => {
		const url = new URL(request.url ?? "/", "http://builder.local");
		const route = url.pathname.slice(TMDB_LOCAL_PREVIEW_PROXY_PREFIX.length);
		const entries = [...url.searchParams.entries()];
		const companyIds = url.searchParams.getAll("with_companies");
		const networkIds = url.searchParams.getAll("with_networks");
		const sorts = url.searchParams.getAll("sort_by");
		const allowedSorts = route === "/3/discover/movie"
			? new Set(["popularity.desc", "primary_release_date.desc", "vote_average.desc", "vote_count.desc"])
			: new Set(["popularity.desc", "first_air_date.desc", "vote_average.desc", "vote_count.desc"]);
		const companyRequest = studioEnabled
			&& ["/3/discover/movie", "/3/discover/tv"].includes(route)
			&& companyIds.length === 1
			&& networkIds.length === 0
			&& sorts.length <= 1
			&& entries.length === 1 + sorts.length
			&& entries.every(([key]) => key === "with_companies" || key === "sort_by")
			&& (sorts.length === 0 || allowedSorts.has(sorts[0]));
		const networkRequest = networkEnabled
			&& route === "/3/discover/tv"
			&& networkIds.length === 1
			&& companyIds.length === 0
			&& sorts.length === 0
			&& entries.length === 1;
		const entityValue = companyRequest ? companyIds[0] : networkRequest ? networkIds[0] : null;
		if (
			!url.pathname.startsWith(`${TMDB_LOCAL_PREVIEW_PROXY_PREFIX}/`)
			|| (!companyRequest && !networkRequest)
			|| !/^[1-9]\d*$/.test(entityValue)
			|| !Number.isSafeInteger(Number(entityValue))
		) {
			next();
			return;
		}
		const entityId = Number(entityValue);
		const totalResults = networkRequest
			? (entityId * 13) % 3_000
			: route.endsWith("/movie") ? (entityId * 37) % 5_000 : (entityId * 11) % 800;
		response.statusCode = 200;
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.setHeader("Cache-Control", "no-store");
		const sortIndex = Math.max(0, [...allowedSorts].indexOf(sorts[0] ?? "popularity.desc"));
		const mediaLabel = route.endsWith("/movie") ? "Movie" : "Series";
		const results = companyRequest ? Array.from({ length: 20 }, (_, index) => {
			const ordinal = sortIndex * 20 + index + 1;
			return route.endsWith("/movie") ? {
				id: entityId * 1_000 + ordinal,
				title: `${mediaLabel} ${ordinal}`,
				release_date: `${2026 - (index % 20)}-01-01`,
				poster_path: `/studio-${entityId}-movie-${sortIndex}-${index + 1}.jpg`,
			} : {
				id: entityId * 1_000 + ordinal,
				name: `${mediaLabel} ${ordinal}`,
				first_air_date: `${2026 - (index % 20)}-01-01`,
				poster_path: `/studio-${entityId}-series-${sortIndex}-${index + 1}.jpg`,
			};
		}) : [];
		response.end(JSON.stringify({ total_results: totalResults, results }));
	});
}

function localTmdbPreviewProxy() {
	return {
		target: tmdbProxyBaseUrl,
		changeOrigin: true,
		headers: { Origin: "http://127.0.0.1:4173" },
		rewrite: (path) => path.slice(TMDB_LOCAL_PREVIEW_PROXY_PREFIX.length) || "/",
	};
}


export default defineConfig(({ command }) => {
	const studioMockCountsEnabled = command === "serve"
		&& process.env.TMDB_STUDIO_MOCK_COUNTS === "1";
	const networkMockCountsEnabled = command === "serve"
		&& process.env.TMDB_NETWORK_MOCK_COUNTS === "1";
	return {
		base: "./",
		plugins: [react(), localCachedEntityCatalogues(), localEntityCountMock(studioMockCountsEnabled, networkMockCountsEnabled)],
		define: {
			__TMDB_PROXY_BASE_URL__: JSON.stringify(tmdbProxyBaseUrl),
			__TMDB_STUDIO_MOCK_COUNTS__: JSON.stringify(studioMockCountsEnabled),
			__TMDB_NETWORK_MOCK_COUNTS__: JSON.stringify(networkMockCountsEnabled),
		},
		build: {
			assetsInlineLimit: 0,
		},
		server: {
			proxy: {
				[TMDB_LOCAL_PREVIEW_PROXY_PREFIX]: localTmdbPreviewProxy(),
			},
		},
		preview: {
			proxy: {
				[TMDB_LOCAL_PREVIEW_PROXY_PREFIX]: localTmdbPreviewProxy(),
			},
		},
	};
});
