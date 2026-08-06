import { spawnSync } from "node:child_process";
import {
	loadRecoveryIntegrityManifest,
	verifyProtectedIndex,
	verifyProtectedTree,
	verifyProtectedWorktree,
} from "./lib/entity-count-recovery-git.mjs";

const repositoryRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
const manifest = await loadRecoveryIntegrityManifest(process.env.RECOVERY_INTEGRITY_MANIFEST);
const source = process.env.RECOVERY_INTEGRITY_SOURCE;
if (source === "worktree") await verifyProtectedWorktree({ repositoryRoot, manifest });
else if (source === "index") await verifyProtectedIndex({ repositoryRoot, manifest });
else if (source === "tree") {
	await verifyProtectedTree({ repositoryRoot, manifest, tree: process.env.RECOVERY_INTEGRITY_TREE || "HEAD" });
} else throw new Error("RECOVERY_INTEGRITY_SOURCE must be worktree, index, or tree.");
console.log(`Verified ${manifest.files.length} protected ${source} files against ${manifest.artifact_name}.`);
