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

export async function importJsonFile(controller, file) {
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

	return controller.importJsonText(text, {
		projectTitle: projectTitleFromFilename(file.name),
	});
}
