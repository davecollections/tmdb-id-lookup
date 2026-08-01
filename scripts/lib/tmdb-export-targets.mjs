import zlib from "node:zlib";
import { promisify } from "node:util";
import {
	buildTargetSnapshot,
	canonicalizeTargetIds,
	utcMonth,
} from "./entity-title-counts.mjs";

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
	return canonicalizeTargetIds(lines.map((line) => Number(JSON.parse(line).id)));
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
	return buildTargetSnapshot({
		entityType,
		month,
		exportDate: exportData.exportDate,
		ids: exportData.ids,
		createdAt,
	});
}
