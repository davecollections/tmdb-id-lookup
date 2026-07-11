export const CONTROLLER_DIAGNOSTIC_CODES = Object.freeze({
	UNSAVED_CHANGES_CONFIRMATION_REQUIRED: "UNSAVED_CHANGES_CONFIRMATION_REQUIRED",
	INVALID_CONTROLLER_ARGUMENT: "INVALID_CONTROLLER_ARGUMENT",
	TARGET_NODE_NOT_FOUND: "TARGET_NODE_NOT_FOUND",
	TARGET_NODE_AMBIGUOUS: "TARGET_NODE_AMBIGUOUS",
	INVALID_PARENT_NODE_TYPE: "INVALID_PARENT_NODE_TYPE",
	PROJECT_ROOT_OPERATION_NOT_ALLOWED: "PROJECT_ROOT_OPERATION_NOT_ALLOWED",
	INVALID_INSERTION_INDEX: "INVALID_INSERTION_INDEX",
	INVALID_SOURCE_CATEGORY: "INVALID_SOURCE_CATEGORY",
	INTERNAL_ID_COLLISION: "INTERNAL_ID_COLLISION",
	MIGRATION_NOT_AVAILABLE: "MIGRATION_NOT_AVAILABLE",
	CONTROLLER_OPERATION_FAILED: "CONTROLLER_OPERATION_FAILED",
	INVALID_DIAGNOSTIC_SCOPE: "INVALID_DIAGNOSTIC_SCOPE",
});

export const DIAGNOSTIC_SCOPES = Object.freeze([
	"import",
	"migration",
	"export",
	"operation",
]);

/**
 * @param {string} code
 * @param {string} path
 * @param {string} message
 */
export function controllerDiagnostic(code, path, message) {
	return { code, path, message };
}

/**
 * Copies only the stable public diagnostic fields.
 *
 * @param {Array<{code: string, path: string, message: string}>} diagnostics
 */
export function copyDiagnosticList(diagnostics = []) {
	return diagnostics.map(({ code, path, message }) => ({ code, path, message }));
}

export function createEmptyDiagnosticScope() {
	return { errors: [], warnings: [] };
}

export function createEmptyDiagnostics() {
	return {
		import: createEmptyDiagnosticScope(),
		migration: createEmptyDiagnosticScope(),
		export: createEmptyDiagnosticScope(),
		operation: createEmptyDiagnosticScope(),
	};
}

/**
 * @param {{errors: Array<object>, warnings: Array<object>}} scope
 */
export function isDiagnosticScopeEmpty(scope) {
	return scope.errors.length === 0 && scope.warnings.length === 0;
}
