import path from "node:path";
import { pathToFileURL } from "node:url";
import { GROUPS, validateIdentity, validatePlan } from "./plan-validation.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export function requireSuccessfulValidation(results, planJson, identity) {
	validateIdentity(identity);
	const expected = ["plan", ...GROUPS];
	if (!object(results) || Object.keys(results).sort().join(",") !== expected.sort().join(",")) throw new Error("Missing or unexpected validation jobs.");
	if (results.plan?.result !== "success") throw new Error("plan did not succeed.");
	if (typeof planJson !== "string" || !planJson) throw new Error("Missing plan JSON.");
	const plan = validatePlan(JSON.parse(planJson), identity);
	if (JSON.stringify(plan) !== planJson) throw new Error("Non-canonical or duplicate-key plan JSON.");
	const outputs = results.plan.outputs;
	if (!object(outputs) || Object.keys(outputs).sort().join(",") !== "artwork,plan,source,workspace" || outputs.plan !== planJson) throw new Error("Missing or inconsistent planner outputs.");
	for (const group of GROUPS.slice(1)) {
		if (outputs[group] !== String(plan.required[group])) throw new Error(`Planner flag disagrees: ${group}.`);
	}
	for (const group of GROUPS) {
		const result = results[group]?.result;
		if (result !== "success" && !(plan.required[group] === false && result === "skipped")) throw new Error(`Validation incomplete: ${group}=${result ?? "missing"}`);
	}
	return "All required validation groups passed.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		const identity = {
			eventName: process.env.VALIDATION_EVENT_NAME,
			eventSha: process.env.VALIDATION_EVENT_SHA,
			baseSha: process.env.VALIDATION_BASE_SHA || null,
			headSha: process.env.VALIDATION_HEAD_SHA || null,
		};
		console.log(requireSuccessfulValidation(JSON.parse(process.env.VALIDATION_RESULTS ?? "null"), process.env.VALIDATION_PLAN, identity));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
