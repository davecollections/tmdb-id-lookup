import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { extractTmdbProxyBaseUrl } from "./build-config.js";
import { TMDB_LOCAL_PREVIEW_PROXY_PREFIX } from "./src/source-add/tmdb-local-preview-proxy.js";

const rootV1ConfigPath = fileURLToPath(new URL("../js/config.js", import.meta.url));
const rootV1Config = fs.readFileSync(rootV1ConfigPath, "utf8");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(rootV1Config);

function localTmdbPreviewProxy() {
	return {
		target: tmdbProxyBaseUrl,
		changeOrigin: true,
		headers: { Origin: "http://127.0.0.1:4173" },
		rewrite: (path) => path.slice(TMDB_LOCAL_PREVIEW_PROXY_PREFIX.length) || "/",
	};
}

export default defineConfig({
	base: "./",
	plugins: [react()],
	define: {
		__TMDB_PROXY_BASE_URL__: JSON.stringify(tmdbProxyBaseUrl),
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
});
