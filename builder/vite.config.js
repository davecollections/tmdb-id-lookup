import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { extractTmdbProxyBaseUrl } from "./build-config.js";
import { TMDB_LOCAL_PREVIEW_PROXY_PREFIX } from "./src/source-add/tmdb-local-preview-proxy.js";

const rootV1ConfigPath = fileURLToPath(new URL("../js/config.js", import.meta.url));
const companyCataloguePath = fileURLToPath(new URL("../data/companies.min.json", import.meta.url));
const rootV1Config = fs.readFileSync(rootV1ConfigPath, "utf8");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(rootV1Config);

function serveCompanyCatalogue(server) {
	server.middlewares.use((request, response, next) => {
		const pathname = new URL(request.url ?? "/", "http://builder.local").pathname;
		if (
			pathname !== "/data/companies.min.json"
			|| !["GET", "HEAD"].includes(request.method ?? "GET")
		) {
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
		const stream = fs.createReadStream(companyCataloguePath);
		stream.on("error", next);
		stream.pipe(response);
	});
}

function localCompanyCatalogue() {
	return {
		name: "local-company-catalogue",
		configureServer: serveCompanyCatalogue,
		configurePreviewServer: serveCompanyCatalogue,
	};
}

function localStudioCountMock(enabled) {
	return {
		name: "local-studio-count-mock",
		configureServer(server) { serveStudioCountMock(server, enabled); },
		configurePreviewServer(server) { serveStudioCountMock(server, enabled); },
	};
}

function serveStudioCountMock(server, enabled) {
	if (!enabled) return;
	server.middlewares.use((request, response, next) => {
		const url = new URL(request.url ?? "/", "http://builder.local");
		const route = url.pathname.slice(TMDB_LOCAL_PREVIEW_PROXY_PREFIX.length);
		const entries = [...url.searchParams.entries()];
		if (
			!url.pathname.startsWith(`${TMDB_LOCAL_PREVIEW_PROXY_PREFIX}/`)
			|| !["/3/discover/movie", "/3/discover/tv"].includes(route)
			|| entries.length !== 1
			|| entries[0][0] !== "with_companies"
			|| !/^[1-9]\d*$/.test(entries[0][1])
			|| !Number.isSafeInteger(Number(entries[0][1]))
		) {
			next();
			return;
		}
		const studioId = Number(entries[0][1]);
		const totalResults = route.endsWith("/movie")
			? (studioId * 37) % 5_000
			: (studioId * 11) % 800;
		response.statusCode = 200;
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.setHeader("Cache-Control", "no-store");
		response.end(JSON.stringify({ total_results: totalResults }));
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
	return {
		base: "./",
		plugins: [react(), localCompanyCatalogue(), localStudioCountMock(studioMockCountsEnabled)],
		define: {
			__TMDB_PROXY_BASE_URL__: JSON.stringify(tmdbProxyBaseUrl),
			__TMDB_STUDIO_MOCK_COUNTS__: JSON.stringify(studioMockCountsEnabled),
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
