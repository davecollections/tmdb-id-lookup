import { createEmptyDiagnostics } from "./diagnostics.js";

export function createEmptySelection() {
	return {
		collectionInternalId: null,
		folderInternalId: null,
		sourceInternalId: null,
	};
}

/**
 * Deeply freezes controller-owned plain state.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
export function deepFreeze(value) {
	return deepFreezeInternal(value, new WeakSet());
}

function deepFreezeInternal(value, seen) {
	if (value === null || typeof value !== "object" || seen.has(value)) {
		return value;
	}

	seen.add(value);
	for (const entry of Object.values(value)) {
		deepFreezeInternal(entry, seen);
	}
	return Object.freeze(value);
}

/**
 * @param {import("../domain/model.js").ProjectNode} project
 * @param {object} migrationPreview
 */
export function createInitialState(project, migrationPreview) {
	return deepFreeze({
		revision: 0,
		project,
		selection: createEmptySelection(),
		dirty: false,
		migrationPreview,
		diagnostics: createEmptyDiagnostics(),
	});
}

/**
 * JSON-compatible deep equality that ignores object property order.
 *
 * @param {unknown} left
 * @param {unknown} right
 */
export function jsonValuesEqual(left, right) {
	if (Object.is(left, right)) {
		return true;
	}
	if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
		return false;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}
		for (let index = 0; index < left.length; index += 1) {
			if (!Object.hasOwn(left, index) || !Object.hasOwn(right, index) || !jsonValuesEqual(left[index], right[index])) {
				return false;
			}
		}
		return true;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	for (const key of leftKeys) {
		if (!Object.hasOwn(right, key) || !jsonValuesEqual(left[key], right[key])) {
			return false;
		}
	}
	return true;
}
