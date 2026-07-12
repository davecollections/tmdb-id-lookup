import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runNode(args) {
	execFileSync(process.execPath, args, {
		cwd: rootDir,
		stdio: "inherit",
	});
}

runNode([path.join("scripts", "check-frontend.mjs")]);
runNode(["--test", path.join("tests", "pages-public-paths.test.mjs")]);
runNode(["--test", path.join("tests", "nuvio-contracts.test.mjs")]);
runNode(["--test", path.join("tests", "builder-domain.test.mjs")]);
runNode(["--test", path.join("tests", "builder-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-serializer.test.mjs")]);
runNode(["--test", path.join("tests", "builder-migration.test.mjs")]);
runNode(["--test", path.join("tests", "builder-controller.test.mjs")]);
runNode(["--test", path.join("tests", "builder-welcome-import.test.mjs")]);
runNode(["--test", path.join("tests", "builder-ui.test.mjs")]);
runNode(["--test", path.join("tests", "builder-node-editing.test.mjs")]);
runNode([path.join("scripts", "generate-migration-round-trip.mjs"), "--check"]);
runNode([path.join("scripts", "check-migration-round-trip-export.mjs")]);

console.log("All checks passed.");
