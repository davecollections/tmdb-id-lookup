import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VALIDATION_GROUPS = Object.freeze(["core", "source", "workspace", "artwork"]);
const mountedGroups = {
	[path.join("tests", "builder-source-edit-mounted.test.mjs")]: "source",
	[path.join("tests", "builder-bulk-edit-mounted.test.mjs")]: "workspace",
	[path.join("tests", "builder-folder-card-artwork-mounted.test.mjs")]: "artwork",
};

// One ordered inventory owns both the complete local run and the CI partitions.
export const validationChecks = Object.freeze([
	[path.join("scripts", "check-frontend.mjs")],
	["--test", path.join("tests", "tmdb-attribution.test.mjs")],
	["--test", path.join("tests", "pages-public-paths.test.mjs")],
	["--test", path.join("tests", "pages-asset-references.test.mjs")],
	["--test", path.join("tests", "cloudflare-worker.test.mjs")],
	["--test", path.join("tests", "artwork-runtime.test.mjs")],
	["--test", path.join("tests", "genre-artwork.test.mjs")],
	["--test", path.join("tests", "decades-artwork.test.mjs")],
	["--test", path.join("tests", "cached-nuvio-export.test.mjs")],
	["--test", path.join("tests", "nuvio-contracts.test.mjs")],
	["--test", path.join("tests", "shared-advanced-investigation.test.mjs"), path.join("tests", "collection-preservation.test.mjs")],
	[path.join("manual-tests", "collection-preservation", "generate-pack.mjs"), "--check"],
	["--test", path.join("tests", "builder-compatibility-corpus.test.mjs")],
	["--test", path.join("tests", "builder-reordering-client-evidence.test.mjs")],
	["--test", path.join("tests", "tmdb-discover-compatibility.test.mjs")],
	["--test", path.join("tests", "builder-discover-core.test.mjs")],
	["--test", path.join("tests", "builder-advanced-discover.test.mjs"), path.join("tests", "builder-advanced-discover-worker.test.mjs"), path.join("tests", "builder-keyword-catalogue.test.mjs")],
	["--test", path.join("tests", "maintenance-commit-action.test.mjs")],
	["--test", path.join("tests", "tmdb-request-budget.test.mjs")],
	["--test", path.join("tests", "tmdb-catalogue-maintenance.test.mjs")],
	["--test", path.join("tests", "global-count-precache-retirement.test.mjs")],
	["--test", path.join("tests", "builder-domain.test.mjs")],
	["--test", path.join("tests", "builder-import.test.mjs")],
	["--test", path.join("tests", "builder-import-merge.test.mjs")],
	["--test", path.join("tests", "builder-serializer.test.mjs")],
	["--test", path.join("tests", "builder-migration.test.mjs")],
	["--test", path.join("tests", "builder-controller.test.mjs")],
	["--test", path.join("tests", "builder-nuvio-import.test.mjs")],
	["--test", path.join("tests", "builder-nuvio-send.test.mjs")],
	["--test", path.join("tests", "builder-nuvio-send-ui.test.mjs")],
	["--test", path.join("tests", "builder-collection-folder-management.test.mjs")],
	["--test", path.join("tests", "builder-collection-extension.test.mjs")],
	["--test", path.join("tests", "builder-presentation-updates.test.mjs")],
	["--test", path.join("tests", "builder-bulk-edit.test.mjs")],
	["--test", path.join("tests", "builder-welcome-import.test.mjs")],
	["--test", path.join("tests", "builder-workspace-import.test.mjs")],
	["--test", path.join("tests", "builder-ui.test.mjs")],
	["--test", path.join("tests", "builder-export-collections.test.mjs")],
	["--test", path.join("tests", "builder-source-details.test.mjs")],
	["--test", path.join("tests", "builder-folder-card-artwork.test.mjs")],
	["--test", path.join("tests", "builder-folder-artwork-suggestions.test.mjs")],
	["--test", path.join("tests", "builder-about-credits-ui.test.mjs")],
	["--test", path.join("tests", "builder-reordering.test.mjs")],
	["--test", path.join("tests", "builder-hierarchy-menu-placement.test.mjs")],
	["--test", path.join("tests", "builder-hierarchy-deletion.test.mjs")],
	["--test", path.join("tests", "builder-node-editing.test.mjs")],
	["--test", path.join("tests", "builder-export-defaults.test.mjs")],
	["--test", path.join("tests", "builder-auto-ids-workspace-flow.test.mjs")],
	["--test", path.join("tests", "builder-add-source-foundation.test.mjs")],
	["--test", path.join("tests", "builder-add-source-ui.test.mjs")],
	["--test", path.join("tests", "builder-source-chooser-ui.test.mjs")],
	["--test", path.join("tests", "builder-people-foundation.test.mjs")],
	["--test", path.join("tests", "builder-native-source-variants.test.mjs")],
	["--test", path.join("tests", "builder-source-names.test.mjs")],
	["--test", path.join("tests", "builder-source-sort-variants.test.mjs")],
	["--test", path.join("tests", "builder-people-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-people-ui.test.mjs")],
	["--test", path.join("tests", "builder-source-capability-contract.test.mjs")],
	["--test", path.join("tests", "builder-action-language.test.mjs")],
	["--test", path.join("tests", "builder-choice-presentation-contract.test.mjs")],
	["--test", path.join("tests", "builder-franchise-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-franchise-ui.test.mjs")],
	["--test", path.join("tests", "builder-studio-foundation.test.mjs")],
	["--test", path.join("tests", "builder-studio-ui.test.mjs")],
	["--test", path.join("tests", "builder-studio-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-studio-hierarchy-ui.test.mjs")],
	["--test", path.join("tests", "builder-network-foundation.test.mjs")],
	["--test", path.join("tests", "builder-network-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-network-preview.test.mjs")],
	["--test", path.join("tests", "builder-network-ui.test.mjs")],
	["--test", path.join("tests", "builder-network-hierarchy-ui.test.mjs")],
	["--test", path.join("tests", "builder-streaming-foundation.test.mjs")],
	["--test", path.join("tests", "builder-streaming-preview.test.mjs")],
	["--test", path.join("tests", "builder-family-advanced.test.mjs")],
	["--test", path.join("tests", "builder-streaming-ui.test.mjs")],
	["--test", path.join("tests", "builder-streaming-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-streaming-hierarchy-ui.test.mjs")],
	["--test", path.join("tests", "builder-genre-foundation.test.mjs")],
	["--test", path.join("tests", "builder-genre-ui.test.mjs")],
	["--test", path.join("tests", "builder-genre-hierarchy.test.mjs")],
	["--test", path.join("tests", "builder-genre-preview.test.mjs")],
	["--test", path.join("tests", "builder-genre-hierarchy-ui.test.mjs")],
	["--test", path.join("tests", "builder-decades-foundation.test.mjs")],
	["--test", path.join("tests", "builder-decades-controller.test.mjs")],
	["--test", path.join("tests", "builder-decades-plan.test.mjs")],
	["--test", path.join("tests", "builder-decades-preview.test.mjs")],
	["--test", path.join("tests", "builder-decades-ui.test.mjs")],
	["--test", path.join("tests", "builder-tmdb-lists.test.mjs")],
	["--test", path.join("tests", "builder-tmdb-lists-ui.test.mjs")],
	["--test", path.join("tests", "v1-company-search-compatibility.test.mjs")],
	["--test", path.join("tests", "builder-source-edit-foundation.test.mjs")],
	["--test", path.join("tests", "builder-source-edit-preview.test.mjs")],
	["--test", path.join("tests", "builder-title-preview-pages.test.mjs")],
	["--test", path.join("tests", "builder-add-source-preview-parity.test.mjs")],
	["--test", path.join("tests", "builder-source-edit-ui.test.mjs")],
	["--test", path.join("tests", "builder-bulk-edit-mounted.test.mjs")],
	["--test", path.join("tests", "mounted-browser-lifecycle.test.mjs")],
	["--test", path.join("tests", "builder-folder-card-artwork-mounted.test.mjs")],
	["--test", path.join("tests", "builder-source-edit-mounted.test.mjs")],
	["--test", path.join("tests", "fixture-line-endings.test.mjs")],
	["--test", path.join("tests", "windows-validation.test.mjs")],
	["--test", path.join("tests", "validation-orchestration.test.mjs")],
	[path.join("scripts", "check-builder-add-source-fixture.mjs")],
	[path.join("scripts", "check-builder-people-fixture.mjs")],
	[path.join("scripts", "check-builder-genre-fixture.mjs")],
	[path.join("scripts", "check-builder-source-edit-fixture.mjs")],
	[path.join("scripts", "generate-migration-round-trip.mjs"), "--check"],
	[path.join("scripts", "check-migration-round-trip-export.mjs")],
].map((args) => Object.freeze({
	group: mountedGroups[args[1]] ?? "core",
	args: Object.freeze(args),
})));

export function selectValidationChecks(group = "all") {
	if (group !== "all" && !VALIDATION_GROUPS.includes(group)) throw new Error(`Unknown validation group: ${group}`);
	return validationChecks.filter((check) => group === "all" || check.group === group);
}

export function parseValidationArguments(args) {
	let group = "all";
	let list = false;
	let selected = false;
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--list" && !list) list = true;
		else if (args[index] === "--group" && !selected && args[index + 1]) {
			group = args[++index];
			selected = true;
		} else throw new Error("Usage: node scripts/check-all.mjs [--group core|source|workspace|artwork] [--list]");
	}
	selectValidationChecks(group);
	return { group, list };
}

export function runValidation(group = "all", { execute = execFileSync, log = console.log } = {}) {
	const checks = selectValidationChecks(group);
	const started = performance.now();
	log(`[Validation] ${group}: ${checks.length} commands`);
	try {
		for (const { args } of checks) {
			const checkStarted = performance.now();
			try {
				execute(process.execPath, args, { cwd: rootDir, stdio: "inherit" });
			} finally {
				log(`[CI timing] ${args.join(" ")}: ${((performance.now() - checkStarted) / 1000).toFixed(1)}s`);
			}
		}
	} finally {
		log(`[CI timing] Validation ${group}: ${((performance.now() - started) / 1000).toFixed(1)}s elapsed`);
	}
	log(group === "all" ? "All checks passed." : `Validation group ${group} passed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const controlledTestExitCode = process.env.TMDB_ID_LOOKUP_CHECK_TEST_EXIT_CODE;

	if (
		process.env.TMDB_ID_LOOKUP_CHECK_TEST_MODE === "1" &&
		controlledTestExitCode !== undefined
	) {
		const parsedExitCode = Number(controlledTestExitCode);
		if (
			!Number.isInteger(parsedExitCode) ||
			parsedExitCode < 0 ||
			parsedExitCode > 255 ||
			String(parsedExitCode) !== controlledTestExitCode
		) {
			throw new Error("TMDB_ID_LOOKUP_CHECK_TEST_EXIT_CODE must be a canonical integer from 0 through 255.");
		}

		console.log(`Controlled check-all test exit: ${parsedExitCode}.`);
		process.exit(parsedExitCode);
	}

	try {
		const { group, list } = parseValidationArguments(process.argv.slice(2));
		if (list) console.log(JSON.stringify(selectValidationChecks(group), null, 2));
		else runValidation(group);
	} catch (error) {
		console.error(error.message);
		process.exitCode = Number.isInteger(error.status) && error.status > 0 ? error.status : 1;
	}
}
