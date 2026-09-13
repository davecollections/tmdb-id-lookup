// Deliberately small, uniquely named input recipes. No external response data.
// Regeneration refuses to overwrite. Run from the repository root.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createBuilderController } from "../../builder/src/application/index.js";
import { serializeNuvioProject } from "../../builder/src/serialize/index.js";

const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
fs.mkdirSync(directory, { recursive: true });
const source = (title, type, media, id, sort, filters = {}) => ({ provider: "tmdb", title, tmdbSourceType: type, mediaType: media, tmdbId: id, sortBy: sort, filters });
const folder = (id, title, sources, extra = {}) => ({ id: "206-20260913-" + id, title: "206 " + title, tileShape: "POSTER", sources, catalogSources: [], ...extra });
const collection = (id, title, folders, extra = {}) => [{ id: "206-20260913-" + id, title: "206 " + title, viewMode: "TABBED_GRID", showAllTab: false, folders, ...extra }];
function write(name, value) {
	const controller = createBuilderController();
	assert.equal(controller.importValue(value).ok, true);
	const output = serializeNuvioProject(controller.getState().project);
	assert.equal(output.ok, true);
	assert.deepEqual(output.value, value, "Manual input must survive the real Builder importer/serializer exactly.");
	fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
write("01-unchanged-round-trip.json", collection("round-trip", "Unchanged round trip", [
	folder("family-movie", "Family Movie Most voted", [source("206 Family Movie Most voted", "DISCOVER", "MOVIE", null, "vote_count.desc", { withGenres: "10751", withOriginalLanguage: "en" })]),
	folder("reality-tv", "Reality Series Most voted", [source("206 Reality Series Most voted", "DISCOVER", "TV", null, "vote_count.desc", { withGenres: "10764", withOriginalLanguage: "en" })]),
	folder("movie-control", "Movie Top rated control", [source("206 Movie Top rated control", "DISCOVER", "MOVIE", null, "vote_average.desc", { voteCountGte: 100 })]),
	folder("series-control", "Series Top rated control", [source("206 Series Top rated control", "DISCOVER", "TV", null, "vote_average.desc", { voteCountGte: 100 })]),
	folder("list-alias", "List alias preservation", [source("206 List Top rated aliases", "LIST", "MOVIE", 8659014, "vote_average.desc", { voteCountGte: 100, "vote_count.gte": 100 })]),
	folder("folder-probes", "Folder unsupported-key probes", [source("206 Folder schema probe", "DISCOVER", "MOVIE", null, "popularity.desc", { withGenres: "10751" })], { focusGlowEnabled: true, pinToTop: true }),
], { focusGlowEnabled: true, pinToTop: true }));
write("02-native-people-votes.json", collection("people-votes", "Native People vote test", ["PERSON", "DIRECTOR"].flatMap((type) => ["MOVIE", "TV"].flatMap((media) => [0, 2147483647].map((votes) => {
	const title = (type === "PERSON" ? "Acting" : "Directing") + " " + media + " votes " + votes;
	return folder("people-" + type + "-" + media + "-" + votes, title, [source("206 " + title, type, media, 31, "vote_average.desc", { voteCountGte: votes })]);
})))));
write("03-native-studio-network-votes.json", collection("native-votes", "Native Studio Network votes", [["COMPANY", "MOVIE", 174], ["COMPANY", "TV", 3], ["NETWORK", "TV", 213]].flatMap(([type, media, id]) => [0, 100].map((votes) => {
	const title = type + " " + id + " " + media + " votes " + votes;
	return folder("native-" + type + "-" + media + "-" + votes, title, [source("206 " + title, type, media, id, "vote_average.desc", { voteCountGte: votes })]);
}))));
// Language and country are isolated; both together is the final row. Tight year
// bounds make complete-result comparison more practical, but never assume one page.
const probes = [{}, { withOriginalLanguage: "es" }, { withOriginalLanguage: "pt" }, { withOriginalLanguage: "es|pt" },
	{ withOriginCountry: "US" }, { withOriginCountry: "CA" }, { withOriginCountry: "US|CA" },
	{ withOriginalLanguage: "es|pt", withOriginCountry: "US|CA" }];
write("04-compound-locale-probes.json", collection("locale-probes", "Compound locale investigation", ["MOVIE", "TV"].flatMap((media) => probes.map((filters, i) => {
	const title = media + " locale case " + i;
	return folder("locale-" + media + "-" + i, title, [source("206 " + title, "DISCOVER", media, null, "vote_count.desc", { year: 2025, voteCountGte: 100, ...filters })]);
}))));
console.log("Generated and preservation-validated four manual files (36 physical sources).");
