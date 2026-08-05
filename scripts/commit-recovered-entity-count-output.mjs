import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { commitRecoveredEntityCountOutput } from "./lib/entity-count-recovery-git.mjs";

async function appendOutputs(values) {
	if (!process.env.GITHUB_OUTPUT) return;
	const lines = [];
	for (const [key, raw] of Object.entries(values)) {
		const value = String(raw ?? "");
		if (value.includes("\n")) {
			const delimiter = `RECOVERY_${key}_${Date.now()}`;
			lines.push(`${key}<<${delimiter}`, value, delimiter);
		} else lines.push(`${key}=${value}`);
	}
	await fs.appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
const artifactRoot = await fs.realpath(path.resolve(process.env.RECOVERY_ARTIFACT_ROOT || ""));
const provenance = JSON.parse(await fs.readFile(process.env.RECOVERY_PROVENANCE_PATH, "utf8"));
const result = await commitRecoveredEntityCountOutput({
	repositoryRoot,
	artifactRoot,
	provenance,
	commitMessage: process.env.RECOVERY_COMMIT_MESSAGE,
});
console.log(JSON.stringify({ recovery_commit: { ...result, manifest: undefined } }, null, 2));
await appendOutputs({
	changed: String(result.changed),
	recovered_paths: result.paths.join("\n"),
	planned_month: result.manifest.planned_month,
	artifact_name: result.manifest.artifact_name,
	legacy_decision: result.legacyDecision,
	commit: result.commit || "",
	push_attempts: result.attempts,
});
