import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function runNode(args) {
	execFileSync(process.execPath, args, {
		cwd: rootDir,
		stdio: "inherit",
	});
}

runNode([path.join("scripts", "check-frontend.mjs")]);
runNode(["--test", path.join("tests", "tmdb-attribution.test.mjs")]);
runNode(["--test", path.join("tests", "pages-public-paths.test.mjs")]);
runNode(["--test", path.join("tests", "cloudflare-worker.test.mjs")]);
runNode(["--test", path.join("tests", "artwork-runtime.test.mjs")]);
runNode(["--test", path.join("tests", "cached-nuvio-export.test.mjs")]);
runNode(["--test", path.join("tests", "nuvio-contracts.test.mjs")]);
runNode(["--test", path.join("tests", "builder-compatibility-corpus.test.mjs")]);
runNode(["--test", path.join("tests", "builder-reordering-client-evidence.test.mjs")]);
runNode(["--test", path.join("tests", "tmdb-discover-compatibility.test.mjs")]);
runNode(["--test", path.join("tests", "builder-discover-core.test.mjs")]);
runNode(["--test", path.join("tests", "maintenance-commit-action.test.mjs")]);
runNode(["--test", path.join("tests", "tmdb-request-budget.test.mjs")]);
runNode(["--test", path.join("tests", "tmdb-catalogue-maintenance.test.mjs")]);
runNode(["--test", path.join("tests", "global-count-precache-retirement.test.mjs")]);
runNode(["--test", path.join("tests", "builder-domain.test.mjs")]);
runNode(["--test", path.join("tests", "builder-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-serializer.test.mjs")]);
runNode(["--test", path.join("tests", "builder-migration.test.mjs")]);
runNode(["--test", path.join("tests", "builder-controller.test.mjs")]);
runNode(["--test", path.join("tests", "builder-presentation-updates.test.mjs")]);
runNode(["--test", path.join("tests", "builder-bulk-edit.test.mjs")]);
runNode(["--test", path.join("tests", "builder-welcome-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-folder-card-artwork.test.mjs")]);
runNode(["--test", path.join("tests", "builder-folder-artwork-suggestions.test.mjs")]);
runNode(["--test", path.join("tests", "builder-about-credits-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-reordering.test.mjs")]);
runNode(["--test", path.join("tests", "builder-hierarchy-menu-placement.test.mjs")]);
runNode(["--test", path.join("tests", "builder-hierarchy-deletion.test.mjs")]);
runNode(["--test", path.join("tests", "builder-node-editing.test.mjs")]);
runNode(["--test", path.join("tests", "builder-auto-ids-workspace-flow.test.mjs")]);
runNode(["--test", path.join("tests", "builder-add-source-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-add-source-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-people-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-people-hierarchy.test.mjs")]);
runNode(["--test", path.join("tests", "builder-people-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-franchise-hierarchy.test.mjs")]);
runNode(["--test", path.join("tests", "builder-franchise-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-studio-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-studio-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-studio-hierarchy.test.mjs")]);
runNode(["--test", path.join("tests", "builder-studio-hierarchy-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-network-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-network-hierarchy.test.mjs")]);
runNode(["--test", path.join("tests", "builder-network-preview.test.mjs")]);
runNode(["--test", path.join("tests", "builder-network-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-network-hierarchy-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-streaming-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-streaming-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-genre-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-genre-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-genre-hierarchy.test.mjs")]);
runNode(["--test", path.join("tests", "builder-genre-preview.test.mjs")]);
runNode(["--test", path.join("tests", "builder-genre-hierarchy-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-decades-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-decades-controller.test.mjs")]);
runNode(["--test", path.join("tests", "builder-decades-plan.test.mjs")]);
runNode(["--test", path.join("tests", "builder-decades-ui.test.mjs")]);
runNode(["--test", path.join("tests", "v1-company-search-compatibility.test.mjs")]);
runNode(["--test", path.join("tests", "builder-source-edit-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-source-edit-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-bulk-edit-mounted.test.mjs")]);
runNode(["--test", path.join("tests", "mounted-browser-lifecycle.test.mjs")]);
runNode(["--test", path.join("tests", "builder-folder-card-artwork-mounted.test.mjs")]);
runNode(["--test", path.join("tests", "builder-source-edit-mounted.test.mjs")]);
runNode(["--test", path.join("tests", "fixture-line-endings.test.mjs")]);
runNode(["--test", path.join("tests", "windows-validation.test.mjs")]);
runNode([path.join("scripts", "check-builder-add-source-fixture.mjs")]);
runNode([path.join("scripts", "check-builder-people-fixture.mjs")]);
runNode([path.join("scripts", "check-builder-genre-fixture.mjs")]);
runNode([path.join("scripts", "check-builder-source-edit-fixture.mjs")]);
runNode([path.join("scripts", "generate-migration-round-trip.mjs"), "--check"]);
runNode([path.join("scripts", "check-migration-round-trip-export.mjs")]);

console.log("All checks passed.");
