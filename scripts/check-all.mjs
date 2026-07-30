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
runNode(["--test", path.join("tests", "pages-public-paths.test.mjs")]);
runNode(["--test", path.join("tests", "artwork-runtime.test.mjs")]);
runNode(["--test", path.join("tests", "cached-nuvio-export.test.mjs")]);
runNode(["--test", path.join("tests", "nuvio-contracts.test.mjs")]);
runNode(["--test", path.join("tests", "builder-compatibility-corpus.test.mjs")]);
runNode(["--test", path.join("tests", "builder-reordering-client-evidence.test.mjs")]);
runNode(["--test", path.join("tests", "tmdb-discover-compatibility.test.mjs")]);
runNode(["--test", path.join("tests", "builder-domain.test.mjs")]);
runNode(["--test", path.join("tests", "builder-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-serializer.test.mjs")]);
runNode(["--test", path.join("tests", "builder-migration.test.mjs")]);
runNode(["--test", path.join("tests", "builder-controller.test.mjs")]);
runNode(["--test", path.join("tests", "builder-welcome-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-reordering.test.mjs")]);
runNode(["--test", path.join("tests", "builder-hierarchy-menu-placement.test.mjs")]);
runNode(["--test", path.join("tests", "builder-hierarchy-deletion.test.mjs")]);
runNode(["--test", path.join("tests", "builder-node-editing.test.mjs")]);
runNode(["--test", path.join("tests", "builder-auto-ids-workspace-flow.test.mjs")]);
runNode(["--test", path.join("tests", "builder-add-source-foundation.test.mjs")]);
runNode(["--test", path.join("tests", "builder-add-source-ui.test.mjs")]);
runNode(["--test", path.join("tests", "windows-validation.test.mjs")]);
runNode([path.join("scripts", "check-builder-add-source-fixture.mjs")]);
runNode([path.join("scripts", "generate-migration-round-trip.mjs"), "--check"]);
runNode([path.join("scripts", "check-migration-round-trip-export.mjs")]);

console.log("All checks passed.");
