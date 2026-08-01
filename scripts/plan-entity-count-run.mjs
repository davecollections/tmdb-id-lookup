import { appendFile } from "node:fs/promises";
import { buildEntityCountRunPlan } from "./lib/entity-count-run-plan.mjs";
import { TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH } from "./lib/entity-title-counts.mjs";

const plan = buildEntityCountRunPlan({
	kind: process.env.COUNT_RUN_KIND,
	eventName: process.env.EVENT_NAME,
	inputMode: process.env.INPUT_MODE,
	inputSliceIndex: process.env.INPUT_SLICE,
	inputSampleIds: process.env.INPUT_SAMPLE_IDS,
	inputMaxRequests: process.env.INPUT_MAX_REQUESTS,
	inputMonth: process.env.INPUT_MONTH,
});

const outputs = {
	mode: plan.mode,
	scheduled: String(plan.scheduled),
	planned_month: plan.planned_month,
	planned_utc_date: plan.planned_utc_date,
	slice_index: plan.slice_index,
	sample_ids: plan.sample_ids,
	requires_requests: String(plan.requires_requests),
	allow_target_create: String(plan.allow_target_create),
	allow_finalize: String(plan.allow_finalize),
	typed_progress_enabled: String(plan.typed_progress_enabled),
	legacy_only: String(plan.legacy_only),
	skip: String(plan.skip),
	skip_reason: plan.skip_reason || "",
	allocations: JSON.stringify(plan.allocations),
	request_bindings: JSON.stringify(plan.request_bindings),
	collection_allowance: String(plan.allocations.collection ?? 0),
	target_export_allowance: String(plan.allocations.target_export ?? 0),
};

console.log(
	JSON.stringify(
		{ plan, automatic_activation_month: TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH },
		null,
		2,
	),
);

if (process.env.GITHUB_OUTPUT) {
	await appendFile(
		process.env.GITHUB_OUTPUT,
		Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
	);
}

if (process.env.GITHUB_STEP_SUMMARY) {
	const summary = plan.skip
		? `### Typed entity count run skipped\n\n${plan.skip_reason}\n\nNo reservation, target, progress, or publication work was performed.\n`
		: `### ${plan.legacy_only ? "Legacy-only entity refresh" : "Typed entity count run planned"}\n\n- Month: ${plan.planned_month}\n- UTC date: ${plan.planned_utc_date}\n- Mode: ${plan.mode}\n- Slice: ${plan.slice_index + 1}/${plan.total_slices}\n- Typed progress: ${plan.typed_progress_enabled ? "enabled" : "disabled"}\n`;
	await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
