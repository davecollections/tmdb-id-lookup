// Authored saved-JSON cases only. No external title requests or client simulation.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { compare, comparisonTable, ROUTES } from "../../scripts/investigate-shared-advanced.mjs";
import { DISCOVER_FILTER_FIELDS } from "../../builder/src/nuvio/known-fields.js";
import { discoverImportedMirrors } from "../../builder/src/nuvio/discover-imported-filters.js";

const notes = new Map();
const record = (key, purpose, status = "Known field preservation") => { notes.set(key, { purpose, status }); return key; };
const tag = (key, title) => "[" + key + "] " + title;
const image = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/people/poster/31.webp";
const logo = "https://raw.githubusercontent.com/davecollections/nuvio-assets/main/assets/collection_covers/people/title-logo/1.png";
const gif = "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif";
const video = "https://developer.mozilla.org/shared-assets/videos/flower.mp4";
const artwork = { coverImageUrl: image, heroBackdropUrl: image, titleLogoUrl: logo, heroVideoUrl: video, focusGifUrl: gif, coverEmoji: "🎬" };
let serial = 0;
function source(title, type = "DISCOVER", media = "MOVIE", id = null, sort = "popularity.desc", filters = {}, status) {
	const key = record("P206-S" + String(++serial).padStart(3, "0"), title, status);
	return { provider: "tmdb", title: tag(key, title), tmdbSourceType: type, tmdbId: id, mediaType: media, sortBy: sort, filters };
}
function folder(n, title, sources, extra = {}) {
	const key = record("P206-F" + String(n).padStart(3, "0"), title);
	return { id: "p206-f-" + n, title: tag(key, title), sources, ...extra };
}
function collection(n, title, folders, extra = {}) {
	const key = record("P206-C" + String(n).padStart(3, "0"), title);
	return { id: "p206-c-" + n, title: tag(key, title), folders, ...extra };
}
const gifFolders = [
	folder(40, "GIF On with URL", [source("GIF On with URL")], { tileShape: "POSTER", hideTitle: false, focusGifEnabled: true, focusGifUrl: gif }),
	folder(10, "GIF Off with URL", [source("GIF Off with URL")], { tileShape: "SQUARE", hideTitle: true, focusGifEnabled: false, focusGifUrl: gif }),
	folder(30, "GIF On without URL", [source("GIF On without URL")], { tileShape: "LANDSCAPE", hideTitle: true, focusGifEnabled: true }),
	folder(20, "GIF Off without URL", [source("GIF Off without URL")], { tileShape: "POSTER", hideTitle: false, focusGifEnabled: false }),
];
const sorts = (media) => ["vote_count.desc", "popularity.desc", media === "TV" ? "first_air_date.desc" : "primary_release_date.desc", "vote_average.desc"];
const families = [
	["DISCOVER", "MOVIE", null], ["DISCOVER", "TV", null],
	["COMPANY", "MOVIE", 174], ["COMPANY", "TV", 3], ["NETWORK", "TV", 213],
	["PERSON", "MOVIE", 31], ["PERSON", "TV", 31], ["DIRECTOR", "MOVIE", 488], ["DIRECTOR", "TV", 488],
];
const familyFolders = families.map(([type, media, id], i) => folder(100 + i * 10, type + " " + media + " sorts", sorts(media).map((sort) => source(type + " " + media + " " + sort, type, media, id, sort))));
const listFolder = folder(190, "List order and imported List filters", ["original", "vote_count.desc", "vote_average.desc", "primary_release_date.desc"].map((sort, i) => source("LIST " + sort, "LIST", "MOVIE", i % 2 ? "8659014" : 8659014, sort, i ? { voteCountGte: 100, withOriginalLanguage: "en", withGenres: "18" } : {}, "Imported List filter preservation; use by the client is outside this test")));
const franchise = folder(200, "Native movie Collection", [source("Toy Story Collection List order", "COLLECTION", "MOVIE", 10194, "original")]);
const allFilters = (media) => ({
	withGenres: media === "TV" ? "18|10765" : "28|12", withoutGenres: media === "TV" ? "10764,10767" : "27,53",
	releaseDateGte: "2000-01-01", releaseDateLte: "2025-12-31", voteAverageGte: 6.5, voteAverageLte: 9.5, voteCountGte: 100,
	withOriginalLanguage: "en", withOriginCountry: "US", withKeywords: "180547|818", withoutKeywords: "155030,9715",
	withCompanies: "174|3", withoutCompanies: "2,420", ...(media === "TV" ? { withNetworks: "213" } : {}),
	year: 2020, watchRegion: "AU", withWatchProviders: "8|337", withoutWatchProviders: "9,350",
});
const filtered = ["MOVIE", "TV"].map((media, i) => {
	const fields = allFilters(media);
	const mirrors = Object.fromEntries(Object.entries(discoverImportedMirrors(media)).filter(([, key]) => Object.hasOwn(fields, key)).map(([alias, key]) => [alias, fields[key]]));
	return folder(220 + i * 10, media + " full filters and matching aliases", [
		source(media + " canonical full filters", "DISCOVER", media, null, "vote_count.desc", fields),
		source(media + " matching aliases", "DISCOVER", media, null, "vote_count.desc", { ...fields, ...mirrors, sortBy: "vote_count.desc" }),
		source(media + " included AND expressions", "DISCOVER", media, null, "vote_average.desc", { withGenres: media === "TV" ? "18,10765" : "28,12", withKeywords: "180547,818", withCompanies: "174,3", withWatchProviders: "8,337", watchRegion: "US" }),
	]);
});
const nullable = source("Explicit null filter fields", "DISCOVER", "TV", null, "popularity.desc", Object.fromEntries(DISCOVER_FILTER_FIELDS.map((key) => [key, null])));
const emptyStrings = source("Empty string filter fields", "DISCOVER", "TV", null, "popularity.desc", Object.fromEntries(DISCOVER_FILTER_FIELDS.filter((key) => !["voteCountGte", "voteAverageGte", "voteAverageLte", "year"].includes(key)).map((key) => [key, ""])), "Preservation probe; empty strings do not establish usable filter expressions");
const absent = source("Absent optional source fields"); delete absent.filters; delete absent.sortBy; delete absent.tmdbId;
const probes = folder(240, "Absent null empty zero and uncertain expressions", [
	nullable, emptyStrings, absent,
	source("Explicit numeric zeros", "DISCOVER", "MOVIE", null, "vote_average.desc", { voteAverageGte: 0, voteAverageLte: 0, voteCountGte: 0 }),
	source("Compound locale and network probe", "DISCOVER", "TV", null, "vote_count.desc", { withOriginalLanguage: "es|pt", withOriginCountry: "US|CA", withNetworks: "213|49" }, "Preservation probe; compound endpoint semantics are unverified"),
	source("Conflicting alias probe", "DISCOVER", "MOVIE", null, "vote_count.desc", { voteCountGte: 100, "vote_count.gte": 101, unfamiliarPreservationField: "P206 keep this literal value" }, "Preservation probe; conflicting alias and unfamiliar imported field require review"),
	source("PERSON imported filters", "PERSON", "TV", 31, "vote_average.desc", allFilters("TV"), "Imported People filter preservation; no filter application claim"),
	source("DIRECTOR imported filters", "DIRECTOR", "MOVIE", 488, "vote_count.desc", allFilters("MOVIE"), "Imported People filter preservation; no filter application claim"),
]);
const duplicate = source("Identical copies, no distinct content", "COMPANY", "MOVIE", 174, "vote_average.desc", { voteCountGte: 100 });
const duplicates = folder(90, "Duplicate copies and a distinct vote setting", [duplicate, structuredClone(duplicate), source("Distinct votes must survive", "COMPANY", "MOVIE", "174", "vote_average.desc", { voteCountGte: 0 })]);
const addons = ["movie", "series"].map((type) => {
	const key = record("P206-S" + String(++serial).padStart(3, "0"), "Cinemeta " + type + " source and compatibility projection", "Known addon identity; imported title is a preservation probe");
	return { provider: "addon", title: tag(key, "Cinemeta " + type), addonId: "com.linvo.cinemeta", type, catalogId: "top", genre: "" };
});
const addonFolder = folder(210, "Addon sources and matching catalogSources", addons, { catalogSources: addons.map(({ provider, ...value }) => value) });
export const master = [
	collection(30, "ROWS: pin On, glow Off, Show All Off", gifFolders, { viewMode: "ROWS", pinToTop: true, focusGlowEnabled: false, showAllTab: false, backdropImageUrl: image }),
	collection(10, "Tabbed: false, true and null artwork", [folder(80, "Artwork populated: café & 東京 🎬", [source("All artwork field control")], { tileShape: "LANDSCAPE", hideTitle: false, focusGifEnabled: true, ...artwork }), ...familyFolders.slice(0, 4)], { viewMode: "TABBED_GRID", pinToTop: false, focusGlowEnabled: true, showAllTab: true, backdropImageUrl: null }),
	collection(50, "ROWS: empty backdrop and null folder artwork", [folder(50, "All nullable artwork explicitly null", [source("Null folder artwork control")], { tileShape: "SQUARE", focusGifEnabled: false, catalogSources: [], ...Object.fromEntries(Object.keys(artwork).map((key) => [key, null])) }), ...familyFolders.slice(4)], { viewMode: "ROWS", pinToTop: false, focusGlowEnabled: false, showAllTab: true, backdropImageUrl: "" }),
	collection(20, "Tabbed: pin On, glow On, absent backdrop", [listFolder, franchise, duplicates, addonFolder], { viewMode: "TABBED_GRID", pinToTop: true, focusGlowEnabled: true, showAllTab: false }),
	collection(60, "Absent collection defaults; explicit empty folder artwork", [folder(60, "All artwork explicitly empty", [source("Empty folder artwork control")], { tileShape: "POSTER", hideTitle: false, focusGifEnabled: false, ...Object.fromEntries(Object.keys(artwork).map((key) => [key, ""])) }), ...filtered]),
	collection(40, "Filters and absent folder defaults", [folder(70, "Absent presentation settings", [source("Absent folder settings control")]), probes], { viewMode: "TABBED_GRID", pinToTop: false, focusGlowEnabled: false, showAllTab: false }),
];

export function artifacts() {
	const json = JSON.stringify(master, null, 2) + "\n";
	const bytes = Buffer.from(json), sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
	const input = { value: master, filename: "206-collection-preservation-master.json", bytes: bytes.length, sha256 };
	const baseline = compare(input, input, { full: true });
	assert.equal(baseline.ambiguous.length, 0);
	assert.ok(baseline.fieldComparison.every((row) => row.label === "Kept"));
	const cases = [...notes].map(([id, details]) => ({ id, ...details }));
	const fields = baseline.fieldComparison.map(({ exported, afterLocation, label, reason, ...row }) => ({ ...row, ...(notes.get(row.case) ?? { purpose: "Deliberate hierarchy order", status: "Order preservation" }) }));
	const manifest = { pack: "206 collection saved-JSON preservation v1", input: { filename: input.filename, bytes: input.bytes, sha256 }, boundary: "All four routes are Not tested. JSON preservation only. Historical #206 evidence is separate. No title results, filter application, ranking, counts or Preview checks.", coverage: { collections: master.length, folders: baseline.matchedFolders, physicalSources: baseline.matchedSources, nativeFamilies: [...new Set(master.flatMap((c) => c.folders.flatMap((f) => f.sources.map((s) => s.tmdbSourceType))).filter(Boolean))], discoverFields: DISCOVER_FILTER_FIELDS, fieldRows: fields.length }, cases, fields };
	const runs = { masterSha256: sha256, routes: Object.fromEntries(ROUTES.map((route) => [route, { status: "Not tested", exportFile: null, version: "", startedAt: "", exportedAt: "", importMethod: "", exportMethod: "", syncActivity: "", isolation: "", notes: "" }])) };
	const summary = "# Collection preservation case manifest\n\nMaster: `" + input.filename + "`\n\nSHA-256: `" + sha256 + "`\n\n" + input.bytes + " bytes; " + master.length + " collections; " + baseline.matchedFolders + " folders; " + baseline.matchedSources + " physical sources; " + fields.length + " field/order rows.\n\nEvery original field value, including declared absences and deliberate ordering, is in `case-manifest.json` and the Original column of `comparison.md`. Fields are identified by case marker and original JSON path. Duplicate copies share one case marker and retain distinct occurrence paths.\n\nAll four manual routes: **Not tested**.\n\n| Case | Purpose | Scope |\n| --- | --- | --- |\n" + cases.map((c) => "| " + [c.id, c.purpose, c.status].map((v) => v.replace(/\|/g, "&#124;")).join(" | ") + " |").join("\n") + "\n";
	return new Map([[input.filename, json], ["case-manifest.json", JSON.stringify(manifest, null, 2) + "\n"], ["case-manifest.md", summary], ["comparison.md", "# Saved-JSON comparison\n\nAll four routes are Not tested. See case-manifest.md for probe boundaries. Typed values distinguish absent, null, false, zero and empty. @order rows list case markers in saved order.\n\n" + comparisonTable(fields)], ["run-log-template.json", JSON.stringify(runs, null, 2) + "\n"]]);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
	const check = process.argv.includes("--check");
	for (const [name, content] of artifacts()) {
		const file = new URL(name, import.meta.url);
		if (check) assert.equal(fs.readFileSync(file, "utf8"), content, name + " differs from the authored generator");
		else fs.writeFileSync(file, content, { flag: "wx" });
	}
	console.log(check ? "Authored master, manifest, initial table and run log are current." : "Authored pack generated; all four client routes are Not tested.");
}
