import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	canonicalJson,
	sha256Json,
	validateReservationReceipt,
} from "./entity-count-budget.mjs";
import {
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_SCHEMA_VERSION,
	validateCountResult,
	validateTargetSnapshot,
} from "./entity-title-counts.mjs";
import { validateRepairAuditBinding } from "./entity-count-repair-binding.mjs";
import { resolveEntityCountRecoveryWriterCheckout } from "./entity-count-recovery-writer-checkout.mjs";

export const ENTITY_COUNT_RECOVERY_SCHEMA_VERSION = 1;
export const ENTITY_COUNT_RECOVERY_RETENTION_DAYS = 90;
export const ENTITY_COUNT_RECOVERY_ARTIFACT_PREFIX = "maintenance-recovery-v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TARGET_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

const COMPANY_CACHE = ["data/companies.min.json", "data/companies.csv"];
const NETWORK_CACHE = ["data/tv-networks.min.json", "data/tv-networks.csv"];

const WORKLOADS = Object.freeze({
	"company-movie": Object.freeze({
		writerJob: "collect-company-movie",
		usageJob: "collect-company-movie",
		reservationJob: "company-movie",
		runSuffix: "company-movie",
		usageSuffix: "company-movie",
		allocationKey: "collection",
		requestClass: "company-movie",
		dimension: "company-movie",
		entityType: "company",
		totalSlices: 14,
		legacy: Object.freeze({
			paths: Object.freeze([
				...COMPANY_CACHE,
				"data/scan-meta.json",
				"data/production-company-export.json",
			]),
			cachePath: COMPANY_CACHE[0],
			csvPath: COMPANY_CACHE[1],
			outputMarker: Object.freeze({ path: "data/scan-meta.json", key: "last_scan" }),
			exportPath: "data/production-company-export.json",
		}),
	}),
	"company-series": Object.freeze({
		writerJob: "collect-company-series",
		usageJob: "collect-company-series",
		reservationJob: "company-series",
		runSuffix: "company-series",
		usageSuffix: "company-series",
		allocationKey: "collection",
		requestClass: "company-series",
		dimension: "company-series",
		entityType: "company",
		totalSlices: 14,
		legacy: null,
	}),
	"network-series": Object.freeze({
		writerJob: "collect-network-series",
		usageJob: "collect-network-series",
		reservationJob: "network-series",
		runSuffix: "network-series",
		usageSuffix: "network-series",
		allocationKey: "collection",
		requestClass: "network-series",
		dimension: "network-series",
		entityType: "network",
		totalSlices: 2,
		legacy: Object.freeze({
			paths: Object.freeze([
				...NETWORK_CACHE,
				"data/tv-network-scan-meta.json",
				"data/tv-network-export.json",
			]),
			cachePath: NETWORK_CACHE[0],
			csvPath: NETWORK_CACHE[1],
			outputMarker: Object.freeze({
				path: "data/tv-network-scan-meta.json",
				key: "last_scan",
			}),
			exportPath: "data/tv-network-export.json",
		}),
	}),
	"company-repair": Object.freeze({
		writerJob: "repair-company",
		usageJob: "repair-company",
		reservationJob: "cache-repair",
		runSuffix: "company-repair",
		usageSuffix: "company-repair",
		allocationKey: "company_repair",
		requestClass: "company-repair",
		dimension: "company-movie",
		entityType: "company",
		totalSlices: null,
		legacy: Object.freeze({
			paths: Object.freeze([...COMPANY_CACHE, "data/company-cache-repair-meta.json"]),
			cachePath: COMPANY_CACHE[0],
			csvPath: COMPANY_CACHE[1],
			outputMarker: Object.freeze({
				path: "data/company-cache-repair-meta.json",
				key: "last_repair",
			}),
			exportPath: null,
		}),
	}),
	"network-repair": Object.freeze({
		writerJob: "repair-network",
		usageJob: "repair-network",
		reservationJob: "cache-repair",
		runSuffix: "network-repair",
		usageSuffix: "network-repair",
		allocationKey: "network_repair",
		requestClass: "network-repair",
		dimension: "network-series",
		entityType: "network",
		totalSlices: null,
		legacy: Object.freeze({
			paths: Object.freeze([
				...NETWORK_CACHE,
				"data/tv-network-cache-repair-meta.json",
			]),
			cachePath: NETWORK_CACHE[0],
			csvPath: NETWORK_CACHE[1],
			outputMarker: Object.freeze({
				path: "data/tv-network-cache-repair-meta.json",
				key: "last_repair",
			}),
			exportPath: null,
		}),
	}),
});

const CURRENT_MARKERS = Object.freeze({
	company: Object.freeze([
		Object.freeze({ path: "data/scan-meta.json", key: "last_scan" }),
		Object.freeze({ path: "data/company-cache-repair-meta.json", key: "last_repair" }),
	]),
	network: Object.freeze([
		Object.freeze({ path: "data/tv-network-scan-meta.json", key: "last_scan" }),
		Object.freeze({ path: "data/tv-network-cache-repair-meta.json", key: "last_repair" }),
	]),
});

function recoveryError(message, code) {
	return Object.assign(new Error(message), { code });
}

export function getEntityCountRecoveryWorkload(workload) {
	const config = WORKLOADS[workload];
	if (!config) throw new TypeError(`Unknown entity-count recovery workload: ${workload}`);
	return config;
}

export function entityCountRecoveryArtifactName({ runId, runAttempt, workload }) {
	const config = getEntityCountRecoveryWorkload(workload);
	for (const [label, value] of [
		["run ID", runId],
		["run attempt", runAttempt],
	]) {
		if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
			throw new TypeError(`Recovery ${label} contains unsafe artifact-name characters.`);
		}
	}
	return `${ENTITY_COUNT_RECOVERY_ARTIFACT_PREFIX}-${runId}-${runAttempt}-${config.writerJob}`;
}

export function sha256Bytes(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function validateRepositoryPath(value, label = "repository path") {
	if (typeof value !== "string" || !value || value.includes("\\")) {
		throw recoveryError(`${label} must be a nonempty slash-normalized path.`, "unsafe_path");
	}
	if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
		throw recoveryError(`${label} must be repository-relative.`, "absolute_path");
	}
	const normalized = path.posix.normalize(value);
	if (normalized !== value || value === "." || value.startsWith("../") || value.includes("/../")) {
		throw recoveryError(`${label} contains traversal or normalization aliases.`, "path_traversal");
	}
	if (value.split("/").some((part) => !part || part === "." || part === "..")) {
		throw recoveryError(`${label} contains an empty or unsafe segment.`, "unsafe_path");
	}
	return value;
}

function absolutePath(root, relativePath) {
	return path.join(root, ...validateRepositoryPath(relativePath).split("/"));
}

function isInside(parent, candidate) {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function lstatOrNull(filePath) {
	try {
		return await fs.lstat(filePath);
	} catch (error) {
		if (error?.code === "ENOENT") return null;
		throw error;
	}
}

async function assertSafeExistingPath(root, relativePath, { requireFile = true } = {}) {
	const rootReal = await fs.realpath(root);
	let current = root;
	for (const segment of validateRepositoryPath(relativePath).split("/")) {
		current = path.join(current, segment);
		const stat = await lstatOrNull(current);
		if (!stat) throw recoveryError(`Missing recovery path: ${relativePath}`, "missing_file");
		if (stat.isSymbolicLink()) {
			throw recoveryError(`Links and reparse points are forbidden: ${relativePath}`, "link_forbidden");
		}
	}
	const stat = await fs.lstat(current);
	if (requireFile && !stat.isFile()) {
		throw recoveryError(`Recovery payload must be a regular file: ${relativePath}`, "non_regular_file");
	}
	const real = await fs.realpath(current);
	if (!isInside(rootReal, real)) {
		throw recoveryError(`Recovery path escapes its root: ${relativePath}`, "path_escape");
	}
	return current;
}

async function readSafeFile(root, relativePath, { missing = false } = {}) {
	try {
		const filePath = await assertSafeExistingPath(root, relativePath);
		return await fs.readFile(filePath);
	} catch (error) {
		if (missing && error?.code === "missing_file") return null;
		throw error;
	}
}

function parseJson(bytes, label) {
	try {
		return JSON.parse(bytes.toString("utf8"));
	} catch (error) {
		throw recoveryError(`${label} is not valid JSON: ${error.message}`, "invalid_json");
	}
}

function assertExactKeys(value, allowed, label) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw recoveryError(`${label} must be an object.`, "invalid_document");
	}
	const actual = Object.keys(value).sort();
	const expected = [...allowed].sort();
	if (canonicalJson(actual) !== canonicalJson(expected)) {
		throw recoveryError(`${label} has missing or unexpected fields.`, "unexpected_field");
	}
}

export function validateTmdbRequestUsageReceipt(usage, expected = {}) {
	const keys = [
		"schema_version", "reservation_id", "reservation_sha256", "utc_date",
		"planned_month", "workflow", "run_id", "run_attempt", "job",
		"allocation_key", "request_class", "target_dimension", "allowance",
		"attempts_used", "unused_allowance", "first_attempt_at", "last_attempt_at",
		"by_host", "by_status_or_outcome", "retries", "month", "dimension",
		"target_fingerprint",
	];
	assertExactKeys(usage, keys, "TMDB usage receipt");
	if (usage.schema_version !== 2) throw recoveryError("Unsupported usage schema version.", "usage_schema");
	for (const field of [
		"reservation_id", "workflow", "run_id", "run_attempt", "job",
		"allocation_key", "request_class", "target_dimension", "dimension",
	]) {
		if (typeof usage[field] !== "string" || !usage[field]) {
			throw recoveryError(`Usage ${field} is required.`, "usage_identity");
		}
	}
	if (!SHA256_PATTERN.test(usage.reservation_sha256 || "")) {
		throw recoveryError("Usage reservation SHA-256 is invalid.", "usage_hash");
	}
	if (!DATE_PATTERN.test(usage.utc_date || "") || usage.utc_date.slice(0, 7) !== usage.planned_month) {
		throw recoveryError("Usage UTC date/month binding is invalid.", "usage_date");
	}
	if (!MONTH_PATTERN.test(usage.month || "") || usage.month !== usage.planned_month) {
		throw recoveryError("Usage month does not match its planned month.", "usage_month");
	}
	if (!TARGET_FINGERPRINT_PATTERN.test(usage.target_fingerprint || "")) {
		throw recoveryError("Usage target fingerprint is invalid.", "usage_target");
	}
	for (const field of ["allowance", "attempts_used", "unused_allowance", "retries"]) {
		if (!Number.isSafeInteger(usage[field]) || usage[field] < 0) {
			throw recoveryError(`Usage ${field} must be a nonnegative safe integer.`, "usage_totals");
		}
	}
	if (usage.attempts_used + usage.unused_allowance !== usage.allowance) {
		throw recoveryError("Usage attempts and unused allowance do not reconcile.", "usage_totals");
	}
	if (usage.retries > usage.attempts_used) {
		throw recoveryError("Usage retry total exceeds attempts.", "usage_totals");
	}
	const hostKeys = ["api.themoviedb.org", "files.tmdb.org"];
	assertExactKeys(usage.by_host, hostKeys, "Usage host totals");
	const hostTotal = hostKeys.reduce((sum, host) => {
		const value = usage.by_host[host];
		if (!Number.isSafeInteger(value) || value < 0) {
			throw recoveryError("Usage host total is invalid.", "usage_totals");
		}
		return sum + value;
	}, 0);
	if (hostTotal !== usage.attempts_used) {
		throw recoveryError("Usage host totals do not reconcile.", "usage_totals");
	}
	if (!usage.by_status_or_outcome || typeof usage.by_status_or_outcome !== "object" || Array.isArray(usage.by_status_or_outcome)) {
		throw recoveryError("Usage status/outcome totals are invalid.", "usage_totals");
	}
	const outcomeTotal = Object.values(usage.by_status_or_outcome).reduce((sum, value) => {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw recoveryError("Usage status/outcome total is invalid.", "usage_totals");
		}
		return sum + value;
	}, 0);
	if (outcomeTotal !== usage.attempts_used) {
		throw recoveryError("Usage status/outcome totals do not reconcile.", "usage_totals");
	}
	if (usage.attempts_used > 0) {
		if (Number.isNaN(Date.parse(usage.first_attempt_at)) || Number.isNaN(Date.parse(usage.last_attempt_at))) {
			throw recoveryError("Positive usage requires first/last attempt timestamps.", "usage_timestamps");
		}
		if (Date.parse(usage.first_attempt_at) > Date.parse(usage.last_attempt_at)) {
			throw recoveryError("Usage attempt timestamps are reversed.", "usage_timestamps");
		}
	} else if (usage.first_attempt_at !== null || usage.last_attempt_at !== null) {
		throw recoveryError("Zero usage must have null attempt timestamps.", "usage_timestamps");
	}
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (expectedValue !== undefined && usage[field] !== expectedValue) {
			throw recoveryError(`Usage ${field} identity mismatch.`, "usage_identity");
		}
	}
	return usage;
}

function targetPath(month, entityType) {
	return `maintenance/entity-title-counts/months/${month}/targets/${entityType === "company" ? "companies" : "networks"}.json`;
}

function expectedUsagePath(usage, config) {
	return `maintenance/tmdb-request-budget/${usage.utc_date}/usage/${usage.reservation_id}-${config.usageSuffix}.json`;
}

function expectedReservationPath(usage) {
	return `maintenance/tmdb-request-budget/${usage.utc_date}/reservations/${usage.reservation_id}.json`;
}

function safeRunId(runId) {
	return String(runId).replace(/[^A-Za-z0-9._-]/g, "-");
}

function validateProgressDocument({ document, config, usage, target, progressPath }) {
	if (!document || typeof document !== "object" || Array.isArray(document)) {
		throw recoveryError("Typed progress must be an object.", "progress_invalid");
	}
	const expectedRunId = `${usage.run_id}-${usage.run_attempt}-${config.runSuffix}`;
	if (
		document.schema_version !== COUNT_SCHEMA_VERSION ||
		document.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION ||
		document.month !== usage.month ||
		document.dimension !== config.dimension ||
		document.target_fingerprint !== target.target_fingerprint ||
		document.run_id !== expectedRunId ||
		Number.isNaN(Date.parse(document.observed_at)) ||
		!Array.isArray(document.results) ||
		!document.results.length
	) {
		throw recoveryError("Typed progress identity or content is invalid.", "progress_identity");
	}
	if (
		!document.request_usage ||
		document.request_usage.reservation_id !== usage.reservation_id ||
		document.request_usage.attempts_used !== usage.attempts_used
	) {
		throw recoveryError("Typed progress is not bound to the exact usage receipt.", "progress_usage");
	}
	const targetIds = new Set(target.ids);
	const resultIds = new Set();
	for (const stored of document.results) {
		if (resultIds.has(stored?.id)) throw recoveryError("Typed progress contains duplicate IDs.", "progress_duplicate");
		resultIds.add(stored?.id);
		if (!targetIds.has(stored?.id)) throw recoveryError("Typed progress contains an ID outside the target.", "progress_target");
		validateCountResult({ ...stored, dimension: document.dimension, observed_at: document.observed_at });
	}
	const base = `maintenance/entity-title-counts/months/${usage.month}`;
	let expectedPath;
	if (document.slice_index === null) {
		if (document.total_slices !== null) throw recoveryError("Patch progress has invalid slice metadata.", "progress_path");
		expectedPath = `${base}/patches/${config.dimension}/${safeRunId(expectedRunId)}.json`;
	} else {
		if (
			config.totalSlices === null ||
			document.total_slices !== config.totalSlices ||
			!Number.isInteger(document.slice_index) ||
			document.slice_index < 0 ||
			document.slice_index >= config.totalSlices
		) {
			throw recoveryError("Primary progress has invalid slice metadata.", "progress_path");
		}
		expectedPath = `${base}/progress/${config.dimension}/slice-${String(document.slice_index + 1).padStart(2, "0")}.json`;
	}
	if (progressPath !== expectedPath) {
		throw recoveryError(`Typed progress path is not allowed for ${config.writerJob}.`, "progress_path");
	}
	return { expectedRunId, resultCount: document.results.length };
}

function parseCsvRows(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') quoted = false;
			else field += character;
		} else if (character === '"' && field === "") quoted = true;
		else if (character === ",") {
			row.push(field);
			field = "";
		} else if (character === "\n") {
			row.push(field.replace(/\r$/, ""));
			rows.push(row);
			row = [];
			field = "";
		} else field += character;
	}
	if (quoted) throw recoveryError("Legacy CSV contains an unterminated quote.", "legacy_csv");
	if (field || row.length) {
		row.push(field.replace(/\r$/, ""));
		rows.push(row);
	}
	return rows;
}

function validateLegacyCacheBytes({ cacheBytes, csvBytes, entityType }) {
	const cache = parseJson(cacheBytes, `${entityType} legacy cache`);
	if (!Array.isArray(cache)) throw recoveryError("Legacy compact cache must be an array.", "legacy_cache");
	const ids = [];
	for (const entry of cache) {
		if (!entry || !Number.isSafeInteger(entry.i) || entry.i <= 0 || typeof entry.n !== "string") {
			throw recoveryError("Legacy compact cache contains an invalid row.", "legacy_cache");
		}
		ids.push(entry.i);
	}
	if (ids.some((id, index) => index > 0 && id <= ids[index - 1])) {
		throw recoveryError("Legacy compact cache IDs must be unique and ascending.", "legacy_cache");
	}
	const rows = parseCsvRows(csvBytes.toString("utf8"));
	const header = ["id", "name", "titles_count", "headquarters", "origin_country", "homepage", "tmdb_url"];
	if (!rows.length || canonicalJson(rows[0]) !== canonicalJson(header)) {
		throw recoveryError("Legacy CSV header is invalid.", "legacy_csv");
	}
	const csvIds = rows.slice(1).map((row) => Number(row[0]));
	if (rows.slice(1).some((row) => row.length !== header.length) || canonicalJson(csvIds) !== canonicalJson(ids)) {
		throw recoveryError("Legacy CSV rows do not match the compact cache.", "legacy_csv");
	}
	for (const [index, row] of rows.slice(1).entries()) {
		const compact = cache[index];
		if (
			!/^\d+$/.test(row[2]) ||
			!Number.isSafeInteger(Number(row[2])) ||
			Number(row[2]) !== (compact.t || 0) ||
			row[1] !== compact.n ||
			row[3] !== (compact.h || "") ||
			row[4] !== (compact.c || "") ||
			row[6] !== `https://www.themoviedb.org/${entityType}/${compact.i}`
		) {
			throw recoveryError("Legacy CSV values do not match the compact cache.", "legacy_csv");
		}
	}
	return { count: ids.length, ids };
}

function validateLegacyMarker(value, marker, { count, target, minimumMonth = null }) {
	const report = value?.[marker.key];
	if (!report || typeof report !== "object" || Array.isArray(report)) {
		throw recoveryError(`Legacy marker ${marker.path} is invalid.`, "legacy_marker");
	}
	const observedAt = report.finished_at;
	const month = report.month;
	const fingerprint = report.target_fingerprint;
	if (
		Number.isNaN(Date.parse(observedAt)) ||
		!MONTH_PATTERN.test(month || "") ||
		!TARGET_FINGERPRINT_PATTERN.test(fingerprint || "") ||
		report.total_cached !== count
	) {
		throw recoveryError(`Legacy marker ${marker.path} is incomplete.`, "legacy_marker");
	}
	if (minimumMonth && month < minimumMonth) {
		throw recoveryError(`Legacy marker ${marker.path} is older than the recovery month.`, "legacy_stale");
	}
	if (target && month === target.month && fingerprint !== target.target_fingerprint) {
		throw recoveryError(`Legacy marker ${marker.path} conflicts with the frozen target.`, "legacy_target");
	}
	return { observedAt, observedTime: Date.parse(observedAt), month, fingerprint, path: marker.path };
}

async function validateLegacyPayload({ config, payloadByPath, target }) {
	if (!config.legacy) return null;
	const cache = validateLegacyCacheBytes({
		cacheBytes: payloadByPath.get(config.legacy.cachePath),
		csvBytes: payloadByPath.get(config.legacy.csvPath),
		entityType: config.entityType,
	});
	const marker = validateLegacyMarker(
		parseJson(payloadByPath.get(config.legacy.outputMarker.path), config.legacy.outputMarker.path),
		config.legacy.outputMarker,
		{ count: cache.count, target },
	);
	if (marker.month !== target.month || marker.fingerprint !== target.target_fingerprint) {
		throw recoveryError("Legacy output marker does not match the recovery target.", "legacy_target");
	}
	if (config.legacy.exportPath) {
		const metadata = parseJson(payloadByPath.get(config.legacy.exportPath), config.legacy.exportPath);
		if (
			metadata.target_fingerprint !== target.target_fingerprint ||
			metadata.total_ids !== target.total_ids ||
			Number.isNaN(Date.parse(metadata.updated_at))
		) {
			throw recoveryError("Legacy export metadata does not match the recovery target.", "legacy_export");
		}
	}
	return marker;
}

async function readTargetAndReservation({ repositoryRoot, config, usage, reservationPath }) {
	const expectedReservation = expectedReservationPath(usage);
	if (reservationPath !== expectedReservation) {
		throw recoveryError("Reservation path does not match usage identity.", "reservation_path");
	}
	const reservation = parseJson(await readSafeFile(repositoryRoot, reservationPath), "reservation receipt");
	validateReservationReceipt(reservation);
	if (sha256Json(reservation) !== usage.reservation_sha256) {
		throw recoveryError("Committed reservation SHA-256 does not match usage.", "reservation_hash");
	}
	const binding = reservation.bindings?.[config.allocationKey];
	for (const [actual, expected, label] of [
		[reservation.reservation_id, usage.reservation_id, "ID"],
		[reservation.workflow, usage.workflow, "workflow"],
		[reservation.run_id, usage.run_id, "run ID"],
		[reservation.run_attempt, usage.run_attempt, "run attempt"],
		[reservation.job, config.reservationJob, "job"],
		[reservation.planned_month, usage.month, "month"],
		[reservation.planned_utc_date, usage.utc_date, "date"],
		[binding?.request_class, config.requestClass, "request class"],
		[binding?.target_dimension, config.dimension, "dimension"],
		[binding?.approved_allowance, usage.allowance, "allowance"],
		[reservation.allocations?.[config.allocationKey], usage.allowance, "allocation"],
	]) {
		if (actual !== expected) throw recoveryError(`Reservation ${label} mismatch.`, "reservation_identity");
	}
	const targetRelative = targetPath(usage.month, config.entityType);
	const target = parseJson(await readSafeFile(repositoryRoot, targetRelative), "frozen target");
	validateTargetSnapshot(target, { month: usage.month, entityType: config.entityType });
	if (
		target.target_fingerprint !== usage.target_fingerprint ||
		target.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION
	) {
		throw recoveryError("Frozen target does not match usage identity.", "target_identity");
	}
	return { target, targetPath: targetRelative, reservation };
}

async function collectPayload({ repositoryRoot, config, progressPath, usagePath }) {
	const payloadPaths = [usagePath, progressPath, ...(config.legacy?.paths || [])];
	const lower = new Set();
	for (const payloadPath of payloadPaths) {
		validateRepositoryPath(payloadPath, "payload path");
		const folded = payloadPath.toLowerCase();
		if (lower.has(folded)) throw recoveryError("Payload paths collide by case.", "case_collision");
		lower.add(folded);
	}
	const payloadByPath = new Map();
	for (const payloadPath of payloadPaths) {
		payloadByPath.set(payloadPath, await readSafeFile(repositoryRoot, payloadPath));
	}
	return { payloadPaths, payloadByPath };
}

function inventoryHash(files) {
	return sha256Bytes(Buffer.from(canonicalJson([...files].sort((a, b) => a.path.localeCompare(b.path)))));
}

export async function createEntityCountRecoveryPackage({
	repositoryRoot,
	outputRoot,
	workload,
	progressPath,
	usagePath,
	reservationPath,
	baseCommit,
	repository,
	writerCheckoutTrust,
	workflow,
	workflowFile,
	event,
	mode = "collect",
	headRef,
	headSha,
	runId,
	runAttempt,
	createdAt = new Date().toISOString(),
}) {
	const config = getEntityCountRecoveryWorkload(workload);
	for (const value of [repositoryRoot, outputRoot, progressPath, usagePath, reservationPath]) {
		if (typeof value !== "string" || !value) throw new TypeError("Recovery package paths are required.");
	}
	if (mode !== "collect") throw recoveryError("Recovery package mode must be collect.", "manifest_mode");
	if (typeof workflowFile !== "string" || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflowFile)) {
		throw recoveryError("Recovery workflow file identity is invalid.", "manifest_workflow");
	}
	if (typeof event !== "string" || !event) throw recoveryError("Recovery event identity is required.", "manifest_event");
	if (headRef !== "refs/heads/main") throw recoveryError("Recovery packages must originate from main.", "manifest_ref");
	if (!COMMIT_PATTERN.test(headSha || "")) {
		throw recoveryError("Recovery source-run head SHA is invalid.", "manifest_commit");
	}
	const writerCheckout = resolveEntityCountRecoveryWriterCheckout({
		repositoryRoot,
		expectedRepository: repository,
		expectedOrigin: writerCheckoutTrust?.expectedOrigin,
		requireGitHubOrigin: writerCheckoutTrust?.requireGitHubOrigin,
		headSha,
		claimedBaseCommit: baseCommit,
	});
	if (Number.isNaN(Date.parse(createdAt))) throw recoveryError("Package creation time is invalid.", "created_at");
	const usage = parseJson(await readSafeFile(repositoryRoot, usagePath), "TMDB usage receipt");
	validateTmdbRequestUsageReceipt(usage, {
		workflow,
		run_id: runId,
		run_attempt: runAttempt,
		job: config.usageJob,
		allocation_key: config.allocationKey,
		request_class: config.requestClass,
		target_dimension: config.dimension,
		dimension: config.dimension,
	});
	if (usagePath !== expectedUsagePath(usage, config)) {
		throw recoveryError("Usage receipt path is not allowed for this workload.", "usage_path");
	}
	const { target, targetPath: frozenTargetPath } = await readTargetAndReservation({
		repositoryRoot,
		config,
		usage,
		reservationPath,
	});
	const { payloadPaths, payloadByPath } = await collectPayload({
		repositoryRoot,
		config,
		progressPath,
		usagePath,
	});
	const progress = parseJson(payloadByPath.get(progressPath), "typed progress");
	const progressSummary = validateProgressDocument({ config, usage, target, progressPath, document: progress });
	const legacyMarker = await validateLegacyPayload({ config, payloadByPath, target });
	if (usage.attempts_used === 0) {
		return { ready: false, reason: "zero-consumption", usage, progressPath, usagePath };
	}
	const roles = new Map([
		[usagePath, "usage"],
		[progressPath, "typed-progress"],
		...(config.legacy?.paths || []).map((legacyPath) => [legacyPath, "legacy"]),
	]);
	const files = [];
	for (const payloadPath of payloadPaths) {
		const bytes = payloadByPath.get(payloadPath);
		const baseBytes = writerCheckout.readBaseFile(payloadPath);
		if (roles.get(payloadPath) !== "legacy" && baseBytes !== null) {
			throw recoveryError(`Immutable recovery output already existed at base: ${payloadPath}`, "immutable_base_conflict");
		}
		files.push({
			path: payloadPath,
			role: roles.get(payloadPath),
			bytes: bytes.byteLength,
			sha256: sha256Bytes(bytes),
			base_sha256: baseBytes === null ? null : sha256Bytes(baseBytes),
		});
	}
	files.sort((left, right) => left.path.localeCompare(right.path));
	const artifactName = entityCountRecoveryArtifactName({ runId, runAttempt, workload });
	const manifest = {
		schema_version: ENTITY_COUNT_RECOVERY_SCHEMA_VERSION,
		status: "ready",
		artifact_name: artifactName,
		repository,
		base_commit: writerCheckout.baseCommit,
		created_at: createdAt,
		workflow,
		workflow_file: workflowFile,
		event,
		mode,
		head_ref: headRef,
		head_sha: headSha,
		run_id: runId,
		run_attempt: runAttempt,
		writer_job: config.writerJob,
		workload,
		planned_month: usage.month,
		planned_utc_date: usage.utc_date,
		reservation: {
			id: usage.reservation_id,
			path: reservationPath,
			sha256: usage.reservation_sha256,
			allocation_key: usage.allocation_key,
			request_class: usage.request_class,
			target_dimension: usage.target_dimension,
			allowance: usage.allowance,
			attempts_used: usage.attempts_used,
			unused_allowance: usage.unused_allowance,
		},
		target: {
			entity_type: config.entityType,
			path: frozenTargetPath,
			fingerprint: target.target_fingerprint,
			schema_version: target.schema_version,
			parser_semantic_version: target.parser_semantic_version,
		},
		progress: {
			path: progressPath,
			run_id: progressSummary.expectedRunId,
			observed_at: progress.observed_at,
			slice_index: progress.slice_index,
			total_slices: progress.total_slices,
			result_count: progressSummary.resultCount,
		},
		legacy: legacyMarker
			? { paths: [...config.legacy.paths], observed_at: legacyMarker.observedAt }
			: null,
		payload_inventory_sha256: inventoryHash(files),
		files,
	};
	const repositoryReal = await fs.realpath(repositoryRoot);
	const resolvedOutput = path.resolve(outputRoot);
	let existingOutputAncestor = resolvedOutput;
	while (!(await lstatOrNull(existingOutputAncestor))) {
		const parent = path.dirname(existingOutputAncestor);
		if (parent === existingOutputAncestor) break;
		existingOutputAncestor = parent;
	}
	const existingOutputReal = await fs.realpath(existingOutputAncestor);
	const projectedOutputReal = path.resolve(
		existingOutputReal,
		path.relative(existingOutputAncestor, resolvedOutput),
	);
	if (isInside(repositoryReal, projectedOutputReal)) {
		throw recoveryError("Recovery packages must be created outside the repository.", "output_inside_repository");
	}
	await fs.mkdir(resolvedOutput, { recursive: true });
	const outputReal = await fs.realpath(resolvedOutput);
	if (isInside(repositoryReal, outputReal)) {
		throw recoveryError("Recovery packages must be created outside the repository.", "output_inside_repository");
	}
	const artifactRoot = path.join(outputReal, artifactName);
	await fs.mkdir(artifactRoot, { recursive: false });
	try {
		for (const file of files) {
			const destination = absolutePath(path.join(artifactRoot, "payload"), file.path);
			await fs.mkdir(path.dirname(destination), { recursive: true });
			await fs.writeFile(destination, payloadByPath.get(file.path), { flag: "wx" });
		}
		await fs.writeFile(path.join(artifactRoot, "manifest.json"), canonicalJson(manifest), { flag: "wx" });
	} catch (error) {
		await fs.rm(artifactRoot, { recursive: true, force: true });
		throw error;
	}
	return { ready: true, artifactName, artifactRoot, manifest };
}

async function enumerateArtifactFiles(root) {
	const files = [];
	async function visit(directory, relativeDirectory = "") {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
			if (entry.isSymbolicLink()) throw recoveryError(`Artifact contains a link: ${relative}`, "link_forbidden");
			if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
			else if (entry.isFile()) files.push(relative);
			else throw recoveryError(`Artifact contains a non-regular member: ${relative}`, "non_regular_file");
		}
	}
	await visit(root);
	const folded = new Set();
	for (const file of files) {
		const lower = file.toLowerCase();
		if (folded.has(lower)) throw recoveryError("Artifact members collide by case.", "case_collision");
		folded.add(lower);
	}
	return files.sort();
}

function validateManifestShape(manifest, { expectedRepository, expectedRunId, expectedRunAttempt, expectedWorkload }) {
	const config = getEntityCountRecoveryWorkload(expectedWorkload);
	assertExactKeys(
		manifest,
		[
			"schema_version", "status", "artifact_name", "repository", "base_commit", "created_at",
			"workflow", "workflow_file", "event", "mode", "head_ref", "head_sha",
			"run_id", "run_attempt", "writer_job", "workload",
			"planned_month", "planned_utc_date", "reservation", "target", "progress",
			"legacy", "payload_inventory_sha256", "files",
		],
		"Recovery manifest",
	);
	assertExactKeys(
		manifest.reservation,
		[
			"id", "path", "sha256", "allocation_key", "request_class",
			"target_dimension", "allowance", "attempts_used", "unused_allowance",
		],
		"Recovery reservation binding",
	);
	assertExactKeys(
		manifest.target,
		["entity_type", "path", "fingerprint", "schema_version", "parser_semantic_version"],
		"Recovery target binding",
	);
	assertExactKeys(
		manifest.progress,
		["path", "run_id", "observed_at", "slice_index", "total_slices", "result_count"],
		"Recovery progress binding",
	);
	if (manifest.legacy !== null) {
		assertExactKeys(manifest.legacy, ["paths", "observed_at"], "Recovery legacy binding");
	}
	if (
		manifest?.schema_version !== ENTITY_COUNT_RECOVERY_SCHEMA_VERSION ||
		manifest.status !== "ready" ||
		manifest.repository !== expectedRepository ||
		manifest.run_id !== expectedRunId ||
		manifest.run_attempt !== expectedRunAttempt ||
		manifest.workload !== expectedWorkload ||
		manifest.writer_job !== config.writerJob ||
		manifest.artifact_name !== entityCountRecoveryArtifactName({ runId: expectedRunId, runAttempt: expectedRunAttempt, workload: expectedWorkload }) ||
		!COMMIT_PATTERN.test(manifest.base_commit || "") ||
		manifest.mode !== "collect" ||
		!/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(manifest.workflow_file || "") ||
		typeof manifest.event !== "string" || !manifest.event ||
		manifest.head_ref !== "refs/heads/main" ||
		!COMMIT_PATTERN.test(manifest.head_sha || "") ||
		Number.isNaN(Date.parse(manifest.created_at)) ||
		!MONTH_PATTERN.test(manifest.planned_month || "") ||
		!DATE_PATTERN.test(manifest.planned_utc_date || "") ||
		manifest.planned_utc_date.slice(0, 7) !== manifest.planned_month ||
		typeof manifest.workflow !== "string" || !manifest.workflow
	) {
		throw recoveryError("Recovery manifest origin identity is invalid.", "manifest_identity");
	}
	if (!Array.isArray(manifest.files) || !manifest.files.length) {
		throw recoveryError("Recovery manifest inventory is missing.", "manifest_inventory");
	}
	const seen = new Set();
	let previous = "";
	for (const file of manifest.files) {
		assertExactKeys(file, ["path", "role", "bytes", "sha256", "base_sha256"], "Manifest file entry");
		validateRepositoryPath(file?.path, "manifest payload path");
		if (file.path <= previous) throw recoveryError("Manifest inventory is not uniquely sorted.", "manifest_inventory");
		previous = file.path;
		const folded = file.path.toLowerCase();
		if (seen.has(folded)) throw recoveryError("Manifest paths collide by case.", "case_collision");
		seen.add(folded);
		if (!["usage", "typed-progress", "legacy"].includes(file.role) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !SHA256_PATTERN.test(file.sha256 || "") || (file.base_sha256 !== null && !SHA256_PATTERN.test(file.base_sha256 || ""))) {
			throw recoveryError("Manifest file metadata is invalid.", "manifest_inventory");
		}
	}
	if (manifest.payload_inventory_sha256 !== inventoryHash(manifest.files)) {
		throw recoveryError("Manifest payload inventory hash does not match.", "inventory_hash");
	}
	return config;
}

async function readCurrentBytes(repositoryRoot, relativePath) {
	return readSafeFile(repositoryRoot, relativePath, { missing: true });
}

function validateEmbeddedUsageSummary(
	report,
	{
		month,
		dimension,
		targetFingerprint,
		writerJob,
		allocationKey,
		requestClass,
		producerStartedAt,
		producerFinishedAt,
	},
) {
	const summary = report.requests;
	if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
		throw recoveryError("Legacy producer request summary is missing.", "legacy_usage");
	}
	const usage = {
		...summary,
		month,
		dimension,
		target_fingerprint: targetFingerprint,
	};
	validateTmdbRequestUsageReceipt(usage, {
		job: writerJob,
		dimension,
		target_fingerprint: targetFingerprint,
		...(allocationKey ? { allocation_key: allocationKey } : {}),
		...(requestClass ? { request_class: requestClass } : {}),
	});
	const producerStartedTime = Date.parse(producerStartedAt);
	const producerFinishedTime = Date.parse(producerFinishedAt);
	if (
		Number.isNaN(producerStartedTime) ||
		Number.isNaN(producerFinishedTime) ||
		producerStartedTime > producerFinishedTime
	) {
		throw recoveryError("Legacy producer execution window is invalid.", "legacy_usage_window");
	}
	if (usage.attempts_used > 0) {
		const firstAttemptTime = Date.parse(usage.first_attempt_at);
		const lastAttemptTime = Date.parse(usage.last_attempt_at);
		if (firstAttemptTime < producerStartedTime || lastAttemptTime > producerFinishedTime) {
			throw recoveryError(
				"Legacy producer request attempts fall outside its execution window.",
				"legacy_usage_window",
			);
		}
	}
	return summary;
}

async function loadCohortTarget({ repositoryRoot, entityType, month, fingerprint }) {
	const relativePath = targetPath(month, entityType);
	const bytes = await readCurrentBytes(repositoryRoot, relativePath);
	if (!bytes) throw recoveryError("Current newer cohort has no frozen target.", "legacy_target");
	const target = parseJson(bytes, relativePath);
	validateTargetSnapshot(target, { month, entityType });
	if (target.target_fingerprint !== fingerprint) {
		throw recoveryError("Current newer cohort target fingerprint is inconsistent.", "legacy_target");
	}
	return target;
}

export async function collectLegacyCohortCandidates({ repositoryRoot, config, minimumMonth }) {
	const candidates = [];
	for (const marker of CURRENT_MARKERS[config.entityType]) {
		const bytes = await readCurrentBytes(repositoryRoot, marker.path);
		if (!bytes) continue;
		const value = parseJson(bytes, marker.path);
		const report = value?.[marker.key];
		if (!report || typeof report !== "object" || Array.isArray(report)) {
			throw recoveryError(`Legacy marker ${marker.path} is incomplete.`, "legacy_marker");
		}
		const observedTime = Date.parse(report.finished_at);
		if (Number.isNaN(observedTime) || !MONTH_PATTERN.test(report.month || "")) {
			throw recoveryError(`Legacy marker ${marker.path} has invalid time or month.`, "legacy_marker");
		}
		if (report.month < minimumMonth) continue;
		candidates.push({
			kind: marker.key === "last_scan" ? "scan" : "repair",
			marker,
			value,
			report,
			observedTime,
			path: marker.path,
		});
	}
	return candidates.sort((left, right) => right.observedTime - left.observedTime || left.path.localeCompare(right.path));
}

export async function validateScanLegacyCohort({ repositoryRoot, config, candidate, minimumMonth }) {
	const cacheBytes = await readCurrentBytes(repositoryRoot, config.legacy.cachePath);
	const csvBytes = await readCurrentBytes(repositoryRoot, config.legacy.csvPath);
	if (!cacheBytes || !csvBytes) throw recoveryError("Current scan cohort is missing cache files.", "legacy_mixed");
	const cache = validateLegacyCacheBytes({ cacheBytes, csvBytes, entityType: config.entityType });
	const marker = validateLegacyMarker(candidate.value, candidate.marker, { count: cache.count, minimumMonth });
	const report = candidate.report;
	const modes = config.entityType === "company"
		? ["manual_company_rebuild_from_export"]
		: ["tmdb_export_sliced_enrichment", "tmdb_daily_export_full_enrichment"];
	if (
		!modes.includes(report.mode) ||
		!/^\d{4}-\d{2}-\d{2}$/.test(report.export_date || "") ||
		!Number.isSafeInteger(report.export_total_ids) || report.export_total_ids <= 0 ||
		report.target_total_ids !== report.export_total_ids ||
		!Number.isSafeInteger(report.actual_limit) || report.actual_limit < 0 ||
		report.current_ids !== report.actual_limit ||
		report.total_slices !== (config.entityType === "company" ? 14 : 2) ||
		!Number.isSafeInteger(report.checked) || report.checked < 0 ||
		!Number.isSafeInteger(report.found) || report.found < 0 ||
		!Number.isSafeInteger(report.missing) || report.missing < 0 ||
		!Number.isSafeInteger(report.older_unresolved_ids) || report.older_unresolved_ids < 0 ||
		report.checked !== report.current_ids ||
		report.checked !== report.found + report.missing ||
		Number.isNaN(Date.parse(report.started_at)) || Date.parse(report.started_at) > marker.observedTime ||
		typeof report.results !== "object" || report.results === null ||
		["positive", "zero", "failed", "unavailable"].some((key) => !Number.isSafeInteger(report.results[key]) || report.results[key] < 0) ||
		["positive", "zero", "failed", "unavailable"].reduce((sum, key) => sum + report.results[key], 0) !==
			report.current_ids + report.older_unresolved_ids
	) {
		throw recoveryError("Current scan producer marker is incomplete.", "legacy_marker");
	}
	const cohortTarget = await loadCohortTarget({
		repositoryRoot,
		entityType: config.entityType,
		month: marker.month,
		fingerprint: marker.fingerprint,
	});
	if (cohortTarget.total_ids !== report.export_total_ids || cohortTarget.export_date !== report.export_date) {
		throw recoveryError("Current scan marker does not match its frozen target.", "legacy_target");
	}
	const exportPath = config.entityType === "company" ? "data/production-company-export.json" : "data/tv-network-export.json";
	const exportBytes = await readCurrentBytes(repositoryRoot, exportPath);
	if (!exportBytes) throw recoveryError("Current scan cohort is missing its export snapshot.", "legacy_export");
	const snapshot = parseJson(exportBytes, exportPath);
	const updatedTime = Date.parse(snapshot.updated_at);
	if (
		snapshot.export_date !== report.export_date ||
		snapshot.total_ids !== report.export_total_ids ||
		snapshot.target_fingerprint !== marker.fingerprint ||
		snapshot.last_offset !== report.offset ||
		snapshot.last_limit !== report.actual_limit ||
		Number.isNaN(updatedTime) ||
		updatedTime < Date.parse(report.started_at) ||
		updatedTime > marker.observedTime
	) {
		throw recoveryError("Current scan export snapshot is not coherent with its marker.", "legacy_export");
	}
	validateEmbeddedUsageSummary(report, {
		month: marker.month,
		dimension: config.entityType === "company" ? "company-movie" : "network-series",
		targetFingerprint: marker.fingerprint,
		writerJob: config.entityType === "company" ? "collect-company-movie" : "collect-network-series",
		allocationKey: "collection",
		requestClass: config.entityType === "company" ? "company-movie" : "network-series",
		producerStartedAt: report.started_at,
		producerFinishedAt: report.finished_at,
	});
	return { ...marker, kind: "scan", target: cohortTarget };
}

function assertArrayCount(report, field, countField) {
	if (!Array.isArray(report[field]) || report[countField] !== report[field].length) {
		throw recoveryError(`Repair metadata ${field} count is inconsistent.`, "legacy_repair");
	}
}

function validateLegacyIdArray(value, label) {
	if (
		!Array.isArray(value) ||
		value.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
		new Set(value).size !== value.length
	) {
		throw recoveryError(`Repair metadata ${label} is not a unique positive-ID array.`, "legacy_repair");
	}
	return value;
}

export async function validateRepairLegacyCohort({ repositoryRoot, config, candidate, minimumMonth }) {
	const cacheBytes = await readCurrentBytes(repositoryRoot, config.legacy.cachePath);
	const csvBytes = await readCurrentBytes(repositoryRoot, config.legacy.csvPath);
	if (!cacheBytes || !csvBytes) throw recoveryError("Current repair cohort is missing cache files.", "legacy_mixed");
	const cache = validateLegacyCacheBytes({ cacheBytes, csvBytes, entityType: config.entityType });
	const marker = validateLegacyMarker(candidate.value, candidate.marker, { count: cache.count, minimumMonth });
	const report = candidate.report;
	const operation = `${config.entityType}_cache_repair`;
	if (
		report.operation !== operation ||
		!["collect", "retry"].includes(report.mode) ||
		report.status !== "completed" || report.skipped !== false || report.reason !== null ||
		report.binding_error !== null ||
		report.failed_count !== 0 || report.processed_missing_count !== report.missing_requested_count ||
		report.cap?.exceeded !== false ||
		report.cap?.maximum !== report.max_repair_ids ||
		report.cap?.requested !== report.requested_repair_count ||
		report.typed_counts_active !== true ||
		report.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION ||
		Number.isNaN(Date.parse(report.started_at)) || Date.parse(report.started_at) > marker.observedTime ||
		typeof report.request_plan !== "object" || report.request_plan === null
	) {
		throw recoveryError("Current repair producer marker is incomplete.", "legacy_repair");
	}
	for (const [field, countField] of [
		["missing_requested", "missing_requested_count"],
		["extra_requested", "extra_requested_count"],
		["processed_missing", "processed_missing_count"],
		["added", "added_count"],
		["removed", "removed_count"],
		["not_found", "not_found_count"],
		["failed", "failed_count"],
		["unavailable", "unavailable_count"],
	]) assertArrayCount(report, field, countField);
	for (const field of [
		"missing_requested",
		"missing_outside_frozen_target",
		"extra_requested",
		"processed_missing",
		"added",
		"removed",
		"not_found",
		"unavailable",
		"typed_count_reused",
		"typed_progress_written",
	]) validateLegacyIdArray(report[field], field);
	if (
		report.requested_repair_count !== report.missing_requested_count + report.extra_requested_count ||
		report.processed_repair_count !== report.processed_missing_count + report.removed_count ||
		canonicalJson(report.processed_missing) !== canonicalJson(report.missing_requested) ||
		canonicalJson(report.removed) !== canonicalJson(report.extra_requested) ||
		report.request_plan.details_requests !== report.missing_requested_count ||
		report.request_plan.typed_count_reuse !== report.typed_count_reused.length ||
		report.request_plan.discover_requests !==
			report.missing_requested_count - report.typed_count_reused.length ||
		report.request_plan.base_requests !==
			report.request_plan.details_requests + report.request_plan.discover_requests
	) {
		throw recoveryError("Current repair producer counts do not reconcile.", "legacy_repair");
	}
	const cohortTarget = await loadCohortTarget({
		repositoryRoot,
		entityType: config.entityType,
		month: marker.month,
		fingerprint: marker.fingerprint,
	});
	const auditPath = config.entityType === "company" ? "data/company-id-audit.json" : "data/tv-network-id-audit.json";
	const auditBytes = await readCurrentBytes(repositoryRoot, auditPath);
	if (!auditBytes) throw recoveryError("Current repair cohort is missing its source audit.", "legacy_audit");
	const audit = parseJson(auditBytes, auditPath);
	validateLegacyIdArray(audit.missing_from_cache, "audit missing_from_cache");
	validateLegacyIdArray(audit.extra_in_cache, "audit extra_in_cache");
	if (
		canonicalJson(report.missing_requested) !== canonicalJson(audit.missing_from_cache) ||
		canonicalJson(report.extra_requested) !== canonicalJson(audit.extra_in_cache)
	) {
		throw recoveryError("Current repair marker does not match its audit ID sets.", "legacy_audit");
	}
	const maxAgeHours = report.audit_freshness?.max_age_hours;
	const freshness = validateRepairAuditBinding({
		audit,
		target: cohortTarget,
		expectedDataset: config.entityType === "company" ? "companies" : "networks",
		expectedMonth: marker.month,
		now: new Date(report.finished_at),
		maxAgeHours,
		requireTypedTarget: true,
	});
	if (
		report.source_audit_date !== audit.audited_at ||
		report.audit_freshness?.audited_at !== freshness.audited_at ||
		report.audit_freshness?.max_age_hours !== freshness.max_age_hours
	) {
		throw recoveryError("Current repair audit metadata is inconsistent.", "legacy_audit");
	}
	validateEmbeddedUsageSummary(report, {
		month: marker.month,
		dimension: config.entityType === "company" ? "company-movie" : "network-series",
		targetFingerprint: marker.fingerprint,
		writerJob: config.entityType === "company" ? "repair-company" : "repair-network",
		allocationKey: config.entityType === "company" ? "company_repair" : "network_repair",
		requestClass: config.entityType === "company" ? "company-repair" : "network-repair",
		producerStartedAt: report.started_at,
		producerFinishedAt: report.finished_at,
	});
	return { ...marker, kind: "repair", target: cohortTarget };
}

export async function selectAuthoritativeNewerLegacyCohort({ repositoryRoot, config, artifactObservedAt, minimumMonth }) {
	const candidates = await collectLegacyCohortCandidates({ repositoryRoot, config, minimumMonth });
	if (!candidates.length) throw recoveryError("Current legacy state has no validating producer marker.", "legacy_mixed");
	const newestTime = candidates[0].observedTime;
	if (newestTime <= Date.parse(artifactObservedAt)) {
		throw recoveryError("Current legacy state differs but is not provably newer.", "legacy_conflict");
	}
	const newest = candidates.filter((candidate) => candidate.observedTime === newestTime);
	if (newest.length !== 1) throw recoveryError("Current legacy state has ambiguous newest producers.", "legacy_mixed");
	return newest[0].kind === "scan"
		? validateScanLegacyCohort({ repositoryRoot, config, candidate: newest[0], minimumMonth })
		: validateRepairLegacyCohort({ repositoryRoot, config, candidate: newest[0], minimumMonth });
}

export async function inspectEntityCountRecoveryPackage({
	artifactRoot,
	repositoryRoot,
	expectedRepository,
	expectedRunId,
	expectedRunAttempt,
	expectedWorkload,
}) {
	const manifestBytes = await readSafeFile(artifactRoot, "manifest.json");
	const manifest = parseJson(manifestBytes, "recovery manifest");
	if (manifestBytes.toString("utf8") !== canonicalJson(manifest)) {
		throw recoveryError("Recovery manifest is not canonical JSON.", "manifest_canonical");
	}
	const config = validateManifestShape(manifest, {
		expectedRepository,
		expectedRunId,
		expectedRunAttempt,
		expectedWorkload,
	});
	const expectedMembers = ["manifest.json", ...manifest.files.map((file) => `payload/${file.path}`)].sort();
	const actualMembers = await enumerateArtifactFiles(artifactRoot);
	if (canonicalJson(actualMembers) !== canonicalJson(expectedMembers)) {
		throw recoveryError("Recovery artifact contains missing or unexpected members.", "artifact_inventory");
	}
	const payloadByPath = new Map();
	for (const file of manifest.files) {
		const bytes = await readSafeFile(path.join(artifactRoot, "payload"), file.path);
		if (bytes.byteLength !== file.bytes || sha256Bytes(bytes) !== file.sha256) {
			throw recoveryError(`Recovery payload hash mismatch: ${file.path}`, "payload_hash");
		}
		payloadByPath.set(file.path, bytes);
	}
	const usageEntry = manifest.files.find((file) => file.role === "usage");
	const progressEntry = manifest.files.find((file) => file.role === "typed-progress");
	if (!usageEntry || !progressEntry || manifest.files.filter((file) => file.role === "usage").length !== 1 || manifest.files.filter((file) => file.role === "typed-progress").length !== 1) {
		throw recoveryError("Recovery artifact must contain one usage and one progress file.", "artifact_inventory");
	}
	const usage = parseJson(payloadByPath.get(usageEntry.path), "TMDB usage receipt");
	validateTmdbRequestUsageReceipt(usage, {
		workflow: manifest.workflow,
		run_id: manifest.run_id,
		run_attempt: manifest.run_attempt,
		job: config.usageJob,
		allocation_key: config.allocationKey,
		request_class: config.requestClass,
		target_dimension: config.dimension,
		dimension: config.dimension,
	});
	if (usage.attempts_used <= 0) throw recoveryError("Recovery rejects zero-consumption usage.", "zero_consumption");
	if (
		usageEntry.path !== expectedUsagePath(usage, config) ||
		manifest.planned_month !== usage.month ||
		manifest.planned_utc_date !== usage.utc_date ||
		manifest.reservation?.id !== usage.reservation_id ||
		manifest.reservation?.path !== expectedReservationPath(usage) ||
		manifest.reservation?.sha256 !== usage.reservation_sha256 ||
		manifest.reservation?.allocation_key !== usage.allocation_key ||
		manifest.reservation?.request_class !== usage.request_class ||
		manifest.reservation?.target_dimension !== usage.target_dimension ||
		manifest.reservation?.attempts_used !== usage.attempts_used ||
		manifest.reservation?.unused_allowance !== usage.unused_allowance ||
		manifest.reservation?.allowance !== usage.allowance ||
		manifest.target?.path !== targetPath(usage.month, config.entityType) ||
		manifest.target?.fingerprint !== usage.target_fingerprint ||
		manifest.target?.entity_type !== config.entityType ||
		manifest.target?.schema_version !== COUNT_SCHEMA_VERSION ||
		manifest.target?.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION ||
		manifest.progress?.path !== progressEntry.path
	) {
		throw recoveryError("Recovery manifest does not match its usage receipt.", "manifest_binding");
	}
	const { target } = await readTargetAndReservation({
		repositoryRoot,
		config,
		usage,
		reservationPath: manifest.reservation.path,
	});
	const progress = parseJson(payloadByPath.get(progressEntry.path), "typed progress");
	const progressSummary = validateProgressDocument({ config, usage, target, progressPath: progressEntry.path, document: progress });
	if (
		manifest.progress.run_id !== progressSummary.expectedRunId ||
		manifest.progress.observed_at !== progress.observed_at ||
		manifest.progress.slice_index !== progress.slice_index ||
		manifest.progress.total_slices !== progress.total_slices ||
		manifest.progress.result_count !== progressSummary.resultCount
	) {
		throw recoveryError("Recovery manifest does not match typed progress.", "manifest_binding");
	}
	const expectedLegacy = config.legacy?.paths || [];
	const actualLegacy = manifest.files.filter((file) => file.role === "legacy").map((file) => file.path);
	if (canonicalJson([...actualLegacy].sort()) !== canonicalJson([...expectedLegacy].sort())) {
		throw recoveryError("Recovery legacy payload is not the static workload allowlist.", "legacy_allowlist");
	}
	const legacyMarker = await validateLegacyPayload({ config, payloadByPath, target });
	if (
		Boolean(manifest.legacy) !== Boolean(legacyMarker) ||
		(legacyMarker && (manifest.legacy.observed_at !== legacyMarker.observedAt || canonicalJson(manifest.legacy.paths) !== canonicalJson(config.legacy.paths)))
	) {
		throw recoveryError("Recovery legacy manifest binding is invalid.", "legacy_binding");
	}
	const writes = [];
	for (const file of manifest.files.filter((entry) => entry.role !== "legacy")) {
		if (file.base_sha256 !== null) throw recoveryError("Immutable payload has a base version.", "immutable_base_conflict");
		const current = await readCurrentBytes(repositoryRoot, file.path);
		if (current === null) writes.push(file.path);
		else if (sha256Bytes(current) !== file.sha256) throw recoveryError(`Immutable current-main conflict: ${file.path}`, "immutable_conflict");
	}
	let legacyDecision = "not-applicable";
	if (config.legacy) {
		const legacyFiles = manifest.files.filter((entry) => entry.role === "legacy");
		const states = [];
		for (const file of legacyFiles) {
			const current = await readCurrentBytes(repositoryRoot, file.path);
			const currentHash = current === null ? null : sha256Bytes(current);
			states.push({ file, currentHash });
		}
		const allPayload = states.every(({ file, currentHash }) => currentHash === file.sha256);
		const allBase = states.every(({ file, currentHash }) => currentHash === file.base_sha256);
		if (allPayload) legacyDecision = "already-applied";
		else if (allBase) {
			legacyDecision = "restore";
			writes.push(...config.legacy.paths);
		} else {
			await selectAuthoritativeNewerLegacyCohort({
				repositoryRoot,
				config,
				artifactObservedAt: manifest.legacy.observed_at,
				minimumMonth: manifest.planned_month,
			});
			legacyDecision = "preserve-newer";
		}
	}
	return { manifest, config, payloadByPath, writes: [...new Set(writes)].sort(), legacyDecision };
}

async function ensureSafeParent(repositoryRoot, relativePath) {
	const rootReal = await fs.realpath(repositoryRoot);
	const segments = validateRepositoryPath(relativePath).split("/").slice(0, -1);
	let current = repositoryRoot;
	for (const segment of segments) {
		const candidate = path.join(current, segment);
		const stat = await lstatOrNull(candidate);
		if (stat) {
			if (!stat.isDirectory() || stat.isSymbolicLink()) throw recoveryError(`Unsafe destination parent: ${relativePath}`, "destination_parent");
		} else await fs.mkdir(candidate);
		current = candidate;
		const real = await fs.realpath(current);
		if (!isInside(rootReal, real)) throw recoveryError(`Destination parent escapes checkout: ${relativePath}`, "path_escape");
	}
}

async function applyWritesTransaction({ repositoryRoot, payloadByPath, writes, beforeReplace = null }) {
	const prepared = [];
	const applied = [];
	try {
		for (const relativePath of writes) {
			await ensureSafeParent(repositoryRoot, relativePath);
			const destination = absolutePath(repositoryRoot, relativePath);
			const token = crypto.randomBytes(12).toString("hex");
			const temporary = `${destination}.recovery-${token}.tmp`;
			const backup = `${destination}.recovery-${token}.bak`;
			await fs.writeFile(temporary, payloadByPath.get(relativePath), { flag: "wx" });
			prepared.push({ relativePath, destination, temporary, backup, hadOriginal: Boolean(await lstatOrNull(destination)) });
		}
		for (const [index, entry] of prepared.entries()) {
			if (beforeReplace) await beforeReplace({ index, relativePath: entry.relativePath });
			if (entry.hadOriginal) await fs.rename(entry.destination, entry.backup);
			await fs.rename(entry.temporary, entry.destination);
			applied.push(entry);
		}
	} catch (error) {
		for (const entry of [...applied].reverse()) {
			await fs.rm(entry.destination, { force: true }).catch(() => {});
			if (entry.hadOriginal) await fs.rename(entry.backup, entry.destination).catch(() => {});
		}
		for (const entry of prepared) {
			await fs.rm(entry.temporary, { force: true }).catch(() => {});
			if (entry.hadOriginal && (await lstatOrNull(entry.backup))) {
				await fs.rename(entry.backup, entry.destination).catch(() => {});
			}
		}
		throw error;
	}
	// All destination renames are now committed. Backup cleanup must never enter
	// the rollback path after an earlier backup has already been deleted.
	for (const entry of applied) {
		if (!entry.hadOriginal) continue;
		await fs.rm(entry.backup, { force: true }).catch((error) => {
			console.warn(`Recovered ${entry.relativePath}, but could not remove its backup: ${error.message}`);
		});
	}
}

export async function recoverEntityCountPackage(options) {
	const inspected = await inspectEntityCountRecoveryPackage(options);
	if (inspected.writes.length) {
		await applyWritesTransaction({
			repositoryRoot: options.repositoryRoot,
			payloadByPath: inspected.payloadByPath,
			writes: inspected.writes,
			beforeReplace: options.transactionHooks?.beforeReplace || null,
		});
	}
	return {
		changed: inspected.writes.length > 0,
		paths: inspected.writes,
		legacyDecision: inspected.legacyDecision,
		manifest: inspected.manifest,
	};
}
