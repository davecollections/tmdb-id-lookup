import { cloneJsonValue } from "../domain/index.js";

const MAX_GENERATION_ATTEMPTS = 100;

export class NuvioIdGenerationError extends Error {
	constructor() {
		super("A unique Nuvio collection or folder ID could not be generated.");
		this.name = "NuvioIdGenerationError";
	}
}

export function defaultNuvioIdFactory() {
	if (typeof globalThis.crypto?.randomUUID !== "function") {
		throw new NuvioIdGenerationError();
	}
	return globalThis.crypto.randomUUID();
}

export function isUsableNuvioId(value) {
	return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function createUniqueNuvioId(existingIds, idFactory = defaultNuvioIdFactory) {
	if (typeof idFactory !== "function") {
		throw new TypeError("nuvioIdFactory must be a function");
	}

	const reserved = existingIds instanceof Set ? existingIds : new Set(existingIds);
	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
		let candidate;
		try {
			candidate = idFactory();
		} catch {
			throw new NuvioIdGenerationError();
		}
		if (!isUsableNuvioId(candidate)) {
			throw new NuvioIdGenerationError();
		}
		if (!reserved.has(candidate)) {
			reserved.add(candidate);
			return candidate;
		}
	}
	throw new NuvioIdGenerationError();
}

export function collectReservedNuvioIds(project) {
	const reserved = new Set();
	for (const collection of project.collections) {
		if (isUsableNuvioId(collection.editable.id)) reserved.add(collection.editable.id);
		for (const folder of collection.folders) {
			if (isUsableNuvioId(folder.editable.id)) reserved.add(folder.editable.id);
		}
	}
	return reserved;
}

export function repairProjectNuvioIds(project, idFactory = defaultNuvioIdFactory) {
	const repaired = cloneJsonValue(project, "project");
	const reserved = collectReservedNuvioIds(repaired);
	const claimed = new Set();

	for (const collection of repaired.collections) {
		repairNodeId(collection, reserved, claimed, idFactory);
		for (const folder of collection.folders) {
			repairNodeId(folder, reserved, claimed, idFactory);
		}
	}
	return repaired;
}

export function prepareNewNodeEditable(project, editable = {}, idFactory = defaultNuvioIdFactory) {
	const prepared = cloneJsonValue(editable, "editable");
	if (prepared === null || Array.isArray(prepared) || typeof prepared !== "object") {
		throw new TypeError("editable must be a plain object");
	}
	const reserved = collectReservedNuvioIds(project);
	if (!isUsableNuvioId(prepared.id) || reserved.has(prepared.id)) {
		prepared.id = createUniqueNuvioId(reserved, idFactory);
	}
	return prepared;
}

function repairNodeId(node, reserved, claimed, idFactory) {
	const current = node.editable.id;
	if (isUsableNuvioId(current) && !claimed.has(current)) {
		claimed.add(current);
		return;
	}
	const generated = createUniqueNuvioId(reserved, idFactory);
	claimed.add(generated);
	node.editable.id = generated;
}
