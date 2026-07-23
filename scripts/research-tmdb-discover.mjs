import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = path.join(rootDir, "manual-tests", "tmdb-discover", "direct-tmdb-test-plan.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const args = process.argv.slice(2);

function parseArguments(values) {
	const parsed = { dryRun: false, ids: null, maxRequests: null, output: null };
	const optionFields = new Map([
		["--ids", "ids"],
		["--max-requests", "maxRequests"],
		["--output", "output"],
	]);

	for (let index = 0; index < values.length; index += 1) {
		const argument = values[index];
		if (argument === "--dry-run") {
			if (parsed.dryRun) throw new Error("Duplicate option: --dry-run");
			parsed.dryRun = true;
			continue;
		}

		const field = optionFields.get(argument);
		if (!field) throw new Error(`Unknown option: ${argument}`);
		if (parsed[field] !== null) throw new Error(`Duplicate option: ${argument}`);
		const value = values[index + 1];
		if (value === undefined || value.startsWith("--") || value.trim() === "") {
			throw new Error(`${argument} requires a non-empty value.`);
		}
		parsed[field] = value;
		index += 1;
	}

	return parsed;
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}

function selectedCases(idsValue) {
	if (idsValue === null) return plan.cases;
	const ids = new Set(idsValue.split(",").map((value) => value.trim()).filter(Boolean));
	if (ids.size === 0) throw new Error("--ids must name at least one test case.");
	const selected = plan.cases.filter((item) => ids.has(item.id));
	const missing = [...ids].filter((id) => !selected.some((item) => item.id === id));
	if (missing.length > 0) throw new Error(`Unknown test IDs: ${missing.join(", ")}`);
	return selected;
}

function queryFor(item) {
	const query = { ...plan.baselines[item.media] };
	for (const name of item.omitBaselineParameters ?? []) delete query[name];
	Object.assign(query, item.query);
	return query;
}

function urlFor(item) {
	const url = new URL(`https://api.themoviedb.org/3/discover/${item.media}`);
	for (const [name, value] of Object.entries(queryFor(item))) url.searchParams.set(name, String(value));
	return url;
}

function sameIds(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

let config;
let cases;
try {
	config = parseArguments(args);
	cases = selectedCases(config.ids);
} catch (error) {
	fail(error.message);
	process.exit();
}

const maxRequests = config.maxRequests === null ? null : Number(config.maxRequests);
const hardCap = plan.hardRequestCap;

if (!Number.isInteger(plan.plannedRequestCount) || plan.plannedRequestCount !== plan.cases.length) {
	fail("The test plan's plannedRequestCount does not match its case count.");
} else if (!Number.isInteger(maxRequests) || maxRequests < 1) {
	fail("Pass an explicit positive --max-requests value.");
} else if (maxRequests > hardCap) {
	fail(`The configured cap ${maxRequests} exceeds the hard cap ${hardCap}.`);
} else if (cases.length > maxRequests) {
	fail(`Selected ${cases.length} requests, which exceeds the configured cap ${maxRequests}.`);
}

if (process.exitCode) process.exit();

console.log(`Planned requests: ${cases.length} (configured cap ${maxRequests}; hard cap ${hardCap}).`);

if (config.dryRun) {
	for (const item of cases) console.log(`${item.id}\t${urlFor(item)}`);
	console.log("Dry run only; no TMDB requests were sent.");
	process.exit();
}

const rawToken = process.env.TMDB_BEARER_TOKEN;
const token = rawToken?.trim();
if (!token) {
	fail("TMDB_BEARER_TOKEN is not set. No requests were sent. Use --dry-run to inspect the plan without a token.");
	process.exit();
}
if (!/^[A-Za-z0-9._-]+$/.test(token)) {
	fail("TMDB_BEARER_TOKEN contains invalid characters. No requests were sent.");
	process.exit();
}

let outputPath = null;
let outputDescriptor = null;
if (config.output !== null) {
	outputPath = path.resolve(process.cwd(), config.output);
	try {
		outputDescriptor = fs.openSync(outputPath, "wx");
	} catch (error) {
		fail(error?.code === "EEXIST"
			? `Output file already exists; no requests were sent: ${outputPath}`
			: `Unable to reserve output file; no requests were sent: ${outputPath}`);
		process.exit();
	}
}

const results = [];
for (const [index, item] of cases.entries()) {
	const url = urlFor(item);
	const timestamp = new Date().toISOString();
	let status = null;
	let totalResults = null;
	let firstPageIds = [];
	let responseParsed = false;
	let error = null;

	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
			signal: AbortSignal.timeout(20_000),
		});
		status = response.status;
		const body = await response.json().catch(() => null);
		if (body && typeof body.total_results === "number" && Array.isArray(body.results)) {
			responseParsed = true;
			totalResults = body.total_results;
			firstPageIds = body.results.map((entry) => entry?.id).filter((id) => Number.isInteger(id));
		}
		if (!response.ok) error = `TMDB returned HTTP ${response.status}`;
	} catch {
		error = "Network request failed or timed out";
	}

	results.push({
		id: item.id,
		media: item.media,
		category: item.category,
		compareTo: item.compareTo,
		timestamp,
		url: url.toString(),
		status,
		totalResults,
		firstPageIds,
		responseParsed,
		error,
	});
	console.log(`${index + 1}/${cases.length}\t${item.id}\tHTTP ${status ?? "error"}\ttotal=${totalResults ?? "unknown"}`);
	if (index + 1 < cases.length) await new Promise((resolve) => setTimeout(resolve, 125));
}

const byId = new Map(results.map((result) => [result.id, result]));
for (const result of results) {
	const baseline = result.compareTo ? byId.get(result.compareTo) : null;
	const comparable = Boolean(
		baseline
		&& result.status >= 200 && result.status < 300
		&& baseline.status >= 200 && baseline.status < 300
		&& result.responseParsed
		&& baseline.responseParsed,
	);
	result.comparison = baseline
		? {
			referenceFoundInRun: true,
			comparable,
			sameTotalResults: comparable ? result.totalResults === baseline.totalResults : null,
			sameOrderedFirstPageIds: comparable ? sameIds(result.firstPageIds, baseline.firstPageIds) : null,
		}
		: result.compareTo
			? { referenceFoundInRun: false, comparable: false, sameTotalResults: null, sameOrderedFirstPageIds: null }
			: null;
}

const report = {
	schemaVersion: 1,
	createdAt: new Date().toISOString(),
	requestCount: results.length,
	configuredRequestCap: maxRequests,
	hardRequestCap: hardCap,
	methodology: plan.methodology,
	warning: "HTTP 200 or a changed first page is not sufficient by itself to prove semantic correctness. Review paired evidence manually.",
	results,
};

if (outputDescriptor !== null) {
	fs.writeFileSync(outputDescriptor, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	fs.closeSync(outputDescriptor);
	console.log(`Wrote sanitized report: ${outputPath}`);
} else {
	console.log(JSON.stringify(report, null, 2));
}
