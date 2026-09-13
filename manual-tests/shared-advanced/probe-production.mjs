// Bounded issue #206 evidence. Uses the production Builder providers/Worker.
// node manual-tests/shared-advanced/probe-production.mjs OUTSIDE_GIT_DIRECTORY
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createTmdbPersonProvider } from "../../builder/src/source-add/tmdb-person-provider.js";
import { createAdvancedDiscoverPreviewProvider } from "../../builder/src/source-add/tmdb-advanced-discover-preview-provider.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.resolve(process.argv[2] ?? "");
const relative = path.relative(root, output);
assert.ok(relative.startsWith(".." + path.sep) || path.isAbsolute(relative), "Provide an output directory outside Git.");
assert.ok(!fs.existsSync(output), "Refuse to overwrite earlier live evidence.");
const config = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
const baseUrl = /const TMDB_PROXY_BASE_URL = "([^"]+)"/.exec(config)[1];
const records = [];
fs.mkdirSync(output, { recursive: true });
async function recordedFetch(url, options = {}) {
	const request = new URL(url);
	assert.equal(request.origin, new URL(baseUrl).origin);
	assert.ok(records.length < 11, "The bounded investigation permits at most eleven requests.");
	const response = await fetch(url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173" } });
	const text = await response.clone().text();
	let body; try { body = JSON.parse(text); } catch { body = text; }
	records.push({ at: new Date().toISOString(), path: request.pathname + request.search, status: response.status, body });
	fs.writeFileSync(path.join(output, "requests.json"), JSON.stringify(records, null, 2) + "\n");
	return response;
}
const personProvider = createTmdbPersonProvider({ baseUrl, fetchImpl: recordedFetch });
const person = await personProvider.getPerson(31);
assert.equal(person.ok, true, "Production People request failed; do not replace it with synthetic credits.");
const credits = records[0].body.combined_credits;
const personCases = ["PERSON", "DIRECTOR"].flatMap((role) => ["MOVIE", "TV"].map((media) => {
	const relevant = (role === "PERSON" ? credits.cast : credits.crew.filter((r) => String(r.job).toLowerCase() === "director"))
		.filter((r) => r.media_type === (media === "MOVIE" ? "movie" : "tv"));
	const rows = [...new Map(relevant.map((r) => [r.id, r])).values()];
	assert.ok(rows.length > 0, "A useful controlled case needs nonempty credits.");
	assert.ok(rows.every((r) => Number.isInteger(r.vote_count) && r.vote_count >= 0 && r.vote_count < 2147483647));
	return { role, media, personId: 31, baselineCount: rows.length, at100: rows.filter((r) => r.vote_count >= 100).length,
		at2147483647: 0, maxVotes: Math.max(...rows.map((r) => r.vote_count)),
		examples: rows.sort((a, b) => b.vote_count - a.vote_count).slice(0, 3).map((r) => ({ id: r.id, title: r.title ?? r.name, voteCount: r.vote_count })) };
}));
const preview = createAdvancedDiscoverPreviewProvider({ baseUrl, fetchImpl: recordedFetch });
const discoverCases = [];
for (const [family, media, defining] of [["Studio Movie", "MOVIE", { withCompanies: "174" }], ["Studio Series", "TV", { withCompanies: "3" }], ["Network Series", "TV", { withNetworks: "213" }]]) {
	for (const votes of [0, 100]) {
		// Detached Discover query proves endpoint filtering, not the existing native-family Preview.
		const draft = { category: "native-tmdb", editable: { provider: "tmdb", title: "206 " + family,
			tmdbSourceType: "DISCOVER", tmdbId: null, mediaType: media, sortBy: "vote_average.desc", filters: { ...defining, voteCountGte: votes } } };
		const result = await preview.getAdvancedDiscoverPreview(draft);
		assert.equal(result.ok, true, "Production Discover request failed; retain failure and stop.");
		const raw = records.at(-1);
		assert.ok(raw.body.results.every((r) => r.vote_count >= votes));
		discoverCases.push({ family, media, votes, status: raw.status, path: raw.path, total: raw.body.total_results,
			pageVotes: raw.body.results.map((r) => r.vote_count), ids: raw.body.results.map((r) => r.id) });
	}
}
const rejected = [];
for (const media of ["movie", "tv"]) for (const [field, expression] of [["with_original_language", "es|pt"], ["with_origin_country", "US|CA"]]) {
	const url = new URL("/builder/discover/" + media, baseUrl);
	url.search = new URLSearchParams({ include_adult: "false", sort_by: "popularity.desc", [field]: expression });
	const response = await recordedFetch(url, { signal: AbortSignal.timeout(12000) });
	assert.ok([400, 403].includes(response.status), "Unexpected compound acceptance: inspect real response, do not infer semantics.");
	rejected.push({ media, field, expression, status: response.status, path: url.pathname + url.search });
}
const summary = { at: new Date().toISOString(), baseUrl, requests: records.length, personCases, discoverCases, rejected,
	boundary: "Complete combined credits for one real person; six current first-page Discover queries; four production gateway rejections. No installed-client filtering, new native Preview support, compound TMDB semantics or exhaustive catalogue ranking is claimed." };
fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
fs.writeFileSync(path.join(output, "sha256.txt"), crypto.createHash("sha256").update(fs.readFileSync(path.join(output, "requests.json"))).digest("hex") + "\n");
console.log(JSON.stringify(summary, null, 2));
