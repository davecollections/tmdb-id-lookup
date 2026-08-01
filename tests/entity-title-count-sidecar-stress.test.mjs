import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	buildEntityCountPublication,
	SIDECAR_LIMITS,
} from "../scripts/lib/entity-count-publication.mjs";
import {
	COUNT_DIMENSIONS,
	COUNT_PARSER_SEMANTIC_VERSION,
	COUNT_STATUSES,
	buildTargetSnapshot,
} from "../scripts/lib/entity-title-counts.mjs";

const MONTH = "2026-09";
const COMPANY_COUNT = 255_201;
const NETWORK_COUNT = 5_504;

function timestamp(day, hour, minute = 0, second = 0) {
	return new Date(Date.UTC(2026, 8, day, hour, minute, second)).toISOString();
}

function state(dimension, resultsById) {
	return {
		schemaVersion: 1,
		parserSemanticVersion: COUNT_PARSER_SEMANTIC_VERSION,
		resultsById,
	};
}

function sparseIds(total, count, step, offset, baseRuns) {
	const boundaries = Array.from({ length: baseRuns - 1 }, (_, index) =>
		Math.floor((total * (index + 1)) / baseRuns),
	);
	const ids = [];
	for (let candidate = offset; candidate <= total && ids.length < count; candidate += step) {
		if (boundaries.some((boundary) => Math.abs(candidate - boundary) <= 4)) continue;
		ids.push(candidate);
	}
	if (ids.length !== count) throw new Error(`Unable to create ${count} sparse IDs.`);
	return ids;
}

function known(id, dimension, observedAt) {
	const count = id % 9 === 0 ? 0 : (id % 37) + 1;
	return {
		id,
		dimension,
		status: count === 0 ? COUNT_STATUSES.ZERO : COUNT_STATUSES.POSITIVE,
		count,
		observed_at: observedAt,
	};
}

function unavailable(id, dimension, observedAt) {
	return {
		id,
		dimension,
		status: COUNT_STATUSES.UNAVAILABLE,
		count: null,
		observed_at: observedAt,
		unavailable_reason: "entity_not_found_confirmed",
		evidence: [
			{ kind: "details_404", observed_at: "2026-09-14T09:00:00Z" },
			{ kind: "details_404", observed_at: "2026-09-15T09:00:00Z" },
		],
	};
}

function buildRunState({ ids, dimension, baseRuns, patchIds = [], patchRuns = 0, patchHour = 10 }) {
	const results = new Map();
	for (let index = 0; index < ids.length; index += 1) {
		const run = Math.min(baseRuns - 1, Math.floor((index * baseRuns) / ids.length));
		const baseHour = dimension === COUNT_DIMENSIONS.NETWORK_SERIES ? 8 : 9;
		const baseDay =
			dimension === COUNT_DIMENSIONS.COMPANY_SERIES ? 15 + run : 1 + run;
		results.set(ids[index], known(ids[index], dimension, timestamp(baseDay, baseHour, run % 60)));
	}
	for (let index = 0; index < patchIds.length; index += 1) {
		const id = patchIds[index];
		const patchRun = index % patchRuns;
		const observedAt = timestamp(28, patchHour, Math.floor(patchRun / 60), patchRun % 60);
		results.set(
			id,
			patchRun === 0
				? unavailable(id, dimension, observedAt)
				: known(id, dimension, observedAt),
		);
	}
	return state(dimension, results);
}

test("current-scale sidecar stays below fixed observation, sparse and byte guardrails", async (context) => {
	const companyIds = Array.from({ length: COMPANY_COUNT }, (_, index) => index + 1);
	const networkIds = Array.from({ length: NETWORK_COUNT }, (_, index) => index + 1);
	const companyPatchIds = sparseIds(COMPANY_COUNT, 10_000, 25, 13, 14);
	const networkPatchIds = sparseIds(NETWORK_COUNT, 200, 27, 7, 2);
	const companyTarget = buildTargetSnapshot({
		entityType: "company",
		month: MONTH,
		ids: companyIds,
		createdAt: "2026-09-01T08:00:00Z",
	});
	const networkTarget = buildTargetSnapshot({
		entityType: "network",
		month: MONTH,
		ids: networkIds,
		createdAt: "2026-09-01T08:00:00Z",
	});
	const companyMovieState = buildRunState({
		ids: companyIds,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		baseRuns: 14,
		patchIds: companyPatchIds,
		patchRuns: 96,
	});
	const companySeriesState = buildRunState({
		ids: companyIds,
		dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
		baseRuns: 14,
	});
	const networkSeriesState = buildRunState({
		ids: networkIds,
		dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
		baseRuns: 2,
		patchIds: networkPatchIds,
		patchRuns: 2,
		patchHour: 11,
	});
	const publication = buildEntityCountPublication({
		month: MONTH,
		companyTarget,
		networkTarget,
		companyMovieState,
		companySeriesState,
		networkSeriesState,
		publishedAt: "2026-09-28T11:00:00Z",
	});

	assert.equal(publication.complete, true);
	assert.equal(publication.completion.sidecar.observation_entries, 128);
	assert.equal(publication.completion.sidecar.company_sparse_overrides, 10_000);
	assert.equal(publication.completion.sidecar.network_sparse_overrides, 200);
	assert.ok(publication.completion.sidecar.raw_bytes < SIDECAR_LIMITS.maxRawBytes);
	assert.ok(publication.completion.sidecar.gzip_bytes < SIDECAR_LIMITS.maxGzipBytes);
	console.log(
		JSON.stringify({
			stress_sidecar: publication.completion.sidecar,
			company_target_ids: COMPANY_COUNT,
			network_target_ids: NETWORK_COUNT,
		}),
	);

	const root = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-sidecar-stress-"));
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const existingPath = path.join(root, "last-known-good.json");
	await fs.writeFile(existingPath, publication.sidecarJson);
	const existingBytes = await fs.readFile(existingPath);
	const excessivePatchIds = sparseIds(COMPANY_COUNT, 25_001, 10, 5, 14);
	const excessiveMovieState = buildRunState({
		ids: companyIds,
		dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
		baseRuns: 14,
		patchIds: excessivePatchIds,
		patchRuns: 2,
	});
	assert.throws(
		() =>
			buildEntityCountPublication({
				month: MONTH,
				companyTarget,
				networkTarget,
				companyMovieState: excessiveMovieState,
				companySeriesState,
				networkSeriesState,
			}),
		/maximum is 25000/,
	);
	assert.deepEqual(await fs.readFile(existingPath), existingBytes);
});
