import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import {
	CATALOGUE_PARSER_SEMANTIC_VERSION,
	CATALOGUE_SCHEMA_VERSION,
	utcMonth,
} from "./tmdb-catalogue-counts.mjs";

const gunzip = promisify(zlib.gunzip);

export const TMDB_EXPORT_DATASETS = Object.freeze({
	companies: {
		entityType: "company",
		exportPrefix: "production_company_ids",
	},
	networks: {
		entityType: "network",
		exportPrefix: "tv_network_ids",
	},
});

export function canonicalizeExportIds(ids) {
	if (!Array.isArray(ids)) throw new TypeError("Export IDs must be an array.");
	const normalized = ids.map(Number);
	if (normalized.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
		throw new TypeError("Export IDs must be positive safe integers.");
	}
	if (new Set(normalized).size !== normalized.length) {
		throw new TypeError("Export IDs must be unique.");
	}
	const unique = [...new Set(normalized)].sort((left, right) => left - right);
	if (!unique.length) throw new TypeError("TMDB export must contain at least one entity ID.");
	return unique;
}

export function fingerprintExportIds(ids) {
	return `sha256:${crypto
		.createHash("sha256")
		.update(canonicalizeExportIds(ids).join("\n"))
		.digest("hex")}`;
}

export function formatTmdbExportDate(date) {
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	return `${mm}_${dd}_${yyyy}`;
}

export function recentTmdbExportCandidates(exportPrefix, now = new Date(), daysBack = 7) {
	if (!Number.isInteger(daysBack) || daysBack <= 0) {
		throw new TypeError("daysBack must be a positive integer.");
	}

	return Array.from({ length: daysBack }, (_, offset) => {
		const date = new Date(now);
		date.setUTCDate(date.getUTCDate() - offset);
		const exportDate = formatTmdbExportDate(date);

		return {
			exportDate,
			url: `https://files.tmdb.org/p/exports/${exportPrefix}_${exportDate}.json.gz`,
		};
	});
}

export function parseTmdbExportIds(buffer) {
	const lines = buffer.toString("utf8").trim().split("\n").filter(Boolean);
	if (!lines.length) {
		throw new TypeError("TMDB export must contain at least one entity ID.");
	}
	return canonicalizeExportIds(lines.map((line) => Number(JSON.parse(line).id)));
}

export async function fetchTmdbExportIds({
	requestClient,
	exportPrefix,
	now = new Date(),
	daysBack = 7,
	logger = console,
}) {
	for (const candidate of recentTmdbExportCandidates(exportPrefix, now, daysBack)) {
		logger.log(`Trying export: ${candidate.url}`);
		const { response } = await requestClient.request(candidate.url, {
			auth: false,
			maxAttempts: 1,
			accept: "application/gzip",
		});

		if (!response.ok) {
			logger.log(`Export not available: ${candidate.exportDate} HTTP ${response.status}`);
			continue;
		}

		const compressed = Buffer.from(await response.arrayBuffer());
		const unzipped = await gunzip(compressed);
		const ids = parseTmdbExportIds(unzipped);

		return {
			exportDate: candidate.exportDate,
			ids,
			url: candidate.url,
		};
	}

	throw new Error(`Could not find a recent TMDB export for ${exportPrefix}.`);
}

export function buildSnapshotFromExport({
	entityType,
	exportData,
	month = utcMonth(),
	createdAt = new Date().toISOString(),
}) {
	if (!["company", "network"].includes(entityType)) {
		throw new TypeError("Export entity type must be company or network.");
	}
	if (!/^\d{2}_\d{2}_\d{4}$/.test(exportData?.exportDate || "")) {
		throw new TypeError("Export date must use MM_DD_YYYY.");
	}
	const ids = canonicalizeExportIds(exportData.ids);
	return {
		schema_version: CATALOGUE_SCHEMA_VERSION,
		parser_semantic_version: CATALOGUE_PARSER_SEMANTIC_VERSION,
		entity_type: entityType,
		month,
		export_date: exportData.exportDate,
		total_ids: ids.length,
		target_fingerprint: fingerprintExportIds(ids),
		created_at: new Date(createdAt).toISOString(),
		ids,
	};
}
