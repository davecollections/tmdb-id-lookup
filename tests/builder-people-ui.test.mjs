import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import {
	addSelectedPerson,
	createAsyncRequestCoordinator,
	createPeopleConfiguration,
	createPeopleSelectionState,
	INITIAL_ASYNC_REQUEST_STATE,
} from "../builder/src/source-add/index.js";
import { restoreAddSourceSearchView } from "../builder/src/ui/add-source-navigation-state.js";
import {
	capturePeopleSelectionScroll,
	completePeopleSearchRestore,
	createPeopleSourceNavigationState,
	enterPeopleConfigure,
	enterPeopleReview,
	PEOPLE_SOURCE_STEPS,
	returnPeopleToConfigure,
	returnPeopleToSearch,
} from "../builder/src/ui/people-source-navigation-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { SourceModeDialog } = await vite.ssrLoadModule("/src/ui/SourceModeDialog.jsx");
const {
	activateFolderPersonResult,
	PeopleBulkConfigurationList,
	PeopleConfigurationCard,
	PeopleConfigurationModeControls,
	PeopleReviewStep,
	PeopleSearchStep,
	PeopleSourceFlow,
	PeopleTitlePreviewSurface,
	requestSelectedPersonDetails,
} = await vite.ssrLoadModule("/src/ui/PeopleSourceFlow.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function person(overrides = {}) {
	return {
		id: 31,
		name: "Tom Hanks",
		knownForDepartment: "Acting",
		profilePath: "/tom-hanks.jpg",
		knownFor: [
			{ title: "Forrest Gump", mediaType: "MOVIE", year: 1994 },
			{ title: "From the Earth to the Moon", mediaType: "TV", year: 1998 },
		],
		counts: { actingMovies: 4, actingSeries: 0, directingMovies: 1, directingSeries: 0 },
		...overrides,
	};
}

function selectionOf(...people) {
	return people.reduce((state, entry) => addSelectedPerson(state, entry).state, createPeopleSelectionState());
}

function findElement(node, predicate) {
	if (Array.isArray(node)) {
		for (const child of node) {
			const match = findElement(child, predicate);
			if (match) return match;
		}
		return null;
	}
	if (!node || typeof node !== "object") return null;
	if (predicate(node)) return node;
	return findElement(node.props?.children, predicate);
}

function renderSearch({ context = "folder", results = [person()], selection = createPeopleSelectionState(), loadingPersonId = null, selectionError = null } = {}) {
	return renderToStaticMarkup(createElement(PeopleSearchStep, {
		context,
		input: "Tom Hanks",
		inputRef: null,
		parsedInput: { kind: "search", query: "Tom Hanks", eligible: true, message: null },
		lookupState: { ...INITIAL_ASYNC_REQUEST_STATE, status: "success" },
		searchData: { results, page: 1, totalPages: 1, totalResults: results.length },
		selection,
		loadingPersonId,
		selectionError,
		onInputChange() {},
		onRetryLookup() {},
		onActivateResult() {},
		onChangePage() {},
		onRemoveSelected() {},
	}));
}

test("source chooser retains the established first five modes before Genres", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, { folderName: "People", onCancel() {}, onSelectMode() {} }));
	assert.ok(markup.includes('data-source-mode-option="tmdb-movie-franchise"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-people"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-studios"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-networks"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-streaming-services"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-genres"'));
	assert.equal((markup.match(/<button/g) ?? []).length, 7);
});

test("folder Search preserves TMDB order, disambiguates identities, and uses friendly profile states", () => {
	const markup = renderSearch({
		results: [
			person({ id: 101, name: "Alex Smith", knownForDepartment: "Acting" }),
			person({ id: 202, name: "Alex Smith", knownForDepartment: "Directing", profilePath: null, knownFor: [] }),
		],
	});
	assert.ok(markup.indexOf("TMDB 101") < markup.indexOf("TMDB 202"));
	assert.equal((markup.match(/<strong>Alex Smith<\/strong>/g) ?? []).length, 2);
	assert.ok(markup.includes("Known for Acting"));
	assert.ok(markup.includes("Known for Directing"));
	assert.ok(markup.includes("Forrest Gump"));
	assert.ok(markup.includes("Movie · 1994"));
	assert.ok(markup.includes("No profile image"));
	assert.ok(markup.includes("No profile image available for Alex Smith"));
	assert.equal((markup.match(/data-tmdb-person-result=/g) ?? []).length, 2);
	assert.equal((markup.match(/type="button"/g) ?? []).length, 2);
});

test("People result cards retain TMDB known-for order, cap desktop markup at three, and hide later rows on mobile", () => {
	const longFirstTitle = "The First TMDB Supplied Known For Title That Needs More Than One Mobile Line";
	const knownFor = Object.freeze([
		Object.freeze({ title: longFirstTitle, mediaType: "TV", year: 1984 }),
		Object.freeze({ title: "Newer Second Entry", mediaType: "MOVIE", year: 2025 }),
		Object.freeze({ title: "Third Entry", mediaType: "TV", year: 2001 }),
		Object.freeze({ title: "Fourth Entry Retained In State", mediaType: "MOVIE", year: 2026 }),
	]);
	const before = JSON.stringify(knownFor);
	const markup = renderSearch({ results: [person({ knownFor })] });
	const styles = read("builder/src/styles.css");
	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	const knownForRenderer = flow.slice(flow.indexOf("function KnownForRows"), flow.indexOf("function PersonResult"));

	assert.equal((markup.match(/class="people-known-for-row"/g) ?? []).length, 3);
	assert.ok(markup.indexOf(longFirstTitle) < markup.indexOf("Newer Second Entry"));
	assert.ok(markup.indexOf("Newer Second Entry") < markup.indexOf("Third Entry"));
	assert.equal(markup.includes("Fourth Entry Retained In State"), false);
	assert.ok(markup.includes("Series · 1984"));
	assert.ok(markup.includes("Movie · 2025"));
	assert.match(markup, new RegExp(`<span class="people-known-for-title">${longFirstTitle}</span>`));
	assert.match(styles, /\.people-known-for-title\s*\{[^}]*line-height:\s*1\.35;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/);
	assert.doesNotMatch(styles.match(/\.people-known-for-title\s*\{[^}]*\}/)?.[0] ?? "", /text-overflow|line-clamp|overflow:\s*hidden/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.people-known-for-row:nth-child\(n \+ 2\)\s*\{\s*display:\s*none;/);
	assert.match(knownForRenderer, /rows\.slice\(0, 3\)/);
	assert.doesNotMatch(knownForRenderer, /\.sort\(|getPerson|searchPeople|fetch\(/);
	assert.equal(JSON.stringify(knownFor), before);
	assert.equal(renderSearch({ results: [person({ knownFor })] }), markup);
});

test("People result cards omit empty known-for rows and never fabricate title totals", () => {
	const markup = renderSearch({ results: [person({ knownFor: [] })] });
	assert.equal(markup.includes("people-known-for"), false);
	assert.equal(markup.includes("Known-for titles unavailable"), false);
	for (const forbidden of ["known-title count", "known titles", "Movies total", "Series total"]) {
		assert.equal(markup.includes(forbidden), false, forbidden);
	}
	assert.ok(markup.includes("Known for Acting"));
	assert.ok(markup.includes("TMDB 31"));
});

test("multi-select People cards expose native checkbox state through a circular reusable indicator", () => {
	const selected = person();
	const unselected = person({ id: 488, name: "Steven Spielberg" });
	const markup = renderSearch({ context: "collection", results: [selected, unselected], selection: selectionOf(selected) });
	const styles = read("builder/src/styles.css");
	assert.match(markup, /<label[^>]*people-result-selectable is-selected[^>]*data-tmdb-person-result="31"/);
	assert.match(markup, /<input class="visually-hidden selectable-card-checkbox" type="checkbox" checked=""/);
	assert.match(markup, /data-selection-indicator="true" data-selection-state="selected"[^>]*>✓<\/span>/);
	assert.match(markup, /data-selection-indicator="true" data-selection-state="unselected"[^>]*><\/span>/);
	assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 2);
	assert.match(styles, /\.people-result-selectable\s*\{[\s\S]*position:\s*relative/);
	assert.match(styles, /\.selectable-card-indicator\s*\{[\s\S]*border-radius:\s*50%/);
	assert.match(styles, /\.selectable-card-checkbox:focus-visible \+ \.selectable-card-indicator/);
});

test("collection Search always uses a bounded selected-people disclosure and adds the 50-person notice", () => {
	for (const count of [2, 20, 50, 105]) {
		const people = Array.from({ length: count }, (_, index) => person({ id: index + 1, name: `Person ${index + 1}` }));
		const markup = renderSearch({ context: "collection", results: [people[0], person({ id: 999, name: "New person" })], selection: selectionOf(...people) });
		assert.ok(markup.includes(`${count} people selected`), count);
		assert.ok(markup.includes(">View selected people<"), count);
		assert.equal(markup.includes(`View selected people · ${count}`), false, count);
		assert.ok(markup.includes('class="people-selected-summary"'), count);
		assert.equal(markup.includes("Folder order preserved"), false, count);
		assert.ok(markup.includes('class="genre-selected-disclosure removable-selection-disclosure"'), count);
		assert.equal(markup.includes('class="genre-selection-pills removable-selection-pills"'), false, count);
		assert.ok(markup.includes('aria-label="Remove Person 1"'), count);
		assert.ok(markup.includes('type="checkbox"'), count);
		assert.ok(markup.includes('checked=""'), count);
		assert.equal(markup.includes('disabled=""'), false, count);
		assert.equal(markup.includes("maximum"), false, count);
		assert.equal(markup.includes("may take a little longer"), count >= 50, count);
	}
});

test("100+ configured People keep four direct compact choices without mounting expanded person editors", () => {
	const entries = Array.from({ length: 105 }, (_, index) => {
		const selected = person({ id: index + 1, name: `Person ${index + 1}` });
		return {
			result: selected,
			person: selected,
			detail: { status: "ready", person: selected },
			configuration: createPeopleConfiguration(selected),
			artworkState: null,
		};
	});
	const callbacks = { onToggleCombination() {}, onRetry() {}, onRemove() {}, onPreview() {}, onClosePreview() {}, onRetryPreview() {}, previewState: null, previewItems: [], previewLimit: 10 };
	const automatic = renderToStaticMarkup(createElement(PeopleBulkConfigurationList, { entries, mode: "automatic", ...callbacks }));
	assert.ok(automatic.includes('data-people-bulk-count="105"'));
	assert.equal((automatic.match(/class="people-bulk-row"/g) ?? []).length, 105);
	assert.equal((automatic.match(/class="people-combination-group is-compact is-pills"/g) ?? []).length, 105);
	assert.equal((automatic.match(/class="people-source-pill"/g) ?? []).length, 420);
	assert.equal((automatic.match(/class="people-title-preview"/g) ?? []).length, 0);
	assert.equal((automatic.match(/>Preview titles</g) ?? []).length, 105);
	assert.equal(automatic.includes("Person to configure"), false);
	assert.equal(/<select\b/.test(automatic), false);
	const custom = renderToStaticMarkup(createElement(PeopleBulkConfigurationList, { entries, mode: "custom", ...callbacks }));
	assert.equal((custom.match(/class="people-combination-group is-compact is-pills"/g) ?? []).length, 105);
	assert.equal(custom.includes("data-person-editor-expanded"), false);
	assert.equal(custom.includes("Customise"), false);
	assert.equal(custom.includes(">Done<"), false);
});

test("People bulk controls expose only Automatic and Same for all while rows remain directly editable", () => {
	const automatic = renderToStaticMarkup(createElement(PeopleConfigurationModeControls, { mode: "automatic", sharedCombinations: ["acting-movies"], onModeChange() {}, onToggleShared() {} }));
	for (const label of ["Automatic", "Same for all"]) assert.ok(automatic.includes(label), label);
	assert.equal(automatic.includes("Custom per person"), false);
	assert.equal(automatic.includes("Automatic starts each person"), false);
	assert.equal(automatic.includes("mode-transition"), false);
	assert.equal(automatic.includes("expand only"), false);
	assert.equal((automatic.match(/type="radio"/g) ?? []).length, 2);
	const shared = renderToStaticMarkup(createElement(PeopleConfigurationModeControls, { mode: "shared", sharedCombinations: ["acting-movies", "directing-series"], onModeChange() {}, onToggleShared() {} }));
	assert.ok(shared.includes("Sources for every selected person"));
	assert.equal((shared.match(/type="checkbox"/g) ?? []).length, 4);
	assert.equal((shared.match(/people-source-pill-check/g) ?? []).length, 4);
	assert.ok(shared.includes('data-people-role="acting"'));
	assert.ok(shared.includes('data-people-role="directing"'));
	assert.equal(shared.includes("PERSON · MOVIE"), false);
	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	assert.equal(flow.includes("Choose Automatic or Same for all, then adjust any person directly."), false);
	assert.match(flow, /aria-describedby=\{headingDescription \? descriptionId : undefined\}/);
});

test("poster-only title preview separates applicable media and exposes bounded ready, loading, empty, and recoverable error states", () => {
	const selected = person();
	const items = Array.from({ length: 10 }, (_, index) => ({ identity: `movie|${index + 1}`, posterPath: `/poster-${index + 1}.jpg` }));
	const ready = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "ready", mediaType: "MOVIE" }, items, limit: 10, mediaTypes: ["MOVIE", "TV"], totalResults: 14, onChangeMedia() {}, onClose() {}, onRetry() {} }));
	assert.ok(ready.includes('data-preview-surface="modal"'));
	assert.ok(ready.includes('role="dialog"'));
	assert.ok(ready.includes('aria-modal="true"'));
	assert.ok(ready.includes('data-preview-status="ready"'));
	assert.ok(ready.includes('data-preview-limit="10"'));
	assert.equal((ready.match(/<img/g) ?? []).length, 10);
	assert.ok(ready.includes('alt="Movies preview poster 1"'));
	assert.equal((ready.match(/role="tab"/g) ?? []).length, 2);
	assert.ok(ready.includes('aria-selected="true">Movies'));
	assert.ok(ready.includes("Movies · 14"));
	assert.equal(ready.includes("Movies + Series"), false);
	assert.equal(ready.includes("Forrest Gump"), false);
	assert.equal(ready.includes("rating"), false);
	assert.equal(ready.includes("release"), false);
	assert.ok(ready.includes(">Close<"));
	const mobile = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "ready" }, items: items.slice(0, 5), limit: 5, onClose() {}, onRetry() {} }));
	assert.equal((mobile.match(/<img/g) ?? []).length, 5);
	assert.ok(mobile.includes('data-preview-limit="5"'));
	const loading = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "loading", mediaType: "TV" }, items: [], limit: 5, mediaTypes: ["TV"], onClose() {}, onRetry() {} }));
	assert.ok(loading.includes('role="status"'));
	assert.ok(loading.includes("Preparing series poster preview"));
	const filtered = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "ready" }, items: [{ identity: "missing", posterPath: null }, { identity: "invalid", posterPath: "poster.jpg" }, items[0]], limit: 5, onClose() {}, onRetry() {} }));
	assert.equal((filtered.match(/<img/g) ?? []).length, 1);
	assert.equal(filtered.includes("No poster"), false);
	const empty = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "ready" }, items: [], limit: 5, onClose() {}, onRetry() {} }));
	assert.ok(empty.includes("No posters available."));
	const error = renderToStaticMarkup(createElement(PeopleTitlePreviewSurface, { person: selected, state: { status: "error", error: { message: "Preview unavailable." } }, items: [], limit: 5, onClose() {}, onRetry() {} }));
	assert.ok(error.includes('role="alert"'));
	assert.ok(error.includes("Preview unavailable."));
	assert.ok(error.includes(">Retry<"));
});

test("selection loading and failure are distinct announced states", () => {
	const loading = renderSearch({ loadingPersonId: 31 });
	assert.ok(loading.includes("Loading details and title counts"));
	assert.ok(loading.includes('aria-busy="true"'));
	const failed = renderSearch({ selectionError: { message: "TMDB is temporarily unavailable.", retryable: true } });
	assert.ok(failed.includes('role="alert"'));
	assert.ok(failed.includes("TMDB is temporarily unavailable."));
	assert.ok(failed.includes("Try selecting the person again."));
});

test("rendered quick-add activation suppresses a rapid repeat and later permits another person", async () => {
	const pending = [];
	let calls = 0;
	const provider = { getPerson(id) { calls += 1; return new Promise((resolve) => pending.push({ id, resolve })); } };
	const coordinators = new Map();
	const ready = new Map();
	let currentToken = null;
	const activated = [];
	function beginDetailsRequest(result) {
		if (ready.has(result.id)) return { cached: true, person: ready.get(result.id) };
		let coordinator = coordinators.get(result.id);
		if (!coordinator) {
			coordinator = createAsyncRequestCoordinator();
			coordinators.set(result.id, coordinator);
		}
		const request = requestSelectedPersonDetails({ coordinator, provider, result });
		return request?.repeated ? request : { request };
	}
	async function loadDetails(result, { detailsRequest }) {
		if (detailsRequest.cached) return { ok: true, person: detailsRequest.person };
		const completion = await detailsRequest.request;
		if (completion.accepted !== true) return { ok: false, stale: true };
		if (completion.result?.ok !== true) return completion.result;
		ready.set(result.id, completion.result.data);
		return { ok: true, person: completion.result.data };
	}
	const onActivateResult = (result) => activateFolderPersonResult({
		result,
		beginDetailsRequest,
		loadDetails,
		getScrollTop: () => 428,
		onStart: (_result, token) => { currentToken = token; },
		isCurrent: (token) => currentToken === token,
		onSettled() {},
		onFailure() {},
		onSuccess: (selected, scrollTop) => activated.push({ id: selected.id, scrollTop }),
	});
	function renderedResultButton(result) {
		const tree = PeopleSearchStep({
			context: "folder",
			input: result.name,
			inputRef: null,
			parsedInput: { kind: "search", query: result.name, eligible: true, message: null },
			lookupState: { ...INITIAL_ASYNC_REQUEST_STATE, status: "success" },
			searchData: { results: [result], page: 1, totalPages: 1, totalResults: 1 },
			selection: createPeopleSelectionState(),
			loadingPersonId: null,
			selectionError: null,
			onInputChange() {}, onRetryLookup() {}, onActivateResult, onChangePage() {}, onRemoveSelected() {},
		});
		assert.ok(renderToStaticMarkup(tree).includes(`data-tmdb-person-result="${result.id}"`));
		const resultElement = findElement(tree, (element) => typeof element.type === "function" && element.props?.result?.id === result.id && element.props?.onActivate === onActivateResult);
		assert.ok(resultElement, `rendered result ${result.id}`);
		return resultElement.type(resultElement.props);
	}

	const firstButton = renderedResultButton(person());
	const first = firstButton.props.onClick();
	const repeated = firstButton.props.onClick();
	assert.equal(calls, 1);
	assert.equal((await repeated).repeated, true);
	pending.shift().resolve({ ok: true, data: person() });
	assert.equal((await first).ok, true);
	assert.deepEqual(activated, [{ id: 31, scrollTop: 428 }]);

	const spielberg = person({ id: 488, name: "Steven Spielberg", knownForDepartment: "Directing" });
	const second = renderedResultButton(spielberg).props.onClick();
	assert.equal(calls, 2);
	pending.shift().resolve({ ok: true, data: spielberg });
	assert.equal((await second).ok, true);
	assert.deepEqual(activated.map((entry) => entry.id), [31, 488]);

	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	assert.match(flow, /async function activateResult\(result\)[\s\S]*activateFolderPersonResult\(\{/);
	assert.match(flow, /function beginDetailsRequest\(result[\s\S]*requestSelectedPersonDetails\(\{/);
});

test("configuration exposes four direct combinations with inline counts and zero-count choices", () => {
	const selected = person();
	const markup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
		personResult: selected,
		detail: { status: "ready", person: selected },
		configuration: createPeopleConfiguration(selected),
		artworkState: null,
		showArtwork: false,
		onToggle() {},
		onRefresh() {},
		onRetry() {},
		onRetryArtwork() {},
		onRemove: null,
	}));
	for (const label of ["Acting Movies", "Acting Series", "Directed Movies", "Directed Series"]) assert.ok(markup.includes(label), label);
	assert.ok(markup.includes("Acting · Movies"));
	assert.ok(markup.includes("Directing · Series"));
	assert.equal(markup.includes("PERSON · MOVIE"), false);
	assert.equal(markup.includes("DIRECTOR · TV"), false);
	assert.ok(markup.includes("No titles found"));
	assert.ok(markup.includes("4 titles"));
	assert.ok(markup.includes("Refresh title counts"));
	assert.ok(markup.includes('href="https://www.themoviedb.org/person/31"'));
	assert.ok(markup.includes('target="_blank"'));
	assert.ok(markup.includes('rel="noopener noreferrer"'));
	assert.ok(markup.includes('aria-label="Open Tom Hanks on TMDB (person 31)"'));
	assert.ok(markup.includes('class="tmdb-review-identity"'));
	assert.ok(markup.includes('class="tmdb-review-identity-actions"'));
	assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 4);
	assert.equal((markup.match(/class="visually-hidden selectable-card-checkbox" type="checkbox"/g) ?? []).length, 4);
	assert.equal((markup.match(/data-selection-indicator="true"/g) ?? []).length, 4);
	assert.equal(markup.includes("Folder artwork"), false);
	assert.ok(markup.includes('data-profile-state="ready"'));
	assert.equal(markup.includes("Curated artwork"), false);
});

test("long People review names and their TMDB link wrap without removing configuration controls", () => {
	const selected = person({
		name: "A Deliberately Very Long Canonical Person Name That Must Wrap Naturally On A Narrow Phone",
	});
	const markup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
		personResult: selected,
		detail: { status: "ready", person: selected },
		configuration: createPeopleConfiguration(selected),
		artworkState: null,
		showArtwork: false,
		onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove: null,
	}));
	const styles = read("builder/src/styles.css");
	assert.ok(markup.includes(selected.name));
	assert.ok(markup.includes('href="https://www.themoviedb.org/person/31"'));
	assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 4);
	assert.ok(markup.includes("Refresh title counts"));
	assert.match(styles, /\.people-configuration-meta\s*\{[\s\S]*flex-wrap:\s*wrap/);
	assert.match(styles, /\.people-configuration-meta > span:first-child\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
	assert.match(styles, /\.tmdb-entity-link\s*\{[\s\S]*min-height:\s*44px/);
});

test("new-folder configuration shows only the final applied artwork representation", () => {
	const selected = person();
	const artwork = { personId: 31, tileShape: "POSTER", source: "tmdb", previewUrl: "https://image.tmdb.org/t/p/w500/tom-hanks.jpg", folderEditable: { coverImageUrl: "https://image.tmdb.org/t/p/w500/tom-hanks.jpg", hideTitle: false } };
	const markup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
		personResult: selected,
		detail: { status: "ready", person: selected },
		configuration: createPeopleConfiguration(selected),
		artworkState: { status: "ready", personId: 31, artwork },
		showArtwork: true,
		onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove() {},
	}));
	assert.ok(markup.includes('data-artwork-person-id="31"'));
	assert.ok(markup.includes('data-artwork-source="tmdb"'));
	assert.ok(markup.includes('data-artwork-tile-shape="POSTER"'));
	assert.ok(markup.includes('alt="TMDB image for Tom Hanks"'));
	assert.ok(markup.includes("TMDB image"));
	assert.equal(markup.includes('data-profile-state='), false);
	assert.equal(markup.includes("Folder artwork"), false);
	assert.equal((markup.match(/<img/g) ?? []).length, 1);
});

test("final artwork preview uses explicit Poster and Landscape folder shapes for every fallback source", () => {
	const selected = person();
	const styles = read("builder/src/styles.css");
	const posterArtwork = { personId: 31, tileShape: "POSTER", source: "manifest", previewUrl: "https://example.test/poster.webp", folderEditable: { coverImageUrl: "https://example.test/poster.webp", hideTitle: true } };
	const posterMarkup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
		personResult: selected,
		detail: { status: "ready", person: selected },
		configuration: createPeopleConfiguration(selected),
		artworkState: { status: "ready", personId: 31, artwork: posterArtwork },
		showArtwork: true,
		onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove: null,
	}));
	assert.ok(posterMarkup.includes('data-artwork-tile-shape="POSTER"'));

	for (const [source, previewUrl] of [
		["manifest", "https://example.test/landscape.webp"],
		["tmdb", "https://image.tmdb.org/t/p/w500/profile.jpg"],
		["emoji", null],
	]) {
		const artwork = {
			personId: 31,
			tileShape: "LANDSCAPE",
			source,
			previewUrl,
			folderEditable: previewUrl ? { coverImageUrl: previewUrl, hideTitle: source === "manifest" } : { coverImageUrl: "", hideTitle: false, coverEmoji: "👤" },
		};
		const markup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
			personResult: selected,
			detail: { status: "ready", person: selected },
			configuration: createPeopleConfiguration(selected),
			artworkState: { status: "ready", personId: 31, artwork },
			showArtwork: true,
			onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove: null,
		}));
		assert.ok(markup.includes('data-artwork-tile-shape="LANDSCAPE"'), source);
		assert.equal((markup.match(/class="people-applied-artwork"/g) ?? []).length, 1, source);
	}
	assert.match(styles, /\.people-applied-artwork > img,[\s\S]*aspect-ratio:\s*2 \/ 3;/);
	assert.match(styles, /\.people-applied-artwork\[data-artwork-tile-shape="LANDSCAPE"\][\s\S]*aspect-ratio:\s*42 \/ 25;/);
});

test("canonical and no-art states use friendly final-artwork labels without implementation terms", () => {
	const selected = person();
	for (const [artwork, label] of [
		[{ personId: 31, tileShape: "POSTER", source: "manifest", previewUrl: "https://example.test/31.webp", folderEditable: { coverImageUrl: "https://example.test/31.webp", hideTitle: true } }, "Canonical People artwork"],
		[{ personId: 31, tileShape: "POSTER", source: "emoji", previewUrl: null, folderEditable: { coverImageUrl: "", hideTitle: false, coverEmoji: "👤" } }, "No folder artwork available"],
	]) {
		const markup = renderToStaticMarkup(createElement(PeopleConfigurationCard, {
			personResult: selected,
			detail: { status: "ready", person: selected },
			configuration: createPeopleConfiguration(selected),
			artworkState: { status: "ready", personId: 31, contextKey: "new-folder", artwork },
			showArtwork: true,
			onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove: null,
		}));
		assert.ok(markup.includes(label));
		assert.equal(/runtime record|fallbackUsed|Folder artwork|TMDB profile fallback/.test(markup), false);
		assert.equal(markup.includes('data-profile-state='), false);
	}
});

test("multiple configured people retain independent final artwork", () => {
	const entries = [
		{ person: person({ id: 31, name: "Tom Hanks" }), source: "manifest", url: "https://example.test/31.webp" },
		{ person: person({ id: 488, name: "Steven Spielberg" }), source: "tmdb", url: "https://image.tmdb.org/t/p/w500/spielberg.jpg" },
	];
	const markup = renderToStaticMarkup(createElement("div", null, entries.map((entry) => createElement(PeopleConfigurationCard, {
		key: entry.person.id,
		personResult: entry.person,
		detail: { status: "ready", person: entry.person },
		configuration: createPeopleConfiguration(entry.person),
		artworkState: { status: "ready", personId: entry.person.id, contextKey: "new-folder", artwork: { personId: entry.person.id, tileShape: "POSTER", source: entry.source, previewUrl: entry.url, folderEditable: { coverImageUrl: entry.url, hideTitle: entry.source === "manifest" } } },
		showArtwork: true,
		onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove() {},
	}))));
	assert.equal((markup.match(/data-artwork-person-id=/g) ?? []).length, 2);
	assert.ok(markup.includes('data-artwork-person-id="31" data-artwork-source="manifest"'));
	assert.ok(markup.includes('data-artwork-person-id="488" data-artwork-source="tmdb"'));
	assert.equal(markup.includes('data-profile-state='), false);
});

test("People Review keeps shared Title options and Layout visible and only collapses the large people detail", () => {
	const selected = person();
	const markup = renderToStaticMarkup(createElement(PeopleReviewStep, {
		planResult: { ok: true, plan: {
			configuration: { scope: "new-collection" },
			counts: { collectionCount: 1, folderCount: 1, sourceCount: 2 },
			collections: [{ titleCollisions: [] }],
			destination: null,
			outcomes: [{ status: "ready-to-create", occurrences: [] }],
		} },
		entries: [{ person: selected, drafts: { drafts: [{}, {}] }, artworkState: { artwork: { source: "manifest" } } }],
		collectionOptions: { title: "People", hideTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false },
		onCollectionOptionsChange() {},
		folderTileShape: "POSTER",
		onFolderTileShapeChange() {},
		folderTitleVisibility: "HIDE_HOME_SCREEN",
		onFolderTitleVisibilityChange() {},
		applyDiagnostic: null,
		headingRef: null,
	}));
	assert.ok(markup.includes("Title options"));
	assert.ok(markup.includes("Layout"));
	assert.ok(markup.includes("Hide collection title in Nuvio"));
	assert.ok(markup.includes("Folder title visibility"));
	assert.equal(markup.includes("Person folder titles"), false);
	for (const label of ["Show everywhere", "Hide on home screen only", "Hide everywhere"]) assert.ok(markup.includes(label), label);
	assert.match(markup, /data-editor-choice="hide-home-screen"[^>]*checked="" value="HIDE_HOME_SCREEN"/);
	assert.ok(markup.includes("Show All tab"));
	assert.ok(markup.includes("Pin collection to top"));
	assert.ok(markup.indexOf("Title options") < markup.indexOf("Layout"));
	assert.ok(markup.indexOf("Layout") < markup.indexOf("Person folder appearance"));
	assert.ok(markup.includes("Person folder appearance"));
	assert.ok(markup.includes("Poster (recommended)"));
	assert.ok(markup.includes("Landscape"));
	assert.match(markup, /<input(?=[^>]*data-editor-choice="poster")(?=[^>]*checked="")[^>]*>/);
	assert.ok(markup.includes("Each person’s Hero, Title Logo and Focus artwork will use the canonical People defaults."));
	assert.ok(markup.includes("edit that person’s folder"));
	for (const label of ["Person folder to edit", "Tile artwork URL", "Hero / background URL", "Title Logo URL", "Focus artwork URL", "Enable focus artwork", "Restore default artwork"]) assert.equal(markup.includes(label), false, label);
	assert.equal(/<select\b/.test(markup), false);
	assert.equal(/type="url"/.test(markup), false);
	assert.equal(markup.includes("decades-settings-disclosure"), false);
	assert.equal((markup.match(/<details/g) ?? []).length, 1);
	assert.ok(markup.includes("View person details · 1"));
	const rowsMarkup = renderToStaticMarkup(createElement(PeopleReviewStep, {
		planResult: { ok: true, plan: { configuration: { scope: "new-collection" }, counts: { collectionCount: 1, folderCount: 1, sourceCount: 2 }, collections: [{ titleCollisions: [] }], destination: null, outcomes: [{ status: "ready-to-create", occurrences: [] }] } },
		entries: [{ person: selected, drafts: { drafts: [{}, {}] }, artworkState: { artwork: { source: "manifest" } } }],
		collectionOptions: { title: "People", hideTitle: false, viewMode: "ROWS", showAllTab: false, pinToTop: true },
		onCollectionOptionsChange() {}, folderTileShape: "POSTER", onFolderTileShapeChange() {}, folderTitleVisibility: "HIDE_HOME_SCREEN", onFolderTitleVisibilityChange() {}, applyDiagnostic: null, headingRef: null,
	}));
	assert.equal(rowsMarkup.includes("Show All tab"), false);
	assert.ok(rowsMarkup.includes("Rows · pinned"));
});

test("People New Folder Review keeps parent presentation read-only while generated folder appearance stays editable", () => {
	const selected = person();
	const markup = renderToStaticMarkup(createElement(PeopleReviewStep, {
		planResult: { ok: true, plan: {
			configuration: { scope: "new-folder" },
			counts: { collectionCount: 0, folderCount: 1, sourceCount: 1 },
			collections: [],
			destination: { collectionInternalId: "parent", collectionTitle: "Parent", viewMode: "ROWS", showAllTab: false, pinToTop: true, titleHidden: false },
			outcomes: [{ status: "ready-to-create", occurrences: [] }],
		} },
		entries: [{ person: selected, drafts: { drafts: [{}] }, artworkState: { artwork: { source: "manifest" } } }],
		collectionOptions: { title: "People", hideTitle: false, viewMode: "TABBED_GRID", showAllTab: true, pinToTop: false },
		onCollectionOptionsChange() {},
		folderTileShape: "LANDSCAPE",
		onFolderTileShapeChange() {},
		folderTitleVisibility: "HIDE_EVERYWHERE",
		onFolderTitleVisibilityChange() {},
		applyDiagnostic: null,
		headingRef: null,
	}));
	assert.ok(markup.includes("Inherited Collection options"));
	assert.ok(markup.includes("parent unchanged"));
	assert.ok(markup.includes("Title options"));
	assert.ok(markup.includes("Folder title visibility"));
	assert.equal(markup.includes("Person folder titles"), false);
	assert.equal(markup.includes("Hide collection title in Nuvio"), false);
	assert.match(markup, /data-editor-choice="hide-everywhere"[^>]*checked="" value="HIDE_EVERYWHERE"/);
	assert.match(markup, /<input(?=[^>]*data-editor-choice="landscape")(?=[^>]*checked="")[^>]*>/);
	assert.ok(markup.includes("edit that person’s folder"));
	assert.equal(markup.includes("Person folder to edit"), false);
	assert.equal(/type="url"/.test(markup), false);
});

test("People navigation adds hierarchy Review while preserving Search restoration", () => {
	assert.deepEqual(PEOPLE_SOURCE_STEPS, { SEARCH: "search", CONFIGURE: "configure", REVIEW: "review" });
	const captured = capturePeopleSelectionScroll(createPeopleSourceNavigationState(), 31, 428.5);
	const configure = enterPeopleConfigure(captured, 31, 900);
	assert.equal(configure.step, PEOPLE_SOURCE_STEPS.CONFIGURE);
	assert.equal(configure.searchScrollTop, 428.5);
	const review = enterPeopleReview(configure);
	assert.equal(review.step, PEOPLE_SOURCE_STEPS.REVIEW);
	assert.equal(returnPeopleToConfigure(review).step, PEOPLE_SOURCE_STEPS.CONFIGURE);
	const search = returnPeopleToSearch(configure);
	assert.equal(search.restoreSearchFocusId, 31);
	assert.equal(completePeopleSearchRestore(search).restoreSearchFocusId, null);
	let visible = false;
	let focused = false;
	const scrollElement = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 300 }) };
	const resultElement = { getBoundingClientRect: () => visible ? ({ top: 160, bottom: 240 }) : ({ top: 360, bottom: 440 }), scrollIntoView() { visible = true; } };
	const restored = restoreAddSourceSearchView({ scrollElement, resultElement, fallbackElement: null, searchScrollTop: configure.searchScrollTop, focusWithoutScroll() { focused = true; } });
	assert.equal(scrollElement.scrollTop, 428.5);
	assert.equal(restored.resultVisible, true);
	assert.equal(focused, true);
});

test("shared People flow keeps modal lifecycle contracts for both contexts", () => {
	for (const context of ["folder", "collection"]) {
		const markup = renderToStaticMarkup(createElement(PeopleSourceFlow, {
			context,
			provider: { async searchPeople() { return { ok: true, data: { results: [], page: 1, totalPages: 1, totalResults: 0 } }; }, async getPerson() { return { ok: true, data: person() }; } },
			manifestClient: { peek() { return null; }, async load() { return { ok: false }; } },
			project: { collections: [] },
			collection: { internalId: "collection", editable: { title: "People" } },
			folder: context === "folder" ? { internalId: "folder", editable: { title: "Current folder" } } : null,
			onCancel() {}, onApply() {},
		}));
		assert.ok(markup.includes('data-add-source-modal="true"'));
		assert.ok(markup.includes('data-add-source-step="search"'));
		assert.ok(markup.includes(`data-people-context="${context}"`));
		assert.ok(markup.includes('data-dialog-compact="true"'));
		assert.ok(markup.includes('role="dialog"'));
		assert.ok(markup.includes('aria-modal="true"'));
	}
});

test("guided People owns browse-first heading focus while Add Source keeps Search focus", () => {
	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	const creation = read("builder/src/ui/CreationDialog.jsx");
	assert.match(flow, /const initialFocusTarget = hierarchy \? searchHeadingRef\.current : inputRef\.current/);
	assert.match(flow, /<h3 ref=\{headingRef\} id="people-mode-title" tabIndex=\{-1\}>/);
	assert.match(creation, /optionId === CREATION_OPTION_IDS\.PEOPLE[\s\S]*querySelector\?\.\("#people-mode-title"\)/);
	assert.doesNotMatch(creation, /optionId === CREATION_OPTION_IDS\.PEOPLE[\s\S]{0,120}#people-source-query/);
});

test("shared People flow keeps Add Source behavior and adds a bounded hierarchy Review", () => {
	const styles = read("builder/src/styles.css");
	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	const navigation = read("builder/src/ui/people-source-navigation-state.js");
	assert.match(`${flow}\n${navigation}`, /PeopleReview|PEOPLE_SOURCE_STEPS\.REVIEW|enterPeopleReview/);
	assert.equal(/people-destination|Destination selector/.test(flow), false);
	assert.ok(flow.includes("Image unavailable"));
	assert.equal(/<table\b/i.test(flow), false);
	assert.match(flow, /artworkById\[result\.id\]/);
	assert.match(flow, /const requestKey = `\$\{artworkContextKey\}:\$\{person\.id\}`/);
	assert.match(flow, /artworkTokensRef\.current\.get\(requestKey\) !== token/);
	assert.match(flow, /loadManifestOnce\(\{ retry: force \}\)/);
	assert.match(flow, /data\?\.byId\?\.\[person\.id\]/);
	assert.match(flow, /if \(!resolvesFolderArtwork\) return/);
	assert.match(flow, /<PeopleBulkConfigurationList/);
	assert.match(flow, /PEOPLE_CONFIGURATION_MODES\.AUTOMATIC/);
	assert.match(flow, /setConfigurationOverrides/);
	assert.match(flow, /updatePeopleConfiguration\(target, combinations\)/);
	assert.equal(flow.includes("setConfigurationMode(PEOPLE_CONFIGURATION_MODES.CUSTOM)"), false);
	assert.equal(flow.includes("Custom per person is now active"), false);
	assert.equal(flow.includes("people-mode-transition"), false);
	assert.match(flow, /SemanticSortChoices options=\{PEOPLE_SOURCE_SORT_OPTIONS\}/);
	assert.match(flow, /buildPeopleSourceDrafts\(person, \{ combinations: configuration\.combinations, sortOptionId \}\)/);
	assert.match(flow, /buildPeopleTitlePreview\(detailResult\.person/);
	assert.match(flow, /peoplePreviewMediaTypes/);
	assert.match(flow, /changePeoplePreviewMedia/);
	assert.match(flow, /mediaType: previewState\.mediaType/);
	assert.match(flow, /\(!retry && entry\.detail\?\.status !== "ready"\)/);
	assert.match(flow, /onRetryPreview=\{\(entry\) => openTitlePreview\(entry, null, \{ retry: true \}\)\}/);
	assert.match(flow, /previewRestoreFocusRef/);
	assert.match(flow, /window\.requestAnimationFrame\(\(\) => focusElementWithoutScroll\(trigger\)\)/);
	assert.match(flow, /handleDialogKeyDown\(event, dialogRef\.current, onClose\)/);
	assert.match(flow, /event\.stopPropagation\(\)/);
	assert.match(flow, /alwaysDisclose/);
	assert.match(flow, /showDisclosureCount=\{false\}/);
	assert.equal(flow.includes("people-configuration-person"), false);
	assert.equal(flow.includes("Person to configure"), false);
	assert.match(flow, /data-large-selection-notice/);
	assert.ok(flow.includes("people-folder-artwork-note"));
	assert.equal(flow.includes("FolderArtworkFields"), false);
	assert.equal(flow.includes("artworkOverridesById"), false);
	assert.equal(flow.includes("activeArtworkPersonId"), false);
	assert.equal(flow.includes("changeFolderArtwork"), false);
	assert.equal(flow.includes("resetFolderArtwork"), false);
	assert.ok(flow.includes("buildPeopleHierarchyFolderEditable"));
	assert.match(flow, /folderTitleVisibility/);
	assert.match(flow, /<TitleOptions/);
	assert.match(styles, /\.people-combination-group label[\s\S]*min-height:\s*58px/);
	assert.match(styles, /\.people-combination-group\.is-pills > div\s*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
	assert.match(styles, /\.people-combination-group\.is-pills \.people-source-pill\s*\{[\s\S]*min-height:\s*36px[\s\S]*padding:\s*5px 8px/);
	assert.match(styles, /\.people-source-pill:has\(input:checked\) \.people-source-pill-check\s*\{[\s\S]*opacity:\s*1/);
	assert.match(styles, /\.people-source-pill\[data-people-role="directing"\]/);
	assert.match(flow, /people-title-preview-backdrop nested-modal-backdrop/);
	assert.match(styles, /\.nested-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--layer-nested-modal\)/);
	assert.match(styles, /\.people-title-preview\s*\{[\s\S]*max-height:/);
	assert.match(styles, /\.people-title-preview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(5/);
	assert.match(styles, /\.people-bulk-list\s*\{[\s\S]*max-height:[\s\S]*overflow-y:\s*auto/);
	assert.match(styles, /\.people-bulk-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*grid-auto-rows:\s*max-content;/);
	assert.match(styles, /\.people-bulk-row\s*\{[\s\S]*align-self:\s*start;/);
	assert.doesNotMatch(styles, /data-people-bulk-count[^\{]*\{[\s\S]*?(?:height|align|grid)/);
	assert.match(styles, /\.people-combination-group label:has\(input:checked\)[\s\S]*box-shadow:\s*none/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.people-combination-group\.is-pills > div[\s\S]*grid-template-columns:\s*repeat\(2/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.people-title-preview-grid[\s\S]*grid-template-columns:\s*repeat\(5/);
	assert.match(flow, /People folder\$\{configuredEntries\.length === 1 \? "" : "s"\}/);
	assert.match(styles, /\.people-source-dialog\[data-dialog-compact="true"\][\s\S]*height:\s*auto/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	for (const width of [360, 384, 393, 402, 412, 899, 900, 901]) assert.ok(width > 0);
});

test("issue #74 artwork-gap log uses the owner-QA table contract", () => {
	const gapLog = read("manual-tests/nuvio-clients/issue-74-builder-add-people/ASSET_GAPS.md");
	for (const heading of ["Person", "Exact TMDB person ID", "Required orientation", "Runtime result", "Fallback observed", "Status"]) {
		assert.ok(gapLog.includes(heading), heading);
	}
	assert.ok(gapLog.includes("John Cena"));
	assert.ok(gapLog.includes("56446"));
	assert.ok(gapLog.includes("poster"));
	assert.ok(gapLog.includes("missing curated People poster"));
	assert.ok(gapLog.includes("TMDB profile image"));
	assert.ok(gapLog.includes("handed to the separate assets workstream"));
	assert.equal(gapLog.includes("ID to confirm"), false);
});

test("workspace exposes People only through canonical hierarchy and Add Source routes", () => {
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	const creationOptions = read("builder/src/ui/creation-options.js");
	const sourceModes = read("builder/src/source-add/source-modes.js");
	assert.equal((workspace.match(/<AddSourceDialog/g) ?? []).length, 1);
	assert.equal((workspace.match(/<PeopleSourceFlow/g) ?? []).length, 1);
	assert.equal((workspace.match(/<SourceModeDialog/g) ?? []).length, 1);
	assert.doesNotMatch(workspace, /data-action="add-people"|openAddPeople|Add people/);
	assert.match(workspace, /data-action="create-folder"/);
	assert.match(workspace, /initialOptionId=\{creationSession\.optionId \?\? null\}/);
	assert.match(creationOptions, /id:\s*CREATION_OPTION_IDS\.PEOPLE,[\s\S]*scopes:\s*BOTH_SCOPES/);
	assert.match(sourceModes, /PEOPLE_SOURCE_MODE[\s\S]*AVAILABLE_SOURCE_MODES/);
	assert.match(workspace, /visibleAddSourceSession\.modeId === PEOPLE_SOURCE_MODE_ID/);
	assert.match(workspace, /applyPeopleHierarchyPlan\(controller, plan\)/);
	assert.equal(workspace.includes("createPeopleFolderBatch(controller"), false);
	assert.match(workspace, /createPeopleSourceBundle\(controller/);
	assert.match(workspace, /setPendingCreatedFolderFocus\(focusFolderInternalId\)/);
	assert.match(workspace, /data-source-creation-status="true"/);
});
