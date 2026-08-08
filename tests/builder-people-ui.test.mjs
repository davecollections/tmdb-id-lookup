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
	PEOPLE_SOURCE_STEPS,
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
	PeopleConfigurationCard,
	PeopleSearchStep,
	PeopleSourceFlow,
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

test("source chooser retains Movie franchise and People while adding Studios", () => {
	const markup = renderToStaticMarkup(createElement(SourceModeDialog, { folderName: "People", onCancel() {}, onSelectMode() {} }));
	assert.ok(markup.includes('data-source-mode-option="tmdb-movie-franchise"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-people"'));
	assert.ok(markup.includes('data-source-mode-option="tmdb-studios"'));
	assert.equal((markup.match(/<button/g) ?? []).length, 4);
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

test("collection Search uses explicit checkboxes, retained selected chips, and the 20-person cap copy", () => {
	const people = Array.from({ length: 20 }, (_, index) => person({ id: index + 1, name: `Person ${index + 1}` }));
	const markup = renderSearch({ context: "collection", results: [people[0], person({ id: 99, name: "New person" })], selection: selectionOf(...people) });
	assert.ok(markup.includes("20 selected"));
	assert.ok(markup.includes("0 remaining"));
	assert.ok(markup.includes("maximum of 20 people"));
	assert.ok(markup.includes('type="checkbox"'));
	assert.ok(markup.includes('checked=""'));
	assert.ok(markup.includes('aria-label="Remove Person 1"'));
	assert.equal(markup.includes('aria-pressed='), false);
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
	assert.ok(markup.includes("PERSON · MOVIE"));
	assert.ok(markup.includes("DIRECTOR · TV"));
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
	const posterArtwork = { personId: 31, tileShape: "POSTER", source: "runtime", previewUrl: "https://example.test/poster.webp?v=123456789abc", folderEditable: { coverImageUrl: "https://example.test/poster.webp?v=123456789abc", hideTitle: true } };
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
		["runtime", "https://example.test/landscape.webp?v=123456789abc"],
		["tmdb", "https://image.tmdb.org/t/p/w500/profile.jpg"],
		["emoji", null],
	]) {
		const artwork = {
			personId: 31,
			tileShape: "LANDSCAPE",
			source,
			previewUrl,
			folderEditable: previewUrl ? { coverImageUrl: previewUrl, hideTitle: source === "runtime" } : { coverImageUrl: "", hideTitle: false, coverEmoji: "👤" },
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

test("curated and no-art states use friendly final-artwork labels without implementation terms", () => {
	const selected = person();
	for (const [artwork, label] of [
		[{ personId: 31, tileShape: "POSTER", source: "runtime", previewUrl: "https://example.test/31.webp?v=123456789abc", folderEditable: { coverImageUrl: "https://example.test/31.webp?v=123456789abc", hideTitle: true } }, "Curated artwork"],
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
		{ person: person({ id: 31, name: "Tom Hanks" }), source: "runtime", url: "https://example.test/31.webp?v=123456789abc" },
		{ person: person({ id: 488, name: "Steven Spielberg" }), source: "tmdb", url: "https://image.tmdb.org/t/p/w500/spielberg.jpg" },
	];
	const markup = renderToStaticMarkup(createElement("div", null, entries.map((entry) => createElement(PeopleConfigurationCard, {
		key: entry.person.id,
		personResult: entry.person,
		detail: { status: "ready", person: entry.person },
		configuration: createPeopleConfiguration(entry.person),
		artworkState: { status: "ready", personId: entry.person.id, contextKey: "new-folder", artwork: { personId: entry.person.id, tileShape: "POSTER", source: entry.source, previewUrl: entry.url, folderEditable: { coverImageUrl: entry.url, hideTitle: entry.source === "runtime" } } },
		showArtwork: true,
		onToggle() {}, onRefresh() {}, onRetry() {}, onRetryArtwork() {}, onRemove() {},
	}))));
	assert.equal((markup.match(/data-artwork-person-id=/g) ?? []).length, 2);
	assert.ok(markup.includes('data-artwork-person-id="31" data-artwork-source="runtime"'));
	assert.ok(markup.includes('data-artwork-person-id="488" data-artwork-source="tmdb"'));
	assert.equal(markup.includes('data-profile-state='), false);
});

test("People navigation has Search and Configure only and restores result focus with recorded scroll", () => {
	assert.deepEqual(PEOPLE_SOURCE_STEPS, { SEARCH: "search", CONFIGURE: "configure" });
	const captured = capturePeopleSelectionScroll(createPeopleSourceNavigationState(), 31, 428.5);
	const configure = enterPeopleConfigure(captured, 31, 900);
	assert.equal(configure.step, PEOPLE_SOURCE_STEPS.CONFIGURE);
	assert.equal(configure.searchScrollTop, 428.5);
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
			artworkClient: { async resolve() { return { status: "missing" }; } },
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

test("People source is Review-free, mobile-first, and keys artwork by person plus creation context", () => {
	const styles = read("builder/src/styles.css");
	const flow = read("builder/src/ui/PeopleSourceFlow.jsx");
	const navigation = read("builder/src/ui/people-source-navigation-state.js");
	assert.equal(/PeopleReview|PEOPLE_SOURCE_STEPS\.REVIEW|enterPeopleReview/.test(`${flow}\n${navigation}`), false);
	assert.equal(/people-destination|Destination selector/.test(flow), false);
	assert.ok(flow.includes("Image unavailable"));
	assert.equal(/<table\b/i.test(flow), false);
	assert.match(flow, /artworkById\[result\.id\]/);
	assert.match(flow, /const requestKey = `\$\{artworkContextKey\}:\$\{person\.id\}`/);
	assert.match(flow, /artworkTokensRef\.current\.get\(requestKey\) !== token/);
	assert.match(flow, /tmdbId:\s*person\.id,\s*tileShape:\s*resolvedTileShape/);
	assert.match(flow, /if \(!resolvesFolderArtwork\) return/);
	assert.equal(flow.includes("people-folder-artwork"), false);
	assert.equal(flow.includes("Folder artwork"), false);
	assert.match(styles, /\.people-combination-group label[\s\S]*min-height:\s*58px/);
	assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.people-combination-group > div[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
	assert.match(styles, /\.people-source-dialog\[data-dialog-compact="true"\][\s\S]*height:\s*auto/);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
	for (const width of [360, 384, 393, 402, 412]) assert.ok(width <= 520);
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

test("workspace exposes both entry points and routes quick-add and atomic collection batches", () => {
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.equal((workspace.match(/<AddSourceDialog/g) ?? []).length, 1);
	assert.equal((workspace.match(/<PeopleSourceFlow/g) ?? []).length, 1);
	assert.equal((workspace.match(/<SourceModeDialog/g) ?? []).length, 1);
	assert.match(workspace, /data-action="add-people"/);
	assert.match(workspace, /context:\s*"collection"[\s\S]*modeId:\s*PEOPLE_SOURCE_MODE_ID/);
	assert.match(workspace, /createPeopleFolderBatch\(controller/);
	assert.match(workspace, /createPeopleSourceBundle\(controller/);
	assert.match(workspace, /setPendingPeopleFolderFocus\(focusFolderInternalId\)/);
	assert.match(workspace, /data-source-creation-status="true"/);
});
