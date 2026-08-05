import fs from "node:fs/promises";
import path from "node:path";
import {
	createEntityCountRecoveryPackage,
} from "./lib/entity-count-recovery.mjs";

async function appendOutputs(values) {
	if (!process.env.GITHUB_OUTPUT) return;
	const lines = [];
	for (const [key, raw] of Object.entries(values)) {
		const value = String(raw ?? "");
		if (value.includes("\n")) {
			const delimiter = `RECOVERY_${key}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
			lines.push(`${key}<<${delimiter}`, value, delimiter);
		} else lines.push(`${key}=${value}`);
	}
	await fs.appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

const repositoryRoot = process.cwd();
const outputRoot = process.env.RECOVERY_OUTPUT_ROOT;
const workload = process.env.RECOVERY_WORKLOAD;
const progressPath = process.env.RECOVERY_PROGRESS_PATH;
const usagePath = process.env.RECOVERY_USAGE_PATH;
const reservationPath = process.env.RECOVERY_RESERVATION_PATH;

function workflowFileFromRef(value) {
	const match = String(value || "").match(/^[^/]+\/[^/]+\/(\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml)@/);
	if (!match) throw new Error("GITHUB_WORKFLOW_REF does not identify a repository workflow file.");
	return match[1];
}

if (!outputRoot) throw new Error("RECOVERY_OUTPUT_ROOT is required and must be outside the checkout.");

const result = await createEntityCountRecoveryPackage({
	repositoryRoot,
	outputRoot: path.resolve(outputRoot),
	workload,
	progressPath,
	usagePath,
	reservationPath,
	repository: process.env.GITHUB_REPOSITORY,
	workflow: process.env.GITHUB_WORKFLOW,
	workflowFile: workflowFileFromRef(process.env.GITHUB_WORKFLOW_REF),
	event: process.env.GITHUB_EVENT_NAME,
	mode: "collect",
	headRef: process.env.GITHUB_REF,
	headSha: process.env.GITHUB_SHA,
	runId: String(process.env.GITHUB_RUN_ID || ""),
	runAttempt: String(process.env.GITHUB_RUN_ATTEMPT || ""),
});

if (!result.ready) {
	console.log("Typed writer used zero TMDB requests; no recovery-ready artifact was created.");
	await appendOutputs({ ready: "false", reason: result.reason, artifact_name: "", package_path: "", manifest_path: "" });
	process.exit(0);
}

console.log(
	JSON.stringify(
		{
			recovery_package: {
				artifact_name: result.artifactName,
				package_path: result.artifactRoot,
				files: result.manifest.files.length,
				inventory_sha256: result.manifest.payload_inventory_sha256,
				retention_days: 90,
			},
		},
		null,
		2,
	),
);
await appendOutputs({
	ready: "true",
	reason: "ready",
	artifact_name: result.artifactName,
	package_path: result.artifactRoot,
	manifest_path: path.join(result.artifactRoot, "manifest.json"),
	planned_month: result.manifest.planned_month,
});
