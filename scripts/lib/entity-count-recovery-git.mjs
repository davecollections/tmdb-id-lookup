import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./entity-count-budget.mjs";
import {
	recoverEntityCountPackage,
	sha256Bytes,
} from "./entity-count-recovery.mjs";
import { validateResolvedEntityCountRecoveryProvenance } from "./entity-count-recovery-provenance.mjs";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function git(repositoryRoot, args, { allowFailure = false, binary = false } = {}) {
	const result = spawnSync("git", args, {
		cwd: repositoryRoot,
		encoding: binary ? null : "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFailure) {
		throw Object.assign(new Error(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`), {
			code: "git_failed",
			gitArgs: [...args],
		});
	}
	return result;
}

function manifestEntries(manifest) {
	if (manifest?.status !== "ready" || !Array.isArray(manifest.files) || !manifest.files.length) {
		throw new TypeError("A ready recovery integrity manifest is required.");
	}
	return manifest.files;
}

function assertSafeManifestPath(value) {
	if (
		typeof value !== "string" || !value || value.includes("\\") ||
		path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
		path.posix.normalize(value) !== value ||
		value.split("/").some((segment) => !segment || segment === "." || segment === "..")
	) throw new TypeError(`Recovery integrity manifest contains an unsafe path: ${value}`);
	return value;
}

export async function loadRecoveryIntegrityManifest(manifestPath) {
	const bytes = await fs.readFile(manifestPath);
	const manifest = JSON.parse(bytes.toString("utf8"));
	if (bytes.toString("utf8") !== canonicalJson(manifest)) {
		throw new Error("Recovery integrity manifest must be canonical JSON.");
	}
	const seen = new Set();
	let previous = "";
	for (const file of manifestEntries(manifest)) {
		assertSafeManifestPath(file.path);
		const folded = file.path.toLowerCase();
		if (seen.has(folded) || file.path <= previous) {
			throw new TypeError("Recovery integrity manifest paths must be unique and sorted.");
		}
		seen.add(folded);
		previous = file.path;
		if (
			!Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
			!/^[a-f0-9]{64}$/.test(file.sha256 || "") ||
			!["usage", "typed-progress", "legacy"].includes(file.role) ||
			(file.base_sha256 !== null && !/^[a-f0-9]{64}$/.test(file.base_sha256 || ""))
		) throw new TypeError(`Recovery integrity metadata is invalid for ${file.path}.`);
	}
	return manifest;
}

async function readWorktreeBytes(repositoryRoot, relativePath) {
	return fs.readFile(path.join(repositoryRoot, ...relativePath.split("/")));
}

function readGitBytes(repositoryRoot, spec) {
	const result = git(repositoryRoot, ["show", spec], { binary: true, allowFailure: true });
	if (result.status !== 0) throw new Error(`Protected Git blob is missing: ${spec}`);
	return result.stdout;
}

async function verifyEntries(manifest, readBytes, label) {
	for (const file of manifestEntries(manifest)) {
		let bytes;
		try {
			bytes = await readBytes(file.path);
		} catch (error) {
			throw new Error(`${label} is missing protected path ${file.path}: ${error.message}`);
		}
		if (bytes.byteLength !== file.bytes || sha256Bytes(bytes) !== file.sha256) {
			throw new Error(`${label} protected bytes differ from the recovery artifact: ${file.path}`);
		}
	}
	return true;
}

export async function verifyProtectedWorktree({ repositoryRoot, manifest }) {
	return verifyEntries(manifest, (relativePath) => readWorktreeBytes(repositoryRoot, relativePath), "Worktree");
}

export async function verifyProtectedIndex({ repositoryRoot, manifest }) {
	await verifyEntries(manifest, (relativePath) => readGitBytes(repositoryRoot, `:${relativePath}`), "Index");
	const protectedPaths = new Set(manifestEntries(manifest).map((file) => file.path));
	const stagedPaths = git(repositoryRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"])
		.stdout.split(/\r?\n/).filter(Boolean);
	const extras = stagedPaths.filter((relativePath) => !protectedPaths.has(relativePath));
	if (extras.length) {
		throw new Error(`Index contains staged paths outside the recovery manifest: ${extras.join(", ")}`);
	}
	return true;
}

export async function verifyProtectedTree({ repositoryRoot, manifest, tree = "HEAD" }) {
	return verifyEntries(manifest, (relativePath) => readGitBytes(repositoryRoot, `${tree}:${relativePath}`), `Tree ${tree}`);
}

export function readRemoteMainSha({ repositoryRoot, remote = "origin", branch = "main", fetch = true }) {
	const trackingRef = `refs/remotes/${remote}/${branch}`;
	if (fetch) {
		git(repositoryRoot, ["fetch", "--no-tags", remote, `+refs/heads/${branch}:${trackingRef}`]);
	}
	const sha = git(repositoryRoot, ["rev-parse", "--verify", trackingRef]).stdout.trim();
	if (!COMMIT_PATTERN.test(sha)) throw new Error("Remote main SHA is invalid.");
	return sha;
}

export function cleanupRecoveryAttempt({ repositoryRoot, baseSha, ownedPaths = [] }) {
	if (!COMMIT_PATTERN.test(baseSha || "")) throw new TypeError("Cleanup base SHA is invalid.");
	git(repositoryRoot, ["reset", "--hard", baseSha]);
	for (const ownedPath of ownedPaths) {
		git(repositoryRoot, ["clean", "-f", "--", ownedPath], { allowFailure: true });
	}
	git(repositoryRoot, ["checkout", "--detach", "--force", baseSha]);
	const dirty = git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim();
	if (dirty) throw new Error(`Recovery cleanup left repository state: ${dirty}`);
}

export function prepareCleanRecoveryAttempt({ repositoryRoot, baseSha, ownedPaths = [] }) {
	cleanupRecoveryAttempt({ repositoryRoot, baseSha, ownedPaths });
	const head = git(repositoryRoot, ["rev-parse", "HEAD"]).stdout.trim();
	if (head !== baseSha) throw new Error("Recovery checkout does not match remote main.");
	return head;
}

export function stageRecoveredPaths({ repositoryRoot, paths }) {
	const uniquePaths = [...new Set(paths)].sort();
	for (const relativePath of uniquePaths) git(repositoryRoot, ["add", "-A", "--", relativePath]);
	return uniquePaths;
}

export async function assertRecoveryIndex({ repositoryRoot, manifest, stagedPaths }) {
	const actual = git(repositoryRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"])
		.stdout.split(/\r?\n/).filter(Boolean).sort();
	const expected = [...new Set(stagedPaths)].sort();
	if (canonicalJson(actual) !== canonicalJson(expected)) {
		throw new Error(`Recovery index differs from the approved paths: ${actual.join(", ")}`);
	}
	const restored = new Set(expected);
	const restoredManifest = { ...manifest, files: manifest.files.filter((file) => restored.has(file.path)) };
	if (restoredManifest.files.length) await verifyProtectedIndex({ repositoryRoot, manifest: restoredManifest });
	const unstaged = git(repositoryRoot, ["diff", "--name-only", "--diff-filter=ACDMRTUXB"])
		.stdout.split(/\r?\n/).filter(Boolean);
	const untracked = git(repositoryRoot, ["ls-files", "--others", "--exclude-standard"])
		.stdout.split(/\r?\n/).filter(Boolean);
	if (unstaged.length || untracked.length) {
		throw new Error(
			`Recovery left changes outside the verified index: ${[...unstaged, ...untracked].join(", ")}`,
		);
	}
	for (const file of manifest.files.filter((entry) => !restored.has(entry.path))) {
		const worktreeBytes = await readWorktreeBytes(repositoryRoot, file.path);
		const baseBytes = readGitBytes(repositoryRoot, `HEAD:${file.path}`);
		if (!worktreeBytes.equals(baseBytes)) {
			throw new Error(`Preserved recovery path differs from reconciled main: ${file.path}`);
		}
	}
	return true;
}

export async function commitRecoveredEntityCountOutput({
	repositoryRoot,
	artifactRoot,
	provenance,
	commitMessage,
	remote = "origin",
	branch = "main",
	maxAttempts = 3,
	beforePush = null,
	afterRemoteCheck = null,
}) {
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
		throw new TypeError("Recovery retry count must be from 1 through 10.");
	}
	if (typeof commitMessage !== "string" || !commitMessage.trim()) throw new TypeError("Recovery commit message is required.");
	const repositoryReal = await fs.realpath(repositoryRoot);
	const artifactReal = await fs.realpath(artifactRoot);
	const artifactRelative = path.relative(repositoryReal, artifactReal);
	if (artifactRelative === "" || (!artifactRelative.startsWith("..") && !path.isAbsolute(artifactRelative))) {
		throw new Error("Recovery artifact must remain outside the repository checkout.");
	}
	const initialDirty = git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim();
	if (initialDirty) throw new Error(`Recovery requires a clean checkout: ${initialDirty}`);
	const expected = {
		artifactRoot: artifactReal,
		repositoryRoot,
		expectedRepository: provenance.repository,
		expectedRunId: provenance.runId,
		expectedRunAttempt: provenance.runAttempt,
		expectedWorkload: provenance.workload,
	};
	const packageManifest = await loadRecoveryIntegrityManifest(path.join(artifactReal, "manifest.json"));
	validateResolvedEntityCountRecoveryProvenance({ manifest: packageManifest, provenance });
	for (const [label, commit] of [
		["source-run head", provenance.headSha],
		["writer base", packageManifest.base_commit],
	]) {
		const exists = git(repositoryRoot, ["cat-file", "-e", `${commit}^{commit}`], { allowFailure: true });
		if (exists.status !== 0) throw new Error(`Recovery ${label} commit object is missing.`);
	}
	const writerDescendsFromRun = git(
		repositoryRoot,
		["merge-base", "--is-ancestor", provenance.headSha, packageManifest.base_commit],
		{ allowFailure: true },
	);
	if (writerDescendsFromRun.status !== 0) {
		throw new Error("Recovery writer base commit is not descended from the source-run head commit.");
	}
	let ownedPaths = packageManifest.files.map((file) => file.path);
	let lastError = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		let remoteSha = readRemoteMainSha({ repositoryRoot, remote, branch });
		try {
			prepareCleanRecoveryAttempt({ repositoryRoot, baseSha: remoteSha, ownedPaths });
			const ancestor = git(repositoryRoot, ["merge-base", "--is-ancestor", provenance.headSha, "HEAD"], { allowFailure: true });
			if (ancestor.status !== 0) throw new Error("Recovery origin commit is not an ancestor of latest main.");
			const baseAncestor = git(repositoryRoot, ["merge-base", "--is-ancestor", packageManifest.base_commit, "HEAD"], { allowFailure: true });
			if (baseAncestor.status !== 0) throw new Error("Recovery package base commit is not an ancestor of latest main.");
			const recovered = await recoverEntityCountPackage(expected);
			validateResolvedEntityCountRecoveryProvenance({ manifest: recovered.manifest, provenance });
			ownedPaths = recovered.manifest.files.map((file) => file.path);
			if (!recovered.changed) {
				const currentRemoteSha = readRemoteMainSha({ repositoryRoot, remote, branch });
				cleanupRecoveryAttempt({ repositoryRoot, baseSha: currentRemoteSha, ownedPaths });
				if (currentRemoteSha !== remoteSha) continue;
				return { ...recovered, attempts: attempt, commit: null, pushed: false };
			}
			const stagedPaths = stageRecoveredPaths({ repositoryRoot, paths: recovered.paths });
			await assertRecoveryIndex({ repositoryRoot, manifest: recovered.manifest, stagedPaths });
			git(repositoryRoot, ["config", "user.name", "github-actions"]);
			git(repositoryRoot, ["config", "user.email", "github-actions@github.com"]);
			git(repositoryRoot, ["commit", "-m", commitMessage]);
			const commit = git(repositoryRoot, ["rev-parse", "HEAD"]).stdout.trim();
			const restoredManifest = {
				...recovered.manifest,
				files: recovered.manifest.files.filter((file) => stagedPaths.includes(file.path)),
			};
			await verifyProtectedTree({ repositoryRoot, manifest: restoredManifest, tree: commit });
			if (beforePush) await beforePush({ attempt, remoteSha, commit, repositoryRoot });
			const currentRemoteSha = readRemoteMainSha({ repositoryRoot, remote, branch });
			if (currentRemoteSha !== remoteSha) {
				cleanupRecoveryAttempt({ repositoryRoot, baseSha: currentRemoteSha, ownedPaths });
				continue;
			}
			if (afterRemoteCheck) await afterRemoteCheck({ attempt, remoteSha, commit, repositoryRoot });
			const pushed = git(repositoryRoot, ["push", remote, `HEAD:refs/heads/${branch}`], { allowFailure: true });
			if (pushed.status === 0) {
				return { ...recovered, attempts: attempt, commit, pushed: true };
			}
			lastError = new Error(`Recovery push attempt ${attempt} was rejected.`);
			remoteSha = readRemoteMainSha({ repositoryRoot, remote, branch });
			cleanupRecoveryAttempt({ repositoryRoot, baseSha: remoteSha, ownedPaths });
		} catch (error) {
			lastError = error;
			const latest = readRemoteMainSha({ repositoryRoot, remote, branch });
			cleanupRecoveryAttempt({ repositoryRoot, baseSha: latest, ownedPaths });
			throw error;
		}
	}
	const latest = readRemoteMainSha({ repositoryRoot, remote, branch });
	cleanupRecoveryAttempt({ repositoryRoot, baseSha: latest, ownedPaths });
	throw lastError || new Error(`Unable to push recovery after ${maxAttempts} attempts.`);
}
