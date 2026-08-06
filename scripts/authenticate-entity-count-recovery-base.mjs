import fs from "node:fs/promises";
import path from "node:path";
import {
	authenticateEntityCountRecoveryBaseProvenance,
	createGitHubActionsApiClient,
} from "./lib/entity-count-recovery-provenance.mjs";

async function appendOutputs(values) {
	if (!process.env.GITHUB_OUTPUT) return;
	await fs.appendFile(
		process.env.GITHUB_OUTPUT,
		`${Object.entries(values).map(([key, value]) => `${key}=${String(value)}`).join("\n")}\n`,
	);
}

const artifactRoot = path.resolve(process.env.RECOVERY_ARTIFACT_ROOT || "");
const provenancePath = path.resolve(process.env.RECOVERY_PROVENANCE_PATH || "");
if (!process.env.RECOVERY_ARTIFACT_ROOT) throw new Error("RECOVERY_ARTIFACT_ROOT is required.");
if (!process.env.RECOVERY_PROVENANCE_PATH) throw new Error("RECOVERY_PROVENANCE_PATH is required.");
const manifest = JSON.parse(await fs.readFile(path.join(artifactRoot, "manifest.json"), "utf8"));
const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
const api = createGitHubActionsApiClient({
	token: process.env.GITHUB_TOKEN,
	apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
});
const authenticated = await authenticateEntityCountRecoveryBaseProvenance({ api, manifest, provenance });
const authenticatedPath = path.join(path.dirname(provenancePath), "authenticated-provenance.json");
await fs.writeFile(authenticatedPath, `${JSON.stringify(authenticated, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ authenticated_base: {
	base_commit: authenticated.baseCommit,
	comparison: authenticated.baseComparisonStatus,
} }, null, 2));
await appendOutputs({ provenance_path: authenticatedPath });
