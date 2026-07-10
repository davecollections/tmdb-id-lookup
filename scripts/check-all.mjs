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
runNode(["--test", path.join("tests", "nuvio-contracts.test.mjs")]);
runNode(["--test", path.join("tests", "builder-domain.test.mjs")]);
runNode(["--test", path.join("tests", "builder-import.test.mjs")]);

console.log("All checks passed.");
