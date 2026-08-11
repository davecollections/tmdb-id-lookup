import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const { AboutCreditsDialog } = await vite.ssrLoadModule("/src/ui/AboutCreditsDialog.jsx");
const { BuilderWelcome } = await vite.ssrLoadModule("/src/ui/BuilderWelcome.jsx");
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createController() {
	let id = 0;
	return createBuilderController({ idFactory: () => `about-${++id}` });
}

function renderWorkspace(options = {}) {
	const controller = createController();
	return renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller,
		state: controller.getState(),
		...options,
	}));
}

function renderWelcome() {
	const controller = createController();
	return renderToStaticMarkup(createElement(BuilderWelcome, {
		controller,
		state: controller.getState(),
		onEnterWorkspace() {},
	}));
}

test("welcome uses an About control and workspace replaces its former V1 link with one question-mark control", () => {
	const welcomeMarkup = renderWelcome();
	assert.match(welcomeMarkup, /<button[^>]+data-action="open-about-credits"/);
	assert.match(welcomeMarkup, /aria-label="About &amp; Credits"/);
	assert.match(welcomeMarkup, />About<\/button>/);
	assert.equal(welcomeMarkup.includes("Back to TMDB ID Lookup"), false);
	assert.equal(welcomeMarkup.includes('data-root-link="true"'), false);

	const markup = renderWorkspace();
	assert.equal((markup.match(/data-action="open-about-credits"/g) ?? []).length, 1);
	assert.match(markup, /aria-label="About &amp; Credits"/);
	assert.match(markup, /aria-haspopup="dialog"/);
	assert.match(markup, /<span aria-hidden="true">\?<\/span>/);
	assert.ok(markup.indexOf("Back to builder home") < markup.indexOf('data-action="open-about-credits"'));
	assert.equal(markup.includes("Back to TMDB ID Lookup"), false);
	assert.equal(markup.includes('data-root-link="true"'), false);

	const openMarkup = renderWorkspace({ initialAboutCreditsOpen: true });
	assert.match(openMarkup, /data-about-credits-open="true"/);
	assert.match(openMarkup, /data-about-credits-dialog="true"/);
	assert.match(openMarkup, /role="dialog"/);
	assert.match(openMarkup, /aria-modal="true"/);
	assert.ok(openMarkup.includes("About &amp; Credits"));
});

test("About & Credits contains compact linked attribution and the approved footer links", () => {
	const markup = renderToStaticMarkup(createElement(AboutCreditsDialog, { onClose() {} }));
	assert.ok(markup.includes("This product uses the TMDB API but is not endorsed or certified by TMDB."));
	assert.ok(markup.includes("Streaming provider availability data supplied by JustWatch via TMDB."));
	assert.match(markup, /href="https:\/\/www\.themoviedb\.org\/"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
	assert.match(markup, /href="https:\/\/www\.justwatch\.com\/"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
	assert.match(markup, /<img[^>]+alt="TMDB"/);
	assert.match(markup, /<img[^>]+alt="JustWatch"/);
	assert.match(markup, /tmdb-logo-square\.svg/);
	assert.match(markup, /justwatch-mark-gold\.svg/);
	assert.match(markup, /href="\.\.\/"[^>]*>TMDB ID Lookup Tool<\/a>/);
	assert.match(markup, /href="https:\/\/github\.com\/davecollections\/tmdb-id-lookup\/issues\/new\/choose"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
	assert.ok(markup.includes("Feedback / report an issue"));
	assert.match(markup, /Created by[\s\S]*href="https:\/\/github\.com\/davecollections"[^>]+target="_blank"[^>]+rel="noopener noreferrer"[\s\S]*davecollections/);
	assert.match(markup, /<svg[^>]+class="about-credits-github-mark"[^>]+aria-hidden="true"/);
	assert.ok(markup.includes("Independent community tool for Nuvio collections. Not affiliated with or endorsed by Nuvio."));
	assert.equal(markup.includes("TMDB provides metadata and imagery used by parts of the Builder."), false);
});

test("credits share one compact borderless group while retaining the divided creator and action footer", () => {
	const markup = renderToStaticMarkup(createElement(AboutCreditsDialog, { onClose() {} }));
	const styles = read("builder/src/styles.css");
	assert.equal((markup.match(/class="about-credits-attributions"/g) ?? []).length, 1);
	assert.equal((markup.match(/class="about-credit-row"/g) ?? []).length, 2);
	assert.equal(markup.includes("about-credit-block"), false);
	assert.equal(styles.includes(".about-credit-block"), false);
	assert.match(styles, /\.about-credits-attributions\s*\{/);
	assert.match(styles, /\.about-credit-row\s*\{/);
	assert.match(styles, /\.about-credits-footer\s*\{[^}]*border-top:/);
	assert.match(styles, /\.about-credits-github-mark\s*\{[^}]*fill:\s*currentColor/);
	assert.match(styles, /\.about-credits-independence\s*\{/);
});

test("About & Credits reuses the established portal, body lock, focus trap, Escape, Close and trigger-return behavior", () => {
	const dialog = read("builder/src/ui/AboutCreditsDialog.jsx");
	const welcome = read("builder/src/ui/BuilderWelcome.jsx");
	const workspace = read("builder/src/ui/BuilderWorkspace.jsx");
	assert.match(dialog, /createPortal\(content, document\.body\)/);
	assert.match(dialog, /lockAddSourceDocumentBody\(\)/);
	assert.match(dialog, /observeAddSourceViewport\(setViewportStyle\)/);
	assert.match(dialog, /focusElementWithoutScroll\(closeButtonRef\.current \?\? dialogRef\.current\)/);
	assert.match(dialog, /handleDialogKeyDown\(event, dialogRef\.current, onClose\)/);
	assert.match(dialog, /aria-label="Close About & Credits"[\s\S]*onClick=\{onClose\}/);
	assert.match(workspace, /onClick=\{openAboutCredits\}/);
	assert.match(workspace, /setAboutCreditsOpen\(false\)[\s\S]*setRestoreAboutCreditsFocus\(true\)/);
	assert.match(workspace, /restoreAboutCreditsFocus[\s\S]*focusElementWithoutScroll\(aboutCreditsTriggerRef\.current\)/);
	assert.match(welcome, /inert=\{aboutCreditsOpen \|\| undefined\}/);
	assert.match(welcome, /restoreAboutCreditsFocusRef[\s\S]*focusElementWithoutScroll\(aboutCreditsTriggerRef\.current\)/);
});

test("Streaming screens no longer contain inline JustWatch attribution", () => {
	const streaming = read("builder/src/ui/StreamingSourceFlow.jsx");
	const styles = read("builder/src/styles.css");
	assert.equal(streaming.includes("Provider availability data supplied by JustWatch via TMDB."), false);
	assert.equal(streaming.includes("StreamingAttribution"), false);
	assert.equal(styles.includes("streaming-attribution"), false);
});
