import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import {
	COUNT_SCHEMA_VERSION,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_DIMENSIONS,
	COUNT_STATUSES,
	isTerminalCountResult,
	truncateToUtcSecond,
	validateCountResult,
	validateTargetSnapshot,
	compareUtcMonths,
	validateUtcMonth,
} from "./entity-title-counts.mjs";
import { summarizeDimensionState } from "./entity-count-progress.mjs";
import { canonicalJson } from "./entity-count-budget.mjs";

export const SIDECAR_LIMITS = Object.freeze({
	maxObservationEntries: 512,
	maxCompanySparseOverrides: 25_000,
	maxRawBytes: 5 * 1024 * 1024,
	maxGzipBytes: Math.floor(1.25 * 1024 * 1024),
});

const DIMENSION_KEYS = Object.freeze({
	[COUNT_DIMENSIONS.COMPANY_MOVIE]: "cm",
	[COUNT_DIMENSIONS.COMPANY_SERIES]: "cs",
	[COUNT_DIMENSIONS.NETWORK_SERIES]: "ns",
});

function sha256Text(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function observationTuple(result) {
	const observedAt = truncateToUtcSecond(result.observed_at);
	return result.status === COUNT_STATUSES.UNAVAILABLE
		? [observedAt, "u", result.unavailable_reason]
		: [observedAt, "k"];
}

function observationKey(tuple) {
	return JSON.stringify(tuple);
}

function collectObservations(dimensionStates) {
	const byKey = new Map();

	for (const { resultsById } of Object.values(dimensionStates)) {
		for (const result of resultsById.values()) {
			if (!isTerminalCountResult(result)) continue;
			const tuple = observationTuple(result);
			byKey.set(observationKey(tuple), tuple);
		}
	}

	const observations = [...byKey.values()].sort((left, right) =>
		observationKey(left).localeCompare(observationKey(right)),
	);
	return {
		observations,
		indexByKey: new Map(
			observations.map((observation, index) => [observationKey(observation), index]),
		),
	};
}

function buildRangesAndOverrides({ targetIds, resultsById, observationIndexByKey }) {
	const ranges = [];
	const overrides = {};
	let run = null;

	function flush() {
		if (!run) return;
		if (run.length >= 2) {
			ranges.push([run.firstId, run.lastId, run.observationIndex]);
		} else {
			overrides[String(run.firstId)] = run.observationIndex;
		}
		run = null;
	}

	for (const id of targetIds) {
		const result = resultsById.get(id);
		const index = observationIndexByKey.get(observationKey(observationTuple(result)));

		if (run && run.observationIndex === index) {
			run.lastId = id;
			run.length += 1;
		} else {
			flush();
			run = {
				firstId: id,
				lastId: id,
				observationIndex: index,
				length: 1,
			};
		}
	}
	flush();

	return { ranges, overrides };
}

function nextCombinedWindowStaleAfter(month) {
	const [year, monthNumber] = month.split("-").map(Number);
	const nextMonth = new Date(Date.UTC(year, monthNumber, 28, 23, 59, 59));
	nextMonth.setUTCHours(nextMonth.getUTCHours() + 72);
	return nextMonth.toISOString().replace(".000Z", "Z");
}

function validateCompleteDimension({ target, state, dimension }) {
	if (
		state?.schemaVersion !== COUNT_SCHEMA_VERSION ||
		state?.parserSemanticVersion !== COUNT_PARSER_SEMANTIC_VERSION
	) {
		throw new TypeError(`${dimension} progress uses an incompatible parser/schema contract.`);
	}
	const targetSet = new Set(target.ids);
	for (const [id, result] of state.resultsById) {
		if (!targetSet.has(id)) {
			throw new TypeError(`${dimension} contains result ${id} outside its frozen target.`);
		}
		validateCountResult(result, { dimension });
	}

	const summary = summarizeDimensionState({
		targetIds: target.ids,
		resultsById: state.resultsById,
	});
	return {
		summary,
		complete: summary.pending === 0 && summary.failed === 0,
	};
}

export function buildEntityCountPublication({
	month,
	companyTarget,
	networkTarget,
	companyMovieState,
	companySeriesState,
	networkSeriesState,
	publishedAt = new Date().toISOString(),
}) {
	validateTargetSnapshot(companyTarget, { month, entityType: "company" });
	validateTargetSnapshot(networkTarget, { month, entityType: "network" });

	const dimensions = {
		[COUNT_DIMENSIONS.COMPANY_MOVIE]: {
			target: companyTarget,
			state: companyMovieState,
		},
		[COUNT_DIMENSIONS.COMPANY_SERIES]: {
			target: companyTarget,
			state: companySeriesState,
		},
		[COUNT_DIMENSIONS.NETWORK_SERIES]: {
			target: networkTarget,
			state: networkSeriesState,
		},
	};
	const summaries = {};
	let complete = true;

	for (const [dimension, entry] of Object.entries(dimensions)) {
		const result = validateCompleteDimension({
			target: entry.target,
			state: entry.state,
			dimension,
		});
		summaries[dimension] = result.summary;
		if (!result.complete) complete = false;
	}

	if (!complete) {
		return {
			complete: false,
			summaries,
			blockers: Object.fromEntries(
				Object.entries(summaries).map(([dimension, summary]) => [
					dimension,
					{ pending: summary.pending, failed: summary.failed },
				]),
			),
		};
	}

	const { observations, indexByKey } = collectObservations(
		Object.fromEntries(
			Object.entries(dimensions).map(([dimension, entry]) => [
				dimension,
				entry.state,
			]),
		),
	);
	const ranges = {};
	const overrides = {};

	for (const [dimension, entry] of Object.entries(dimensions)) {
		const compact = buildRangesAndOverrides({
			targetIds: entry.target.ids,
			resultsById: entry.state.resultsById,
			observationIndexByKey: indexByKey,
		});
		const key = DIMENSION_KEYS[dimension];
		ranges[key] = compact.ranges;
		overrides[key] = compact.overrides;
	}

	const companies = {};
	for (const id of companyTarget.ids) {
		const movie = companyMovieState.resultsById.get(id);
		const series = companySeriesState.resultsById.get(id);
		companies[id] = [
			movie.status === COUNT_STATUSES.UNAVAILABLE ? null : movie.count,
			series.status === COUNT_STATUSES.UNAVAILABLE ? null : series.count,
		];
	}
	const networks = {};
	for (const id of networkTarget.ids) {
		const series = networkSeriesState.resultsById.get(id);
		networks[id] = series.status === COUNT_STATUSES.UNAVAILABLE ? null : series.count;
	}

	const sidecar = {
		v: 1,
		p: COUNT_PARSER_SEMANTIC_VERSION,
		m: month,
		ct: companyTarget.target_fingerprint,
		nt: networkTarget.target_fingerprint,
		o: observations,
		r: {
			cm: ranges.cm,
			cs: ranges.cs,
			ns: ranges.ns,
		},
		x: {
			cm: overrides.cm,
			cs: overrides.cs,
			ns: overrides.ns,
		},
		c: companies,
		n: networks,
	};
	const sidecarJson = JSON.stringify(sidecar);
	const rawBytes = Buffer.byteLength(sidecarJson);
	const gzipBytes = zlib.gzipSync(sidecarJson, { level: 9 }).length;
	const companyOverrideCount =
		Object.keys(overrides.cm).length + Object.keys(overrides.cs).length;
	const networkOverrideLimit = Math.max(
		1,
		Math.ceil(
			(SIDECAR_LIMITS.maxCompanySparseOverrides * networkTarget.total_ids) /
				companyTarget.total_ids,
		),
	);
	const networkOverrideCount = Object.keys(overrides.ns).length;

	if (observations.length > SIDECAR_LIMITS.maxObservationEntries) {
		throw new RangeError(
			`Sidecar has ${observations.length} observations; maximum is ${SIDECAR_LIMITS.maxObservationEntries}.`,
		);
	}
	if (companyOverrideCount > SIDECAR_LIMITS.maxCompanySparseOverrides) {
		throw new RangeError(
			`Sidecar has ${companyOverrideCount} sparse Company overrides; maximum is ${SIDECAR_LIMITS.maxCompanySparseOverrides}.`,
		);
	}
	if (networkOverrideCount > networkOverrideLimit) {
		throw new RangeError(
			`Sidecar has ${networkOverrideCount} sparse Network overrides; maximum is ${networkOverrideLimit}.`,
		);
	}
	if (rawBytes > SIDECAR_LIMITS.maxRawBytes) {
		throw new RangeError(`Sidecar is ${rawBytes} raw bytes; maximum is ${SIDECAR_LIMITS.maxRawBytes}.`);
	}
	if (gzipBytes > SIDECAR_LIMITS.maxGzipBytes) {
		throw new RangeError(
			`Sidecar is ${gzipBytes} gzip bytes; maximum is ${SIDECAR_LIMITS.maxGzipBytes}.`,
		);
	}

	const sidecarSha256 = sha256Text(sidecarJson);
	const staleAfter = nextCombinedWindowStaleAfter(month);
	const completion = {
		schema_version: 1,
		parser_semantic_version: COUNT_PARSER_SEMANTIC_VERSION,
		status: "complete",
		month,
		published_at: publishedAt,
		stale_after: {
			[COUNT_DIMENSIONS.COMPANY_MOVIE]: staleAfter,
			[COUNT_DIMENSIONS.COMPANY_SERIES]: staleAfter,
			[COUNT_DIMENSIONS.NETWORK_SERIES]: staleAfter,
		},
		targets: {
			companies: {
				fingerprint: companyTarget.target_fingerprint,
				total_ids: companyTarget.total_ids,
				export_date: companyTarget.export_date,
			},
			networks: {
				fingerprint: networkTarget.target_fingerprint,
				total_ids: networkTarget.total_ids,
				export_date: networkTarget.export_date,
			},
		},
		dimensions: summaries,
		sidecar: {
			path: "data/entity-title-counts.min.json",
			sha256: sidecarSha256,
			raw_bytes: rawBytes,
			gzip_bytes: gzipBytes,
			observation_entries: observations.length,
			company_sparse_overrides: companyOverrideCount,
			network_sparse_overrides: networkOverrideCount,
			network_sparse_override_limit: networkOverrideLimit,
		},
	};

	return {
		complete: true,
		sidecar,
		sidecarJson,
		completion,
		summaries,
	};
}

export function validateCompletionManifest(completion, sidecarJson) {
	if (!completion || typeof completion !== "object" || Array.isArray(completion)) {
		throw new TypeError("Completion manifest must be an object.");
	}
	if (completion.schema_version !== 1) {
		throw new TypeError(`Unsupported completion schema version: ${completion.schema_version}`);
	}
	if (completion.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION) {
		throw new TypeError(
			`Unsupported completion parser semantic version: ${completion.parser_semantic_version}`,
		);
	}
	if (completion.status !== "complete") {
		throw new TypeError("Completion manifest status must be complete.");
	}
	validateUtcMonth(completion.month, "completion month");
	if (!completion.sidecar || typeof completion.sidecar !== "object") {
		throw new TypeError("Completion manifest sidecar metadata is required.");
	}
	if (Number.isNaN(Date.parse(completion.published_at))) {
		throw new TypeError("Completion published_at must be a valid timestamp.");
	}
	for (const dimension of Object.values(COUNT_DIMENSIONS)) {
		const summary = completion.dimensions?.[dimension];
		if (
			!summary ||
			summary.pending !== 0 ||
			summary.failed !== 0 ||
			![summary.total, summary.positive, summary.zero, summary.unavailable].every(
				(value) => Number.isSafeInteger(value) && value >= 0,
			) ||
			summary.positive + summary.zero + summary.unavailable !== summary.total ||
			Number.isNaN(Date.parse(completion.stale_after?.[dimension]))
		) {
			throw new TypeError(`Completion dimension ${dimension} is incomplete or malformed.`);
		}
	}
	for (const targetKey of ["companies", "networks"]) {
		const target = completion.targets?.[targetKey];
		if (
			!target ||
			!/^sha256:[a-f0-9]{64}$/.test(target.fingerprint || "") ||
			!Number.isSafeInteger(target.total_ids) ||
			target.total_ids < 0
		) {
			throw new TypeError(`Completion ${targetKey} target is malformed.`);
		}
	}
	if (
		completion.dimensions[COUNT_DIMENSIONS.COMPANY_MOVIE].total !==
			completion.targets.companies.total_ids ||
		completion.dimensions[COUNT_DIMENSIONS.COMPANY_SERIES].total !==
			completion.targets.companies.total_ids ||
		completion.dimensions[COUNT_DIMENSIONS.NETWORK_SERIES].total !==
			completion.targets.networks.total_ids ||
		completion.sidecar.path !== "data/entity-title-counts.min.json"
	) {
		throw new TypeError("Completion dimension totals or sidecar path are incompatible.");
	}
	if (!/^[a-f0-9]{64}$/.test(completion.sidecar.sha256 || "")) {
		throw new TypeError("Completion sidecar SHA-256 is invalid.");
	}
	if (typeof sidecarJson === "string") {
		if (sha256Text(sidecarJson) !== completion.sidecar.sha256) {
			throw new TypeError("Existing sidecar does not match its completion manifest.");
		}
		let sidecar;
		try {
			sidecar = JSON.parse(sidecarJson);
		} catch (error) {
			throw new TypeError(`Existing sidecar is malformed JSON: ${error.message}`);
		}
		if (
			sidecar.v !== 1 ||
			sidecar.p !== COUNT_PARSER_SEMANTIC_VERSION ||
			sidecar.m !== completion.month
		) {
			throw new TypeError("Existing sidecar and completion contracts are incompatible.");
		}
		if (
			Object.keys(sidecar.c || {}).length !== completion.targets.companies.total_ids ||
			Object.keys(sidecar.n || {}).length !== completion.targets.networks.total_ids ||
			!Array.isArray(sidecar.o) ||
			!sidecar.r ||
			!sidecar.x
		) {
			throw new TypeError("Existing sidecar entity/observation structure is incompatible.");
		}
		const safeIdKey = (key) => {
			const value = Number(key);
			return Number.isSafeInteger(value) && value > 0 && String(value) === key;
		};
		const entityKeys = [
			...Object.keys(sidecar.c || {}),
			...Object.keys(sidecar.n || {}),
			...Object.values(sidecar.x || {}).flatMap((entries) => Object.keys(entries || {})),
		];
		const rangeIds = Object.values(sidecar.r || {}).flatMap((ranges) =>
			(ranges || []).flatMap((range) => range.slice(0, 2)),
		);
		if (
			entityKeys.some((key) => !safeIdKey(key)) ||
			rangeIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
		) {
			throw new TypeError("Existing sidecar contains an unsafe entity ID.");
		}
		if (
			sidecar.ct !== completion.targets.companies.fingerprint ||
			sidecar.nt !== completion.targets.networks.fingerprint ||
			Buffer.byteLength(sidecarJson) !== completion.sidecar.raw_bytes ||
			zlib.gzipSync(sidecarJson, { level: 9 }).length !== completion.sidecar.gzip_bytes ||
			sidecar.o.length !== completion.sidecar.observation_entries
		) {
			throw new TypeError("Existing sidecar measurements/targets do not match completion.");
		}
		const companySparse =
			Object.keys(sidecar.x?.cm || {}).length + Object.keys(sidecar.x?.cs || {}).length;
		const networkSparse = Object.keys(sidecar.x?.ns || {}).length;
		if (
			companySparse !== completion.sidecar.company_sparse_overrides ||
			networkSparse !== completion.sidecar.network_sparse_overrides ||
			completion.sidecar.raw_bytes > SIDECAR_LIMITS.maxRawBytes ||
			completion.sidecar.gzip_bytes > SIDECAR_LIMITS.maxGzipBytes ||
			completion.sidecar.observation_entries > SIDECAR_LIMITS.maxObservationEntries ||
			companySparse > SIDECAR_LIMITS.maxCompanySparseOverrides ||
			networkSparse > completion.sidecar.network_sparse_override_limit
		) {
			throw new TypeError("Existing sidecar guardrails/override measurements are invalid.");
		}
	}
	return completion;
}

export function decidePublicationReplacement({ existingCompletion, existingSidecarJson, publication }) {
	validateCompletionManifest(publication.completion, publication.sidecarJson);
	if (!existingCompletion && existingSidecarJson === null) {
		return { action: "publish", reason: "first_publication" };
	}
	if (!existingCompletion || typeof existingSidecarJson !== "string") {
		throw new Error("Published sidecar/completion pair is incomplete; refusing replacement.");
	}
	validateCompletionManifest(existingCompletion, existingSidecarJson);
	const comparison = compareUtcMonths(publication.completion.month, existingCompletion.month);
	if (comparison < 0) {
		return { action: "preserve", reason: "newer_month_already_published" };
	}
	if (comparison === 0) {
		if (
			canonicalJson(JSON.parse(existingSidecarJson)) ===
				canonicalJson(JSON.parse(publication.sidecarJson))
		) {
			return { action: "preserve", reason: "already_current" };
		}
		throw new Error("A different complete sidecar is already published for this month.");
	}
	return { action: "publish", reason: "newer_complete_month" };
}

export async function writePublicationFiles({
	publication,
	sidecarPath,
	completionPath,
	fsOps = fs,
	nonceFactory = () => `${process.pid}-${Date.now()}`,
}) {
	const existingSidecarJson = await fsOps.readFile(sidecarPath, "utf8").catch((error) => {
		if (error?.code === "ENOENT") return null;
		throw error;
	});
	const existingCompletionRaw = await fsOps.readFile(completionPath, "utf8").catch((error) => {
		if (error?.code === "ENOENT") return null;
		throw error;
	});
	let existingCompletion = null;
	if (existingCompletionRaw !== null) {
		try {
			existingCompletion = JSON.parse(existingCompletionRaw);
		} catch (error) {
			throw new TypeError(`Existing completion manifest is malformed JSON: ${error.message}`);
		}
	}
	const decision = decidePublicationReplacement({
		existingCompletion,
		existingSidecarJson,
		publication,
	});
	if (decision.action !== "publish") return { published: false, reason: decision.reason };

	await fsOps.mkdir(path.dirname(sidecarPath), { recursive: true });
	await fsOps.mkdir(path.dirname(completionPath), { recursive: true });
	const nonce = nonceFactory();
	const temporarySidecar = `${sidecarPath}.${nonce}.tmp`;
	const temporaryCompletion = `${completionPath}.${nonce}.tmp`;
	const backupSidecar = `${sidecarPath}.${nonce}.bak`;
	const backupCompletion = `${completionPath}.${nonce}.bak`;
	const completionJson = `${JSON.stringify(publication.completion, null, 2)}\n`;
	let preserveBackups = false;
	try {
		await fsOps.writeFile(temporarySidecar, publication.sidecarJson, { flag: "wx" });
		await fsOps.writeFile(temporaryCompletion, completionJson, { flag: "wx" });
		if (existingSidecarJson !== null) {
			await fsOps.writeFile(backupSidecar, existingSidecarJson, { flag: "wx" });
		}
		if (existingCompletionRaw !== null) {
			await fsOps.writeFile(backupCompletion, existingCompletionRaw, { flag: "wx" });
		}
		await fsOps.rename(temporarySidecar, sidecarPath);
		try {
			await fsOps.rename(temporaryCompletion, completionPath);
		} catch (error) {
			try {
				await fsOps.rm(sidecarPath, { force: true });
				if (existingSidecarJson !== null) await fsOps.rename(backupSidecar, sidecarPath);
				await fsOps.rm(completionPath, { force: true });
				if (existingCompletionRaw !== null) {
					await fsOps.rename(backupCompletion, completionPath);
				}
			} catch (rollbackError) {
				preserveBackups = true;
				throw new Error(
					`Publication replacement failed and rollback restoration failed: ${rollbackError.message}. Backups were retained at ${backupSidecar} and ${backupCompletion}.`,
					{ cause: new AggregateError([error, rollbackError]) },
				);
			}
			throw error;
		}
	} finally {
		await Promise.allSettled([
			fsOps.rm(temporarySidecar, { force: true }),
			fsOps.rm(temporaryCompletion, { force: true }),
			...(preserveBackups
				? []
				: [
					fsOps.rm(backupSidecar, { force: true }),
					fsOps.rm(backupCompletion, { force: true }),
				]),
		]);
	}
	return { published: true, reason: decision.reason };
}
