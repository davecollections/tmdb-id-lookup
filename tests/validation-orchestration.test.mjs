import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { IMPACT_REGISTRY, BROAD_PREFIXES, planValidation, fullPlan, planOutputs, identityFromEvent, normalizeChangedPath, acquireValidationPlan, runGit, decodeGit, parseRawDiff } from "../scripts/plan-validation.mjs";
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


test("workflow has one planner, independent Core, exactly gated optional workers and an always aggregate", () => {
	const sections = new Map([...workflow.split(/^jobs:\s*$/m)[1].matchAll(/^  (\w+):\r?\n([\s\S]*?)(?=^  \w+:\r?\n|(?![\s\S]))/gm)].map((match) => [match[1], match[2]]));
	assert.deepEqual([...sections.keys()], ["plan", ...VALIDATION_GROUPS, "validate"]);
	const planner = sections.get("plan");
	assert.match(planner, /ref: \$\{\{ github\.sha \}\}/);
	assert.match(planner, /fetch-depth: 0/);
	assert.match(planner, /package-manager-cache: false/);
	assert.deepEqual([...planner.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1].trim()), ["node scripts/plan-validation.mjs"]);
	assert.doesNotMatch(planner, /npm|restore-tmdb|DEVTOOLS|GH_TOKEN|needs:/);
	for (const output of ["plan", "source", "workspace", "artwork"]) assert.ok(planner.includes(output + ": ${{ steps.route.outputs." + output + " }}"));
	const expectedNames = { core: "Core and build", source: "Source, hierarchy and live Preview", workspace: "Bulk Edit, Import, Export and Send", artwork: "Folder artwork" };
	for (const group of VALIDATION_GROUPS) {
		const worker = sections.get(group);
		assert.ok(worker.includes("name: " + expectedNames[group]));
		if (group === "core") assert.doesNotMatch(worker, /^    (?:needs|if):/m);
		else {
			assert.match(worker, /^    needs: plan\r?$/m);
			assert.equal(worker.match(/^    if: (.+)$/m)[1].trim(), "${{ needs.plan.result == 'success' && needs.plan.outputs." + group + " == 'true' }}");
		}
		assert.deepEqual([...worker.matchAll(/^\s+uses: (.+)$/gm)].map((match) => match[1].trim()), ["actions/checkout@v7", "actions/setup-node@v7"]);
		assert.match(worker, /node-version: 22\s+cache: npm\s+cache-dependency-path: builder\/package-lock\.json/);
		const commands = [...worker.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1].trim());
		assert.deepEqual(commands, ["npm ci --prefix builder", "node scripts/restore-tmdb-keyword-catalogue.mjs", "node scripts/check-all.mjs --group " + group,
			...(group === "core" ? ["npm run build --prefix builder", "node scripts/prepare-pages-site.mjs --code-only", "node scripts/validate-pages-site.mjs --code-only"] : [])]);
		assert.deepEqual([...worker.matchAll(/^          ([A-Z_]+): (.+)$/gm)].map((match) => [match[1], match[2].trim()]), [["GH_TOKEN", "${{ github.token }}"], ["DEVTOOLS_STARTUP_MS", '"30000"']]);
	}
	const aggregate = sections.get("validate");
	assert.match(aggregate, /if: \$\{\{ always\(\) \}\}/);
	assert.match(aggregate, /needs: \[plan, core, source, workspace, artwork\]/);
	assert.match(aggregate, /VALIDATION_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
	assert.match(aggregate, /VALIDATION_PLAN: \$\{\{ needs\.plan\.outputs\.plan \}\}/);
	for (const [name, value] of [["EVENT_NAME", "github.event_name"], ["EVENT_SHA", "github.sha"], ["BASE_SHA", "github.event.pull_request.base.sha"], ["HEAD_SHA", "github.event.pull_request.head.sha"]]) {
		assert.ok(aggregate.includes("VALIDATION_" + name + ": ${{ " + value + " }}"));
	}
	assert.match(aggregate, /run: node scripts\/validate-ci-results\.mjs/);
	assert.doesNotMatch(aggregate, /^\s+name: (?!Checkout repository|Setup Node.js|Require planned validation to succeed)/m);
	assert.match(workflow, /on:\s+push:\s+branches:\s+- main\s+pull_request:\s+branches:\s+- main\s+workflow_dispatch:\s+permissions:/);
	assert.match(workflow, /permissions:\s+actions: read\s+contents: read\s+# Only newer/);
	assert.doesNotMatch(workflow, /paths-ignore:|paths:|deploy-pages@|continue-on-error|secrets\.|dorny\/|paths-filter/);
	assert.equal((workflow.match(/npm ci/g) ?? []).length, 4);
	assert.equal(selectValidationChecks().length, 113);
	assert.equal(selectValidationChecks("core").length, 110);
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

const identity = { eventName: "pull_request", eventSha: "e".repeat(40), baseSha: "b".repeat(40), headSha: "a".repeat(40) };
const changed = (file, overrides = {}) => ({ status: "M", oldMode: "100644", newMode: "100644", oldPath: file, newPath: file, ...overrides });
const route = (paths, options) => planValidation(identity, paths.map((file) => typeof file === "string" ? changed(file) : file), options);
const selected = (plan) => VALIDATION_GROUPS.filter((group) => plan.required[group]);
const all = [...VALIDATION_GROUPS];
const histories = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/validation-routing-history.json"), "utf8"));

test("every audited narrow leaf has its approved route; additions are not inferred from test filenames", () => {
	assert.deepEqual(Object.fromEntries(Object.entries(IMPACT_REGISTRY).map(([key, paths]) => [key, paths.length])), { core: 107, source: 21, workspace: 30, artwork: 3, sourceWorkspace: 7 });
	const seen = new Set();
	for (const [domain, paths] of Object.entries(IMPACT_REGISTRY)) for (const file of paths) {
		assert.ok(!seen.has(file), file); seen.add(file);
		assert.ok(fs.existsSync(path.join(root, file)), file);
		const expected = domain === "core" ? ["core"] : domain === "sourceWorkspace" ? ["core", "source", "workspace"] : ["core", domain];
		assert.deepEqual(selected(route([file])), expected, file);
		assert.deepEqual(selected(route([changed(file, { status: "A", oldPath: null, oldMode: "000000" })])), expected, file);
	}
	assert.deepEqual(selected(route(["docs/v2/notes.md", "README.md", "AGENTS.md"])), ["core"]);
	assert.deepEqual(selected(route(["tests/builder-ui.test.mjs"])), ["core"]);
	assert.deepEqual(selected(route(["tests/new-unregistered.test.mjs"])), all);
	assert.deepEqual(selected(route(["builder/src/ui/AboutCreditsDialog.jsx"])), ["core", "workspace"]);
});

for (const fixture of histories) test("actual historical planner: " + fixture.name, () => {
	const event = { ...identity, baseSha: fixture.baseSha, headSha: fixture.headSha };
	assert.deepEqual(selected(planValidation(event, fixture.records, { mergeBaseSha: fixture.mergeBaseSha })), fixture.expected);
});

test("union, order, duplicate paths and broad dominance do not grant extra skips", () => {
	const s = "builder/src/ui/SourceEditorDialog.jsx", w = "builder/src/ui/FindProjectDialog.jsx", a = "tests/fixtures/builder-folder-card-artwork-mounted.jsx";
	assert.deepEqual(selected(route([s, w])), ["core", "source", "workspace"]);
	assert.deepEqual(route([s, w, s]), route([w, s]));
	assert.deepEqual(route([s, w, a]), route([a, w, s]));
	assert.deepEqual(selected(route([s, w, a])), all);
	for (const broad of ["builder/src/styles.css", "unknown/file.js"]) {
		assert.deepEqual(route([s, broad]), route([broad, s]));
		assert.deepEqual(selected(route([s, broad])), all);
	}
});

test("every shared boundary and unclassified surface is full, including component CSS", () => {
	const broad = [
		...BROAD_PREFIXES.map((prefix) => prefix + "README.md"),
		"scripts/plan-validation.mjs", "scripts/validate-ci-results.mjs", "scripts/check-all.mjs", "scripts/check.cmd",
		"tests/validation-orchestration.test.mjs", "tests/mounted-browser-lifecycle.test.mjs", "tests/windows-validation.test.mjs",
		"tests/helpers/mounted-browser.mjs", "tests/helpers/vite.mjs", "tests/helpers/defaults.mjs",
		"tests/fixtures/new-mounted.jsx", "tests/helpers/new-helper.mjs",
		"builder/src/application/controller.js", "builder/src/domain/identity.js", "builder/src/domain/source-overlay.js",
		"builder/src/import/index.js", "builder/src/serialize/index.js", "builder/src/migrate/index.js", "builder/src/nuvio/contracts.js",
		"builder/src/main.jsx", "builder/src/ui/BuilderApp.jsx", "builder/src/ui/BuilderWorkspace.jsx", "builder/src/ui/BuilderWelcome.jsx",
		"builder/src/ui/index.js", "builder/src/source-add/index.js", "builder/src/ui/view-model.js",
		"builder/src/ui/modal-focus.js", "builder/src/ui/add-source-modal-lifecycle.js", "builder/src/ui/responsive-viewport.js",
		"builder/src/ui/hierarchy-menu-placement.js", "builder/src/ui/NodeEditorDialog.jsx", "builder/src/ui/node-titles.js",
		"builder/src/ui/delete-nodes.js", "builder/src/ui/reorder.js", "builder/src/ui/presentation.js", "builder/src/ui/ChoiceCards.jsx",
		"builder/src/ui/folder-artwork-suggestions.js", "builder/src/ui/exact-url-preview.js", "builder/src/ui/FolderArtworkFields.jsx",
		"builder/src/ui/CollectionArtworkField.jsx", "builder/src/ui/ExactImageUrlField.jsx", "builder/src/source-add/genre-artwork.js",
		"builder/src/source-add/other-family-flow.js", "builder/src/source-edit/new-helper.js",
		"js/artwork-runtime.mjs", "js/genre-artwork.mjs", "builder/src/data/catalogue.json",
		"builder/src/new-production.js", "new-production/index.js", "public/new.json", "data/new.json",
		"cloudflare-worker/src/index.js", "js/app.js", "index.html",
		"package.json", "package-lock.json", "builder/package.json", "builder/package-lock.json",
		".npmrc", ".node-version", "builder/vite.config.js", "builder/build-config.js",
		"builder/src/styles.css", "builder/src/ui/AboutCreditsDialog.css", "docs/example.css", "new.CSS", "new.scss", "new.less",
		"README.MD", "Docs/guide.md", "manual-tests/notes.md", "docs/guide.mdx",
	];
	for (const file of broad) assert.deepEqual(selected(route([file])), all, file);
});

test("statuses, modes, malformed records and empty diffs fail closed", () => {
	for (const status of ["D", "R100", "C100", "T", "U", "X", "B", "", null, "M100", "AD"]) {
		assert.deepEqual(selected(route([changed("README.md", { status })])), all, String(status));
	}
	assert.deepEqual(selected(route([changed("README.md", { status: "D", newPath: null }), changed("docs/new.md", { status: "A", oldMode: "000000", oldPath: null })])), all);
	for (const [oldMode, newMode] of [["100644", "100755"], ["120000", "120000"], ["160000", "160000"], ["000000", "000000"], [null, "100644"], ["100644", "100644x"]]) {
		assert.deepEqual(selected(route([changed("README.md", { oldMode, newMode })])), all);
	}
	for (const records of [[], null, {}, [null], [{}], [changed("README.md", { extra: true })], [changed("README.md", { oldPath: "other.md" })]]) {
		assert.deepEqual(selected(planValidation(identity, records)), all);
	}
	assert.deepEqual(selected(route([changed("README.md", { status: "A" })])), all);
	assert.deepEqual(selected(route(["README.md"], { mergeBaseSha: null })), all);
	assert.deepEqual(selected(route(["README.md"], { mergeBaseSha: "c".repeat(40) })), all);
});

test("paths normalize only explicit Windows input; Git filenames never split or case-fold", () => {
	assert.deepEqual(selected(route(["docs\\guide.md"], { pathStyle: "windows" })), ["core"]);
	assert.equal(normalizeChangedPath("docs\\sub\\guide.md", "windows"), "docs/sub/guide.md");
	assert.deepEqual(route(["docs/guide.md", "docs\\guide.md"], { pathStyle: "windows" }), route(["docs/guide.md"]));
	for (const file of ["/docs/a.md", "C:/docs/a.md", "C:docs/a.md", "\\\\server\\docs\\a.md", "\\docs\\a.md", "../README.md", "docs/../README.md", "docs/./a.md", "docs//a.md", "docs/a.md/", "docs/a\nb.md", "docs/a\tb.md", "docs/a\0b.md", "docs/a\u007fb.md", "docs\\a.md", "", null]) {
		assert.deepEqual(selected(route([changed(file)])), all, JSON.stringify(file));
	}
	assert.deepEqual(selected(route(["docs/a.md"], { pathStyle: "unknown" })), all);
});

test("main and manual events always require full, regardless of candidate paths", () => {
	for (const eventName of ["push", "workflow_dispatch"]) {
		const event = { ...identity, eventName, baseSha: null, headSha: null };
		const plan = planValidation(event, [changed("README.md")]);
		assert.deepEqual(selected(plan), all);
		assert.equal(plan.decision, "full");
		assert.deepEqual(planOutputs(plan, event), { plan: JSON.stringify(plan), source: "true", workspace: "true", artwork: "true" });
	}
	assert.throws(() => identityFromEvent("pull_request", identity.eventSha, {}));
	assert.deepEqual(selected(route(["README.md"], { mergeBaseSha: "bad" })), all);
	assert.throws(() => planValidation({ ...identity, eventSha: "bad;touch file" }, []));
});

const guardInput = (plan = route(["README.md"])) => {
	const outputs = planOutputs(plan, { eventName: plan.eventName, eventSha: plan.eventSha, baseSha: plan.baseSha, headSha: plan.headSha });
	return { planJson: outputs.plan, results: { plan: { result: "success", outputs }, ...Object.fromEntries(VALIDATION_GROUPS.map((group) => [group, { result: plan.required[group] ? "success" : "skipped" }])) } };
};
const guard = ({ results, planJson }, event = identity) => requireSuccessfulValidation(results, planJson, event);
test("aggregate state matrix covers every combination of optional requirements and worker outcomes", () => {
	const states = ["success", "skipped", "failure", "cancelled", "timed_out", "neutral", "unknown", "", null, undefined];
	let cases = 0;
	for (let mask = 0; mask < 8; mask++) {
		const plan = { ...route(["README.md"]), required: { core: true, source: !!(mask & 1), workspace: !!(mask & 2), artwork: !!(mask & 4) } };
		for (const s of states) for (const w of states) for (const a of states) {
			const input = guardInput(plan);
			const results = [s, w, a];
			["source", "workspace", "artwork"].forEach((group, i) => { input.results[group].result = results[i]; });
			const valid = ["source", "workspace", "artwork"].every((group, i) => results[i] === "success" || (!plan.required[group] && results[i] === "skipped"));
			if (valid) assert.match(guard(input), /passed/); else assert.throws(() => guard(input));
			cases++;
		}
	}
	assert.equal(cases, 8000);
	for (const group of ["plan", ...VALIDATION_GROUPS]) for (const state of states) {
		const input = guardInput(fullPlan(identity, "Full test."));
		input.results[group].result = state;
		if (state === "success") assert.match(guard(input), /passed/); else assert.throws(() => guard(input), new RegExp(group));
	}
});

test("aggregate rejects missing jobs, malformed schema, inconsistent flags and independent identity mismatch", () => {
	for (const job of ["plan", ...VALIDATION_GROUPS]) {
		const input = guardInput(); delete input.results[job];
		assert.throws(() => guard(input), /Missing/);
	}
	for (const invalid of [null, [], {}, { ...guardInput().results, other: { result: "success" } }]) assert.throws(() => guard({ ...guardInput(), results: invalid }));
	for (const planJson of ["", undefined, "not JSON", "{}", "null", "[]", " " + guardInput().planJson, guardInput().planJson.replace('"version":1', '"version":1,"version":1')]) assert.throws(() => guard({ ...guardInput(), planJson }));
	const mutate = (change) => {
		const input = guardInput();
		const plan = JSON.parse(input.planJson); change(plan);
		input.planJson = JSON.stringify(plan); input.results.plan.outputs.plan = input.planJson;
		return input;
	};
	for (const change of [
		(p) => { p.version = 2; }, (p) => { p.version = "1"; }, (p) => { delete p.version; },
		(p) => { p.required.core = false; }, (p) => { p.required.source = "false"; },
		(p) => { delete p.required.artwork; }, (p) => { p.required.other = false; }, (p) => { p.extra = true; },
		(p) => { p.eventSha = "f".repeat(40); }, (p) => { p.headSha = "f".repeat(40); }, (p) => { p.baseSha = null; },
		(p) => { p.eventName = "push"; }, (p) => { p.mergeBaseSha = null; }, (p) => { p.mergeBaseSha = "f".repeat(40); },
		(p) => { p.reason = ""; }, (p) => { p.reason = "reason\n"; }, (p) => { p.decision = "guess"; },
		(p) => { p.decision = "full"; },
	]) assert.throws(() => guard(mutate(change)));
	for (const field of ["plan", "source", "workspace", "artwork"]) {
		for (const value of [undefined, "", "FALSE", false, "unexpected"]) {
			const input = guardInput(); input.results.plan.outputs[field] = value;
			assert.throws(() => guard(input));
		}
		const input = guardInput(); delete input.results.plan.outputs[field]; assert.throws(() => guard(input));
	}
	const extra = guardInput(); extra.results.plan.outputs.other = "false"; assert.throws(() => guard(extra));
	for (const eventName of ["push", "workflow_dispatch"]) {
		const event = { ...identity, eventName, baseSha: null, headSha: null };
		const plan = fullPlan(event, "Full event.");
		assert.match(guard(guardInput(plan), event), /passed/);
		plan.required.source = false;
		const input = guardInput(); input.planJson = JSON.stringify(plan);
		input.results.plan.outputs = { plan: input.planJson, source: "false", workspace: "true", artwork: "true" };
		assert.throws(() => guard(input, event));
	}
	assert.throws(() => guard(guardInput(), { ...identity, eventSha: "f".repeat(40) }));
});

test("aggregate CLI succeeds only with a complete verified plan and fails malformed JSON", () => {
	const input = guardInput();
	const env = { ...process.env, VALIDATION_RESULTS: JSON.stringify(input.results), VALIDATION_PLAN: input.planJson,
		VALIDATION_EVENT_NAME: identity.eventName, VALIDATION_EVENT_SHA: identity.eventSha, VALIDATION_BASE_SHA: identity.baseSha, VALIDATION_HEAD_SHA: identity.headSha };
	const invoke = (override) => spawnSync(process.execPath, ["scripts/validate-ci-results.mjs"], { cwd: root, encoding: "utf8", env: { ...env, ...override } });
	assert.equal(invoke({}).status, 0);
	for (const override of [{ VALIDATION_RESULTS: "not JSON" }, { VALIDATION_RESULTS: "{}" }, { VALIDATION_PLAN: "{" }, { VALIDATION_PLAN: "" }, { VALIDATION_EVENT_SHA: "bad" }]) {
		const result = invoke(override); assert.equal(result.status, 1); assert.equal(result.stdout, "");
	}
});

// These are real local object graphs. Fault injection wraps real Git only to
// exercise process/byte failures; no external service or response is fabricated.
function temporaryDirectory(t) {
	const parent = fs.realpathSync(os.tmpdir());
	const dir = fs.mkdtempSync(path.join(parent, "validation-routing-"));
	t.after(() => {
		const resolved = fs.realpathSync(dir);
		if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith("validation-routing-")) throw new Error("Unsafe temporary cleanup target.");
		fs.rmSync(resolved, { recursive: true, force: true });
	});
	return dir;
}
function repository(t, parent = temporaryDirectory(t), name = "repo") {
	const dir = path.join(parent, name); fs.mkdirSync(dir);
	const git = (args, input) => execFileSync("git", args, { cwd: dir, input, encoding: input ? undefined : "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
	git(["init", "--quiet", "--initial-branch=main", "--template="]);
	git(["config", "user.name", "Validation Test"]); git(["config", "user.email", "validation@example.invalid"]);
	git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]); git(["config", "core.filemode", "true"]);
	const write = (file, text = file + "\n") => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
	const commit = (message) => { git(["add", "-A"]); git(["commit", "--quiet", "-m", message]); return git(["rev-parse", "HEAD"]).trim(); };
	write("README.md", "base\n"); const base = commit("base " + name);
	git(["checkout", "--quiet", "-b", "feature"]); write("docs/guide.md"); const head = commit("head " + name);
	const treeCommit = (tree, parents, message = "synthetic merge") => git(["commit-tree", tree, ...parents.flatMap((sha) => ["-p", sha]), "-m", message]).trim();
	const event = treeCommit(git(["rev-parse", head + "^{tree}"]).trim(), [base, head]);
	git(["checkout", "--quiet", "--detach", event]);
	const eventIdentity = { eventName: "pull_request", baseSha: base, headSha: head, eventSha: event };
	return { dir, git, write, commit, base, head, event, treeCommit, identity: eventIdentity, parent };
}
const acquire = (repo, options = {}, event = repo.identity) => acquireValidationPlan(event, { cwd: repo.dir, ...options });

test("temporary Git: immutable event objects ignore moving main/feature refs", (t) => {
	const repo = repository(t);
	assert.deepEqual(selected(acquire(repo)), ["core"]);
	repo.git(["update-ref", "refs/heads/main", repo.head]);
	repo.git(["update-ref", "refs/heads/feature", repo.base]);
	assert.deepEqual(selected(acquire(repo)), ["core"]);
	const calls = [];
	assert.deepEqual(selected(acquire(repo, { execute: (args, options) => { calls.push(args); return runGit(args, options); } })), ["core"]);
	assert.ok(calls.some((args) => args[0] === "merge-base" && args.join(" ") === ["merge-base", "--all", repo.base, repo.head].join(" ")));
	assert.ok(calls.filter((args) => args[0] === "diff").every((args) => args.includes(repo.head) && !args.includes("origin/main")));
});

test("temporary Git: diverged base uses merge-base semantics and forces full", (t) => {
	const repo = repository(t);
	repo.git(["checkout", "--quiet", "--detach", repo.base]);
	repo.write("shared.js"); const advanced = repo.commit("advanced base");
	const event = repo.treeCommit(repo.git(["rev-parse", repo.head + "^{tree}"]).trim(), [advanced, repo.head]);
	repo.git(["checkout", "--quiet", "--detach", event]);
	const plan = acquire(repo, {}, { ...repo.identity, baseSha: advanced, eventSha: event });
	assert.equal(plan.mergeBaseSha, repo.base); assert.match(plan.reason, /diverges/); assert.deepEqual(selected(plan), all);
});

test("temporary Git: merge parents, checkout SHA and payload head must all match", (t) => {
	const repo = repository(t);
	for (const event of [
		{ ...repo.identity, headSha: repo.base },
		{ ...repo.identity, baseSha: repo.head },
		{ ...repo.identity, eventSha: repo.head },
	]) assert.deepEqual(selected(acquire(repo, {}, event)), all);
	const tree = repo.git(["rev-parse", repo.head + "^{tree}"]).trim();
	for (const parents of [[repo.head, repo.base], [repo.head], [repo.base, repo.head, repo.event]]) {
		const event = repo.treeCommit(tree, parents); repo.git(["checkout", "--quiet", "--detach", event]);
		assert.deepEqual(selected(acquire(repo, {}, { ...repo.identity, eventSha: event })), all);
	}
});

test("temporary Git: multiple and absent merge bases cannot narrow", (t) => {
	const repo = repository(t);
	const tree = repo.git(["rev-parse", repo.head + "^{tree}"]).trim();
	const a = repo.treeCommit(tree, [repo.base], "a");
	const b = repo.treeCommit(tree, [repo.base], "b");
	const left = repo.treeCommit(tree, [a, b], "left");
	const right = repo.treeCommit(tree, [b, a], "right");
	assert.equal(repo.git(["merge-base", "--all", left, right]).trim().split("\n").length, 2);
	for (const [baseSha, headSha] of [[left, right], [repo.base, repo.treeCommit(tree, [], "unrelated")]]) {
		const eventSha = repo.treeCommit(tree, [baseSha, headSha]); repo.git(["checkout", "--quiet", "--detach", eventSha]);
		assert.deepEqual(selected(acquire(repo, {}, { ...repo.identity, baseSha, headSha, eventSha })), all);
	}
});

test("temporary Git: NUL parsing preserves whitespace, newline and literal backslash filenames", (t) => {
	const repo = repository(t);
	const blob = repo.git(["hash-object", "-w", "--stdin"], Buffer.from("file\n")).toString().trim();
	const baseTree = repo.git(["rev-parse", repo.base + "^{tree}"]).trim();
	for (const name of ["ordinary space.md", "line\nbreak.md", "tab\tname.md", "literal\\name.md"]) {
		const docsTree = repo.git(["mktree", "-z"], Buffer.from("100644 blob " + blob + "\t" + name + "\0")).toString().trim();
		const tree = repo.git(["mktree", "-z"], Buffer.from("040000 tree " + docsTree + "\tdocs\0")).toString().trim();
		const headSha = repo.treeCommit(tree, [repo.base], "filename");
		// Valid checkout tree keeps platform-invalid filenames only in Git objects.
		const eventSha = repo.treeCommit(baseTree, [repo.base, headSha]); repo.git(["checkout", "--quiet", "--detach", eventSha]);
		const raw = runGit(["diff", "--raw", "-z", "--no-abbrev", repo.base, headSha], { cwd: repo.dir });
		const record = parseRawDiff(raw).find((record) => record.newPath?.startsWith("docs/"));
		assert.equal(record.newPath, "docs/" + name);
		const plan = planValidation({ ...repo.identity, headSha, eventSha }, [record]);
		assert.deepEqual(selected(plan), name === "ordinary space.md" ? ["core"] : all);
		// Complete diff also contains README deletion, so complete acquisition is full.
		assert.deepEqual(selected(acquire(repo, {}, { ...repo.identity, headSha, eventSha })), all);
	}
});

test("temporary Git: deletion, rename, copy and executable mode changes preserve raw records", (t) => {
	for (const operation of ["delete", "rename", "copy", "mode"]) {
		const repo = repository(t, temporaryDirectory(t), operation);
		repo.git(["checkout", "--quiet", "--detach", repo.base]);
		if (operation === "delete") repo.git(["rm", "README.md"]);
		if (operation === "rename") repo.git(["mv", "README.md", "AGENTS.md"]);
		if (operation === "copy") repo.write("AGENTS.md", "base\n");
		if (operation === "mode") repo.git(["update-index", "--chmod=+x", "README.md"]);
		if (operation !== "mode") repo.git(["add", "-A"]);
		repo.git(["commit", "--quiet", "-m", operation]);
		const headSha = repo.git(["rev-parse", "HEAD"]).trim();
		const raw = runGit(["diff", "--raw", "-z", "--no-abbrev", "--find-renames", "--find-copies-harder", repo.base, headSha], { cwd: repo.dir });
		const [record] = parseRawDiff(raw);
		assert.ok(record);
		if (operation === "mode") assert.notEqual(record.oldMode, record.newMode);
		else assert.ok(record.status.startsWith({ delete: "D", rename: "R", copy: "C" }[operation]), record.status);
		const eventSha = repo.treeCommit(repo.git(["rev-parse", headSha + "^{tree}"]).trim(), [repo.base, headSha]);
		repo.git(["checkout", "--quiet", "--detach", eventSha]);
		assert.deepEqual(selected(acquire(repo, {}, { ...repo.identity, headSha, eventSha })), all);
	}
});

test("temporary Git: shallow/missing history recovers once from origin using only exact SHAs", (t) => {
	const source = repository(t);
	source.git(["update-ref", "refs/heads/main", source.event]);
	const clone = path.join(source.parent, "shallow");
	execFileSync("git", ["clone", "--quiet", "--depth=1", "--branch", "main", pathToFileURL(source.dir).href, clone], { stdio: "pipe" });
	const calls = [];
	const execute = (args, options) => { calls.push(args); return runGit(args, options); };
	assert.equal(decodeGit(runGit(["rev-parse", "--is-shallow-repository"], { cwd: clone })).trim(), "true");
	assert.deepEqual(selected(acquireValidationPlan(source.identity, { cwd: clone, recovery: false })), all);
	assert.deepEqual(selected(acquireValidationPlan(source.identity, { cwd: clone, execute })), ["core"]);
	const fetches = calls.filter((args) => args[0] === "fetch");
	assert.equal(fetches.length, 1);
	assert.deepEqual(fetches[0], ["fetch", "--no-tags", "--no-recurse-submodules", "--unshallow", "origin", source.base, source.head, source.event]);
	assert.equal(decodeGit(runGit(["rev-parse", "--is-shallow-repository"], { cwd: clone })).trim(), "false");
	assert.ok(calls.every((args) => !args.some((arg) => arg.includes("refs/pull") || arg.includes("feature"))));
});

test("temporary Git: missing exact objects recover without shallow history; failures stay bounded", (t) => {
	const source = repository(t);
	const target = repository(t, source.parent, "missing");
	target.git(["remote", "add", "origin", source.dir]);
	// Copy only the exact event commit; its parents are deliberately absent.
	const bytes = runGit(["cat-file", "commit", source.event], { cwd: source.dir });
	assert.equal(target.git(["hash-object", "-t", "commit", "-w", "--stdin"], bytes).toString().trim(), source.event);
	target.git(["update-ref", "HEAD", source.event]);
	const calls = [];
	assert.deepEqual(selected(acquireValidationPlan(source.identity, { cwd: target.dir, execute: (args, options) => { calls.push(args); return runGit(args, options); } })), ["core"]);
	assert.equal(calls.filter((args) => args[0] === "fetch").length, 1);
	assert.ok(!calls.find((args) => args[0] === "fetch").includes("--unshallow"));
	let attempts = 0;
	const impossible = { ...source.identity, headSha: "1".repeat(40) };
	const failed = acquireValidationPlan(impossible, { cwd: target.dir, execute: (args, options) => { if (args[0] === "fetch") attempts++; return runGit(args, options); } });
	assert.deepEqual(selected(failed), all); assert.equal(attempts, 1);
});

test("temporary Git: command, decoding, truncation and buffer errors never emit skip permission", (t) => {
	const repo = repository(t);
	const raw = runGit(["diff", "--raw", "-z", "--no-abbrev", repo.base, repo.head], { cwd: repo.dir });
	for (const bytes of [Buffer.alloc(0), raw.subarray(0, -1), Buffer.from([0xff, 0]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw]), Buffer.from(":100644 100644 " + "0".repeat(40) + " " + "b".repeat(40) + " M\0README.md\0"), Buffer.from(":invalid\0README.md\0"), Buffer.from(":100644 100644 " + "a".repeat(40) + " " + "b".repeat(40) + " R100\0old\0")]) {
		assert.throws(() => parseRawDiff(bytes));
		const plan = acquire(repo, { execute: (args, options) => args[0] === "diff" ? bytes : runGit(args, options) });
		assert.deepEqual(selected(plan), all);
		assert.deepEqual(Object.values(planOutputs(plan, repo.identity)).slice(1), ["true", "true", "true"]);
	}
	assert.throws(() => decodeGit("not bytes"));
	for (const failAt of ["rev-parse", "cat-file", "show", "merge-base", "diff"]) {
		assert.deepEqual(selected(acquire(repo, { execute: (args, options) => { if (args[0] === failAt) throw new Error("Process failure"); return runGit(args, options); } })), all);
	}
	assert.deepEqual(selected(acquire(repo, { execute: (args, options) => runGit(args, { ...options, ...(args[0] === "diff" ? { maxBuffer: 1 } : {}) }) })), all);
});

test("planner CLI cannot inject shell commands or write partial skip outputs after invalid input", (t) => {
	const repo = repository(t);
	const eventPath = path.join(repo.parent, "event.json"), outputPath = path.join(repo.parent, "outputs.txt");
	const payload = { pull_request: { base: { sha: repo.base, repo: { full_name: "davecollections/tmdb-id-lookup" } }, head: { sha: repo.head } } };
	fs.writeFileSync(eventPath, JSON.stringify(payload));
	repo.git(["remote", "add", "origin", "https://github.com/davecollections/tmdb-id-lookup.git"]);
	const env = { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: repo.event, GITHUB_EVENT_PATH: eventPath,
		GITHUB_REPOSITORY: "davecollections/tmdb-id-lookup", GITHUB_SERVER_URL: "https://github.com", GITHUB_OUTPUT: outputPath };
	const invoke = (override = {}) => spawnSync(process.execPath, [path.join(root, "scripts/plan-validation.mjs")], { cwd: repo.dir, env: { ...env, ...override }, encoding: "utf8" });
	assert.equal(invoke().status, 0);
	assert.equal(invoke({ GITHUB_OUTPUT: repo.parent }).status, 1);
	const output = fs.readFileSync(outputPath, "utf8");
	assert.match(output, /\nsource=false\nworkspace=false\nartwork=false\n$/);
	fs.writeFileSync(outputPath, "");
	for (const sha of ["bad", repo.event + ";touch injected", "$(touch injected)", "--help"]) {
		assert.equal(invoke({ GITHUB_SHA: sha }).status, 1);
		assert.equal(fs.readFileSync(outputPath, "utf8"), "");
	}
	assert.equal(fs.existsSync(path.join(repo.dir, "injected")), false);
	fs.writeFileSync(eventPath, "{}");
	assert.equal(invoke().status, 1); assert.equal(fs.readFileSync(outputPath, "utf8"), "");
	fs.writeFileSync(eventPath, "{");
	assert.equal(invoke().status, 1); assert.equal(fs.readFileSync(outputPath, "utf8"), "");
	fs.writeFileSync(eventPath, JSON.stringify(payload));
	repo.git(["remote", "set-url", "origin", "https://example.invalid/untrusted.git"]);
	assert.equal(invoke().status, 0);
	assert.match(fs.readFileSync(outputPath, "utf8"), /\nsource=true\nworkspace=true\nartwork=true\n$/);
});
