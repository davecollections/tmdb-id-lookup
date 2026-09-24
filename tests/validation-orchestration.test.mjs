import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { VALIDATION_GROUPS, validationChecks, selectValidationChecks, parseValidationArguments, runValidation } from "../scripts/check-all.mjs";
import { requireSuccessfulValidation } from "../scripts/validate-ci-results.mjs";
import { createValidationTiming } from "../scripts/lib/validation-timing.mjs";
import { runExportRegressions } from "./helpers/export-mounted.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = fs.readFileSync(path.join(root, ".github/workflows/nuvio-contract-validation.yml"), "utf8");
const key = ({ args }) => JSON.stringify(args);

test("CI groups partition the complete ordered local inventory exactly once", () => {
	const all = selectValidationChecks();
	const grouped = VALIDATION_GROUPS.flatMap((group) => selectValidationChecks(group));
	assert.equal(new Set(all.map(key)).size, all.length);
	assert.deepEqual(grouped.map(key).sort(), all.map(key).sort());
	for (const group of VALIDATION_GROUPS) {
		assert.ok(selectValidationChecks(group).length > 0);
		assert.deepEqual(selectValidationChecks(group), all.filter((check) => check.group === group));
	}
	assert.equal(selectValidationChecks("core").some(({ args }) => args.some((arg) => arg.endsWith("-mounted.test.mjs"))), false);
	assert.equal(grouped.filter(({ group }) => group !== "core").length, 3);
	for (const { args } of all) for (const arg of args) if (!arg.startsWith("--")) assert.ok(fs.existsSync(path.join(root, arg)), arg);
});

test("local runner executes the whole inventory in order and stops at the original child error", () => {
	const calls = [];
	runValidation("all", { execute: (executable, args, options) => {
		assert.equal(executable, process.execPath);
		assert.equal(options.stdio, "inherit");
		calls.push(args);
	}, log: () => {} });
	assert.deepEqual(calls, validationChecks.map(({ args }) => args));
	let attempted = 0;
	const logs = [];
	const failure = Object.assign(new Error("Child failed"), { status: 37 });
	assert.throws(() => runValidation("core", { execute: () => { if (++attempted === 2) throw failure; }, log: (line) => logs.push(line) }), (error) => error === failure);
	assert.equal(attempted, 2);
	assert.ok(logs.some((line) => line.includes("[CI timing]")));
	assert.equal(logs.some((line) => line.includes("passed")), false);
});

test("invalid selectors fail closed and the real list CLI never starts checks", () => {
	assert.deepEqual(parseValidationArguments([]), { group: "all", list: false });
	assert.deepEqual(parseValidationArguments(["--list", "--group", "source"]), { group: "source", list: true });
	for (const args of [["--group"], ["--group", "typo"], ["--skip"], ["--list", "--list"], ["--group", "core", "--group", "source"]]) assert.throws(() => parseValidationArguments(args));
	const result = spawnSync(process.execPath, ["scripts/check-all.mjs", "--group", "workspace", "--list"], { cwd: root, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), selectValidationChecks("workspace"));
	const bad = spawnSync(process.execPath, ["scripts/check-all.mjs", "--group", "typo"], { cwd: root, encoding: "utf8" });
	assert.equal(bad.status, 1);
	assert.equal(bad.stdout, "");
});

const successes = () => Object.fromEntries(VALIDATION_GROUPS.map((group) => [group, { result: "success" }]));
test("aggregate rejects failure, setup failure, cancellation, skip, neutral, unknown and missing workers", () => {
	assert.match(requireSuccessfulValidation(successes()), /passed/);
	for (const group of VALIDATION_GROUPS) {
		for (const result of ["failure", "cancelled", "skipped", "neutral", "timed_out", "", null, undefined]) {
			assert.throws(() => requireSuccessfulValidation({ ...successes(), [group]: { result } }), new RegExp(group));
		}
		const absent = successes(); delete absent[group];
		assert.throws(() => requireSuccessfulValidation(absent), /missing/);
	}
	for (const invalid of [null, [], {}, { ...successes(), extra: { result: "success" } }]) assert.throws(() => requireSuccessfulValidation(invalid));
	for (const [value, expected] of [[JSON.stringify(successes()), 0], ["{}", 1], ["not JSON", 1]]) {
		const result = spawnSync(process.execPath, ["scripts/validate-ci-results.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, VALIDATION_RESULTS: value } });
		assert.equal(result.status, expected, result.stderr);
	}
});

test("workflow workers are independent and the original validate gate always depends on all four", () => {
	const sections = new Map([...workflow.split(/^jobs:\s*$/m)[1].matchAll(/^  (\w+):\r?\n([\s\S]*?)(?=^  \w+:\r?\n|(?![\s\S]))/gm)].map((match) => [match[1], match[2]]));
	assert.deepEqual([...sections.keys()], [...VALIDATION_GROUPS, "validate"]);
	for (const group of VALIDATION_GROUPS) {
		const worker = sections.get(group);
		assert.doesNotMatch(worker, /^    (?:needs|if):/m);
		assert.match(worker, new RegExp(`run: node scripts/check-all\\.mjs --group ${group}`));
		assert.match(worker, /npm ci --prefix builder/);
		assert.match(worker, /restore-tmdb-keyword-catalogue\.mjs/);
	}
	const aggregate = sections.get("validate");
	assert.match(aggregate, /if: \$\{\{ always\(\) \}\}/);
	const dependencies = aggregate.match(/needs: \[([^\]]+)\]/)[1].split(",").map((name) => name.trim());
	assert.deepEqual(dependencies, VALIDATION_GROUPS);
	assert.match(aggregate, /VALIDATION_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
	assert.match(aggregate, /run: node scripts\/validate-ci-results\.mjs/);
	assert.match(sections.get("core"), /npm run build --prefix builder/);
	assert.match(sections.get("core"), /prepare-pages-site\.mjs --code-only/);
	assert.match(sections.get("core"), /validate-pages-site\.mjs --code-only/);
	assert.match(workflow, /  push:\s+branches:\s+- main/);
	assert.match(workflow, /  pull_request:\s+branches:\s+- main/);
	assert.match(workflow, /  workflow_dispatch:/);
	assert.doesNotMatch(workflow, /paths-ignore:|paths:|deploy-pages@/);
});

test("workflow concurrency supersedes only the same PR and never groups main/manual runs together", () => {
	const expression = workflow.match(/^  group: \$\{\{ github\.workflow \}\}-(\$\{\{.*\}\})$/m)[1].slice(3, -2);
	const cancellation = workflow.match(/^  cancel-in-progress: \$\{\{ (.*) \}\}$/m)[1];
	const context = (event_name, run_id, number = undefined) => ({ github: { event_name, run_id, run_attempt: 1, event: { pull_request: number ? { number } : undefined } }, format: (text, ...args) => text.replace(/\{(\d+)\}/g, (_, i) => args[i]) });
	const group = (event, id, number) => vm.runInNewContext(expression, context(event, id, number));
	assert.equal(group("pull_request", 1, 247), group("pull_request", 2, 247));
	assert.notEqual(group("pull_request", 1, 247), group("pull_request", 2, 248));
	assert.notEqual(group("push", 1), group("push", 2));
	assert.notEqual(group("workflow_dispatch", 1), group("workflow_dispatch", 2));
	assert.notEqual(group("pull_request", 1, 247), group("push", 1));
	for (const event of ["pull_request", "push", "workflow_dispatch"]) assert.equal(vm.runInNewContext(cancellation, context(event, 1, 247)), event === "pull_request");
});

test("timing aggregates repeated phases and remains informational even for very long work", () => {
	let clock = 0;
	const output = [];
	const timing = createValidationTiming("Example", { now: () => clock, log: (line) => output.push(line) });
	clock = 100; timing.stage("Send");
	clock = 1100; timing.stage("Export");
	clock = 1600; timing.stage("Send");
	clock = 3602600; timing.finish();
	assert.ok(output.includes("[CI timing] Example / Send: 3602.0s (2 segments)"));
	assert.ok(output.includes("[CI timing] Example / Export: 0.5s"));
	const count = output.length;
	timing.finish(); timing.stage("Ignored after completion");
	assert.equal(output.length, count);
});

test("shared Export orchestration runs each local scenario once at the retained widths and propagates errors", async () => {
	// Pure orchestration unit: no browser or external integration claim.
	const widths = [], expressions = [];
	const connection = { command: async (name, args) => { if (name === "Emulation.setDeviceMetricsOverride") widths.push(args.width); } };
	const evaluate = async (_connection, expression) => { expressions.push(expression); return expression.includes("Ready") ? true : { expression }; };
	const result = await runExportRegressions(connection, "http://127.0.0.1:1234", evaluate);
	assert.deepEqual(widths, [393, 900, 1280]);
	assert.equal(expressions.filter((value) => value === "window.runExportScenario()").length, 3);
	for (const name of ["EditorCases", "FeedbackCases", "WarningCases", "LargeCase"]) {
		assert.equal(expressions.filter((value) => value === `window.runExport${name}()`).length, 1);
		assert.equal(result.regressions[name].expression, `window.runExport${name}()`);
	}
	const error = new Error("Scenario failure");
	await assert.rejects(runExportRegressions(connection, "http://127.0.0.1:1234", async () => { throw error; }), (failure) => failure === error);
});
