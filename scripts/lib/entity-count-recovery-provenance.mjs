import { entityCountRecoveryArtifactName } from "./entity-count-recovery.mjs";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

export const ENTITY_COUNT_RECOVERY_PROVENANCE = Object.freeze({
	"company-movie": Object.freeze({
		writerJob: "collect-company-movie",
		artifactUploadStep: "Persist completed typed Company Movie output before push",
		workflows: Object.freeze({
			".github/workflows/monthly-company-refresh.yml": Object.freeze(["schedule", "workflow_dispatch"]),
			".github/workflows/manual-company-rebuild-from-export.yml": Object.freeze(["workflow_dispatch"]),
		}),
	}),
	"company-series": Object.freeze({
		writerJob: "collect-company-series",
		artifactUploadStep: "Persist completed typed Company Series output before push",
		workflows: Object.freeze({
			".github/workflows/monthly-company-series-counts.yml": Object.freeze(["schedule", "workflow_dispatch"]),
		}),
	}),
	"network-series": Object.freeze({
		writerJob: "collect-network-series",
		artifactUploadStep: "Persist completed typed Network Series output before push",
		workflows: Object.freeze({
			".github/workflows/monthly-network-refresh.yml": Object.freeze(["schedule", "workflow_dispatch"]),
			".github/workflows/update-tv-network-details-from-export.yml": Object.freeze(["workflow_dispatch"]),
		}),
	}),
	"company-repair": Object.freeze({
		writerJob: "repair-company",
		artifactUploadStep: "Persist typed Company repair output before push",
		workflows: Object.freeze({
			".github/workflows/repair-cache-from-audit.yml": Object.freeze(["workflow_dispatch"]),
			".github/workflows/daily-repair-cache-from-audit.yml": Object.freeze(["workflow_dispatch", "workflow_run"]),
		}),
	}),
	"network-repair": Object.freeze({
		writerJob: "repair-network",
		artifactUploadStep: "Persist typed Network repair output before push",
		workflows: Object.freeze({
			".github/workflows/repair-cache-from-audit.yml": Object.freeze(["workflow_dispatch"]),
			".github/workflows/daily-repair-cache-from-audit.yml": Object.freeze(["workflow_dispatch", "workflow_run"]),
		}),
	}),
});

function provenanceError(message, code) {
	return Object.assign(new Error(message), { code });
}

function canonicalPositiveInteger(value, label) {
	const text = String(value || "");
	if (!POSITIVE_INTEGER_PATTERN.test(text)) {
		throw provenanceError(`${label} must be a positive decimal integer.`, "invalid_input");
	}
	return text;
}

function normalizeWorkflowPath(value) {
	const path = String(value || "").replace(/^\//, "");
	return path.replace(/@refs\/heads\/main$/, "");
}

function jobMatchesWriter(jobName, writerJob) {
	return jobName === writerJob || String(jobName || "").endsWith(` / ${writerJob}`);
}

export function createGitHubActionsApiClient({ token, fetchImpl = globalThis.fetch, apiUrl = "https://api.github.com" } = {}) {
	if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
	if (typeof token !== "string" || !token) throw new TypeError("A GitHub token is required.");
	return async function request(endpoint) {
		const response = await fetchImpl(new URL(endpoint, apiUrl), {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
		if (!response.ok) {
			throw provenanceError(`GitHub API ${endpoint} failed with HTTP ${response.status}.`, "github_api");
		}
		return response.json();
	};
}

export async function resolveEntityCountRecoveryProvenance({
	api,
	repository,
	runId,
	runAttempt,
	workload,
}) {
	if (typeof api !== "function") throw new TypeError("A GitHub API client is required.");
	if (!/^[^/]+\/[^/]+$/.test(repository || "")) {
		throw provenanceError("Current repository identity is invalid.", "repository");
	}
	const attempt = canonicalPositiveInteger(runAttempt, "Run attempt");
	const id = canonicalPositiveInteger(runId, "Run ID");
	const contract = ENTITY_COUNT_RECOVERY_PROVENANCE[workload];
	if (!contract) throw provenanceError("Recovery workload is not approved.", "workload");
	const repositoryPath = `/repos/${repository}`;
	const run = await api(`${repositoryPath}/actions/runs/${id}`);
	if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) {
		throw provenanceError("Source run repository does not match the current repository.", "repository");
	}
	if (String(run.id) !== id || String(run.run_attempt) !== attempt) {
		throw provenanceError("Source run ID or attempt does not match.", "run_attempt");
	}
	if (run.status !== "completed" || !["failure", "cancelled"].includes(run.conclusion)) {
		throw provenanceError("Source run is not a completed failed or cancelled run.", "run_status");
	}
	if (run.head_branch !== "main" || run.head_repository?.full_name !== repository) {
		throw provenanceError("Source run did not originate from this repository's main branch.", "head_ref");
	}
	if (!COMMIT_PATTERN.test(run.head_sha || "")) {
		throw provenanceError("Source run head SHA is invalid.", "head_sha");
	}
	let workflowFile = normalizeWorkflowPath(run.path);
	if (!workflowFile && run.workflow_id) {
		const workflow = await api(`${repositoryPath}/actions/workflows/${run.workflow_id}`);
		workflowFile = normalizeWorkflowPath(workflow.path);
	}
	const approvedEvents = contract.workflows[workflowFile];
	if (!approvedEvents) throw provenanceError("Source workflow is not approved for this workload.", "workflow");
	if (!approvedEvents.includes(run.event)) {
		throw provenanceError("Source event is not approved for this workflow.", "event");
	}
	const sourceCommit = await api(`${repositoryPath}/commits/${run.head_sha}`);
	if (sourceCommit.sha !== run.head_sha) {
		throw provenanceError("Source run commit identity does not match the GitHub API.", "head_sha");
	}
	const jobsResponse = await api(`${repositoryPath}/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`);
	const writerJobs = (jobsResponse.jobs || []).filter((job) => jobMatchesWriter(job.name, contract.writerJob));
	if (writerJobs.length !== 1) throw provenanceError("Exactly one approved writer job is required.", "writer_job");
	const writerJob = writerJobs[0];
	if (writerJob.status !== "completed") {
		throw provenanceError("Originating writer job is still active.", "writer_active");
	}
	const uploadSteps = Array.isArray(writerJob.steps)
		? writerJob.steps.filter((step) => step.name === contract.artifactUploadStep)
		: [];
	if (uploadSteps.length !== 1) {
		throw provenanceError(
			"Exactly one approved writer artifact-upload step is required.",
			"artifact_upload_step",
		);
	}
	const uploadStep = uploadSteps[0];
	if (uploadStep.status !== "completed" || uploadStep.conclusion !== "success") {
		throw provenanceError(
			"Approved writer artifact-upload step did not complete successfully.",
			"artifact_upload_step",
		);
	}
	const artifactName = entityCountRecoveryArtifactName({ runId: id, runAttempt: attempt, workload });
	const artifactsResponse = await api(`${repositoryPath}/actions/runs/${id}/artifacts?per_page=100`);
	const artifacts = (artifactsResponse.artifacts || []).filter((artifact) => artifact.name === artifactName);
	if (artifacts.length !== 1) {
		throw provenanceError("Exactly one matching recovery artifact is required.", "artifact_count");
	}
	const artifact = artifacts[0];
	if (artifact.expired) throw provenanceError("Recovery artifact is expired.", "artifact_expired");
	if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0) {
		throw provenanceError("Recovery artifact ID is invalid.", "artifact_id");
	}
	if (artifact.workflow_run?.id !== undefined && String(artifact.workflow_run.id) !== id) {
		throw provenanceError("Recovery artifact belongs to another run.", "artifact_run");
	}
	return Object.freeze({
		repository,
		runId: id,
		runAttempt: attempt,
		workload,
		writerJob: contract.writerJob,
		workflowName: run.name,
		workflowFile,
		event: run.event,
		headRef: "refs/heads/main",
		headSha: run.head_sha,
		status: run.status,
		conclusion: run.conclusion,
		artifactUploadStepName: uploadStep.name,
		artifactUploadStepStatus: uploadStep.status,
		artifactUploadStepConclusion: uploadStep.conclusion,
		artifactId: String(artifact.id),
		artifactName,
		artifactExpiresAt: artifact.expires_at || null,
	});
}

function validateManifestRunProvenance({ manifest, provenance }) {
	if (!manifest || !provenance) throw provenanceError("Manifest and resolved provenance are required.", "manifest_provenance");
	const contract = ENTITY_COUNT_RECOVERY_PROVENANCE[manifest.workload];
	if (
		!contract ||
		provenance.writerJob !== contract.writerJob ||
		provenance.artifactUploadStepName !== contract.artifactUploadStep ||
		provenance.artifactUploadStepStatus !== "completed" ||
		provenance.artifactUploadStepConclusion !== "success"
	) {
		throw provenanceError(
			"Resolved writer artifact-upload step does not match the approved workload.",
			"manifest_provenance",
		);
	}
	for (const [field, actual, expected] of [
		["repository", manifest.repository, provenance.repository],
		["run ID", manifest.run_id, provenance.runId],
		["run attempt", manifest.run_attempt, provenance.runAttempt],
		["workload", manifest.workload, provenance.workload],
		["writer job", manifest.writer_job, provenance.writerJob],
		["workflow name", manifest.workflow, provenance.workflowName],
		["workflow file", manifest.workflow_file, provenance.workflowFile],
		["event", manifest.event, provenance.event],
		["head ref", manifest.head_ref, provenance.headRef],
		["head SHA", manifest.head_sha, provenance.headSha],
		["artifact name", manifest.artifact_name, provenance.artifactName],
	]) {
		if (actual !== expected) throw provenanceError(`Manifest ${field} does not match GitHub API provenance.`, "manifest_provenance");
	}
	if (manifest.status !== "ready" || manifest.mode !== "collect") {
		throw provenanceError("Manifest readiness or mode is invalid.", "manifest_provenance");
	}
	return manifest;
}

export async function authenticateEntityCountRecoveryBaseProvenance({ api, manifest, provenance }) {
	if (typeof api !== "function") throw new TypeError("A GitHub API client is required.");
	validateManifestRunProvenance({ manifest, provenance });
	if (!COMMIT_PATTERN.test(manifest.base_commit || "")) {
		throw provenanceError("Manifest base commit SHA is invalid.", "base_commit");
	}
	const repositoryPath = `/repos/${provenance.repository}`;
	const baseCommit = await api(`${repositoryPath}/commits/${manifest.base_commit}`);
	if (baseCommit.sha !== manifest.base_commit) {
		throw provenanceError("Writer base commit identity does not match the GitHub API.", "base_commit");
	}
	const comparison = await api(
		`${repositoryPath}/compare/${provenance.headSha}...${manifest.base_commit}`,
	);
	if (
		!["ahead", "identical"].includes(comparison.status) ||
		comparison.base_commit?.sha !== provenance.headSha ||
		comparison.merge_base_commit?.sha !== provenance.headSha ||
		(comparison.status === "identical" && (
			manifest.base_commit !== provenance.headSha || comparison.ahead_by !== 0
		)) ||
		(comparison.status === "ahead" && (
			manifest.base_commit === provenance.headSha ||
			!Number.isSafeInteger(comparison.ahead_by) ||
			comparison.ahead_by < 1
		))
	) {
		throw provenanceError(
			"Writer base commit is not equal to or descended from the source-run head commit.",
			"base_commit_ancestry",
		);
	}
	return Object.freeze({
		...provenance,
		baseCommit: manifest.base_commit,
		baseComparisonStatus: comparison.status,
	});
}

export function validateResolvedEntityCountRecoveryProvenance({ manifest, provenance }) {
	validateManifestRunProvenance({ manifest, provenance });
	if (
		manifest.base_commit !== provenance.baseCommit ||
		!["ahead", "identical"].includes(provenance.baseComparisonStatus)
	) {
		throw provenanceError(
			"Manifest base commit does not match authenticated GitHub API provenance.",
			"manifest_provenance",
		);
	}
	return manifest;
}
