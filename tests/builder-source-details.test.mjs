import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { desktopExpandedSource, roundTripSourceCases } from "./fixtures/nuvio-desktop-round-trip.mjs";
import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { buildBuilderViewModel } from "../builder/src/ui/view-model.js";
import { sourceCardDetails } from "../builder/src/ui/source-details.js";
import { buildCanonicalDecadePeriodDrafts } from "../builder/src/source-add/decades-source.js";
import { discoverSourceNodeIdentity } from "../builder/src/nuvio/discover.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";

const native = (tmdbSourceType, mediaType = "MOVIE", extra = {}) => ({ nodeType: "source", category: "native-tmdb", editable: { provider: "tmdb", tmdbSourceType, mediaType, sortBy: "popularity.desc", filters: {}, ...extra } });
const summary = (node) => sourceCardDetails(node).metadata.map((entry) => entry.value).join(" · ");
const cases = [];
for (const [media, label] of [["MOVIE", "Movies"], ["TV", "Series"]]) {
	for (const [type, id, role] of [["PERSON", 31, "Acting"], ["DIRECTOR", 488, "Directing"]]) cases.push([type + media, native(type, media, { tmdbId: id }), "Person · " + (role === "Acting" ? "Acting" : "Directed") + " " + label.toLowerCase() + " · Popular", role + " source"]);
	cases.push(["Studio " + media, native("COMPANY", media, { tmdbId: 1003, sortBy: media === "MOVIE" ? "primary_release_date.desc" : "first_air_date.desc" }), "Studio · " + label + " · Recent", "Studio source"]);
	cases.push(["Genre " + media, native("DISCOVER", media, { filters: { withGenres: "35" } }), "Comedy " + label.toLowerCase() + " · Popular", "Genre source"]);
	cases.push(["Streaming " + media, native("DISCOVER", media, { filters: { watchRegion: "AU", withWatchProviders: "8" } }), "Streaming · " + label + " (AU) · Popular", "Streaming source"]);
	for (const [periodId, period, fallback] of [["1980s", "1980s", "Decade source"], ["year-1984", "1984", "Year source"], ["1950s-and-earlier", "1950s & Earlier", "Decade source"], ["before-1950", "Before 1950", "Decade source"]]) for (const genreName of [null, "Comedy"]) {
		const built = buildCanonicalDecadePeriodDrafts({ periodId, mediaMode: media === "MOVIE" ? "movies" : "series", genreName, advanced: {} });
		assert.equal(built.ok, true);
		cases.push([periodId + media + genreName, { ...built.drafts[0], nodeType: "source" }, period + (genreName ? " " + genreName.toLowerCase() : "") + " " + label.toLowerCase() + " · Popular", fallback]);
	}
}
cases.push(
	["Network", native("NETWORK", "TV", { tmdbId: 1004 }), "Network · Series · Popular", "Network source"],
	["Franchise", native("COLLECTION", "MOVIE", { tmdbId: 1002, sortBy: "original" }), "Movie franchise · TMDB order", "Movie franchise source"],
	["List mixed contents cannot be inferred", native("LIST", "MOVIE", { tmdbId: "1001", sortBy: "original" }), "List · Original order", "TMDB List source"],
	["List unknown sort", native("LIST", "MOVIE", { tmdbId: 123, sortBy: "added.desc" }), "List · Other sorting", "TMDB List source"],
	["Advanced Genre", native("DISCOVER", "MOVIE", { sortBy: "vote_average.desc", filters: { withGenres: "35", voteCountGte: 250 } }), "Comedy movies · Top rated · Additional settings", "Genre source"],
	["Keyword", native("DISCOVER", "MOVIE", { filters: { withKeywords: "15097" } }), "Discover · Popular movies · Additional settings", "TMDB Discover source"],
	["Missing optional values", native("COMPANY", undefined, { mediaType: null, sortBy: " ", tmdbId: null }), "Studio", "Studio source"],
	["Malformed optional values", native("COMPANY", false, { sortBy: {}, tmdbId: false, filters: [] }), "Studio · Other media type (Other sorting) · Additional settings", "Studio source"],
);
for (const [name, node, expected, fallback] of cases) test("Source details: " + name, () => {
	const before = JSON.stringify(node);
	assert.equal(summary(node), expected);
	assert.equal(sourceCardDetails(node).fallback, fallback);
	assert.equal(new Set(sourceCardDetails(node).metadata.map((entry) => entry.key)).size, sourceCardDetails(node).metadata.length);
	assert.equal(JSON.stringify(node), before);
	assert.ok(sourceCardDetails(node).metadata.length <= 3);
	assert.equal(/TMDB (Person|Studio|Network|Provider|List) \d/.test(summary(node)), false);
	assert.ok((summary(node).match(/Additional settings/g) ?? []).length <= 1);
});

test("family sort tables are media-specific, missing sorts are omitted, unknown values stay private", () => {
	for (const type of ["PERSON", "DIRECTOR", "COMPANY", "NETWORK", "DISCOVER"]) {
		for (const [sortBy, expected] of [["vote_average.desc", "Top rated"], ["added.desc", "Other sorting"], ["primary_release_date.desc", "Other sorting"], [undefined, null], ["", null]]) {
			const node = native(type, "TV", { sortBy });
			if (expected) assert.ok(summary(node).includes(expected), type + " " + sortBy);
			else assert.equal(/Top rated|Other sorting|Popular|Recent/.test(summary(node)), false);
		}
	}
	assert.match(summary(native("COMPANY", "MOVIE", { sortBy: "vote_count.desc" })), /Most voted/);
	assert.match(summary(native("PERSON", "MOVIE", { sortBy: "vote_count.desc" })), /Other sorting/);
	assert.match(summary(native("COMPANY", "future-media")), /Other media type/);
});

test("preserved raw filters and fields cannot be mistaken for a fully recognized Genre", () => {
	const node = native("DISCOVER", "MOVIE", { filters: { withGenres: "35" } });
	node.rawImported = { ...node.editable, filters: { withGenres: "35", futureFilter: "private-token" }, futureSetting: false };
	assert.equal(summary(node), "Discover · Popular movies · Additional settings");
	assert.equal(summary(node).includes("private-token"), false);
	assert.match(summary(native("DISCOVER", "MOVIE", { filters: { withGenres: {} } })), /Additional settings/);
});

const addon = (extra = {}) => ({ category: "addon", editable: { provider: "addon", title: "Picks", addonId: "example.id", type: "series", catalogId: "trending-series", ...extra } });
for (const [name, node, expected] of [
	["catalog identity", addon(), "example.id · Catalog: trending-series · Series"],
	["genre", addon({ genre: "Drama" }), "example.id · Catalog: trending-series · Drama series"],
	["role-aware repetition", addon({ addonId: "movie", type: "movie", genre: "MOVIE", catalogId: "catalog" }), "movie · Catalog: catalog · Movies"],
	["identical identifiers are not globally deduplicated", addon({ addonId: "same", catalogId: "same" }), "same · Catalog: same · Series"],
	["unknown type", addon({ type: "anime" }), "example.id · Catalog: trending-series · Type: anime"],
	["prototype-looking type", addon({ type: "constructor" }), "example.id · Catalog: trending-series · Type: constructor"],
	["missing type and catalog", addon({ type: null, catalogId: " " }), "example.id"],
	["malformed type", addon({ type: {} }), "example.id · Catalog: trending-series · Other media type"],
	["opaque community", { category: "opaque", editable: { provider: "community", addonId: "not-an-addon" } }, "Community"],
	["opaque Trakt", { category: "opaque", editable: { provider: "trakt" } }, "Trakt"],
	["missing provider", { category: "opaque", editable: {} }, ""],
]) test("Source details: " + name, () => assert.equal(summary(node), expected));

function controllerFor(sources) {
	let next = 0;
	const controller = createBuilderController({ idFactory: () => "details-" + (++next) });
	assert.equal(controller.importValue([{ id: "c", title: "C", folders: [{ id: "f", title: "F", sources }] }]).ok, true);
	controller.selectNode(controller.getState().project.collections[0].folders[0].internalId);
	return controller;
}

test("desktop round trip: family details and Workspace Edit eligibility survive null expansion", () => {
	for (const { name, source } of roundTripSourceCases) {
		const compact = controllerFor([source]);
		const expanded = controllerFor([desktopExpandedSource(source)]);
		const before = JSON.stringify(expanded.getState());
		const originalView = buildBuilderViewModel(compact.getState()).sources[0];
		const view = buildBuilderViewModel(expanded.getState()).sources[0];
		assert.equal(view.editSupported, true, name);
		assert.deepEqual(view.metadata, originalView.metadata, name);
		assert.equal(JSON.stringify(expanded.getState()), before);
	}
});

test("names remain independent of metadata and existing hidden/format-only title semantics remain intact", () => {
	const names = ["Custom display name", "", "   ", "\u200e", "\u200e\u200e", "\u200b"];
	const controller = controllerFor(names.map((title) => ({ ...native("LIST", "MOVIE", { tmdbId: 123, sortBy: "original" }).editable, title })));
	const view = buildBuilderViewModel(controller.getState());
	assert.deepEqual(view.sources.map((source) => source.title), [names[0], "TMDB List source", "TMDB List source", "Hidden title", "Hidden title", names[5]]);
	assert.equal(new Set(view.sources.map((source) => source.metadataDescription)).size, 1);
	assert.equal(view.sources[3].accessibleName, "Source with hidden Nuvio title");
});

test("imported corpus rendering preserves revision, source identity, ordering and serialized output", () => {
	for (const path of ["valid/all-native-tmdb-source-types.json", "valid/mixed-native-and-addon.json", "valid/opaque-community-import.json", "compatibility/legacy-projection-only-input.json", "compatibility/legacy-nuvio-normalised.json", "v2-compatibility/preservation/comprehensive-imported-profile.json", "invalid/unsupported-direct-movie-source.json"]) {
		const controller = createBuilderController();
		assert.equal(controller.importValue(JSON.parse(fs.readFileSync(new URL("./fixtures/nuvio/" + path, import.meta.url), "utf8"))).ok, true);
		for (const collection of controller.getState().project.collections) for (const folder of collection.folders) {
			controller.selectNode(folder.internalId);
			const state = controller.getState();
			const before = JSON.stringify(state);
			const output = serializeNuvioProject(state.project);
			const identities = folder.sources.map(discoverSourceNodeIdentity);
			buildBuilderViewModel(state);
			assert.equal(JSON.stringify(controller.getState()), before, path);
			assert.deepEqual(serializeNuvioProject(state.project), output, path);
			assert.deepEqual(folder.sources.map(discoverSourceNodeIdentity), identities, path);
		}
	}
});

const vite = await createServer({ root: fileURLToPath(new URL("../builder", import.meta.url)), appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
const { BuilderApp } = await vite.ssrLoadModule("/src/ui/BuilderApp.jsx");
after(() => vite.close());
test("hidden Sources have one comma-separated description; visible Sources retain descendant details without an extra description", () => {
	const controller = controllerFor(["Visible", "\u200e"].map((title) => ({ ...native("LIST", "MOVIE", { tmdbId: 123, sortBy: "original" }).editable, title })));
	const html = renderToStaticMarkup(createElement(BuilderApp, { controller, initialScreen: "workspace" }));
	const buttons = html.match(/<button[^>]*data-node-type="source"[\s\S]*?<\/button>/g);
	assert.equal(buttons.length, 2);
	assert.equal(buttons[0].includes("aria-describedby"), false);
	assert.equal(buttons[0].includes('class="node-meta" aria-hidden'), false);
	assert.match(buttons[1], /aria-label="Source with hidden Nuvio title"/);
	assert.match(buttons[1], /aria-describedby="source-details-details-\d+"/);
	assert.match(buttons[1], /class="node-meta" aria-hidden="true"/);
	assert.equal((buttons[1].match(/List, Original order/g) ?? []).length, 1);
	assert.equal(html.includes("MOVIE"), false);
});

for (const [name, node, expected] of [
	["AIO Trakt origin", addon({ addonId: "aio-metadata", catalogId: "trakt.recommendations.movies", type: "movie", genre: "None" }), "AIO Metadata · Trakt · Movies"],
	["catalog equals visible title", addon({ title: "trending-series" }), "example.id · Series"],
	["catalog already supplies blank-name fallback", addon({ title: "" }), "example.id · Series"],
	["plural media genre", addon({ type: "movie", genre: "Movies" }), "example.id · Catalog: trending-series · Movies"],
	["Series genre", addon({ type: "series", genre: "TV" }), "example.id · Catalog: trending-series · Series"],
	["unknown addon with familiar text is not inferred", addon({ addonId: "not-aio-metadata", catalogId: "trakt.watchlist" }), "not-aio-metadata · Catalog: trakt.watchlist · Series"],
	["namespace boundary", addon({ addonId: "aio-metadata", catalogId: "traktish.list.1" }), "AIO Metadata · Catalog: traktish.list.1 · Series"],
	["unknown type and genre stay compact", addon({ type: "anime", genre: "Drama" }), "example.id · Catalog: trending-series · Drama (Type: anime)"],
	["unknown preserved provider", { category: "opaque", editable: { provider: "future.example" } }, "Provider: future.example"],
]) test("compact details: " + name, () => { assert.equal(summary(node), expected); assert.ok(sourceCardDetails(node).metadata.length <= 3); });

test("additional settings do not make ordinary native cards exceed three segments or lowercase region codes", () => {
	for (const node of [native("PERSON", "MOVIE", { filters: { year: "2020" } }), native("COMPANY", "MOVIE", { filters: { year: "2020" } })]) {
		assert.equal(sourceCardDetails(node).metadata.length, 3);
		assert.equal(sourceCardDetails(node).metadata.at(-1).value, "Additional settings");
	}
	const streaming = native("DISCOVER", "MOVIE", { filters: { withWatchProviders: "8", watchRegion: "AU" } });
	assert.equal(summary(streaming), "Streaming · Movies (AU) · Popular");
	assert.equal(summary(native("DISCOVER", "MOVIE", { sortBy: "primary_release_date.desc", filters: { withKeywords: "15097" } })), "Discover · Recent movies · Additional settings");
});

test("only otherwise identical sibling addon cards expose distinct catalogs behind the same friendly origin", () => {
	const controller = controllerFor(["trakt.watchlist", "trakt.recommendations.movies"].map((catalogId) => addon({ addonId: "aio-metadata", type: "movie", catalogId }).editable));
	const before = JSON.stringify(controller.getState());
	const output = serializeNuvioProject(controller.getState().project);
	const cards = buildBuilderViewModel(controller.getState()).sources;
	assert.deepEqual(cards.map((card) => card.metadataDescription), ["AIO Metadata, Trakt, Catalog: trakt.watchlist, Movies", "AIO Metadata, Trakt, Catalog: trakt.recommendations.movies, Movies"]);
	assert.equal(JSON.stringify(controller.getState()), before);
	assert.deepEqual(serializeNuvioProject(controller.getState().project), output);
	const differentTitles = controllerFor([addon({ addonId: "aio-metadata", catalogId: "trakt.watchlist", title: "Watchlist" }).editable, addon({ addonId: "aio-metadata", catalogId: "trakt.calendar", title: "Calendar" }).editable]);
	assert.ok(buildBuilderViewModel(differentTitles.getState()).sources.every((card) => card.metadata.length === 3));
});
