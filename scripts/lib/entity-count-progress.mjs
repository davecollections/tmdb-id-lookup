import fs from "node:fs/promises";
import path from "node:path";
import {
	COUNT_SCHEMA_VERSION,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_STATUSES,
	isTerminalCountResult,
	truncateToUtcSecond,
	validateCountResult,
	validateTargetSnapshot,
} from "./entity-title-counts.mjs";
import { canonicalJson } from "./entity-count-budget.mjs";

export const DEFAULT_MAINTENANCE_ROOT = path.join("maintenance", "entity-title-counts");

export function targetPathFor({ root = DEFAULT_MAINTENANCE_ROOT, month, entityType }) {
	const filename = entityType === "company" ? "companies.json" : "networks.json";
	return path.join(root, "months", month, "targets", filename);
}

export function dimensionProgressDirectory({
	root = DEFAULT_MAINTENANCE_ROOT,
	month,
	dimension,
}) {
	return path.join(root, "months", month, "progress", dimension);
}

export function dimensionPatchDirectory({
	root = DEFAULT_MAINTENANCE_ROOT,
	month,
	dimension,
}) {
	return path.join(root, "months", month, "patches", dimension);
}

export async function readJsonFile(filePath, fallback = null) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") {
			return fallback;
		}
		throw error;
	}
}

export async function writeJsonFile(filePath, value, { compact = false } = {}) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const serialized = compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`;
	await fs.writeFile(filePath, serialized);
}

export async function loadTargetSnapshot({
	root = DEFAULT_MAINTENANCE_ROOT,
	month,
	entityType,
}) {
	const filePath = targetPathFor({ root, month, entityType });
	const snapshot = await readJsonFile(filePath);

	if (!snapshot) {
		return null;
	}

	validateTargetSnapshot(snapshot, { month, entityType });
	return snapshot;
}

export async function writeFrozenTargetSnapshot({
	root = DEFAULT_MAINTENANCE_ROOT,
	snapshot,
}) {
	validateTargetSnapshot(snapshot);
	const filePath = targetPathFor({
		root,
		month: snapshot.month,
		entityType: snapshot.entity_type,
	});
	const existing = await readJsonFile(filePath);

	if (existing) {
		validateTargetSnapshot(existing, {
			month: snapshot.month,
			entityType: snapshot.entity_type,
		});

		if (existing.target_fingerprint !== snapshot.target_fingerprint) {
			throw new Error(
				`Frozen ${snapshot.entity_type} target already exists with a different fingerprint.`,
			);
		}

		return {
			path: filePath,
			created: false,
			snapshot: existing,
		};
	}

	await writeJsonFile(filePath, snapshot);
	return {
		path: filePath,
		created: true,
		snapshot,
	};
}

function collectResultRecords(document, expectedDimension, sourcePath) {
	if (!document || document.schema_version !== COUNT_SCHEMA_VERSION) {
		throw new TypeError(`Invalid progress document: ${sourcePath}`);
	}
	if (document.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION) {
		throw new TypeError(`Progress parser semantic version mismatch: ${sourcePath}`);
	}

	if (document.dimension !== expectedDimension || !Array.isArray(document.results)) {
		throw new TypeError(`Progress dimension/results mismatch: ${sourcePath}`);
	}

	const seen = new Set();
	return document.results.map((storedResult) => {
		if (seen.has(storedResult?.id)) {
			throw new TypeError(`Duplicate result ID ${storedResult?.id} in ${sourcePath}.`);
		}
		seen.add(storedResult?.id);
		const result = {
			...storedResult,
			dimension: expectedDimension,
			observed_at: document.observed_at,
		};
		return {
			...validateCountResult(result, { dimension: expectedDimension }),
			_source_path: sourcePath,
		};
	});
}

async function listJsonFiles(directory) {
	try {
		const entries = await fs.readdir(directory, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
			.map((entry) => path.join(directory, entry.name))
			.sort();
	} catch (error) {
		if (error?.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export function reduceCountResults(records) {
	const state = new Map();
	const semanticFields = (value) => ({
		id: value.id,
		dimension: value.dimension,
		status: value.status,
		count: value.count ?? null,
		error_code: value.error_code ?? null,
		error: value.error ?? null,
		unavailable_reason: value.unavailable_reason ?? null,
		evidence: value.evidence ?? null,
	});
	const semanticRecord = (value) => {
		const { _source_path: _sourcePath, ...record } = value;
		return record;
	};

	for (const record of records) {
		validateCountResult(record);
		const existing = state.get(record.id);

		if (!existing) {
			state.set(record.id, semanticRecord(record));
			continue;
		}

		const existingTerminal = isTerminalCountResult(existing);
		const incomingTerminal = isTerminalCountResult(record);
		const existingTime = Date.parse(existing.observed_at);
		const incomingTime = Date.parse(record.observed_at);
		if (incomingTime === existingTime) {
			if (canonicalJson(semanticFields(existing)) !== canonicalJson(semanticFields(record))) {
				throw new TypeError(
					`Conflicting count observations for ${record.dimension} ID ${record.id} at ${record.observed_at}.`,
				);
			}
			const incomingRecord = semanticRecord(record);
			if (canonicalJson(incomingRecord) < canonicalJson(existing)) {
				state.set(record.id, incomingRecord);
			}
			continue;
		}

		if (existingTerminal !== incomingTerminal) {
			if (incomingTerminal) state.set(record.id, semanticRecord(record));
			continue;
		}

		if (incomingTime > existingTime) {
			state.set(record.id, semanticRecord(record));
		}
	}

	return new Map([...state].sort(([left], [right]) => left - right));
}

export async function loadDimensionState({
	root = DEFAULT_MAINTENANCE_ROOT,
	month,
	dimension,
	targetFingerprint,
	targetIds,
}) {
	const progressFiles = await listJsonFiles(
		dimensionProgressDirectory({ root, month, dimension }),
	);
	const patchFiles = await listJsonFiles(
		dimensionPatchDirectory({ root, month, dimension }),
	);
	const records = [];

	for (const filePath of [...progressFiles, ...patchFiles]) {
		const document = await readJsonFile(filePath);

		if (document.month !== month || document.target_fingerprint !== targetFingerprint) {
			throw new TypeError(`Progress target/month mismatch: ${filePath}`);
		}

		records.push(...collectResultRecords(document, dimension, filePath));
	}
	if (targetIds) {
		const allowed = new Set(targetIds);
		const outside = records.find((record) => !allowed.has(record.id));
		if (outside) {
			throw new TypeError(
				`Progress contains ${dimension} ID ${outside.id} outside the frozen target.`,
			);
		}
	}

	return {
		schemaVersion: COUNT_SCHEMA_VERSION,
		parserSemanticVersion: COUNT_PARSER_SEMANTIC_VERSION,
		progressFiles,
		patchFiles,
		records,
		resultsById: reduceCountResults(records),
	};
}

export async function writeProgressDocument({
	root = DEFAULT_MAINTENANCE_ROOT,
	month,
	dimension,
	targetFingerprint,
	runId,
	observedAt,
	results,
	sliceIndex = null,
	totalSlices = null,
	requestUsage = null,
}) {
	if (!Array.isArray(results)) {
		throw new TypeError("results must be an array.");
	}
	const resultIds = new Set();

	for (const result of results) {
		if (resultIds.has(result.id)) {
			throw new TypeError(`Progress results contain duplicate ID ${result.id}.`);
		}
		resultIds.add(result.id);
		validateCountResult(result, { dimension });
		if (
			truncateToUtcSecond(result.observed_at) !==
			truncateToUtcSecond(observedAt)
		) {
			throw new TypeError(
				"Progress results must share the document run observation timestamp.",
			);
		}
	}

	const storedResults = results.map((result) => {
		const {
			dimension: _dimension,
			observed_at: _observedAt,
			attempts,
			...storedResult
		} = result;
		if (Array.isArray(attempts) && attempts.length) {
			storedResult.attempt_window =
				attempts.length === 1
					? [attempts[0].at, 1]
					: [attempts[0].at, attempts.at(-1).at, attempts.length];
		}
		return storedResult;
	});
	const document = {
		schema_version: COUNT_SCHEMA_VERSION,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		month,
		dimension,
		target_fingerprint: targetFingerprint,
		run_id: String(runId),
		observed_at: observedAt,
		slice_index: sliceIndex,
		total_slices: totalSlices,
		request_usage: requestUsage,
		results: storedResults.sort((left, right) => left.id - right.id),
	};

	let filePath;

	if (sliceIndex !== null) {
		const primaryPath = path.join(
			dimensionProgressDirectory({ root, month, dimension }),
			`slice-${String(sliceIndex + 1).padStart(2, "0")}.json`,
		);
		const existing = await readJsonFile(primaryPath);
		if (!existing) {
			filePath = primaryPath;
		}
	}

	if (!filePath) {
		const safeRunId = String(runId).replace(/[^A-Za-z0-9._-]/g, "-");
		filePath = path.join(
			dimensionPatchDirectory({ root, month, dimension }),
			`${safeRunId}.json`,
		);

		if (await readJsonFile(filePath)) {
			throw new Error(`Immutable progress patch already exists: ${filePath}`);
		}
	}

	await writeJsonFile(filePath, document, { compact: true });

	return {
		path: filePath,
		document,
	};
}

export function summarizeDimensionState({ targetIds, resultsById }) {
	const summary = {
		total: targetIds.length,
		pending: 0,
		positive: 0,
		zero: 0,
		failed: 0,
		unavailable: 0,
	};

	for (const id of targetIds) {
		const result = resultsById.get(id);
		if (!result) {
			summary.pending += 1;
			continue;
		}

		if (result.status === COUNT_STATUSES.POSITIVE) summary.positive += 1;
		else if (result.status === COUNT_STATUSES.ZERO) summary.zero += 1;
		else if (result.status === COUNT_STATUSES.FAILED) summary.failed += 1;
		else if (result.status === COUNT_STATUSES.UNAVAILABLE) summary.unavailable += 1;
	}

	return summary;
}
