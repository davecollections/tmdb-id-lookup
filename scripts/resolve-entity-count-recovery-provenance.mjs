import fs from "node:fs/promises";
import path from "node:path";
import {
	createGitHubActionsApiClient,
	resolveEntityCountRecoveryProvenance,
} from "./lib/entity-count-recovery-provenance.mjs";

async function appendOutputs(values) {
	if (!process.env.GITHUB_OUTPUT) return;
	await fs.appendFile(
		process.env.GITHUB_OUTPUT,
		`${Object.entries(values).map(([key, value]) => `${key}=${String(value)}`).join("\n")}\n`,
	);
}

const outputRoot = path.resolve(process.env.RECOVERY_PROVENANCE_ROOT || "");
if (!process.env.RECOVERY_PROVENANCE_ROOT) throw new Error("RECOVERY_PROVENANCE_ROOT is required.");
const api = createGitHubActionsApiClient({
	token: process.env.GITHUB_TOKEN,
	apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
});
const provenance = await resolveEntityCountRecoveryProvenance({
	api,
	repository: process.env.GITHUB_REPOSITORY,
	runId: process.env.RECOVERY_RUN_ID,
	runAttempt: process.env.RECOVERY_RUN_ATTEMPT,
	workload: process.env.RECOVERY_WORKLOAD,
});
await fs.mkdir(outputRoot, { recursive: true });
const provenancePath = path.join(outputRoot, "resolved-provenance.json");
await fs.writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
await appendOutputs({
	artifact_id: provenance.artifactId,
	artifact_name: provenance.artifactName,
	provenance_path: provenancePath,
});
console.log(JSON.stringify({ recovery_provenance: provenance }, null, 2));
