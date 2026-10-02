import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "../../builder/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../../builder/node_modules/vite/dist/node/index.js";
import { extractTmdbProxyBaseUrl } from "../../builder/build-config.js";
import { mountedReactOptimizeDeps } from "./mounted-react-vite.mjs";

// Shared by the existing mounted runner and a temporary owner review server.
// This serves test fixtures; it is never imported by the production Builder.
export function createSourceEditMountedServer({ cacheDir, host = "127.0.0.1", port = 0, reviewOnly = false } = {}) {
 const root = fileURLToPath(new URL("../../", import.meta.url)), modules = path.join(root, "builder/node_modules");
 return createServer({ root, cacheDir, configFile: false, appType: "spa", logLevel: "silent",
  plugins: [react(), { name: "mounted-production-catalogue-paths", configureServer(server) {
   server.middlewares.use((request, response, next) => {
    // Owner-review fixture cannot connect to any remote service, even if a component regresses.
    if (reviewOnly) response.setHeader("Content-Security-Policy", "connect-src 'self' ws:; img-src 'self' data:; font-src 'self' data:; media-src 'none'; frame-src 'none'; form-action 'none'");
    if (reviewOnly && ["/", "/builder/"].includes(request.url)) { response.statusCode = 302; response.setHeader("Location", "/tests/fixtures/builder-source-edit-mounted.html?trakt-creation-review"); response.end(); return; }
    if (["/builder/data/companies.min.json", "/builder/data/tv-networks.min.json"].includes(request.url)) request.url = request.url.replace("/builder/data/", "/data/");
    next();
   });
  } }],
  optimizeDeps: mountedReactOptimizeDeps(["tests/fixtures/builder-source-edit-mounted.html"]),
  define: { __TMDB_PROXY_BASE_URL__: JSON.stringify(extractTmdbProxyBaseUrl(fs.readFileSync(path.join(root, "js/config.js"), "utf8"))), __TMDB_STUDIO_MOCK_COUNTS__: "false", __TMDB_NETWORK_MOCK_COUNTS__: "false" },
  resolve: { alias: [
   { find: /^react$/, replacement: path.join(modules, "react/index.js") },
   { find: /^react\/jsx-runtime$/, replacement: path.join(modules, "react/jsx-runtime.js") },
   { find: /^react-dom$/, replacement: path.join(modules, "react-dom/index.js") },
   { find: /^react-dom\/client$/, replacement: path.join(modules, "react-dom/client.js") },
  ] }, server: { host, port, ...(port ? { strictPort: true } : {}) },
 });
}
