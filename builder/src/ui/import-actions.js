import { reviewLocalJsonText } from "../import/local-snapshot.js";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const IMPORT_PATH = "$ui.import";

function diagnostic(code, message) {
	return { code, path: IMPORT_PATH, message };
}

function failure(code, message) {
	return {
		ok: false,
		errors: [diagnostic(code, message)],
		warnings: [],
	};
}

export function projectTitleFromFilename(filename) {
	if (typeof filename !== "string") {
		return "Imported project";
	}

	const title = filename.trim().replace(/\.json$/i, "").trim();
	return title || "Imported project";
}

export function validateImportFile(file) {
	if (!file) {
		return failure("IMPORT_FILE_REQUIRED", "Choose a JSON file before importing.");
	}

	const filename = typeof file.name === "string" ? file.name : "";
	const mimeType = typeof file.type === "string" ? file.type.toLowerCase() : "";
	const hasJsonFilename = /\.json$/i.test(filename.trim());
	if (!hasJsonFilename && mimeType !== "application/json") {
		return failure("UNSUPPORTED_IMPORT_FILE", "Choose a JSON file to import.");
	}

	if (typeof file.size === "number" && file.size > MAX_IMPORT_FILE_BYTES) {
		return failure("IMPORT_FILE_TOO_LARGE", "Choose a JSON file smaller than 10 MiB.");
	}

	return { ok: true, errors: [], warnings: [] };
}

export function startNewBuilderProject(controller) {
	return controller.startNewProject({ title: "Untitled project" });
}

export function importPastedJson(controller, text) {
	if (typeof text !== "string" || text.trim().length === 0) {
		return failure(
			"IMPORT_TEXT_REQUIRED",
			"Paste a Nuvio collection JSON document before importing.",
		);
	}

	return controller.importJsonText(text, { projectTitle: "Imported project" });
}

async function readImportFile(file, receiveText) {
	const validation = validateImportFile(file);
	if (!validation.ok) {
		return validation;
	}

	let text;
	try {
		text = await file.text();
	} catch {
		return failure("IMPORT_FILE_READ_FAILED", "The selected JSON file could not be read.");
	}

	if (typeof text !== "string") {
		return failure("IMPORT_FILE_READ_FAILED", "The selected JSON file could not be read.");
	}

	return receiveText(text, projectTitleFromFilename(file.name));
}

export async function importJsonFile(controller, file) {
	return readImportFile(file, (text, projectTitle) => controller.importJsonText(text, { projectTitle }));
}

export function reviewPastedJson(text) {
	if (typeof text !== "string" || !text.trim()) return failure("IMPORT_TEXT_REQUIRED", "Paste a Nuvio collection JSON document before importing.");
	return reviewLocalJsonText(text, "Imported project", "json");
}

export async function reviewJsonFile(file) {
	return readImportFile(file, (text, projectTitle) => reviewLocalJsonText(text, projectTitle, "file"));
}

export function projectHasImportWork(state) {
	return state.project.collections.length > 0 || state.dirty;
}

// One synchronous, network-free application path for every incoming source.
// Source adapters must additionally verify authority for their own snapshot.
export function importCollectionSnapshot({ controller, snapshot, project, mode, artworkPolicy, replaceConfirmed = false }) {
	const fail = (message) => ({ ok: false, message });
	if (!snapshot || snapshot.kind !== "ready") return fail("Review the incoming Collections before importing.");
	if (controller.getState().project !== project) return fail("Your Dingo project changed. Review the import choice again.");
	if (!["add", "merge", "replace"].includes(mode)) return fail("Choose how to import these Collections into your current project.");
	if (mode === "replace" && projectHasImportWork(controller.getState()) && !replaceConfirmed) return fail("Confirm replacement before importing over your current work.");
	const result = mode === "add" ? controller.appendImportedCollections(snapshot.collections)
		: mode === "merge" ? controller.mergeImportedCollections(snapshot.collections, { artworkPolicy })
			: controller.importValue(snapshot.collections, { projectTitle: snapshot.projectTitle ?? snapshot.profile?.name ?? "Imported project", ...(replaceConfirmed ? { discardChanges: true } : {}) });
	return result.ok ? { ok: true, counts: result.counts, artworkCounts: result.artworkCounts }
		: fail(result.errors[0]?.message ?? "These Collections could not be imported. Your current work is unchanged.");
}
