import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
	inspectEntityCountRecoveryPackage,
	recoverEntityCountPackage,
} from "./lib/entity-count-recovery.mjs";
import { validateResolvedEntityCountRecoveryProvenance } from "./lib/entity-count-recovery-provenance.mjs";

function git(args, { allowFailure = false } = {}) {
	const result = spawnSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFailure) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
	}
	return result;
}

function isInside(parent, candidate) {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

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

const repositoryRoot = await fs.realpath(git(["rev-parse", "--show-toplevel"]).stdout.trim());
const artifactRoot = await fs.realpath(path.resolve(process.env.RECOVERY_ARTIFACT_ROOT || ""));
if (isInside(repositoryRoot, artifactRoot)) {
	throw new Error("The downloaded recovery artifact must remain outside the checkout.");
}
const dirty = git(["status", "--porcelain", "--untracked-files=all"]).stdout;
if (dirty.trim()) throw new Error("Recovery requires a clean latest-main checkout.");

const options = {
	artifactRoot,
	repositoryRoot,
	expectedRepository: process.env.GITHUB_REPOSITORY,
	expectedRunId: String(process.env.RECOVERY_RUN_ID || ""),
	expectedRunAttempt: String(process.env.RECOVERY_RUN_ATTEMPT || ""),
	expectedWorkload: process.env.RECOVERY_WORKLOAD,
};
const inspected = await inspectEntityCountRecoveryPackage(options);
if (process.env.RECOVERY_PROVENANCE_PATH) {
	const provenance = JSON.parse(await fs.readFile(process.env.RECOVERY_PROVENANCE_PATH, "utf8"));
	validateResolvedEntityCountRecoveryProvenance({ manifest: inspected.manifest, provenance });
}
const ancestor = git(["merge-base", "--is-ancestor", inspected.manifest.base_commit, "HEAD"], {
	allowFailure: true,
});
if (ancestor.status !== 0) {
	throw new Error("Recovery base commit is not an ancestor of latest main.");
}

const recovered = await recoverEntityCountPackage(options);
console.log(
	JSON.stringify(
		{
			recovery: {
				artifact_name: recovered.manifest.artifact_name,
				changed: recovered.changed,
				paths: recovered.paths,
				legacy_decision: recovered.legacyDecision,
				zero_tmdb_requests: true,
			},
		},
		null,
		2,
	),
);
await appendOutputs({
	changed: String(recovered.changed),
	recovered_paths: recovered.paths.join("\n"),
	planned_month: recovered.manifest.planned_month,
	artifact_name: recovered.manifest.artifact_name,
	legacy_decision: recovered.legacyDecision,
});
