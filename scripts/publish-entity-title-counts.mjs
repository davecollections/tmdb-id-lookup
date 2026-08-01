import fs from "node:fs/promises";
import path from "node:path";
import {
	loadDimensionState,
	loadTargetSnapshot,
} from "./lib/entity-count-progress.mjs";
import {
	buildEntityCountPublication,
	writePublicationFiles,
} from "./lib/entity-count-publication.mjs";
import { COUNT_DIMENSIONS, utcMonth } from "./lib/entity-title-counts.mjs";

const month = process.env.COUNT_MONTH || utcMonth();
const validateOnly = process.env.VALIDATION_ONLY === "true";
const publicationDisabled = process.env.PUBLICATION_DISABLED === "true";
const sidecarPath = process.env.SIDECAR_PATH || path.join("data", "entity-title-counts.min.json");
const completionPath =
	process.env.COMPLETION_PATH || path.join("data", "entity-title-counts-completion.json");

async function reportPublication(result) {
	console.log(JSON.stringify(result, null, 2));
	if (!process.env.GITHUB_STEP_SUMMARY) return;

	const lines = [
		"## Entity title-count publication",
		"",
		`- Month: \`${result.month}\``,
		`- Published: **${result.published ? "yes" : "no"}**`,
		`- Result: \`${result.reason || "complete"}\``,
	];
	if (result.blockers) {
		for (const [dimension, blockers] of Object.entries(result.blockers)) {
			lines.push(
				`- ${dimension}: ${blockers.pending} pending, ${blockers.failed} failed`,
			);
		}
	}
	if (result.sidecar) {
		lines.push(
			`- Sidecar: ${result.sidecar.raw_bytes.toLocaleString()} raw bytes, ${result.sidecar.gzip_bytes.toLocaleString()} gzip bytes, ${result.sidecar.observation_entries} observations`,
		);
	}
	await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

const companyTarget = await loadTargetSnapshot({ month, entityType: "company" });
const networkTarget = await loadTargetSnapshot({ month, entityType: "network" });

if (!companyTarget || !networkTarget) {
	await reportPublication({
		published: false,
		month,
		reason: "missing_target",
		company_target: Boolean(companyTarget),
		network_target: Boolean(networkTarget),
	});
	process.exit(0);
}

const companyMovieState = await loadDimensionState({
	month,
	dimension: COUNT_DIMENSIONS.COMPANY_MOVIE,
	targetFingerprint: companyTarget.target_fingerprint,
	targetIds: companyTarget.ids,
});
const companySeriesState = await loadDimensionState({
	month,
	dimension: COUNT_DIMENSIONS.COMPANY_SERIES,
	targetFingerprint: companyTarget.target_fingerprint,
	targetIds: companyTarget.ids,
});
const networkSeriesState = await loadDimensionState({
	month,
	dimension: COUNT_DIMENSIONS.NETWORK_SERIES,
	targetFingerprint: networkTarget.target_fingerprint,
	targetIds: networkTarget.ids,
});
const publication = buildEntityCountPublication({
	month,
	companyTarget,
	networkTarget,
	companyMovieState,
	companySeriesState,
	networkSeriesState,
});

if (!publication.complete) {
	await reportPublication({
		published: false,
		month,
		reason: "incomplete",
		blockers: publication.blockers,
		summaries: publication.summaries,
	});
	process.exit(0);
}

if (validateOnly || publicationDisabled) {
	await reportPublication({
		published: false,
		valid: true,
		month,
		reason: validateOnly ? "validation_only" : "publication_disabled",
		sidecar: publication.completion.sidecar,
	});
	process.exit(0);
}

const writeResult = await writePublicationFiles({ publication, sidecarPath, completionPath });

await reportPublication({
	published: writeResult.published,
	month,
	reason: writeResult.reason,
	sidecar: publication.completion.sidecar,
});
