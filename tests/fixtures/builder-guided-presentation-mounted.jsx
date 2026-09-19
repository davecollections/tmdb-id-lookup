import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { BuilderWorkspace } from "../../builder/src/ui/BuilderWorkspace.jsx";

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
// workspace constructs its production providers; external data is never replaced.
export async function runGuidedPresentationScenario(helpers, { family, forcedColors = false, capture = false, semanticOnly = false }) {
	const { createController, clickAndSettle: click, afterCommittedEffects: settle, setInputValue, setTextareaValue, setSelectValue, waitForMountedCondition: wait, serializedValue } = helpers;
	const check = (value, message) => { if (!value) throw new Error(`${family}/${innerWidth}: ${message}`); return value; };
	const visible = (node) => Boolean(node?.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]'));
	const controller = createController(), before = serializedValue(controller), revision = controller.getState().revision;
	const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
	function Workspace() {
		const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
		return createElement(BuilderWorkspace, { controller, state });
	}
	const evidence = { family, width: innerWidth, forcedColors, stages: [], palettes: [], screenshots: [], noMutation: false, focusRestored: false, keyboard: false };
	async function key(value) {
		await new Promise(resolve => { window.__finish230Key = resolve; window.pressGuidedPresentationKey(JSON.stringify({ key: value })); });
		await settle();
	}
	async function keyboardToggle(row) {
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
		await wait(() => dialog().querySelector(".creation-stage-intro .panel-kicker")?.textContent.startsWith(`Step ${step} · `), { label: `${family} step ${step} ready`, timeoutMs: 30000 });
		await settle();
		const surface = dialog(), intro = check(surface.querySelector(".creation-stage-intro"), "shared stage intro");
		check(intro.querySelector(".panel-kicker").textContent.startsWith(`Step ${step} · `), `step ${step} phase`);
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
		evidence.stages.push({ step, title: intro.querySelector("h3").textContent, scrollOwners: owners.length });
		if (capture && globalThis.capture204Preview) {
			if (["exclusions", "semantic-include"].includes(shot) && owner) {
				const genres = surface.querySelector(".discover-genres");
				owner.scrollTop += genres.getBoundingClientRect().top - owner.getBoundingClientRect().top;
				await settle();
			}
			await wait(() => [...surface.querySelectorAll("img")].filter(node => visible(node) && within(node)).every(node => node.complete), { label: "visible screenshot artwork settled", timeoutMs: 15000 });
			const name = `issue-230-${family}-${innerWidth}-${shot}${forcedColors ? "-forced" : ""}`;
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
			await next(); await stage(3, "Review & Appearance", "review"); await palette(selected("single")[0], "single");
		} else if (family === "genres") {
			for (const row of [...dialog().querySelectorAll(".genre-catalogue-choice")].slice(0, 2)) await click(row);
			await palette(selected("multiple")[0], "multiple"); await stage(1, "Select Genres", "select");
			await next(); await stage(2, "Configure Genres", "configure"); await palette(selected("multiple")[0], "multiple");
			await next(); await stage(3, "Structure", "structure"); await palette(selected("single")[0], "single");
			await next(); await stage(4, "Appearance", "appearance");
		} else if (family === "streaming-services") {
			await click(await wait(() => dialog().querySelector('[data-streaming-region="AU"]'), { label: "live AU region", timeoutMs: 30000 }));
			await palette(selected("multiple")[0], "multiple"); await stage(1, "Choose regions", "regions");
			await next(); await stage(1, "Choose Streaming services", "providers");
			const row = await wait(() => dialog().querySelector(".streaming-provider-selectable"), { label: "live Streaming provider", timeoutMs: 30000 });
			await click(row); await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single");
			await next(); await stage(2, "Configure Streaming services", "configure");
			await next(); await stage(3, "Review", "review");
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
			await next(); await stage(3, "Artwork", "artwork"); await palette(selected("single")[0], "single");
			await next(); await stage(4, "Review", "review");
			}
		} else if (family === "tmdb-lists") {
			await stage(1, "TMDB lists", "select");
			await input("textarea", "5916"); await click(button("Resolve lists"));
			await wait(() => dialog().querySelector(".tmdb-list-selected") || !primary().disabled, { label: "live public TMDB list resolution", timeoutMs: 30000 });
			await next(); await stage(2, "Review & Appearance", "review");
		} else if (family === "franchises" || family === "people") {
			const people = family === "people", id = people ? "31" : "645";
			await input('input[type="search"]', id);
			const row = await wait(() => dialog().querySelector(people ? `[data-tmdb-person-result="${id}"]` : `[data-tmdb-franchise-result="${id}"]`), { label: `live ${family} exact result`, timeoutMs: 30000 });
			await click(row); await wait(() => row.querySelector("input:checked"), { label: `${family} retained selection`, timeoutMs: 30000 });
			await keyboardToggle(row);
			await palette(row, "multiple"); await stage(1, people ? "People" : "Movie franchises", "select");
			await next(); await stage(2, people ? "People folder" : "Review & Appearance", people ? "configure" : "review");
			if (people) { await palette(selected("multiple")[0], "multiple"); await palette(selected("single")[0], "single"); await next(); await stage(3, "Review & Appearance", "review"); }
		} else {
			const network = family === "networks", name = network ? "Networks" : "Studios";
			const row = await wait(() => dialog().querySelector(".studio-result-selectable"), { label: `production ${family} catalogue`, timeoutMs: 30000 });
			await click(row); await palette(row, "multiple"); await stage(1, name, "select");
			await next(); await stage(2, `Configure ${name}`, "configure"); await palette(selected("multiple")[0], "multiple");
			await next(); await stage(3, "Appearance", "appearance");
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
		return evidence;
	} finally {
		await act(async () => { root.unmount(); await settle(); }); host.remove();
	}
}
