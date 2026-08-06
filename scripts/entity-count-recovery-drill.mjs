import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./lib/entity-count-budget.mjs";
import { sha256Bytes } from "./lib/entity-count-recovery.mjs";

const DRILL_SCHEMA_VERSION = 1;
const DRILL_PATH = "fixture-output/output.json";
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function assertSafeDrillPath(value) {
	if (value !== DRILL_PATH || value.includes("\\") || path.posix.normalize(value) !== value) {
		throw new Error("Drill artifact path is not the single fixture-only path.");
	}
	return value;
}

async function enumerate(root, relative = "") {
	const files = [];
	for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
		const name = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) throw new Error(`Drill artifact contains a link: ${name}`);
		if (entry.isDirectory()) files.push(...await enumerate(root, name));
		else if (entry.isFile()) files.push(name);
		else throw new Error(`Drill artifact contains a non-regular member: ${name}`);
	}
	return files.sort();
}

export async function createFixtureOnlyDrillArtifact({ outputRoot, runId, runAttempt }) {
	if (!POSITIVE_INTEGER.test(String(runId)) || !POSITIVE_INTEGER.test(String(runAttempt))) {
		throw new Error("Drill run identity must be positive integers.");
	}
	const artifactName = `entity-count-recovery-drill-v1-${runId}-${runAttempt}`;
	const artifactRoot = path.join(outputRoot, artifactName);
	const payload = Buffer.from(`${JSON.stringify({ fixture: true, value: 73 })}\n`);
	const manifest = {
		schema_version: DRILL_SCHEMA_VERSION,
		status: "ready",
		mode: "fixture-only",
		artifact_name: artifactName,
		path: DRILL_PATH,
		bytes: payload.byteLength,
		sha256: sha256Bytes(payload),
		zero_tmdb_requests: true,
	};
	await fs.mkdir(path.join(artifactRoot, "payload", "fixture-output"), { recursive: true });
	await fs.writeFile(path.join(artifactRoot, "payload", "fixture-output", "output.json"), payload, { flag: "wx" });
	await fs.writeFile(path.join(artifactRoot, "drill-manifest.json"), canonicalJson(manifest), { flag: "wx" });
	return { artifactName, artifactRoot, manifest };
}

export async function inspectFixtureOnlyDrillArtifact(artifactRoot) {
	const manifestBytes = await fs.readFile(path.join(artifactRoot, "drill-manifest.json"));
	const manifest = JSON.parse(manifestBytes.toString("utf8"));
	if (manifestBytes.toString("utf8") !== canonicalJson(manifest)) throw new Error("Drill manifest is not canonical.");
	if (
		manifest.schema_version !== DRILL_SCHEMA_VERSION || manifest.status !== "ready" ||
		manifest.mode !== "fixture-only" || manifest.zero_tmdb_requests !== true
	) throw new Error("Drill manifest identity is invalid.");
	assertSafeDrillPath(manifest.path);
	const members = await enumerate(artifactRoot);
	if (canonicalJson(members) !== canonicalJson(["drill-manifest.json", `payload/${DRILL_PATH}`])) {
		throw new Error("Drill artifact inventory is invalid.");
	}
	const payload = await fs.readFile(path.join(artifactRoot, "payload", ...DRILL_PATH.split("/")));
	if (payload.byteLength !== manifest.bytes || sha256Bytes(payload) !== manifest.sha256) {
		throw new Error("Drill payload hash is invalid.");
	}
	return { manifest, payload };
}

export async function runFixtureOnlyRecoveryDrill(artifactRoot) {
	const originalFetch = globalThis.fetch;
	let networkRequestAttempts = 0;
	let tmdbRequestAttempts = 0;
	globalThis.fetch = async (input) => {
		networkRequestAttempts += 1;
		const raw = input instanceof Request ? input.url : String(input);
		let hostname = "unparseable";
		try {
			hostname = new URL(raw).hostname;
		} catch {}
		if (["api.themoviedb.org", "files.tmdb.org"].includes(hostname)) tmdbRequestAttempts += 1;
		throw new Error(`TMDB/network requests are forbidden during fixture recovery execution: ${hostname}.`);
	};
	let temporary = null;
	try {
		const inspected = await inspectFixtureOnlyDrillArtifact(artifactRoot);
		temporary = await fs.mkdtemp(path.join(os.tmpdir(), "entity-count-hosted-drill-"));
		const destination = path.join(temporary, ...DRILL_PATH.split("/"));
		await fs.mkdir(path.dirname(destination), { recursive: true });
		await fs.writeFile(destination, inspected.payload, { flag: "wx" });
		const first = await fs.readFile(destination);
		if (sha256Bytes(first) !== inspected.manifest.sha256) throw new Error("Fixture recovery changed bytes.");
		const before = await fs.stat(destination);
		const current = await fs.readFile(destination);
		if (sha256Bytes(current) !== inspected.manifest.sha256) throw new Error("Repeated recovery is not a no-op.");
		const after = await fs.stat(destination);
		if (before.size !== after.size) throw new Error("Repeated recovery changed the fixture output.");

		const corrupt = path.join(temporary, "corrupt");
		await fs.cp(artifactRoot, corrupt, { recursive: true });
		await fs.writeFile(path.join(corrupt, "payload", ...DRILL_PATH.split("/")), "corrupt\n");
		await inspectFixtureOnlyDrillArtifact(corrupt).then(
			() => { throw new Error("Corrupt fixture artifact was accepted."); },
			() => {},
		);

		const traversal = path.join(temporary, "traversal");
		await fs.cp(artifactRoot, traversal, { recursive: true });
		const traversalManifestPath = path.join(traversal, "drill-manifest.json");
		const traversalManifest = JSON.parse(await fs.readFile(traversalManifestPath, "utf8"));
		traversalManifest.path = "../outside.json";
		await fs.writeFile(traversalManifestPath, canonicalJson(traversalManifest));
		await inspectFixtureOnlyDrillArtifact(traversal).then(
			() => { throw new Error("Traversal fixture artifact was accepted."); },
			() => {},
		);

		if (process.platform !== "win32") {
			const linked = path.join(temporary, "linked");
			await fs.cp(artifactRoot, linked, { recursive: true });
			await fs.symlink(path.join(linked, "drill-manifest.json"), path.join(linked, "forbidden-link"));
			await inspectFixtureOnlyDrillArtifact(linked).then(
				() => { throw new Error("Symlink fixture artifact was accepted."); },
				() => {},
			);
		}
		if (networkRequestAttempts !== 0 || tmdbRequestAttempts !== 0) {
			throw new Error("Fixture recovery attempted a forbidden network request.");
		}
		return {
			exact: true,
			repeatedNoop: true,
			corruptRejected: true,
			traversalRejected: true,
			symlinkTested: process.platform !== "win32",
			networkRequestAttempts,
			tmdbRequestAttempts,
		};
	} finally {
		globalThis.fetch = originalFetch;
		if (temporary) await fs.rm(temporary, { recursive: true, force: true });
	}
}

async function appendOutputs(values) {
	if (!process.env.GITHUB_OUTPUT) return;
	await fs.appendFile(process.env.GITHUB_OUTPUT, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
}

async function resolveHostedArtifact() {
	const repository = process.env.GITHUB_REPOSITORY;
	const runId = String(process.env.DRILL_SOURCE_RUN_ID || "");
	const runAttempt = String(process.env.DRILL_SOURCE_RUN_ATTEMPT || "");
	const token = process.env.GITHUB_TOKEN;
	if (!POSITIVE_INTEGER.test(runId) || !POSITIVE_INTEGER.test(runAttempt) || !/^[^/]+\/[^/]+$/.test(repository || "") || !token) {
		throw new Error("Hosted drill provenance inputs are invalid.");
	}
	const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
	const request = async (endpoint) => {
		const response = await fetch(new URL(endpoint, process.env.GITHUB_API_URL || "https://api.github.com"), { headers });
		if (!response.ok) throw new Error(`GitHub API drill lookup failed with HTTP ${response.status}.`);
		return response.json();
	};
	const run = await request(`/repos/${repository}/actions/runs/${runId}`);
	const workflowPath = String(run.path || "").replace(/^\//, "").replace(/@refs\/heads\/main$/, "");
	if (
		run.status !== "completed" || run.conclusion !== "failure" || run.event !== "workflow_dispatch" ||
		run.name !== "Entity Count Recovery Fixture Producer" ||
		workflowPath !== ".github/workflows/entity-count-recovery-drill-producer.yml" ||
		run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
		run.head_branch !== "main" || String(run.run_attempt) !== runAttempt
	) throw new Error("Hosted drill producer provenance is invalid.");
	const expectedName = `entity-count-recovery-drill-v1-${runId}-${runAttempt}`;
	const response = await request(`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
	const matches = (response.artifacts || []).filter((artifact) => artifact.name === expectedName);
	const artifact = matches[0];
	const createdAt = Date.parse(artifact?.created_at);
	const expiresAt = Date.parse(artifact?.expires_at);
	if (
		matches.length !== 1 || artifact.expired || !Number.isSafeInteger(artifact.id) || artifact.id <= 0 ||
		String(artifact.workflow_run?.id || "") !== runId ||
		Number.isNaN(createdAt) || Number.isNaN(expiresAt) || expiresAt <= Date.now() || expiresAt <= createdAt
	) throw new Error("Hosted drill requires one live, expiry-bearing, correctly associated artifact.");
	const actualRetentionDays = (expiresAt - createdAt) / (24 * 60 * 60 * 1000);
	const policyCapped = actualRetentionDays < 89.5;
	await appendOutputs({ artifact_id: artifact.id, artifact_name: expectedName, expires_at: artifact.expires_at });
	console.log(JSON.stringify({
		requested_retention_days: 90,
		actual_created_at: artifact.created_at,
		actual_expires_at: artifact.expires_at,
		actual_retention_days: Number(actualRetentionDays.toFixed(3)),
		repository_policy_capped: policyCapped,
	}, null, 2));
}

async function main() {
	const command = process.argv[2];
	if (command === "produce") {
		const result = await createFixtureOnlyDrillArtifact({
			outputRoot: path.resolve(process.env.DRILL_OUTPUT_ROOT || ""),
			runId: process.env.GITHUB_RUN_ID,
			runAttempt: process.env.GITHUB_RUN_ATTEMPT,
		});
		await appendOutputs({ artifact_name: result.artifactName, artifact_path: result.artifactRoot });
	} else if (command === "resolve") await resolveHostedArtifact();
	else if (command === "verify") {
		console.log(JSON.stringify(await runFixtureOnlyRecoveryDrill(path.resolve(process.env.DRILL_ARTIFACT_ROOT || "")), null, 2));
	} else throw new Error("Drill command must be produce, resolve, or verify.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
