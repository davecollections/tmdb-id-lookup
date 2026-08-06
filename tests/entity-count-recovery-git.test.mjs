import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { recoveryNetworkGuardState } from "./helpers/entity-count-recovery-network-guard.mjs";

const {
	commitRecoveredEntityCountOutput,
	loadRecoveryIntegrityManifest,
	verifyProtectedIndex,
	verifyProtectedTree,
	verifyProtectedWorktree,
} = await import("../scripts/lib/entity-count-recovery-git.mjs");
const { sha256Bytes } = await import("../scripts/lib/entity-count-recovery.mjs");
const { resolveEntityCountRecoveryWriterCheckout } = await import("../scripts/lib/entity-count-recovery-writer-checkout.mjs");
const {
	cloneRacer,
	createRecoveryGitFixture,
	runGit,
	writeFixtureFile,
} = await import("./helpers/entity-count-recovery-fixtures.mjs");
const { canonicalJson } = await import("../scripts/lib/entity-count-budget.mjs");
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assertNoTmdbRuntimeRequests() {
	assert.equal(recoveryNetworkGuardState.installed, true);
	assert.equal(recoveryNetworkGuardState.tmdbHostAttempts, 0);
	assert.deepEqual(recoveryNetworkGuardState.fetchAttempts, []);
}

function fixtureWriterCheckoutTrust(fixture) {
	return {
		expectedOrigin: fixture.bare,
		requireGitHubOrigin: false,
	};
}

async function rewriteArtifactManifest(fixture, mutate) {
	const manifestPath = path.join(fixture.packaged.artifactRoot, "manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
	mutate(manifest);
	await fs.writeFile(manifestPath, canonicalJson(manifest));
}

async function recover(fixture, extra = {}) {
	return commitRecoveredEntityCountOutput({
		repositoryRoot: fixture.recovery,
		artifactRoot: fixture.packaged.artifactRoot,
		provenance: fixture.provenance,
		commitMessage: "Recover exact fixture output",
		...extra,
	});
}

async function artifactBytes(fixture, relativePath) {
	return fs.readFile(path.join(fixture.packaged.artifactRoot, "payload", ...relativePath.split("/")));
}

async function assertCleanAtRemote(fixture) {
	const status = runGit(fixture.recovery, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim();
	assert.equal(status, "");
	const head = runGit(fixture.recovery, ["rev-parse", "HEAD"]).stdout.trim();
	const remote = runGit(fixture.recovery, ["rev-parse", "refs/remotes/origin/main"]).stdout.trim();
	assert.equal(head, remote);
}

test("runtime recovery guard rejects the TMDB request client before production core imports can use it", async () => {
	await assert.rejects(
		import("../scripts/lib/tmdb-maintenance-request.mjs?recovery-guard-probe"),
		/TMDB maintenance request client import is forbidden/,
	);
	assertNoTmdbRuntimeRequests();
});

test("writer checkout trust is explicit under ambient GitHub Actions", async (context) => {
	const previousGitHubActions = process.env.GITHUB_ACTIONS;
	process.env.GITHUB_ACTIONS = "true";
	try {
		const fixture = await createRecoveryGitFixture(context);
		const local = resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: fixture.seed,
			expectedRepository: fixture.provenance.repository,
			...fixtureWriterCheckoutTrust(fixture),
			headSha: fixture.ancestorCommit,
		});
		assert.equal(local.baseCommit, fixture.targetCommit);
		assert.throws(
			() => resolveEntityCountRecoveryWriterCheckout({
				repositoryRoot: fixture.seed,
				expectedRepository: fixture.provenance.repository,
				expectedOrigin: `https://github.com/${fixture.provenance.repository}.git`,
				requireGitHubOrigin: true,
				headSha: fixture.ancestorCommit,
			}),
			(error) => error?.code === "writer_checkout_repository",
		);
		assert.throws(
			() => resolveEntityCountRecoveryWriterCheckout({
				repositoryRoot: fixture.seed,
				expectedRepository: fixture.provenance.repository,
				headSha: fixture.ancestorCommit,
			}),
			(error) => error?.code === "writer_checkout_context",
		);
		runGit(fixture.seed, ["remote", "set-url", "origin", `https://github.com/${fixture.provenance.repository}.git`]);
		const github = resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: fixture.seed,
			expectedRepository: fixture.provenance.repository,
			expectedOrigin: `https://github.com/${fixture.provenance.repository}.git`,
			requireGitHubOrigin: true,
			headSha: fixture.ancestorCommit,
		});
		assert.equal(github.baseCommit, fixture.targetCommit);
	} finally {
		if (previousGitHubActions === undefined) delete process.env.GITHUB_ACTIONS;
		else process.env.GITHUB_ACTIONS = previousGitHubActions;
	}
	assertNoTmdbRuntimeRequests();
});

test("production packaging requires canonical GitHub origin trust without environment bypasses", async () => {
	const entrypoint = await fs.readFile(path.join(sourceRoot, "scripts/package-entity-count-recovery.mjs"), "utf8");
	const resolver = await fs.readFile(
		path.join(sourceRoot, "scripts/lib/entity-count-recovery-writer-checkout.mjs"),
		"utf8",
	);
	assert.match(entrypoint, /expectedOrigin:\s*`https:\/\/github\.com\/\$\{repository\}\.git`/);
	assert.match(entrypoint, /requireGitHubOrigin:\s*true/);
	assert.doesNotMatch(resolver, /process\.env\.(?:CI|GITHUB_ACTIONS|NODE_ENV)/);
});

test("unchanged remote receives one exact recovery commit and repeat recovery is a no-op", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	assert.equal(fixture.packaged.manifest.head_sha, fixture.ancestorCommit);
	assert.equal(fixture.packaged.manifest.base_commit, fixture.targetCommit);
	assert.equal(fixture.baseCommit, fixture.targetCommit);
	assert.equal(
		runGit(fixture.writer, ["merge-base", "--is-ancestor", fixture.ancestorCommit, fixture.baseCommit], { allowFailure: true }).status,
		0,
	);
	const reservationBefore = runGit(
		fixture.recovery,
		["show", `HEAD:${fixture.reservationPath}`],
		{ binary: true },
	).stdout;
	const first = await recover(fixture);
	assert.equal(first.pushed, true);
	assert.equal(first.attempts, 1);
	assert.equal(first.manifest.planned_month, "2026-09");
	runGit(fixture.recovery, ["fetch", "origin", "main"]);
	for (const relativePath of [fixture.progressPath, fixture.usagePath]) {
		assert.deepEqual(
			runGit(fixture.recovery, ["show", `refs/remotes/origin/main:${relativePath}`], { binary: true }).stdout,
			await artifactBytes(fixture, relativePath),
		);
	}
	const second = await recover(fixture);
	assert.equal(second.changed, false);
	assert.equal(second.commit, null);
	assert.deepEqual(
		runGit(fixture.recovery, ["show", `HEAD:${fixture.reservationPath}`], { binary: true }).stdout,
		reservationBefore,
	);
	assert.equal(
		runGit(fixture.recovery, [
			"ls-tree", "-r", "--name-only", "HEAD", path.posix.dirname(fixture.reservationPath),
		]).stdout.trim().split(/\r?\n/).filter(Boolean).length,
		1,
	);
	assert.deepEqual(
		runGit(fixture.recovery, ["show", `HEAD:${fixture.usagePath}`], { binary: true }).stdout,
		await artifactBytes(fixture, fixture.usagePath),
	);
	await assertCleanAtRemote(fixture);
	assertNoTmdbRuntimeRequests();
});

test("writer checkout accepts A, B, and C descendants and rejects unsafe commit relationships", async (context) => {
	for (const key of ["ancestorCommit", "reservationCommit", "targetCommit"]) {
		const fixture = await createRecoveryGitFixture(context);
		runGit(fixture.seed, ["reset", "--hard", fixture[key]]);
		runGit(fixture.seed, ["update-ref", "refs/remotes/origin/main", fixture[key]]);
		const resolved = resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: fixture.seed,
			expectedRepository: fixture.provenance.repository,
			...fixtureWriterCheckoutTrust(fixture),
			headSha: fixture.ancestorCommit,
		});
		assert.equal(resolved.baseCommit, fixture[key], key);
	}

	const behind = await createRecoveryGitFixture(context);
	runGit(behind.seed, ["reset", "--hard", behind.reservationCommit]);
	runGit(behind.seed, ["update-ref", "refs/remotes/origin/main", behind.reservationCommit]);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: behind.seed,
			expectedRepository: behind.provenance.repository,
			...fixtureWriterCheckoutTrust(behind),
			headSha: behind.targetCommit,
		}),
		(error) => error?.code === "base_commit_ancestry",
	);

	const sibling = await createRecoveryGitFixture(context);
	runGit(sibling.seed, ["reset", "--hard", sibling.ancestorCommit]);
	await writeFixtureFile(sibling.seed, "sibling.txt", "sibling\n");
	runGit(sibling.seed, ["add", "."]);
	runGit(sibling.seed, ["commit", "-m", "sibling writer base"]);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: sibling.seed,
			expectedRepository: sibling.provenance.repository,
			...fixtureWriterCheckoutTrust(sibling),
			headSha: sibling.ancestorCommit,
		}),
		(error) => error?.code === "writer_checkout_ref",
	);

	const unrelated = await createRecoveryGitFixture(context);
	const tree = runGit(unrelated.seed, ["write-tree"]).stdout.trim();
	const rootCommit = runGit(unrelated.seed, ["commit-tree", tree, "-m", "unrelated root"]).stdout.trim();
	runGit(unrelated.seed, ["reset", "--hard", rootCommit]);
	runGit(unrelated.seed, ["update-ref", "refs/remotes/origin/main", rootCommit]);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: unrelated.seed,
			expectedRepository: unrelated.provenance.repository,
			...fixtureWriterCheckoutTrust(unrelated),
			headSha: unrelated.ancestorCommit,
		}),
		(error) => error?.code === "base_commit_ancestry",
	);

	const missing = await createRecoveryGitFixture(context);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: missing.seed,
			expectedRepository: missing.provenance.repository,
			...fixtureWriterCheckoutTrust(missing),
			headSha: "d".repeat(40),
		}),
		(error) => error?.code === "head_commit_missing",
	);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: missing.seed,
			expectedRepository: missing.provenance.repository,
			...fixtureWriterCheckoutTrust(missing),
			headSha: missing.ancestorCommit,
			claimedBaseCommit: missing.reservationCommit,
		}),
		(error) => error?.code === "base_commit_mismatch",
	);
	const wrongRepository = await createRecoveryGitFixture(context);
	runGit(wrongRepository.seed, ["remote", "set-url", "origin", "https://github.com/other/repository.git"]);
	assert.throws(
		() => resolveEntityCountRecoveryWriterCheckout({
			repositoryRoot: wrongRepository.seed,
			expectedRepository: wrongRepository.provenance.repository,
			...fixtureWriterCheckoutTrust(wrongRepository),
			headSha: wrongRepository.ancestorCommit,
		}),
		(error) => error?.code === "writer_checkout_repository",
	);
	assertNoTmdbRuntimeRequests();
});

test("trusted recovery rejects a nonexistent authenticated base object before reconciliation", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const missingBase = "d".repeat(40);
	await rewriteArtifactManifest(fixture, (manifest) => { manifest.base_commit = missingBase; });
	fixture.provenance = { ...fixture.provenance, baseCommit: missingBase };
	await assert.rejects(recover(fixture), /writer base commit object is missing/i);
	await assertCleanAtRemote(fixture);
	assert.equal(runGit(fixture.recovery, ["cat-file", "-e", `HEAD:${fixture.progressPath}`], { allowFailure: true }).status, 128);
	assert.equal(runGit(fixture.recovery, ["cat-file", "-e", `HEAD:${fixture.usagePath}`], { allowFailure: true }).status, 128);
	assertNoTmdbRuntimeRequests();
});

test("remote already containing exact recovered output produces no commit", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const racer = await cloneRacer(fixture, "already-applied");
	for (const relativePath of [fixture.progressPath, fixture.usagePath]) {
		await writeFixtureFile(racer, relativePath, await artifactBytes(fixture, relativePath));
	}
	runGit(racer, ["add", "."]);
	runGit(racer, ["commit", "-m", "already recovered"]);
	runGit(racer, ["push", "origin", "main"]);
	const before = runGit(racer, ["rev-parse", "HEAD"]).stdout.trim();
	const result = await recover(fixture);
	assert.equal(result.changed, false);
	assert.equal(result.commit, null);
	assert.equal(runGit(fixture.bare, ["rev-parse", "refs/heads/main"]).stdout.trim(), before);
});

test("unrelated remote advance retries from latest main and preserves exact artifact bytes", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	let advanced = false;
	const result = await recover(fixture, {
		beforePush: async ({ attempt }) => {
			if (attempt !== 1 || advanced) return;
			advanced = true;
			const racer = await cloneRacer(fixture, "unrelated-race");
			await writeFixtureFile(racer, "unrelated.txt", "remote advance\n");
			runGit(racer, ["add", "."]);
			runGit(racer, ["commit", "-m", "unrelated advance"]);
			runGit(racer, ["push", "origin", "main"]);
		},
	});
	assert.equal(result.pushed, true);
	assert.equal(result.attempts, 2);
	assert.equal(runGit(fixture.recovery, ["show", "HEAD:unrelated.txt"]).stdout, "remote advance\n");
	await verifyProtectedTree({
		repositoryRoot: fixture.recovery,
		manifest: await loadRecoveryIntegrityManifest(path.join(fixture.packaged.artifactRoot, "manifest.json")),
	});
	assertNoTmdbRuntimeRequests();
});

for (const [label, content] of [
	["disjoint same-file remote change", '{"remote_only":true}\n'],
	["overlapping same-file remote change", '{"results":[{"id":1,"count":999}]}\n'],
]) {
	test(`${label} conflicts without producing hybrid bytes or a push`, async (context) => {
		const fixture = await createRecoveryGitFixture(context);
		let advanced = false;
		await assert.rejects(recover(fixture, {
			beforePush: async ({ attempt }) => {
				if (attempt !== 1 || advanced) return;
				advanced = true;
				const racer = await cloneRacer(fixture, `same-file-${content.length}`);
				await writeFixtureFile(racer, fixture.progressPath, content);
				runGit(racer, ["add", "."]);
				runGit(racer, ["commit", "-m", label]);
				runGit(racer, ["push", "origin", "main"]);
			},
		}), /conflict/i);
		assert.equal(
			runGit(fixture.bare, ["show", `refs/heads/main:${fixture.progressPath}`]).stdout,
			content,
		);
		await assertCleanAtRemote(fixture);
		assertNoTmdbRuntimeRequests();
	});
}

test("actual push rejection after ref comparison retries from latest remote", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	let raced = false;
	const result = await recover(fixture, {
		afterRemoteCheck: async ({ attempt }) => {
			if (attempt !== 1 || raced) return;
			raced = true;
			const racer = await cloneRacer(fixture, "push-rejection");
			await writeFixtureFile(racer, "after-check.txt", "wins race\n");
			runGit(racer, ["add", "."]);
			runGit(racer, ["commit", "-m", "advance after ref comparison"]);
			runGit(racer, ["push", "origin", "main"]);
		},
	});
	assert.equal(result.pushed, true);
	assert.equal(result.attempts, 2);
	assert.equal(runGit(fixture.recovery, ["show", "HEAD:after-check.txt"]).stdout, "wins race\n");
	assertNoTmdbRuntimeRequests();
});

test("remote advancement on every allowed attempt exhausts three CAS retries and leaves no recovery state", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const tracePath = path.join(fixture.temporary, "bounded-retry-git-trace.log");
	const previousTrace = process.env.GIT_TRACE;
	process.env.GIT_TRACE = tracePath;
	let advances = 0;
	try {
		await assert.rejects(
			recover(fixture, {
				beforePush: async ({ attempt }) => {
					assert.equal(attempt, advances + 1);
					advances += 1;
					const racer = await cloneRacer(fixture, `bounded-race-${attempt}`);
					await writeFixtureFile(racer, `race-${attempt}.txt`, `remote advance ${attempt}\n`);
					runGit(racer, ["add", "."]);
					runGit(racer, ["commit", "-m", `bounded remote advance ${attempt}`]);
					runGit(racer, ["push", "origin", "main"]);
				},
			}),
			(error) => error?.message === "Unable to push recovery after 3 attempts.",
		);
	} finally {
		if (previousTrace === undefined) delete process.env.GIT_TRACE;
		else process.env.GIT_TRACE = previousTrace;
	}
	assert.equal(advances, 3);
	for (const relativePath of [fixture.progressPath, fixture.usagePath]) {
		assert.notEqual(
			runGit(fixture.bare, ["cat-file", "-e", `refs/heads/main:${relativePath}`], { allowFailure: true }).status,
			0,
		);
	}
	await assertCleanAtRemote(fixture);
	assert.equal(runGit(fixture.recovery, ["diff", "--cached", "--quiet"], { allowFailure: true }).status, 0);
	assert.equal(runGit(fixture.recovery, ["diff", "--quiet"], { allowFailure: true }).status, 0);
	assert.equal(runGit(fixture.recovery, ["ls-files", "--others", "--exclude-standard"]).stdout.trim(), "");
	assert.equal(runGit(fixture.recovery, ["rev-list", "refs/remotes/origin/main..HEAD"]).stdout.trim(), "");
	assert.doesNotMatch(
		runGit(fixture.bare, ["log", "--format=%s", "refs/heads/main"]).stdout,
		/Recover exact fixture output/,
	);
	const trace = await fs.readFile(tracePath, "utf8");
	assert.doesNotMatch(
		trace,
		/\bgit (?:pull|rebase)\b|\bgit merge(?:\s|$)|\bgit push\b[^\r\n]*--force(?:-with-lease)?\b/,
	);
	assertNoTmdbRuntimeRequests();
});

test("worktree, staged index, and commit-tree integrity reject changed protected bytes", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const manifest = await loadRecoveryIntegrityManifest(path.join(fixture.packaged.artifactRoot, "manifest.json"));
	for (const relativePath of [fixture.progressPath, fixture.usagePath]) {
		await writeFixtureFile(fixture.recovery, relativePath, await artifactBytes(fixture, relativePath));
	}
	await verifyProtectedWorktree({ repositoryRoot: fixture.recovery, manifest });
	runGit(fixture.recovery, ["add", "."]);
	await verifyProtectedIndex({ repositoryRoot: fixture.recovery, manifest });
	await writeFixtureFile(fixture.recovery, "unexpected-staged.txt", "must not be committed\n");
	runGit(fixture.recovery, ["add", "unexpected-staged.txt"]);
	await assert.rejects(
		verifyProtectedIndex({ repositoryRoot: fixture.recovery, manifest }),
		/outside the recovery manifest/,
	);
	runGit(fixture.recovery, ["reset", "--", "unexpected-staged.txt"]);
	await fs.rm(path.join(fixture.recovery, "unexpected-staged.txt"));
	runGit(fixture.recovery, ["config", "user.name", "fixture"]);
	runGit(fixture.recovery, ["config", "user.email", "fixture@example.invalid"]);
	runGit(fixture.recovery, ["commit", "-m", "protected bytes"]);
	await verifyProtectedTree({ repositoryRoot: fixture.recovery, manifest });
	await writeFixtureFile(fixture.recovery, fixture.progressPath, "mutated after packaging\n");
	await assert.rejects(verifyProtectedWorktree({ repositoryRoot: fixture.recovery, manifest }), /differ/);
	runGit(fixture.recovery, ["add", "--", fixture.progressPath]);
	await assert.rejects(verifyProtectedIndex({ repositoryRoot: fixture.recovery, manifest }), /differ/);
	runGit(fixture.recovery, ["commit", "-m", "mutated protected blob"]);
	await assert.rejects(verifyProtectedTree({ repositoryRoot: fixture.recovery, manifest }), /differ/);
});

function oneFileManifest(relativePath, bytes) {
	return {
		status: "ready",
		artifact_name: "normal-writer-integrity-fixture",
		files: [{ path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) }],
	};
}

test("normal rebase that auto-merges a protected file is refused by commit-tree verification", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const baseWriter = await cloneRacer(fixture, "protected-base");
	const relativePath = "protected-output.txt";
	await writeFixtureFile(baseWriter, relativePath, "one\ntwo\nthree\nfour\nfive\n");
	runGit(baseWriter, ["add", "."]);
	runGit(baseWriter, ["commit", "-m", "protected base"]);
	runGit(baseWriter, ["push", "origin", "main"]);
	const local = await cloneRacer(fixture, "protected-local");
	const remote = await cloneRacer(fixture, "protected-remote");
	const packagedBytes = Buffer.from("one local\ntwo\nthree\nfour\nfive\n");
	await writeFixtureFile(local, relativePath, packagedBytes);
	runGit(local, ["add", "."]);
	runGit(local, ["commit", "-m", "normal protected output"]);
	await writeFixtureFile(remote, relativePath, "one\ntwo\nthree\nfour\nfive remote\n");
	runGit(remote, ["add", "."]);
	runGit(remote, ["commit", "-m", "remote protected change"]);
	runGit(remote, ["push", "origin", "main"]);
	const rebased = runGit(local, ["pull", "--rebase", "origin", "main"], { allowFailure: true });
	assert.equal(rebased.status, 0, rebased.stderr);
	await assert.rejects(
		verifyProtectedTree({ repositoryRoot: local, manifest: oneFileManifest(relativePath, packagedBytes) }),
		/differ/,
	);
});

test("normal rebase changing only an unrelated file keeps protected hashes exact and may push", async (context) => {
	const fixture = await createRecoveryGitFixture(context);
	const baseWriter = await cloneRacer(fixture, "unrelated-base");
	const relativePath = "protected-output.txt";
	await writeFixtureFile(baseWriter, relativePath, "base\n");
	runGit(baseWriter, ["add", "."]);
	runGit(baseWriter, ["commit", "-m", "protected base"]);
	runGit(baseWriter, ["push", "origin", "main"]);
	const local = await cloneRacer(fixture, "unrelated-local");
	const remote = await cloneRacer(fixture, "unrelated-remote");
	const packagedBytes = Buffer.from("packaged exact\n");
	await writeFixtureFile(local, relativePath, packagedBytes);
	runGit(local, ["add", "."]);
	runGit(local, ["commit", "-m", "normal protected output"]);
	await writeFixtureFile(remote, "remote-unrelated.txt", "remote\n");
	runGit(remote, ["add", "."]);
	runGit(remote, ["commit", "-m", "remote unrelated change"]);
	runGit(remote, ["push", "origin", "main"]);
	runGit(local, ["pull", "--rebase", "origin", "main"]);
	const manifest = oneFileManifest(relativePath, packagedBytes);
	await verifyProtectedTree({ repositoryRoot: local, manifest });
	runGit(local, ["push", "origin", "HEAD:main"]);
	assert.deepEqual(runGit(fixture.bare, ["show", `refs/heads/main:${relativePath}`], { binary: true }).stdout, packagedBytes);
});

test("recovery Git implementation contains no pull, merge, rebase, or force-push path", async () => {
	const source = await fs.readFile(path.join(sourceRoot, "scripts/lib/entity-count-recovery-git.mjs"), "utf8");
	assert.doesNotMatch(source, /\["(?:pull|merge|rebase)"|\["push"[^\]]*"--force(?:-with-lease)?"/);
});
