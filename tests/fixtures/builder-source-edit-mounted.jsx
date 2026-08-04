import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import {
	chooseMovieCollection,
	createSourceEditSession,
	saveSourceEdit,
} from "../../builder/src/source-edit/index.js";
import { SourceEditorDialog } from "../../builder/src/ui/SourceEditorDialog.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function countingIdFactory(prefix = "builder") {
	let count = 0;
	return () => `${prefix}-${++count}`;
}

function createController() {
	return createBuilderController({
		idFactory: countingIdFactory(),
		nuvioIdFactory: countingIdFactory("nuvio"),
		initialProjectTitle: "Mounted source edit regression",
	});
}

function collectionSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Existing franchise title",
		tmdbSourceType: "COLLECTION",
		tmdbId: 100,
		mediaType: "MOVIE",
		sortBy: "original",
		filters: {},
		...overrides,
	};
}

function peopleSource(overrides = {}) {
	return {
		provider: "tmdb",
		title: "Movie Credits",
		tmdbSourceType: "PERSON",
		tmdbId: 31,
		mediaType: "MOVIE",
		sortBy: "popularity.desc",
		filters: {},
		...overrides,
	};
}

function importSources(controller, sources) {
	const imported = controller.importValue([{
		id: "collection",
		title: "Collection",
		folders: [{
			id: "folder",
			title: "Safe folder title",
			hideTitle: true,
			tileShape: "POSTER",
			sources,
		}],
	}]);
	if (!imported.ok) throw new Error("Mounted fixture import failed.");
	return controller.getState().project.collections[0].folders[0];
}

function openEdit(controller, source) {
	const opened = createSourceEditSession(controller.getState().project, source.internalId);
	if (!opened.ok) throw new Error("Mounted source edit session failed to open.");
	return opened;
}

function serializedValue(controller) {
	return JSON.stringify(controller.serializeProject().value);
}

function setInputValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter.call(input, value);
	input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
}

async function afterCommittedEffects() {
	await Promise.resolve();
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function withMountedEditor({ controller, session, draft, run }) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let updateCalls = 0;
	let submittedDraft = null;
	const saveController = {
		getState: () => controller.getState(),
		updateNode(...args) {
			updateCalls += 1;
			return controller.updateNode(...args);
		},
	};
	await act(async () => {
		root.render(createElement(SourceEditorDialog, {
			provider: {},
			peopleProvider: {},
			session,
			initialDraft: draft,
			onCancel() {},
			onSave(nextDraft) {
				submittedDraft = nextDraft;
				return saveSourceEdit(saveController, session, nextDraft);
			},
		}));
		await afterCommittedEffects();
	});
	try {
		return await run({
			getUpdateCalls: () => updateCalls,
			getSubmittedDraft: () => submittedDraft,
		});
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

async function runRequiredNameScenario(source) {
	const controller = createController();
	const folder = importSources(controller, [source]);
	const opened = openEdit(controller, folder.sources[0]);
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	return withMountedEditor({
		controller,
		session: opened.session,
		draft: opened.draft,
		async run({ getUpdateCalls, getSubmittedDraft }) {
			const input = document.querySelector("#source-edit-title-input");
			await act(async () => {
				setInputValue(input, "");
				await Promise.resolve();
			});
			await act(async () => {
				document.querySelector('[data-action="save-source-edit"]').click();
				await afterCommittedEffects();
			});
			const alert = document.querySelector(".source-edit-diagnostics");
			return {
				activeElementIsInput: document.activeElement === input,
				ariaInvalid: input.getAttribute("aria-invalid"),
				alertRendered: Boolean(alert),
				alertRole: alert?.getAttribute("role") ?? null,
				alertText: alert?.textContent ?? "",
				dialogOpen: Boolean(document.querySelector('[data-source-edit-modal="true"]')),
				blankValuePreserved: input.value === "" && getSubmittedDraft()?.title === "",
				updateCalls: getUpdateCalls(),
				revisionBefore,
				revisionAfter: controller.getState().revision,
				serializedUnchanged: serializedValue(controller) === serializedBefore,
				label: document.querySelector('label[for="source-edit-title-input"]')?.textContent ?? "",
				helper: document.querySelector("#source-edit-title-help")?.textContent ?? "",
			};
		},
	});
}

async function runDuplicateScenario() {
	const controller = createController();
	const folder = importSources(controller, [
		collectionSource({ tmdbId: 100, title: "First" }),
		collectionSource({ tmdbId: 200, title: "Second" }),
	]);
	const opened = openEdit(controller, folder.sources[0]);
	const draft = chooseMovieCollection(opened.draft, { id: 200, name: "Replacement Collection" });
	const revisionBefore = controller.getState().revision;
	const serializedBefore = serializedValue(controller);
	return withMountedEditor({
		controller,
		session: opened.session,
		draft,
		async run({ getUpdateCalls, getSubmittedDraft }) {
			await act(async () => {
				document.querySelector('[data-action="save-source-edit"]').click();
				await afterCommittedEffects();
			});
			const input = document.querySelector("#source-edit-title-input");
			const alert = document.querySelector(".source-edit-diagnostics");
			return {
				activeElementIsAlert: document.activeElement === alert,
				activeElementIsInput: document.activeElement === input,
				alertRendered: Boolean(alert),
				alertRole: alert?.getAttribute("role") ?? null,
				alertText: alert?.textContent ?? "",
				dialogOpen: Boolean(document.querySelector('[data-source-edit-modal="true"]')),
				draftPreserved: input.value === "Replacement Collection"
					&& getSubmittedDraft()?.title === "Replacement Collection",
				updateCalls: getUpdateCalls(),
				revisionBefore,
				revisionAfter: controller.getState().revision,
				serializedUnchanged: serializedValue(controller) === serializedBefore,
			};
		},
	});
}

async function runMountedRegressions() {
	return {
		peopleRequiredName: await runRequiredNameScenario(peopleSource()),
		collectionRequiredName: await runRequiredNameScenario(collectionSource()),
		duplicate: await runDuplicateScenario(),
	};
}

window.__builderSourceEditMounted = { status: "running" };
runMountedRegressions().then(
	(results) => { window.__builderSourceEditMounted = { status: "complete", results }; },
	(error) => {
		window.__builderSourceEditMounted = {
			status: "error",
			message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
		};
	},
);
