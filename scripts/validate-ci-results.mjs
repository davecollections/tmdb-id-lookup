import path from "node:path";
import { pathToFileURL } from "node:url";
import { VALIDATION_GROUPS } from "./check-all.mjs";

export function requireSuccessfulValidation(results) {
	if (!results || typeof results !== "object" || Array.isArray(results)) throw new Error("Missing validation job results.");
	const failures = VALIDATION_GROUPS.filter((group) => results[group]?.result !== "success");
	const unexpected = Object.keys(results).filter((group) => !VALIDATION_GROUPS.includes(group));
	if (failures.length || unexpected.length) {
		throw new Error(`Validation incomplete: ${failures.map((group) => `${group}=${results[group]?.result ?? "missing"}`).concat(unexpected.map((group) => `unexpected=${group}`)).join(", ")}`);
	}
	return "All required validation groups passed.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		console.log(requireSuccessfulValidation(JSON.parse(process.env.VALIDATION_RESULTS ?? "null")));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
