import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function checkoutError(message, code) {
	return Object.assign(new Error(message), { code });
}

function git(repositoryRoot, args, { allowFailure = false, binary = false } = {}) {
	const result = spawnSync("git", args, {
		cwd: repositoryRoot,
		encoding: binary ? null : "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFailure) {
		throw checkoutError(
			`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`,
			"writer_checkout_git",
		);
	}
	return result;
}

function commitExists(repositoryRoot, commit) {
	return git(repositoryRoot, ["cat-file", "-e", `${commit}^{commit}`], { allowFailure: true }).status === 0;
}

function refCommit(repositoryRoot, ref) {
	const result = git(repositoryRoot, ["rev-parse", "--verify", ref], { allowFailure: true });
	return result.status === 0 ? result.stdout.trim() : null;
}

function githubRepositoryFromRemote(value) {
	const remote = String(value || "").trim();
	try {
		const parsed = new URL(remote);
		if (parsed.hostname.toLowerCase() !== "github.com") return null;
		return parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
	} catch {
		const match = remote.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
		return match?.[1] || null;
	}
}

export function resolveEntityCountRecoveryWriterCheckout({
	repositoryRoot,
	expectedRepository,
	headSha,
	claimedBaseCommit,
}) {
	if (typeof repositoryRoot !== "string" || !repositoryRoot) {
		throw new TypeError("Recovery repository root is required.");
	}
	if (!COMMIT_PATTERN.test(headSha || "")) {
		throw checkoutError("Recovery source-run head SHA is invalid.", "manifest_commit");
	}
	if (!/^[^/]+\/[^/]+$/.test(expectedRepository || "")) {
		throw checkoutError("Expected recovery repository identity is invalid.", "writer_checkout_repository");
	}
	if (claimedBaseCommit !== undefined && !COMMIT_PATTERN.test(claimedBaseCommit || "")) {
		throw checkoutError("Claimed recovery base commit SHA is invalid.", "base_commit");
	}

	const requestedRoot = fs.realpathSync(repositoryRoot);
	const discoveredRoot = fs.realpathSync(
		git(repositoryRoot, ["rev-parse", "--show-toplevel"]).stdout.trim(),
	);
	if (path.normalize(requestedRoot) !== path.normalize(discoveredRoot)) {
		throw checkoutError("Recovery repository root is not the Git checkout root.", "writer_checkout_root");
	}
	const origin = git(repositoryRoot, ["remote", "get-url", "origin"], { allowFailure: true });
	const originRepository = origin.status === 0 ? githubRepositoryFromRemote(origin.stdout) : null;
	if (originRepository && originRepository.toLowerCase() !== expectedRepository.toLowerCase()) {
		throw checkoutError("Writer checkout origin does not match the expected repository.", "writer_checkout_repository");
	}
	if (process.env.GITHUB_ACTIONS === "true" && !originRepository) {
		throw checkoutError("Actions writer checkout has no trusted GitHub repository origin.", "writer_checkout_repository");
	}

	const baseCommit = git(repositoryRoot, ["rev-parse", "--verify", "HEAD"]).stdout.trim();
	if (!COMMIT_PATTERN.test(baseCommit)) {
		throw checkoutError("Writer checkout HEAD is not a full commit SHA.", "base_commit");
	}
	if (claimedBaseCommit !== undefined && claimedBaseCommit !== baseCommit) {
		throw checkoutError(
			"Claimed recovery base commit does not match the writer checkout HEAD.",
			"base_commit_mismatch",
		);
	}
	const mainCommits = [
		refCommit(repositoryRoot, "refs/heads/main"),
		refCommit(repositoryRoot, "refs/remotes/origin/main"),
	].filter(Boolean);
	if (!mainCommits.length || mainCommits.some((commit) => commit !== baseCommit)) {
		throw checkoutError("Writer checkout HEAD is not the checked-out main commit.", "writer_checkout_ref");
	}
	if (!commitExists(repositoryRoot, headSha)) {
		throw checkoutError("Source-run head commit object is missing from the writer checkout.", "head_commit_missing");
	}
	if (!commitExists(repositoryRoot, baseCommit)) {
		throw checkoutError("Writer base commit object is missing from the checkout.", "base_commit_missing");
	}
	const ancestor = git(
		repositoryRoot,
		["merge-base", "--is-ancestor", headSha, baseCommit],
		{ allowFailure: true },
	);
	if (ancestor.status !== 0) {
		throw checkoutError(
			"Source-run head commit is not an ancestor of the writer base commit.",
			"base_commit_ancestry",
		);
	}

	return Object.freeze({
		baseCommit,
		readBaseFile(relativePath) {
			const spec = `${baseCommit}:${relativePath}`;
			const exists = git(repositoryRoot, ["cat-file", "-e", spec], { allowFailure: true });
			if (exists.status !== 0) return null;
			return git(repositoryRoot, ["show", "--no-ext-diff", spec], { binary: true }).stdout;
		},
	});
}
