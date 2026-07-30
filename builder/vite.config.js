import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { extractTmdbProxyBaseUrl } from "./build-config.js";

const rootV1ConfigPath = fileURLToPath(new URL("../js/config.js", import.meta.url));
const rootV1Config = fs.readFileSync(rootV1ConfigPath, "utf8");
const tmdbProxyBaseUrl = extractTmdbProxyBaseUrl(rootV1Config);

export default defineConfig({
	base: "./",
	plugins: [react()],
	define: {
		__TMDB_PROXY_BASE_URL__: JSON.stringify(tmdbProxyBaseUrl),
	},
	build: {
		assetsInlineLimit: 0,
	},
});
