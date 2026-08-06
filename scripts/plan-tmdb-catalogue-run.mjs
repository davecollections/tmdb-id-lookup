import { appendFile } from "node:fs/promises";
import { buildCatalogueRunPlan } from "./lib/tmdb-catalogue-run-plan.mjs";

const plan = buildCatalogueRunPlan({
	kind: process.env.CATALOGUE_RUN_KIND,
	eventName: process.env.EVENT_NAME,
	inputMode: process.env.INPUT_MODE,
	inputSliceIndex: process.env.INPUT_SLICE,
	inputMaxRequests: process.env.INPUT_MAX_REQUESTS,
	inputMonth: process.env.INPUT_MONTH,
});

const outputs = {
	mode: plan.mode,
	scheduled: String(plan.scheduled),
	planned_month: plan.planned_month,
	planned_utc_date: plan.planned_utc_date,
	slice_index: plan.slice_index,
	requires_requests: String(plan.requires_requests),
	skip: String(plan.skip),
	skip_reason: plan.skip_reason || "",
	allocations: JSON.stringify(plan.allocations),
	request_bindings: JSON.stringify(plan.request_bindings),
	collection_allowance: String(plan.allocations.collection ?? 0),
	target_export_allowance: String(plan.allocations.target_export ?? 0),
};

console.log(JSON.stringify({ catalogue_run_plan: plan }, null, 2));

if (process.env.GITHUB_OUTPUT) {
	await appendFile(
		process.env.GITHUB_OUTPUT,
		`${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
	);
}

if (process.env.GITHUB_STEP_SUMMARY) {
	const summary = plan.skip
		? `### Catalogue refresh skipped\n\n${plan.skip_reason}\n\nNo reservation or catalogue work was performed.\n`
		: `### TMDB catalogue refresh planned\n\n- Month: ${plan.planned_month}\n- UTC date: ${plan.planned_utc_date}\n- Mode: ${plan.mode}\n- Slice: ${plan.slice_index + 1}/${plan.total_slices}\n`;
	await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
