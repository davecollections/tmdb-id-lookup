import { traverseProject } from "../domain/index.js";
import { migrateLegacyAddonProjections } from "../migrate/index.js";
import { copyDiagnosticList } from "./diagnostics.js";

const previewIdPrefix = "__builder_migration_preview__";

/**
 * Runs the production migration without committing its project or consuming
 * the controller's configured ID factory.
 *
 * @param {import("../domain/model.js").ProjectNode} project
 */
export function createMigrationPreview(project) {
	const result = migrateLegacyAddonProjections(project, {
		idFactory: createPreviewIdFactory(project),
	});

	if (!result.ok) {
		return {
			status: "blocked",
			changes: { foldersMigrated: 0, sourcesCreated: 0 },
			errors: copyDiagnosticList(result.errors),
		};
	}

	return {
		status: result.changes.sourcesCreated > 0 ? "available" : "unavailable",
		changes: {
			foldersMigrated: result.changes.foldersMigrated,
			sourcesCreated: result.changes.sourcesCreated,
		},
		errors: [],
	};
}

function createPreviewIdFactory(project) {
	const reserved = new Set(traverseProject(project).map((node) => node.internalId));
	let sequence = 0;

	return () => {
		let candidate;
		do {
			sequence += 1;
			candidate = `${previewIdPrefix}${sequence}`;
		} while (reserved.has(candidate));
		reserved.add(candidate);
		return candidate;
	};
}
