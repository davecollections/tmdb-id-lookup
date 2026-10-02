import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PLAN_VERSION = 1;
export const GROUPS = Object.freeze(["core", "source", "workspace", "artwork"]);
const shaPattern = /^[0-9a-f]{40}$/;
const isSha = (value) => typeof value === "string" && shaPattern.test(value);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

// Frozen, reviewed leaves from #270 Pass 1. New test entries are NOT inferred
// from check-all: adding or widening a route requires explicit ownership review.
export const IMPACT_REGISTRY = Object.freeze({
	core: Object.freeze([
		"README.md",
		"AGENTS.md",
		"tests/artwork-runtime.test.mjs",
		"tests/builder-about-credits-ui.test.mjs",
		"tests/builder-action-language.test.mjs",
		"tests/builder-add-source-foundation.test.mjs",
		"tests/builder-add-source-preview-parity.test.mjs",
		"tests/builder-add-source-ui.test.mjs",
		"tests/builder-advanced-discover-worker.test.mjs",
		"tests/builder-advanced-discover.test.mjs",
		"tests/builder-auto-ids-workspace-flow.test.mjs",
		"tests/builder-bulk-edit.test.mjs",
		"tests/builder-choice-presentation-contract.test.mjs",
		"tests/builder-collection-extension.test.mjs",
		"tests/builder-collection-folder-management.test.mjs",
		"tests/builder-compatibility-corpus.test.mjs",
		"tests/builder-controller.test.mjs",
		"tests/builder-decades-controller.test.mjs",
		"tests/builder-decades-foundation.test.mjs",
		"tests/builder-decades-plan.test.mjs",
		"tests/builder-decades-preview.test.mjs",
		"tests/builder-decades-ui.test.mjs",
		"tests/builder-discover-core.test.mjs",
		"tests/builder-domain.test.mjs",
		"tests/builder-native-trakt.test.mjs",
		"tests/builder-export-collections.test.mjs",
		"tests/builder-export-defaults.test.mjs",
		"tests/builder-family-advanced.test.mjs",
		"tests/builder-folder-artwork-suggestions.test.mjs",
		"tests/builder-folder-card-artwork.test.mjs",
		"tests/builder-franchise-hierarchy.test.mjs",
		"tests/builder-franchise-ui.test.mjs",
		"tests/builder-genre-foundation.test.mjs",
		"tests/builder-genre-hierarchy-ui.test.mjs",
		"tests/builder-genre-hierarchy.test.mjs",
		"tests/builder-genre-preview.test.mjs",
		"tests/builder-genre-ui.test.mjs",
		"tests/builder-hierarchy-deletion.test.mjs",
		"tests/builder-hierarchy-menu-placement.test.mjs",
		"tests/builder-import-merge.test.mjs",
		"tests/builder-import.test.mjs",
		"tests/builder-keyword-catalogue.test.mjs",
		"tests/builder-migration.test.mjs",
		"tests/builder-move-folders.test.mjs",
		"tests/builder-native-source-occurrences.test.mjs",
		"tests/builder-native-source-variants.test.mjs",
		"tests/builder-network-foundation.test.mjs",
		"tests/builder-network-hierarchy-ui.test.mjs",
		"tests/builder-network-hierarchy.test.mjs",
		"tests/builder-network-preview.test.mjs",
		"tests/builder-network-ui.test.mjs",
		"tests/builder-node-editing.test.mjs",
		"tests/builder-nuvio-import.test.mjs",
		"tests/builder-nuvio-send-ui.test.mjs",
		"tests/builder-nuvio-send.test.mjs",
		"tests/builder-people-foundation.test.mjs",
		"tests/builder-people-hierarchy.test.mjs",
		"tests/builder-people-ui.test.mjs",
		"tests/builder-presentation-updates.test.mjs",
		"tests/builder-project-find.test.mjs",
		"tests/builder-reordering-client-evidence.test.mjs",
		"tests/builder-reordering.test.mjs",
		"tests/builder-serializer.test.mjs",
		"tests/builder-source-capability-contract.test.mjs",
		"tests/builder-source-chooser-ui.test.mjs",
		"tests/builder-source-details.test.mjs",
		"tests/builder-source-edit-foundation.test.mjs",
		"tests/builder-source-edit-preview.test.mjs",
		"tests/builder-source-edit-ui.test.mjs",
		"tests/builder-source-names.test.mjs",
		"tests/builder-source-occurrences.test.mjs",
		"tests/builder-source-sort-variants.test.mjs",
		"tests/builder-streaming-foundation.test.mjs",
		"tests/builder-streaming-hierarchy-ui.test.mjs",
		"tests/builder-streaming-hierarchy.test.mjs",
		"tests/builder-streaming-preview.test.mjs",
		"tests/builder-streaming-ui.test.mjs",
		"tests/builder-studio-foundation.test.mjs",
		"tests/builder-studio-hierarchy-ui.test.mjs",
		"tests/builder-studio-hierarchy.test.mjs",
		"tests/builder-studio-ui.test.mjs",
		"tests/builder-title-preview-pages.test.mjs",
		"tests/builder-tmdb-lists-ui.test.mjs",
		"tests/builder-tmdb-lists.test.mjs",
		"tests/builder-ui.test.mjs",
		"tests/builder-welcome-import.test.mjs",
		"tests/builder-workspace-import.test.mjs",
		"tests/cached-nuvio-export.test.mjs",
		"tests/cloudflare-worker.test.mjs",
		"tests/collection-preservation.test.mjs",
		"tests/decades-artwork.test.mjs",
		"tests/fixture-line-endings.test.mjs",
		"tests/genre-artwork.test.mjs",
		"tests/global-count-precache-retirement.test.mjs",
		"tests/maintenance-commit-action.test.mjs",
		"tests/nuvio-contracts.test.mjs",
		"tests/pages-asset-references.test.mjs",
		"tests/pages-public-paths.test.mjs",
		"tests/shared-advanced-investigation.test.mjs",
		"tests/tmdb-attribution.test.mjs",
		"tests/tmdb-catalogue-maintenance.test.mjs",
		"tests/tmdb-discover-compatibility.test.mjs",
		"tests/tmdb-request-budget.test.mjs",
		"tests/v1-company-search-compatibility.test.mjs",
	]),
	source: Object.freeze([
		"builder/src/ui/SourceTitlePreviewDialog.jsx",
		"builder/src/ui/SourcePreviewContent.jsx",
		"builder/src/ui/TitlePreviewResults.jsx",
		"builder/src/ui/PosterOnlyPreviewGrid.jsx",
		"builder/src/ui/use-source-title-preview.js",
		"builder/src/ui/SourceEditorDialog.jsx",
		"builder/src/ui/source-edit-error-presentation.js",
		"builder/src/ui/SourceNamesDisclosure.jsx",
		"builder/src/ui/use-source-names.js",
		"builder/src/source-add/source-title-preview.js",
		"builder/src/source-add/title-preview-results.js",
		"builder/src/source-add/preview-page-cache.js",
		"tests/builder-source-edit-mounted.test.mjs",
		"tests/fixtures/builder-source-edit-mounted.html",
		"tests/fixtures/builder-source-edit-mounted.jsx",
		"tests/fixtures/builder-source-names-mounted.jsx",
		"tests/fixtures/builder-source-sort-variants-mounted.jsx",
		"tests/fixtures/builder-native-source-variants-mounted.jsx",
		"tests/fixtures/builder-discover-preview-mounted.jsx",
		"tests/fixtures/builder-preview-pages-mounted.jsx",
		"tests/fixtures/builder-guided-presentation-mounted.jsx",
	]),
	workspace: Object.freeze([
		"builder/src/ui/AboutCreditsDialog.jsx",
		"builder/src/ui/FindProjectDialog.jsx",
		"builder/src/ui/project-find.js",
		"builder/src/ui/MoveFoldersDialog.jsx",
		"builder/src/ui/move-folders.js",
		"builder/src/ui/ExportCollectionsDialog.jsx",
		"builder/src/ui/BulkEditDialog.jsx",
		"builder/src/ui/bulk-edit.js",
		"builder/src/ui/WorkspaceImportDialog.jsx",
		"tests/builder-bulk-edit-mounted.test.mjs",
		"tests/fixtures/builder-bulk-edit-mounted.html",
		"tests/fixtures/builder-bulk-edit-mounted.jsx",
		"tests/fixtures/builder-collection-folders-mounted.html",
		"tests/fixtures/builder-collection-folders-mounted.jsx",
		"tests/fixtures/builder-export-collections-mounted.html",
		"tests/fixtures/builder-export-collections-mounted.jsx",
		"tests/fixtures/builder-find-mounted.html",
		"tests/fixtures/builder-find-mounted.jsx",
		"tests/fixtures/builder-move-folders-mounted.html",
		"tests/fixtures/builder-move-folders-mounted.jsx",
		"tests/fixtures/builder-nuvio-import-mounted.html",
		"tests/fixtures/builder-nuvio-import-mounted.jsx",
		"tests/fixtures/builder-nuvio-send-mounted.html",
		"tests/fixtures/builder-nuvio-send-mounted.jsx",
		"tests/fixtures/project-find-data.mjs",
		"tests/helpers/export-mounted.mjs",
		"tests/helpers/nuvio-send-mounted.mjs",
		"tests/helpers/workspace-import-mounted.mjs",
		"tests/helpers/project-find-mounted.mjs",
		"tests/helpers/move-folders-mounted.mjs",
	]),
	artwork: Object.freeze([
		"tests/builder-folder-card-artwork-mounted.test.mjs",
		"tests/fixtures/builder-folder-card-artwork-mounted.html",
		"tests/fixtures/builder-folder-card-artwork-mounted.jsx",
	]),
	sourceWorkspace: Object.freeze([
		"builder/src/ui/AddSourceDialog.jsx",
		"builder/src/ui/SourceModeDialog.jsx",
		"builder/src/ui/CreationDialog.jsx",
		"builder/src/ui/creation-options.js",
		"builder/src/ui/creation-session.js",
		"builder/src/ui/GenreCatalogueSelector.jsx",
		"builder/src/ui/SemanticSortChoices.jsx",
	]),
});
export const BROAD_PREFIXES = Object.freeze([
	".github/", "scripts/", "builder/src/application/", "builder/src/domain/",
	"builder/src/import/", "builder/src/serialize/", "builder/src/migrate/", "builder/src/nuvio/",
]);
const narrow = new Map(Object.entries(IMPACT_REGISTRY).flatMap(([domain, paths]) =>
	paths.map((file) => [file, domain === "core" ? [] : domain === "sourceWorkspace" ? ["source", "workspace"] : [domain]])));

// ---------- Pure contract and routing: no I/O ----------
export function validateIdentity(identity) {
	if (!object(identity) || !["pull_request", "push", "workflow_dispatch"].includes(identity.eventName) || !isSha(identity.eventSha)) {
		throw new Error("Invalid validation event identity.");
	}
	for (const key of ["baseSha", "headSha"]) {
		if (identity.eventName === "pull_request" ? !isSha(identity[key]) : identity[key] !== null) throw new Error("Invalid PR identity.");
	}
	return identity;
}

export function fullPlan(identity, reason, mergeBaseSha = null) {
	validateIdentity(identity);
	if (!reason || typeof reason !== "string" || (mergeBaseSha !== null && !isSha(mergeBaseSha))) throw new Error("Invalid full fallback.");
	return { version: PLAN_VERSION, eventName: identity.eventName, eventSha: identity.eventSha,
		baseSha: identity.baseSha, headSha: identity.headSha, mergeBaseSha,
		decision: "full", reason, required: { core: true, source: true, workspace: true, artwork: true } };
}

export function validatePlan(plan, identity) {
	validateIdentity(identity);
	if (!exactKeys(plan, ["version", "eventName", "eventSha", "baseSha", "headSha", "mergeBaseSha", "decision", "reason", "required"]) ||
		plan.version !== PLAN_VERSION || !["routed", "full"].includes(plan.decision) ||
		typeof plan.reason !== "string" || !plan.reason.trim() || /[\x00-\x1f\x7f]/.test(plan.reason) ||
		!exactKeys(plan.required, GROUPS) || GROUPS.some((group) => typeof plan.required[group] !== "boolean") || !plan.required.core) {
		throw new Error("Invalid validation plan schema.");
	}
	for (const key of ["eventName", "eventSha", "baseSha", "headSha"]) if (plan[key] !== identity[key]) throw new Error("Validation plan event identity mismatch.");
	if (plan.mergeBaseSha !== null && !isSha(plan.mergeBaseSha)) throw new Error("Invalid merge-base identity.");
	if (plan.decision === "routed" && (plan.eventName !== "pull_request" || plan.mergeBaseSha !== plan.baseSha)) throw new Error("Unproven routed plan.");
	if (plan.eventName !== "pull_request" && plan.mergeBaseSha !== null) throw new Error("Unexpected non-PR merge base.");
	if ((plan.decision === "full" || plan.eventName !== "pull_request") && GROUPS.some((group) => !plan.required[group])) throw new Error("Full validation requires every group.");
	if (plan.eventName !== "pull_request" && plan.decision !== "full") throw new Error("Non-PR validation must be full.");
	return plan;
}

export function normalizeChangedPath(value, pathStyle = "git") {
	if (!["git", "windows"].includes(pathStyle) || typeof value !== "string" || !value ||
		/[\x00-\x1f\x7f-\x9f]/.test(value) || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) throw new Error("Ambiguous path.");
	if (pathStyle === "git" && value.includes("\\")) throw new Error("Literal Git backslash.");
	const normalized = pathStyle === "windows" ? value.replaceAll("\\", "/") : value;
	if (normalized.split("/").some((part) => !part || part === "." || part === "..") || normalized.includes(":")) throw new Error("Ambiguous path components.");
	return normalized;
}

export function planValidation(identity, records, { mergeBaseSha = identity?.baseSha, pathStyle = "git" } = {}) {
	validateIdentity(identity);
	if (identity.eventName !== "pull_request") return fullPlan(identity, "Main push or manual force-full event.");
	if (!isSha(mergeBaseSha)) return fullPlan(identity, "Missing unique merge base.");
	if (mergeBaseSha !== identity.baseSha) return fullPlan(identity, "Event base diverges from merge base.", mergeBaseSha);
	if (!Array.isArray(records) || !records.length) return fullPlan(identity, "Empty or malformed diff.", mergeBaseSha);
	const required = { core: true, source: false, workspace: false, artwork: false };
	const paths = new Set();
	try {
		for (const record of records) {
			if (!exactKeys(record, ["status", "oldMode", "newMode", "oldPath", "newPath"])) throw new Error("Malformed change record.");
			// Only regular-file additions and unchanged-mode modifications can narrow.
			if (!["A", "M"].includes(record.status) ||
				!["100644", "100755"].includes(record.newMode) ||
				(record.status === "M" ? record.oldMode !== record.newMode : record.oldMode !== "000000")) throw new Error("Broad change status or mode.");
			const newPath = normalizeChangedPath(record.newPath, pathStyle);
			if (record.status === "M" ? normalizeChangedPath(record.oldPath, pathStyle) !== newPath : record.oldPath !== null) throw new Error("Inconsistent change paths.");
			paths.add(newPath);
		}
	} catch {
		return fullPlan(identity, "Ambiguous change record, path, status or mode.", mergeBaseSha);
	}
	for (const file of [...paths].sort()) {
		if (BROAD_PREFIXES.some((prefix) => file.startsWith(prefix)) || /\.(?:css|scss|sass|less)$/i.test(file)) {
			return fullPlan(identity, "Shared infrastructure or stylesheet changed.", mergeBaseSha);
		}
		const impact = narrow.get(file) ?? (file.startsWith("docs/") && file.endsWith(".md") ? [] : null);
		if (!impact) return fullPlan(identity, "Unclassified path changed.", mergeBaseSha);
		for (const group of impact) required[group] = true;
	}
	if (GROUPS.every((group) => required[group])) return fullPlan(identity, "Union requires every group.", mergeBaseSha);
	return { ...fullPlan(identity, "Audited leaf ownership.", mergeBaseSha), decision: "routed", required };
}

export function planOutputs(plan, identity) {
	validatePlan(plan, identity);
	return { plan: JSON.stringify(plan), source: String(plan.required.source), workspace: String(plan.required.workspace), artwork: String(plan.required.artwork) };
}

export function identityFromEvent(eventName, eventSha, payload) {
	return validateIdentity({ eventName, eventSha,
		baseSha: eventName === "pull_request" ? payload?.pull_request?.base?.sha : null,
		headSha: eventName === "pull_request" ? payload?.pull_request?.head?.sha : null });
}

// ---------- Git acquisition adapter (bounded argument-array execution) ----------
const MAX_GIT_BYTES = 32 * 1024 * 1024;
export function runGit(args, { cwd, maxBuffer = MAX_GIT_BYTES } = {}) {
	return execFileSync("git", ["--no-replace-objects", ...args], {
		cwd, encoding: "buffer", maxBuffer, timeout: 30000, windowsHide: true,
		stdio: ["ignore", "pipe", "pipe"], shell: false,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" },
	});
}
export function decodeGit(buffer) {
	if (!Buffer.isBuffer(buffer)) throw new Error("Git did not return bytes.");
	return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
}
export function parseRawDiff(buffer) {
	const text = decodeGit(buffer);
	if (!text || !text.endsWith("\0")) throw new Error("Empty or truncated raw diff.");
	const fields = text.split("\0"); fields.pop();
	const records = [];
	for (let i = 0; i < fields.length;) {
		const header = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMDTRCUXB](?:[0-9]{1,3})?)$/.exec(fields[i++]);
		if (!header) throw new Error("Malformed raw diff header.");
		const [, oldMode, newMode, oldOid, newOid, status] = header;
		const zero = "0".repeat(40);
		if ((oldMode === "000000") !== (oldOid === zero) || (newMode === "000000") !== (newOid === zero) ||
			(status === "A" ? oldMode !== "000000" || newMode === "000000" : status === "D" ? newMode !== "000000" || oldMode === "000000" : oldMode === "000000" || newMode === "000000")) {
			throw new Error("Inconsistent raw diff modes or object IDs.");
		}
		const first = fields[i++];
		const paired = /^[RC]/.test(status);
		const second = paired ? fields[i++] : first;
		if (!first || !second) throw new Error("Truncated raw diff path.");
		records.push({ status, oldMode, newMode, oldPath: status === "A" ? null : first, newPath: status === "D" ? null : second });
	}
	return records;
}

export function acquireValidationPlan(identity, { cwd, execute = runGit, recovery = true } = {}) {
	validateIdentity(identity); // No trustworthy identity means no outputs at all.
	if (identity.eventName !== "pull_request") return fullPlan(identity, "Main push or manual force-full event.");
	const git = (args) => execute(args, { cwd });
	const text = (args) => decodeGit(git(args)).trim();
	const commitExists = (sha) => { try { return text(["cat-file", "-t", sha]) === "commit"; } catch { return false; } };
	let mergeBaseSha = null;
	try {
		const shas = [...new Set([identity.baseSha, identity.headSha, identity.eventSha])];
		const shallow = text(["rev-parse", "--is-shallow-repository"]);
		if (!["true", "false"].includes(shallow)) throw new Error("Unresolved history state.");
		const missing = shas.filter((sha) => !commitExists(sha));
		if (shallow === "true" || missing.length) {
			if (!recovery) throw new Error("Exact history recovery disabled.");
			// One bounded attempt, always the fixed repository origin and immutable
			// event objects. Never fetch a fork URL or trust a moving PR branch/ref.
			git(["fetch", "--no-tags", "--no-recurse-submodules", ...(shallow === "true" ? ["--unshallow"] : []), "origin", ...shas]);
			if (text(["rev-parse", "--is-shallow-repository"]) !== "false" || shas.some((sha) => !commitExists(sha))) throw new Error("Incomplete exact history recovery.");
		}
		if (text(["rev-parse", "--verify", "HEAD"]) !== identity.eventSha) throw new Error("Checkout differs from event SHA.");
		const parents = text(["show", "-s", "--format=%P", identity.eventSha]).split(" ");
		if (parents.length !== 2 || parents[0] !== identity.baseSha || parents[1] !== identity.headSha) throw new Error("Synthetic merge parents differ from event.");
		const bases = text(["merge-base", "--all", identity.baseSha, identity.headSha]).split(/\r?\n/);
		if (bases.length !== 1 || !isSha(bases[0]) || !commitExists(bases[0])) throw new Error("Missing or multiple merge bases.");
		mergeBaseSha = bases[0];
		if (mergeBaseSha !== identity.baseSha) return fullPlan(identity, "Event base diverges from merge base.", mergeBaseSha);
		const records = parseRawDiff(git(["diff", "--raw", "-z", "--no-abbrev", "--no-ext-diff", "--no-textconv",
			"--ignore-submodules=none", "--find-renames", "--find-copies", "--find-copies-harder", mergeBaseSha, identity.headSha, "--"]));
		return planValidation(identity, records, { mergeBaseSha });
	} catch {
		// Do not include command stderr/filenames in Actions outputs. A failed
		// comparison grants no skip permission; the complete suite can still run.
		return fullPlan(identity, "Exact Git acquisition could not be proven.", mergeBaseSha);
	}
}

export function runPlannerCli(env = process.env, { cwd = process.cwd() } = {}) {
	const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
	const identity = identityFromEvent(env.GITHUB_EVENT_NAME, env.GITHUB_SHA, payload);
	let plan;
	if (identity.eventName === "pull_request") {
		// Recovery is allowed only from this run's repository, never payload URLs.
		const repo = env.GITHUB_REPOSITORY;
		const server = env.GITHUB_SERVER_URL;
		const origin = decodeGit(runGit(["remote", "get-url", "origin"], { cwd })).trim();
		const expected = typeof repo === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && server === "https://github.com" ? `${server}/${repo}` : null;
		plan = expected && [expected, `${expected}.git`].includes(origin) && payload?.pull_request?.base?.repo?.full_name === repo
			? acquireValidationPlan(identity, { cwd })
			: fullPlan(identity, "Repository recovery identity could not be proven.");
	} else {
		plan = fullPlan(identity, "Main push or manual force-full event.");
	}
	const outputs = planOutputs(plan, identity);
	// Compute and validate everything before a single append; no partial false
	// flags can escape an acquisition/serialization failure.
	if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(""), "utf8");
	return outputs.plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try { console.log(runPlannerCli()); }
	catch (error) { console.error(error.message); process.exitCode = 1; }
}
