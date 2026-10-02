import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";
import { createReviewClient } from "./builder-trakt-creation-mounted.jsx";

// Inspect computed CSS, including all four border styles: source-token checks alone
// cannot detect a more-specific family border shorthand overriding exclusion.
export async function assertSelectionAppearance(node, kind, { wait, forcedColors = false }) {
	if (!node) throw new Error(`Missing ${kind} choice`);
	const style = getComputedStyle(node);
	if (!forcedColors) {
		const expected = { neutral: "rgba(11, 35, 48, 0.72)", include: "rgba(69, 176, 119, 0.14)", multiple: "rgba(69, 176, 119, 0.14)", single: "rgba(1, 180, 228, 0.12)", exclude: "rgba(221, 102, 99, 0.13)" }[kind];
		await wait(() => getComputedStyle(node).backgroundColor === expected, { label: `${kind} selected colour`, timeoutMs: 2000 });
	} else {
		const inset = getComputedStyle(node, "::after");
		if (inset.content !== '""' || inset.borderTopStyle !== "solid") throw new Error(`${kind} forced-colour selected inset missing`);
	}
	for (const edge of ["Top", "Right", "Bottom", "Left"]) {
		if (style[`border${edge}Style`] !== (kind === "exclude" ? "dashed" : "solid")) throw new Error(`${kind} ${edge} border is ${style[`border${edge}Style`]}`);
	}
}

// Task-specific assertions in the existing source-edit browser harness. The real
// workspace uses live TMDB providers. Trakt alone uses the owner-approved,
// side-effect-free review client for deterministic mechanics, never live evidence.
export async function runGuidedPresentationScenario(helpers, { family, forcedColors = false, capture = false, semanticOnly = false, nameRecovery = null, meaning = false, enlargedText = false }) {
	const { createController, clickAndSettle: click, afterCommittedEffects: settle, setInputValue, setTextareaValue, setSelectValue, waitForMountedCondition: wait, serializedValue } = helpers;
	const check = (value, message) => { if (!value) throw new Error(`${family}/${innerWidth}: ${message}`); return value; };
	const visible = (node) => Boolean(node?.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]'));
	const originalFontSize = document.documentElement.style.fontSize;
	if (nameRecovery?.enlargedText || enlargedText) document.documentElement.style.fontSize = "24px";
	const controller = createController(), before = serializedValue(controller), revision = controller.getState().revision;
	const traktClient = family === "trakt-lists" ? createReviewClient() : null;
	const originalFetch = window.fetch, traktRequests = [];
	if (traktClient) window.fetch = (request) => {
		traktRequests.push(String(request?.url ?? request));
		throw new Error("Uninjected request in guided Trakt mechanics");
	};
	function traktEvidence() {
		if (!traktClient) return {};
		check(traktRequests.length === 0, "Trakt mechanics attempted an external request");
		check(JSON.stringify(traktClient.calls) === JSON.stringify([{ kind: "resolve", input: "101", refresh: false }, { kind: "media", id: 101 }]), "Trakt requires only one resolution and one selected-list media check");
		return { trakt: { calls: [...traktClient.calls], requests: traktRequests.length, selectedId: 101, media: "MOVIE" } };
	}
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	function Workspace() {
		const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
		return createElement(BuilderWorkspace, { controller, state, ...(traktClient ? { traktClient } : {}) });
	}
	const evidence = { family, width: innerWidth, forcedColors, stages: [], filters: [], palettes: [], screenshots: [], noMutation: false, focusRestored: false, keyboard: false };
    async function saveShot(name) {
        if (!capture || forcedColors || !globalThis.capture204Preview) return;
        await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `pass-c-${family}-${innerWidth}-${name}` })); });
    }
	async function key(value) {
		await new Promise(resolve => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key: value })); });
		await settle();
	}
	async function keyboardToggle(row) {
		if (nameRecovery) return;
		const control = row.querySelector("input") ?? row;
		const checked = () => control.tagName === "INPUT" ? control.checked : control.getAttribute("aria-pressed") === "true";
		const before = checked(), rect = dialog().getBoundingClientRect();
		control.focus({ preventScroll: true }); await key(" ");
		check(checked() !== before, "Space did not toggle native selection");
		await key(" "); check(checked() === before, "Space did not restore native selection");
		check(dialog().getBoundingClientRect().top === rect.top && window.scrollY === 0, "keyboard moved outer surface");
		check(getComputedStyle(row).outlineStyle !== "none", "complete-control keyboard focus missing");
		evidence.keyboard = true;
	}
	const dialog = () => check([...document.querySelectorAll('.add-source-dialog[role="dialog"]')].find(visible), "active creation dialog");
	const button = (label, scope = dialog()) => check([...scope.querySelectorAll("button")].find(node => visible(node) && node.textContent.trim().replace(/^←\s*/, "") === label), `button ${label}`);
	const primary = () => check(dialog().querySelector("footer .editor-apply"), "primary action");
	async function next() {
		await wait(() => !primary().disabled, { label: `${family} stage ready`, timeoutMs: 30000 });
		await click(primary());
	}
	async function palette(node, kind) {
		check(node, `${kind} control`);
		await assertSelectionAppearance(node, kind, { wait, forcedColors });
		if (!forcedColors) check(getComputedStyle(node).boxShadow !== "none", `${kind} structural inset`);
		evidence.palettes.push(kind);
	}
	function selected(mode, scope = dialog()) {
		return [...scope.querySelectorAll(`[data-selection-mode="${mode}"]`)].filter(node => visible(node) && (node.matches('[data-selected="true"], [aria-pressed="true"], [aria-selected="true"], .is-selected') || node.querySelector(":scope > input:checked")));
	}
	async function stage(step, titlePart, shot) {
		await wait(() => dialog().querySelector(".creation-stage-intro .panel-kicker")?.textContent.match(new RegExp(`^Step ${step}(?: · |$)`)), { label: `${family} step ${step} ready`, timeoutMs: 30000 });
		await settle();
		const surface = dialog(), intro = check(surface.querySelector(".creation-stage-intro"), "shared stage intro");
        const heading = surface.querySelector("header h2")?.textContent;
        check(heading?.startsWith("Create with "), "persistent creation operation missing");
        if (evidence.operation) check(evidence.operation === heading, "operation changed between stages");
        evidence.operation = heading;
        const filters = surface.querySelector("details.genre-advanced-options");
        if (filters && !nameRecovery && !semanticOnly && !meaning && !evidence.filters.length) {
            const summary = filters.querySelector(":scope > summary");
            check(!filters.open, "Filters should start collapsed");
            check(summary.querySelector("strong")?.textContent === "Filters", "Filters label missing");
            check(summary.querySelector("small")?.textContent === "Refine which titles are included.", "default Filters helper missing");
            summary.scrollIntoView({ block: "nearest" }); summary.focus({ preventScroll: true });
            if (family === "decades") await saveShot("filters-default");
            await key("Enter"); check(filters.open && document.activeElement === summary, "native Filters keyboard expansion/focus");
            const content = filters.querySelector(".genre-advanced-content");
            check(getComputedStyle(filters).borderTopStyle !== "none" && getComputedStyle(content).borderTopStyle !== "none", "Filters boundaries missing");
            const votes = filters.querySelector('[id="discover-field-voteCountGte"]');
            const rating = filters.querySelector('[id="discover-field-voteAverageGte"]');
            const initial = [votes.value, rating.value];
            async function setField(node, value) { await act(async () => { setInputValue(node, value); await settle(); }); }
            await setField(votes, "100"); check(summary.textContent.includes("1 applied"), "one active Filters group");
            await setField(rating, "7"); check(summary.textContent.includes("2 applied"), "two active Filters groups");
            summary.focus({ preventScroll: true }); await key("Enter");
            summary.scrollIntoView({ block: "nearest" }); await settle();
            if (family === "decades") await saveShot("filters-applied");
            await key("Enter");
            if (family === "decades") {
                const scrollOwner = surface.querySelector(".add-source-scroll");
                scrollOwner.scrollTop += summary.getBoundingClientRect().top - scrollOwner.getBoundingClientRect().top;
                await settle(); await saveShot("filters-expanded");
            }
            await setField(votes, initial[0]); await setField(rating, initial[1]);
            check(summary.textContent.includes("Refine which titles are included."), "clear Filters helper recovery");
            summary.focus({ preventScroll: true }); await key("Enter");
            check(!filters.open && document.activeElement === summary, "Filters keyboard collapse/focus");
            evidence.filters.push({ helper: true, semanticCounts: true, clearing: true, keyboard: true, boundaries: true });
            if (family === "decades") {
                const preview = surface.querySelector('.decades-preview-catalogue');
                check(preview && !preview.querySelector("summary") && preview.querySelector('button[aria-haspopup="dialog"]')?.textContent === "Preview titles", "direct Decades Preview titles");
                const scrollOwner = surface.querySelector(".add-source-scroll");
                scrollOwner.scrollTop += preview.getBoundingClientRect().top - scrollOwner.getBoundingClientRect().top;
                await settle(); await saveShot("preview-actions");
            }
        }
		check(intro.querySelector(".panel-kicker").textContent.match(new RegExp(`^Step ${step}(?: · |$)`)), `step ${step} phase`);
		check(intro.querySelector("h3").textContent.includes(titlePart), `title ${titlePart}`);
		check(getComputedStyle(intro).borderTopWidth === "0px", "stage intro acquired a card border");
		const owner = surface.querySelector(".add-source-scroll");
		if (owner) owner.scrollTop = 0;
		await settle();
		check(document.documentElement.scrollWidth <= innerWidth + 1 && surface.scrollWidth <= surface.clientWidth + 1, "horizontal overflow");
		const within = node => { const r = node.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; };
		check(within(button("Close")) && within(button("Back")) && within(primary()), "fixed actions out of view");
		check(window.scrollY === 0 && surface.scrollTop === 0, "outer document/dialog scrolled");
		const owners = [...surface.querySelectorAll("*")].filter(node => visible(node) && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2);
		check(owners.length <= 1, `competing scroll owners: ${owners.map(node => node.className).join(" / ")}`);
		for (const toggle of surface.querySelectorAll('[role="switch"]')) check(!toggle.closest("[data-selection-mode]"), "independent boolean gained selection semantics");
		const navigation = {
			decades: { 1: "Configure", 2: "Appearance" },
			people: { 1: "Configure", 2: "Appearance" },
			franchises: { 1: "Appearance" },
			"tmdb-lists": { 1: "Names", 2: "Appearance" },
			"trakt-lists": { 1: "Media", 2: "Names", 3: "Appearance" },
			studios: { 1: "Configure", 2: "Appearance" },
			networks: { 1: "Configure", 2: "Appearance" },
			genres: { 1: "Configure", 2: "Structure", 3: "Appearance" },
			"streaming-services": { 1: titlePart === "Choose regions" ? "Services" : "Configure", 2: "Appearance" },
			"advanced-discover": { 1: "Appearance", 2: "Artwork", 3: "Review" },
		}[family]?.[step];
		if (navigation) check(primary().textContent === `Continue to ${navigation}`, "navigation does not identify the actual next stage");
		if (/Appearance/.test(intro.querySelector("h3").textContent)) {
			const name = surface.querySelector('input[data-required-name]');
			const visibility = surface.querySelector('.review-title-options');
			const layout = surface.querySelector('.hierarchy-collection-presentation-controls');
			const pin = [...surface.querySelectorAll('[role="switch"]')].find(node => /Pin .*collection/.test(node.closest("label")?.textContent));
			const shape = surface.querySelector('.editor-shape-choice-grid');
			const groups = [name, visibility, layout, pin, shape].filter(Boolean);
			for (let index = 1; index < groups.length; index++) check(Boolean(groups[index - 1].compareDocumentPosition(groups[index]) & Node.DOCUMENT_POSITION_FOLLOWING), "Appearance controls are out of semantic order");
			if (family === "decades") check(shape && !shape.closest("details"), "basic Decades shape is hidden in disclosure");
			if (["studios", "franchises", "streaming-services"].includes(family)) check(!shape, "unsupported shape selector appeared");
			if (["people", "networks"].includes(family)) check(!shape.querySelector('[value="SQUARE"]'), "unsupported Square shape appeared");
		}
		evidence.stages.push({ step, title: intro.querySelector("h3").textContent, scrollOwners: owners.length });
		if (capture && globalThis.capture204Preview && (semanticOnly || ["appearance", "review"].includes(shot))) {
			if (["exclusions", "semantic-include"].includes(shot) && owner) {
				const genres = surface.querySelector(".discover-genres");
				owner.scrollTop += genres.getBoundingClientRect().top - owner.getBoundingClientRect().top;
				await settle();
			}
			await wait(() => [...surface.querySelectorAll("img")].filter(node => visible(node) && within(node)).every(node => node.complete), { label: "visible screenshot artwork settled", timeoutMs: 15000 });
			const name = `pass-c-${family}-${innerWidth}-${shot}${forcedColors ? "-forced" : ""}`;
			await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name })); });
			evidence.screenshots.push(name + ".png");
		}
	}
	async function input(selector, value) {
		const node = check(dialog().querySelector(selector), selector);
		await act(async () => { (node.tagName === "TEXTAREA" ? setTextareaValue : node.tagName === "SELECT" ? setSelectValue : setInputValue)(node, value); await settle(); });
	}
	try {
		await act(async () => { root.render(createElement(Workspace)); await settle(); });
		const trigger = check([...host.querySelectorAll('[data-action="create-collection"]')].find(visible), "New collection trigger");
		await click(trigger);
		await click(check(dialog().querySelector(`[data-creation-option="${family}"]`), "family launcher"));
		await wait(() => dialog().querySelector(".creation-stage-intro"), { label: `${family} stage intro`, timeoutMs: 30000 });
		check(document.activeElement?.type !== "search", "browse Search auto-focused");
		if (family === "decades") {
			await click(dialog().querySelector('[data-decade-preset="1980s"]'));
			await click(dialog().querySelector('[data-decade-preset="2000s"]'));
			await keyboardToggle(dialog().querySelector('[data-decade-preset="2000s"]'));
			await palette(selected("multiple")[0], "multiple"); await stage(1, "Choose decades", "select");
			await next(); await stage(2, "Configure Decades", "configure");
			await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single");
			await palette(dialog().querySelector('.decades-content-grid [aria-pressed="true"]'), "multiple");
			await next(); await stage(3, "Appearance", "review"); await palette(selected("single")[0], "single");
		} else if (family === "genres") {
			for (const row of [...dialog().querySelectorAll(".genre-catalogue-choice")].slice(0, 2)) await click(row);
			await palette(selected("multiple")[0], "multiple"); await stage(1, "Select Genres", "select");
			await next(); await stage(2, "Configure Genres", "configure"); await palette(selected("multiple")[0], "multiple");
			await next(); await stage(3, "Structure", "structure"); await palette(selected("single")[0], "single");
			if (meaning) await click(check(dialog().querySelector('input[value="separate-media-collections"]'), "split Genre structure"));
			if (nameRecovery?.structure) await click(check(dialog().querySelector(`input[value="${nameRecovery.structure}"]`), "Genre structure"));
			await next(); await stage(4, "Appearance", "appearance");
		} else if (family === "streaming-services") {
			await click(await wait(() => dialog().querySelector('[data-streaming-region="AU"]'), { label: "live AU region", timeoutMs: 30000 }));
			await palette(selected("multiple")[0], "multiple"); await stage(1, "Choose regions", "regions");
			await next(); await stage(1, "Choose Streaming services", "providers");
			const row = await wait(() => dialog().querySelector(".streaming-provider-selectable"), { label: "live Streaming provider", timeoutMs: 30000 });
			await click(row);
			if (nameRecovery) await click(check(dialog().querySelectorAll(".streaming-provider-selectable")[1], "second live Streaming provider"));
			await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single");
			await next(); await stage(2, "Configure Streaming services", "configure");
			await next(); await stage(3, "Appearance", "appearance");
		} else if (family === "advanced-discover") {
			await stage(1, "Filters", "filters"); await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single");
			const genres = check(dialog().querySelector(".discover-genres"), "Discover genre group");
			await palette(genres.querySelector('[data-mode="include"]'), "include");
			if (!forcedColors) await assertSelectionAppearance(genres.querySelector('[data-mode="exclude"]'), "neutral", { wait });
			await palette(genres.querySelector('.discover-operator [aria-pressed="true"]'), "single");
			const choices = genres.querySelectorAll(".discover-genre-pills button");
			await click(choices[0]); await palette(choices[0], "multiple");
			await keyboardToggle(choices[0]);
			await click(genres.querySelector('[data-mode="exclude"]'));
			await palette(genres.querySelector('[data-mode="exclude"]'), "exclude");
			await click(choices[1]); await palette(choices[1], "exclude");
			await stage(1, "Filters", "exclusions");
			await click(genres.querySelector('[data-mode="include"]'));
			await palette(genres.querySelector('[data-mode="include"]'), "include");
			if (semanticOnly) await stage(1, "Filters", "semantic-include");
			if (!semanticOnly) {
			await next(); await stage(2, "Appearance", "appearance");
			if (!nameRecovery) { await next(); await stage(3, "Artwork", "artwork"); await palette(selected("single")[0], "single");
			await next(); await stage(4, "Review", "review"); }
			}
		} else if (family === "tmdb-lists") {
			await stage(1, "TMDB lists", "select");
			await input("textarea", "5916"); await click(button("Resolve lists"));
			await wait(() => dialog().querySelector(".tmdb-list-selected") || !primary().disabled, { label: "live public TMDB list resolution", timeoutMs: 30000 });
			await next(); await stage(2, "Names", "names");
			if (!nameRecovery) { await next(); await stage(3, "Appearance", "review"); }
		} else if (family === "trakt-lists") {
			check(traktClient.calls.length === 0, "Trakt startup is request-free");
			await stage(1, "Trakt lists", "select");
			await click(button("URL / ID")); await input("#trakt-input", "101"); await click(button("Resolve lists"));
			await wait(() => dialog().querySelector(".trakt-selected strong")?.textContent === "Selected · 1" && !primary().disabled, { label: "deterministic Trakt list selected" });
			check(dialog().querySelector(".trakt-selected").textContent.includes("Movie-only list"), "resolved Trakt identity retained");
			check(traktClient.calls.length === 1 && traktClient.calls[0].kind === "resolve", "Select only resolves the explicit ID");
			await next(); await stage(2, "Media", "media");
			const media = await wait(() => {
				const card = dialog().querySelector('[data-trakt-media-id="101"]');
				return card?.querySelector(".trakt-list-identity small")?.textContent === "Trakt List 101 · Checked" && !primary().disabled && card;
			}, { label: "selected Trakt media known" });
			check(dialog().querySelectorAll("[data-trakt-media-id]").length === 1, "one selected Trakt list");
			check(media.querySelector('input[value="automatic"]').checked && media.textContent.includes("Will create: Movies"), "Automatic produces the known movie-only output");
			await next(); await stage(3, "Names", "names");
			check(dialog().querySelector('[data-trakt-review-id="101"] .trakt-output-statuses').textContent === "Ready: Movies", "Names retains the physical movie result");
			if (!nameRecovery) {
				await input("#trakt-collection-title", "Guided Trakt collection");
				await next(); await stage(4, "Appearance", "appearance");
			}
		} else if (family === "franchises" || family === "people") {
			const people = family === "people", id = people ? "31" : "645";
			await input('input[type="search"]', id);
			const row = await wait(() => dialog().querySelector(people ? `[data-tmdb-person-result="${id}"]` : `[data-tmdb-franchise-result="${id}"]`), { label: `live ${family} exact result`, timeoutMs: 30000 });
			await click(row); await wait(() => row.querySelector("input:checked"), { label: `${family} retained selection`, timeoutMs: 30000 });
			await keyboardToggle(row);
			await palette(row, "multiple"); await stage(1, people ? "People" : "Movie franchises", "select");
			await next(); await stage(2, people ? "People folder" : "Appearance", people ? "configure" : "review");
			if (people) { await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single"); await next(); await stage(3, "Appearance", "review"); }
		} else {
			const network = family === "networks", name = network ? "Networks" : "Studios";
			const row = await wait(() => dialog().querySelector(".studio-result-selectable"), { label: `production ${family} catalogue`, timeoutMs: 30000 });
			await click(row); await palette(row, "multiple"); await stage(1, name, "select");
			await next(); await stage(2, `Configure ${name}`, "configure"); await palette(selected("multiple")[0], "multiple");
			await next(); await stage(3, "Appearance", "appearance");
		}
		if (meaning) {
			check(dialog().querySelector("h2").textContent.startsWith("Create with "), "persistent create operation");
			for (const field of dialog().querySelectorAll('input[type="text"]')) {
				if (!field.disabled && !field.value && [...field.labels].some(label => /(?:collection|folder) name/i.test(label.textContent))) await input(`#${field.id}`, `Review ${field.labels[0].textContent.replace(/ name/i, "")}`);
			}
			if (family === "decades" || family === "genres") check(primary().textContent === "Create 2 collections", "split output action understates two Collections");
			else check(primary().textContent === "Create collection", "single Collection action");
			const allHelp = dialog().querySelector(".hierarchy-show-all-control") ?? [...dialog().querySelectorAll("p")].find(node => node.textContent.includes("two or more sources"));
			check(allHelp && /each folder with two or more sources.*All tab.*its sources/.test(allHelp.textContent), "All-tab source-within-folder meaning");
			check(!/atomically|one atomic Apply|canonical People defaults/.test(dialog().textContent), "normal flow jargon");
			check(dialog().textContent.includes("Collection layout"), "shared layout term");
			for (const label of dialog().querySelectorAll("label[for]")) check(document.getElementById(label.htmlFor), "label target missing");
			for (const node of dialog().querySelectorAll("[aria-describedby]")) for (const id of node.getAttribute("aria-describedby").split(/\s+/)) check(document.getElementById(id), "description target missing");
			check(!primary().disabled, "valid commit action unavailable");
			const rect = primary().getBoundingClientRect();
			check(rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1, "plural footer clipped");
			check(dialog().scrollWidth <= dialog().clientWidth + 1, "copy horizontal overflow");
			evidence.meaning = { action: primary().textContent, noOverflow: true, accessibleLabels: true, enlargedText };
		}
		if (nameRecovery) {
			function assertNameFeedback(field, kind, invalid) {
				check(field.getAttribute("aria-invalid") === (invalid ? "true" : null), `${kind} aria-invalid state`);
				const descriptions = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id));
				check(descriptions.length > 0 && descriptions.every(Boolean), `${kind} descriptions resolve`);
				const message = descriptions.find(node => node.classList.contains("editor-field-error"));
				const requiredMessage = family === "trakt-lists" ? `Enter a ${kind} name without spaces at either end.` : `Enter a ${kind} name.`;
				check(message && message.textContent === (invalid ? requiredMessage : ""), `${kind} plain-language field message`);
				check(message.getAttribute("role") === "alert" && message.getAttribute("aria-atomic") === "true", `${kind} announced field feedback`);
				check(document.querySelectorAll(`[id="${message.id}"]`).length === 1, `${kind} unique error association`);
				if (invalid && !forcedColors) {
					const style = getComputedStyle(field);
					check(["Top", "Right", "Bottom", "Left"].every(edge => style[`border${edge}Color`] === "rgb(255, 142, 134)"), `${kind} coral error border`);
					check(getComputedStyle(message).color === "rgb(255, 231, 228)" && !message.closest(".genre-advanced-errors"), `${kind} error rather than amber warning`);
					check(message.scrollWidth <= message.clientWidth + 1, `${kind} error wraps inside field`);
				}
				check(!/nonblank|trimmed string|invalid string|required scalar/i.test(dialog().textContent), "internal required-name diagnostic leaked into UI");
				const actionRect = primary().getBoundingClientRect();
				check(actionRect.top >= -1 && actionRect.bottom <= innerHeight + 1, "footer remains reachable");
			}
			const fields = () => [...dialog().querySelectorAll('input[type="text"]')].filter(node => [...node.labels].some(label => /collection name/i.test(label.textContent)));

			check(!dialog().querySelector('[data-required-name][aria-invalid="true"]'), "untouched names unexpectedly have errors");
			if (family === "tmdb-lists") {
				const folder = () => dialog().querySelector('input[data-required-name][id*="folder"]');
				const names = () => [fields()[0], folder()];
				const expected = ["Recovered tmdb-lists 1"], folderName = "Custom Folder 1";
				// Required names are intentionally on another stage from visibility.
				await next(); await stage(3, "Appearance", "appearance");
				await next(); await stage(2, "Names", "names");
				check(document.activeElement === fields()[0], "List attempted create focuses Collection first");
				assertNameFeedback(fields()[0], "collection", true); assertNameFeedback(folder(), "folder", false);
				await input(`#${fields()[0].id}`, expected[0]); await input(`#${folder().id}`, folderName);
				for (const field of names()) {
					const kind = field.id.includes("collection") ? "collection" : "folder", label = field.labels[0].textContent;
					field.focus(); await input(`#${field.id}`, "");
					check(field.isConnected && document.activeElement === field && field.labels[0].textContent === label && !field.disabled && !primary().disabled, "blank name stays editable and focused");
					assertNameFeedback(field, kind, true);
					await input(`#${field.id}`, "   "); assertNameFeedback(field, kind, true);
					await input(`#${field.id}`, kind === "collection" ? expected[0] : folderName);
					check(document.activeElement === field, "correcting name replaced focused input"); assertNameFeedback(field, kind, false);
				}
				await next();
				await click(dialog().querySelector('[data-editor-control="tmdbListPinToTop"]'));
				await click(dialog().querySelector('input[name="tmdb-list-folder-shape"][value="SQUARE"]'));
				await click(button("Back"));
				for (const field of names()) await input(`#${field.id}`, "   ");
				await click(button("Back")); await next();
				check(names().every(field => field.value === "   "), "invalid names survive Select/Names navigation");
				for (let index = 0; index < 2; index++) {
					await next(); await stage(3, "Appearance", "appearance");
					check(dialog().querySelector('[data-editor-control="tmdbListPinToTop"]').checked && dialog().querySelector('input[name="tmdb-list-folder-shape"][value="SQUARE"]').checked, "presentation survives cross-stage correction");
					primary().focus(); await key("Enter"); await stage(2, "Names", "names");
					check(document.activeElement === names()[index], "Enter focuses first invalid name in semantic order");
					check(controller.getState().revision === revision, "invalid attempt mutated project");
					for (const [pendingIndex, field] of names().entries()) assertNameFeedback(field, pendingIndex === 0 ? "collection" : "folder", pendingIndex >= index);
					await input(`#${names()[index].id}`, index === 0 ? expected[0] : folderName);
				}
				await click(button("Back")); await next();
				check(fields()[0].value === expected[0] && folder().value === folderName, "corrected names survive Back/return");
				await next(); await next();
				await wait(() => !document.querySelector('.add-source-dialog[role="dialog"]'), { label: "recovered List hierarchy created" });
				const created = controller.getState().project.collections[0];
				check(controller.getState().revision === revision + 1 && created.editable.title === expected[0] && created.folders[0].editable.title === folderName, "atomic corrected names output");
				check(created.editable.pinToTop && created.folders[0].editable.tileShape === "SQUARE", "retained presentation applied");
				return { family, width: innerWidth, enlargedText: Boolean(nameRecovery.enlargedText), structure: null, recoveredNames: expected, focusRetained: true, navigationRetained: true, noOverflow: true };
			}
			if (family === "trakt-lists") {
				// Trakt validates required hierarchy names before leaving Names.
				await next(); await stage(3, "Names", "names");
				check(document.activeElement === fields()[0], "Trakt first invalid Collection name focused");
				assertNameFeedback(fields()[0], "collection", true);
				assertNameFeedback(dialog().querySelector("#trakt-folder-101"), "folder", false);
				check(serializedValue(controller) === before && controller.getState().revision === revision, "invalid Trakt Names did not mutate");
				await input("#trakt-collection-title", "Recovered trakt-lists 1");
			}
			let folderInputs = [], folderNames = [];
			if (["streaming-services", "advanced-discover", "trakt-lists"].includes(family)) {
				if (family === "streaming-services") await click(check(dialog().querySelector(".streaming-folder-names summary"), "Folder name disclosure"));
				folderInputs = [...dialog().querySelectorAll('input[data-required-name]')].filter(node => node.id.includes("folder"));
				check(folderInputs.length === (family === "streaming-services" ? 2 : 1), "required Folder names");
				for (const [index, field] of folderInputs.entries()) {
					field.focus(); await input(`#${field.id}`, "");
					check(field.isConnected && document.activeElement === field && field.getAttribute("aria-invalid") === "true" && !primary().disabled, "Folder name recovery changed");
					assertNameFeedback(field, "folder", true);
					folderNames.push(`Custom Folder ${index + 1}`);
					await input(`#${field.id}`, folderNames[index]);
					assertNameFeedback(field, "folder", false);
				}
			}
			const pin = [...dialog().querySelectorAll('[role="switch"]')].find(node => node.closest("label")?.textContent.includes("Pin collection"));
			if (pin) await click(pin);
			const settings = [...dialog().querySelectorAll('input[type="radio"], [role="switch"]')].map(node => ({ node, checked: node.checked }));
			const originals = fields();
			check(originals.length === (nameRecovery.structure === "separate-media-collections" || family === "decades" ? 2 : 1), "one name control per Collection");
			const siblings = originals.map(node => node.value);
			const expected = originals.map((_, index) => `Recovered ${family} ${index + 1}`);
			for (let index = 0; index < originals.length; index++) {
				const field = originals[index], label = field.labels[0]?.textContent;
				field.focus(); await input(`#${field.id}`, "");
				check(field.isConnected && fields()[index] === field, "clearing a required name unmounted its correction control");
				check(document.activeElement === field && !field.disabled && field.labels[0]?.textContent === label, "name lost focus, accessibility or editability");
				check(folderInputs.every((node, sibling) => node.isConnected && node.value === folderNames[sibling]), "Collection validation removed sibling Folder fields or drafts");
				check(settings.every(({ node, checked }) => node.isConnected && node.checked === checked), "Collection validation reset presentation choices");
				check(field.value === "" && !primary().disabled, "blank draft / existing invalid state was not retained");
				assertNameFeedback(field, "collection", true);
				if (folderInputs.length) {
					await input(`#${folderInputs[0].id}`, "");
					assertNameFeedback(folderInputs[0], "folder", true);
					if (folderInputs[1]) assertNameFeedback(folderInputs[1], "folder", false);
					assertNameFeedback(field, "collection", true);
					await input(`#${folderInputs[0].id}`, folderNames[0]);
					assertNameFeedback(folderInputs[0], "folder", false);
					field.focus();
				}
				for (const sibling of originals.filter(node => node !== field)) assertNameFeedback(sibling, "collection", false);
				check(originals.every((node, sibling) => node.isConnected && (sibling === index || node.value === (sibling < index ? expected[sibling] : siblings[sibling]))), "sibling name changed");
				check(document.documentElement.scrollWidth <= innerWidth + 1 && dialog().scrollWidth <= dialog().clientWidth + 1, "invalid form horizontal overflow");
				await input(`#${field.id}`, "   ");
				check(field.isConnected && field.value === "   " && !primary().disabled, "whitespace name recovery changed");
				assertNameFeedback(field, "collection", true);
				await input(`#${field.id}`, expected[index]);
				check(field.isConnected && document.activeElement === field, "correcting name replaced the focused input");
				assertNameFeedback(field, "collection", false);
			}
			check(!primary().disabled, "corrected names did not restore valid creation");
			const allNames = [...originals, ...folderInputs], savedNames = allNames.map(node => node.value);
			for (const field of allNames) await input(`#${field.id}`, "   ");
			await click(button("Back")); await next();
			const restored = [...dialog().querySelectorAll('input[data-required-name]')];
			check(restored.length === allNames.length && restored.every(node => node.value === "   "), "invalid names cannot recover after Back/return");
			allNames.splice(0, allNames.length, ...restored);
			primary().focus(); await key("Enter");
			check(document.activeElement === allNames[0], "Enter did not focus the first invalid name");

			for (const [index, field] of allNames.entries()) {
				await next();
				check(document.activeElement === field, "attempt did not focus first invalid name in semantic order");
				check(controller.getState().revision === revision, "invalid attempt mutated project");
				for (const pending of allNames.slice(index)) check(pending.getAttribute("aria-invalid") === "true", "one correction cleared another error");
				await input(`#${field.id}`, savedNames[index]);
			}

			await click(button("Back"));
			if (family === "genres") {
				const structure = nameRecovery.structure ?? "genre-folders";
				const alternative = structure === "media-folders" ? "genre-folders" : "media-folders";
				await click(dialog().querySelector(`input[value="${alternative}"]`)); await next();
				check(fields().length === 1, "alternate structure duplicated name fields");
				await click(button("Back")); await click(dialog().querySelector(`input[value="${structure}"]`));
			}
			await next();
			check(fields().every((node, index) => node.value === expected[index]), "corrected names did not survive Back/return");
			await next();
			if (family === "advanced-discover") { await next(); await next(); }
			if (family === "trakt-lists") { await stage(4, "Appearance", "appearance"); await next(); }
			await wait(() => !document.querySelector('.add-source-dialog[role="dialog"]'), { label: "recovered hierarchy created" });
			check(JSON.stringify(controller.getState().project.collections.map(node => node.editable.title)) === JSON.stringify(expected), "created Collections did not use corrected names");
			check(controller.getState().revision === revision + 1, "creation was not atomic");
			if (folderNames.length) check(JSON.stringify(controller.getState().project.collections[0].folders.map(node => node.editable.title)) === JSON.stringify(folderNames), "created Folders lost custom names");
			return { family, width: innerWidth, enlargedText: Boolean(nameRecovery.enlargedText), structure: nameRecovery.structure ?? null, recoveredNames: expected, focusRetained: true, navigationRetained: true, noOverflow: true, ...traktEvidence() };
		}
		if (!semanticOnly) await click(button("Back"));
		check(dialog().querySelector(".creation-stage-intro"), "Back lost shared heading");
		const last = [...dialog().querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(visible).at(-1);
		last.focus({ preventScroll: true }); await key("Tab");
		check(document.activeElement === button("Back"), "Tab escaped the modal instead of wrapping");
		if (family === "decades") {
			await key("Escape");
		} else await click(button("Close"));
		await wait(() => !document.querySelector('.add-source-dialog[role="dialog"]'), { label: "creation closed" });
		check(document.activeElement === trigger, "Close did not restore exact launcher trigger");
		check(serializedValue(controller) === before && controller.getState().revision === revision, "presentation changed project");
		evidence.noMutation = true; evidence.focusRestored = true;
		return { ...evidence, ...traktEvidence() };
	} finally {
		await act(async () => { root.unmount(); await settle(); }); host.remove();
		document.documentElement.style.fontSize = originalFontSize;
		if (traktClient) window.fetch = originalFetch;
	}
}
