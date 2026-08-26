import assert from "node:assert/strict";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "../builder/node_modules/react/index.js";
import { renderToStaticMarkup } from "../builder/node_modules/react-dom/server.js";
import { createServer } from "../builder/node_modules/vite/dist/node/index.js";
import { createBuilderController } from "../builder/src/application/index.js";
import {
	BULK_EDIT_NO_CHANGE,
	buildBulkEditPlan,
	bulkEditAvailability,
	createBulkEditDraft,
	hasBulkEditChanges,
	updateBulkEditDraft,
} from "../builder/src/ui/bulk-edit.js";
import { NUVIO_INVISIBLE_TITLE } from "../builder/src/nuvio/titles.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
	root: path.join(rootDir, "builder"),
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
const {
	BulkEditDialog,
	BulkEditTitleConfirmation,
	BULK_EDIT_TITLE_CONFIRMATION_MESSAGE,
} = await vite.ssrLoadModule("/src/ui/BulkEditDialog.jsx");
const { BuilderWorkspace } = await vite.ssrLoadModule("/src/ui/BuilderWorkspace.jsx");
after(() => vite.close());

function countingIdFactory(prefix = "bulk") {
	let calls = 0;
	return () => `${prefix}-${++calls}`;
}

function createController(value = null) {
	const controller = createBuilderController({ idFactory: countingIdFactory() });
	if (value !== null) {
		const result = controller.importValue(value);
		assert.equal(result.ok, true);
	}
	return controller;
}

function completeTree() {
	return [
		{
			id: "collection-a",
			title: "Collection A",
			viewMode: "FOLLOW_LAYOUT",
			showAllTab: true,
			pinToTop: false,
			backdropImageUrl: "https://saved.example/collection-a.webp",
			unknownCollection: { keep: true },
			folders: [{
				id: "folder-a",
				title: "Folder A",
				hideTitle: false,
				tileShape: "POSTER",
				coverImageUrl: "https://saved.example/cover-a.webp",
				heroBackdropUrl: "https://saved.example/hero-a.webp",
				titleLogoUrl: "https://saved.example/logo-a.webp",
				focusGifUrl: "https://saved.example/focus-a.webp",
				focusGifEnabled: false,
				unknownFolder: { keep: true },
				sources: [{ provider: "community", addonId: "example", type: "movie", catalogId: "first", unknownSource: true }],
			}],
		},
		{
			id: "collection-b",
			title: `${NUVIO_INVISIBLE_TITLE}${NUVIO_INVISIBLE_TITLE}`,
			viewMode: "ROWS",
			showAllTab: false,
			pinToTop: true,
			folders: [{
				id: "folder-b",
				title: `${NUVIO_INVISIBLE_TITLE}${NUVIO_INVISIBLE_TITLE}`,
				hideTitle: false,
				tileShape: "LANDSCAPE",
				focusGifUrl: "",
				focusGifEnabled: true,
				sources: [],
			}],
		},
	];
}

function choose(draft, choices) {
	return Object.entries(choices).reduce(
		(current, [field, value]) => updateBulkEditDraft(current, field, value),
		draft,
	);
}

test("Bulk Edit draft starts entirely at No change and rejects unsupported values", () => {
	const draft = createBulkEditDraft();
	assert.deepEqual(Object.values(draft), Array(6).fill(BULK_EDIT_NO_CHANGE));
	assert.equal(hasBulkEditChanges(draft), false);
	assert.equal(updateBulkEditDraft(draft, "layout", "FOLLOW_LAYOUT"), draft);
	assert.equal(updateBulkEditDraft(draft, "unknown", "ROWS"), draft);
	assert.equal(hasBulkEditChanges(updateBulkEditDraft(draft, "layout", "ROWS")), true);
});

test("combined explicit Collection and Folder choices build narrow patches and commit once", () => {
	const controller = createController(completeTree());
	const before = controller.getState();
	const firstCollection = before.project.collections[0];
	const firstFolder = firstCollection.folders[0];
	const saved = {
		collectionOrder: before.project.collections.map(({ internalId }) => internalId),
		folderOrder: firstCollection.folders.map(({ internalId }) => internalId),
		backdrop: firstCollection.editable.backdropImageUrl,
		cover: firstFolder.editable.coverImageUrl,
		hero: firstFolder.editable.heroBackdropUrl,
		logo: firstFolder.editable.titleLogoUrl,
		focus: firstFolder.editable.focusGifUrl,
		sources: firstFolder.sources,
		rawCollection: firstCollection.rawImported,
		rawFolder: firstFolder.rawImported,
	};
	const draft = choose(createBulkEditDraft(), {
		layout: "TABBED_GRID",
		showAllTab: "OFF",
		pinToTop: "ON",
		focusArtwork: "SHOW",
	});
	const plan = buildBulkEditPlan(before.project, draft);

	assert.equal(plan.ok, true);
	assert.equal(plan.requiresTitleConfirmation, false);
	assert.equal(plan.updates.length, 4);
	assert.deepEqual(plan.updates[0].patch, { viewMode: "TABBED_GRID", showAllTab: false, pinToTop: true });
	assert.deepEqual(plan.updates[1].patch, { viewMode: "TABBED_GRID", showAllTab: false, pinToTop: true });
	assert.deepEqual(plan.updates[2].patch, { focusGifEnabled: true });
	assert.deepEqual(plan.updates[3].patch, { focusGifEnabled: true });

	const notifications = [];
	controller.subscribe(() => notifications.push(controller.getState()));
	const result = controller.applyPresentationUpdates(plan.updates);
	assert.equal(result.ok, true);
	assert.equal(notifications.length, 1);
	assert.equal(controller.getState().revision, before.revision + 1);

	const updatedFirst = controller.getState().project.collections[0];
	const updatedFolder = updatedFirst.folders[0];
	assert.equal(updatedFirst.editable.viewMode, "TABBED_GRID");
	assert.equal(updatedFirst.editable.showAllTab, false);
	assert.equal(updatedFirst.editable.pinToTop, true);
	assert.equal(updatedFolder.editable.focusGifEnabled, true);
	assert.equal(updatedFirst.editable.backdropImageUrl, saved.backdrop);
	assert.equal(updatedFolder.editable.coverImageUrl, saved.cover);
	assert.equal(updatedFolder.editable.heroBackdropUrl, saved.hero);
	assert.equal(updatedFolder.editable.titleLogoUrl, saved.logo);
	assert.equal(updatedFolder.editable.focusGifUrl, saved.focus);
	assert.equal(updatedFolder.sources, saved.sources);
	assert.equal(updatedFirst.rawImported, saved.rawCollection);
	assert.equal(updatedFolder.rawImported, saved.rawFolder);
	assert.deepEqual(controller.getState().project.collections.map(({ internalId }) => internalId), saved.collectionOrder);
	assert.deepEqual(updatedFirst.folders.map(({ internalId }) => internalId), saved.folderOrder);
});

test("Rows, Show All On, Pin Off, and Focus Hide map independently", () => {
	const controller = createController([completeTree()[0]]);
	const plan = buildBulkEditPlan(controller.getState().project, choose(createBulkEditDraft(), {
		layout: "ROWS",
		showAllTab: "ON",
		pinToTop: "OFF",
		focusArtwork: "HIDE",
	}));
	assert.deepEqual(plan.updates[0].patch, { viewMode: "ROWS", showAllTab: true, pinToTop: false });
	assert.deepEqual(plan.updates.at(-1).patch, { focusGifEnabled: false });
});

test("No change preserves FOLLOW_LAYOUT and a total effective no-op creates no revision", () => {
	const controller = createController([completeTree()[0]]);
	const before = controller.getState();
	const untouched = buildBulkEditPlan(before.project, createBulkEditDraft());
	assert.deepEqual(untouched.updates, []);
	assert.equal(before.project.collections[0].editable.viewMode, "FOLLOW_LAYOUT");

	const noOp = buildBulkEditPlan(before.project, choose(createBulkEditDraft(), {
		showAllTab: "ON",
		pinToTop: "OFF",
	}));
	const result = controller.applyPresentationUpdates(noOp.updates);
	assert.equal(result.ok, true);
	assert.deepEqual(result.changedTargets, []);
	assert.equal(controller.getState(), before);
});

test("Collection Hide and Folder Hide everywhere request one confirmation only for visible titles", () => {
	const controller = createController(completeTree());
	const plan = buildBulkEditPlan(controller.getState().project, choose(createBulkEditDraft(), {
		collectionTitles: "HIDE",
		folderTitleVisibility: "HIDE_EVERYWHERE",
		focusArtwork: "HIDE",
	}));
	assert.equal(plan.ok, true);
	assert.equal(plan.requiresTitleConfirmation, true);
	assert.equal(plan.updates[0].patch.title, NUVIO_INVISIBLE_TITLE);
	assert.equal(plan.updates[1].patch.title, NUVIO_INVISIBLE_TITLE);
	assert.deepEqual(plan.updates[2].patch, {
		title: NUVIO_INVISIBLE_TITLE,
		hideTitle: true,
		focusGifEnabled: false,
	});
	assert.deepEqual(plan.updates[3].patch, { hideTitle: true, focusGifEnabled: false });

	const hiddenOnly = createController([completeTree()[1]]);
	const hiddenPlan = buildBulkEditPlan(hiddenOnly.getState().project, choose(createBulkEditDraft(), {
		collectionTitles: "HIDE",
		folderTitleVisibility: "HIDE_EVERYWHERE",
	}));
	assert.equal(hiddenPlan.requiresTitleConfirmation, false);
	assert.equal(hiddenPlan.updates[1].patch.title, undefined);
	assert.equal(hiddenOnly.getState().project.collections[0].folders[0].editable.title, `${NUVIO_INVISIBLE_TITLE}${NUVIO_INVISIBLE_TITLE}`);
});

test("Folder visible outcomes preserve valid titles and fail closed for invisible imports", () => {
	const visible = createController([completeTree()[0]]);
	const show = buildBulkEditPlan(visible.getState().project, choose(createBulkEditDraft(), {
		folderTitleVisibility: "SHOW_EVERYWHERE",
	}));
	const home = buildBulkEditPlan(visible.getState().project, choose(createBulkEditDraft(), {
		folderTitleVisibility: "HIDE_HOME_SCREEN",
	}));
	assert.deepEqual(show.updates[0].patch, { hideTitle: false });
	assert.deepEqual(home.updates[0].patch, { hideTitle: true });
	assert.equal(Object.hasOwn(show.updates[0].patch, "title"), false);

	const importedHidden = createController([completeTree()[1]]);
	assert.deepEqual(bulkEditAvailability(importedHidden.getState().project), {
		hasCollections: true,
		hasFolders: true,
		folderVisibleTitlesAvailable: false,
	});
	const rejected = buildBulkEditPlan(importedHidden.getState().project, choose(createBulkEditDraft(), {
		folderTitleVisibility: "SHOW_EVERYWHERE",
	}));
	assert.equal(rejected.ok, false);
	assert.equal(rejected.errors[0].code, "BULK_EDIT_FOLDER_VISIBLE_TITLE_REQUIRED");
	assert.deepEqual(rejected.updates, []);
});

test("an atomic validation failure rolls back the complete combined request", () => {
	const controller = createController(completeTree());
	const before = controller.getState();
	const plan = buildBulkEditPlan(before.project, choose(createBulkEditDraft(), {
		showAllTab: "OFF",
		focusArtwork: "SHOW",
	}));
	const result = controller.applyPresentationUpdates([
		...plan.updates,
		{ nodeType: "folder", internalId: "stale-folder", patch: { hideTitle: true } },
	]);
	assert.equal(result.ok, false);
	assert.equal(controller.getState().project, before.project);
	assert.equal(controller.getState().revision, before.revision);
});

test("Global display settings and confirmation markup expose only the approved accessible controls", () => {
	const controller = createController([completeTree()[0]]);
	const draft = createBulkEditDraft();
	const dialog = renderToStaticMarkup(createElement(BulkEditDialog, {
		draft,
		diagnostics: [],
		availability: bulkEditAvailability(controller.getState().project),
		onChange() {},
		onSubmit() {},
		onCancel() {},
	}));
	for (const text of [
		"ALL COLLECTIONS &amp; FOLDERS",
		"Global display settings",
		"Changes apply across all Collections and Folders.",
		"Layout",
		"Show All tab",
		"Pin to Top",
		"Collection titles",
		"Title visibility",
		"Hide on home only",
		"Focus GIF",
		"Controls whether folder Focus GIFs are shown.",
		"Apply Changes",
	]) assert.ok(dialog.includes(text), text);
	assert.equal((dialog.match(/No change/g) ?? []).length, 6);
	assert.equal((dialog.match(/type="radio"/g) ?? []).length, 18);
	assert.equal((dialog.match(/checked=""/g) ?? []).length, 6);
	assert.equal((dialog.match(/data-selected="true"/g) ?? []).length, 6);
	assert.equal((dialog.match(/studio-sort-choices/g) ?? []).length, 6);
	assert.equal((dialog.match(/studio-sort-choice-row/g) ?? []).length, 6);
	assert.equal((dialog.match(/semantic-sort-choices/g) ?? []).length, 6);
	assert.equal((dialog.match(/semantic-sort-choice-row/g) ?? []).length, 6);
	assert.equal((dialog.match(/people-source-pill-check/g) ?? []).length, 0);
	assert.equal((dialog.match(/people-source-pill/g) ?? []).length, 0);
	assert.equal((dialog.match(/bulk-edit-choice/g) ?? []).length, 0);
	assert.ok(dialog.includes('role="dialog"'));
	assert.ok(dialog.includes('aria-modal="true"'));
	assert.ok(dialog.includes('data-action="apply-bulk-edit" disabled=""'));
	assert.equal(dialog.includes("<select"), false);
	assert.equal(dialog.includes("Bulk edit"), false);
	assert.equal(dialog.includes("Project hierarchy"), false);
	assert.equal(dialog.includes("Presentation settings"), false);
	assert.equal(dialog.includes("Apply common display settings"), false);
	assert.equal(dialog.includes(">Home only<"), false);
	assert.equal(dialog.includes("Focus artwork"), false);
	assert.equal(dialog.includes("Show titles"), false);
	for (const forbidden of ["Poster", "Landscape", "Focus Glow", "artwork URL", "selected count"]) {
		assert.equal(dialog.includes(forbidden), false);
	}

	const confirmation = renderToStaticMarkup(createElement(BulkEditTitleConfirmation, {
		onCancel() {},
		onContinue() {},
	}));
	assert.ok(confirmation.includes(BULK_EDIT_TITLE_CONFIRMATION_MESSAGE));
	assert.equal((confirmation.match(/data-action="cancel-bulk-title-confirmation"/g) ?? []).length, 1);
	assert.equal((confirmation.match(/data-action="continue-bulk-title-confirmation"/g) ?? []).length, 1);
	assert.ok(confirmation.includes('aria-describedby="bulk-title-confirmation-description"'));
});

test("the Global display settings trigger is singular beside Collections and disabled only for an empty project", () => {
	const empty = createController();
	const emptyMarkup = renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller: empty,
		state: empty.getState(),
	}));
	assert.equal((emptyMarkup.match(/data-action="open-bulk-edit"/g) ?? []).length, 1);
	assert.match(emptyMarkup, /data-action="open-bulk-edit"[^>]*aria-haspopup="dialog"[^>]*disabled=""/);
	assert.match(emptyMarkup, /data-action="open-bulk-edit"[^>]*aria-label="Global display settings"[^>]*title="Global display settings"/);
	const mastheadActions = emptyMarkup.match(/<div class="workspace-header-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
	const collectionHeader = emptyMarkup.match(/<header class="panel-header" data-panel-header="collections">([\s\S]*?)<\/header>/)?.[1] ?? "";
	const folderHeader = emptyMarkup.match(/<header class="panel-header" data-panel-header="folders">([\s\S]*?)<\/header>/)?.[1] ?? "";
	assert.equal(mastheadActions.includes('data-action="open-bulk-edit"'), false);
	assert.equal(collectionHeader.includes('data-action="open-bulk-edit"'), true);
	assert.ok(collectionHeader.indexOf('id="collections-title"') < collectionHeader.indexOf('data-action="open-bulk-edit"'));
	assert.equal(folderHeader.includes('data-action="open-bulk-edit"'), false);
	assert.equal((collectionHeader.match(/presentation-settings-icon/g) ?? []).length, 1);
	assert.equal(emptyMarkup.includes("workspace-controls"), false);

	const noFolders = createController([{ title: "Collection", folders: [] }]);
	const populatedMarkup = renderToStaticMarkup(createElement(BuilderWorkspace, {
		controller: noFolders,
		state: noFolders.getState(),
	}));
	assert.doesNotMatch(populatedMarkup, /data-action="open-bulk-edit"[^>]*disabled=""/);
});
