// Local manual-test helper. Serves only the immutable public example master.
// No directory browsing, uploads, private exports, screenshots or external proxy.
import http from "node:http";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createMasterServer() {
	const manifest = JSON.parse(fs.readFileSync(new URL("./case-manifest.json", import.meta.url), "utf8"));
	assert.equal(manifest.input.filename, "206-collection-preservation-master.json");
	const bytes = fs.readFileSync(new URL("./206-collection-preservation-master.json", import.meta.url));
	assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), manifest.input.sha256, "Master hash must match the case manifest.");
	const compressed = gzipSync(bytes);
	return http.createServer((request, response) => {
		if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return; }
		if (!["/206.json", "/206-gzip.json"].includes(request.url)) { response.writeHead(404); response.end(); return; }
		const useGzip = request.url === "/206-gzip.json" && (request.headers["accept-encoding"] ?? "").split(",").some((token) => token.trim().toLowerCase() === "gzip");
		const body = useGzip ? compressed : bytes;
		response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Content-Disposition": 'attachment; filename="206-collection-preservation-master.json"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Accept-Encoding", ...(useGzip ? { "Content-Encoding": "gzip" } : {}) });
		response.end(request.method === "HEAD" ? undefined : body);
	});
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [host = "127.0.0.1", portText = "8766"] = process.argv.slice(2);
	const port = Number(portText);
	assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, "Use an available local port from 1024 to 65535.");
	const server = createMasterServer();
	server.listen(port, host, () => console.log("Master JSON: http://" + host + ":" + port + "/206.json\nCompressed transfer of the same JSON: http://" + host + ":" + port + "/206-gzip.json\nOnly this file is shared. Stop this process when the manual runs are finished."));
}
