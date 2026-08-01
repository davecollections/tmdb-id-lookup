import fs from "node:fs/promises";
import path from "node:path";
import {
	buildReservationReceipt,
	RESERVATION_BUCKETS,
	sha256Json,
	utcDate,
	validateReservationReceipt,
} from "./lib/entity-count-budget.mjs";

const ROOT = process.env.TMDB_BUDGET_ROOT || path.join("maintenance", "tmdb-request-budget");
const now = new Date();
const date = utcDate(now);
const workflow = process.env.GITHUB_WORKFLOW || process.env.RESERVATION_WORKFLOW;
const runId = process.env.GITHUB_RUN_ID || process.env.RESERVATION_RUN_ID;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const job = process.env.RESERVATION_JOB || "reserve-requests";
const bucket = process.env.RESERVATION_BUCKET || RESERVATION_BUCKETS.GENERAL;
const reservationId =
	process.env.RESERVATION_ID ||
	`${runId || "local"}-${runAttempt}-${job}`.replace(/[^A-Za-z0-9._-]/g, "-");
const allocations = JSON.parse(process.env.REQUEST_ALLOCATIONS_JSON || "{}");
const bindings = JSON.parse(process.env.REQUEST_BINDINGS_JSON || "{}");
const plannedMonth = process.env.RESERVATION_PLANNED_MONTH;
const plannedUtcDate = process.env.RESERVATION_PLANNED_UTC_DATE;
const allowPreferredOverride = process.env.ALLOW_PREFERRED_OVERRIDE === "true";
const overrideReason = process.env.PREFERRED_OVERRIDE_REASON || "";
const reservationDirectory = path.join(ROOT, date, "reservations");
const receiptPath = path.join(reservationDirectory, `${reservationId}.json`);

if (!workflow || !runId) {
	throw new Error("GITHUB_WORKFLOW/RESERVATION_WORKFLOW and GITHUB_RUN_ID/RESERVATION_RUN_ID are required.");
}
if (plannedUtcDate !== date) {
	throw new Error(
		`Planned UTC date ${plannedUtcDate || "missing"} expired before reservation on ${date}.`,
	);
}

await fs.mkdir(reservationDirectory, { recursive: true });

const existingReceipts = [];
for (const filename of (await fs.readdir(reservationDirectory)).sort()) {
	if (!filename.endsWith(".json") || filename === `${reservationId}.json`) {
		continue;
	}

	const receipt = JSON.parse(
		await fs.readFile(path.join(reservationDirectory, filename), "utf8"),
	);
	validateReservationReceipt(receipt);

	if (receipt.utc_date !== date) {
		throw new Error(
			`Reservation ${filename} belongs to ${receipt.utc_date}, not directory date ${date}.`,
		);
	}
	existingReceipts.push(receipt);
}

const built = buildReservationReceipt({
	date: now,
	reservationId,
	workflow,
	runId,
	runAttempt,
	job,
	plannedMonth,
	plannedUtcDate,
	bucket,
	allocations,
	bindings,
	existingReceipts,
	allowPreferredOverride,
	overrideReason,
	createdAt: now.toISOString(),
});
const existingRaw = await fs.readFile(receiptPath, "utf8").catch(() => null);

if (existingRaw) {
	const existing = JSON.parse(existingRaw);
	validateReservationReceipt(existing);
	if (sha256Json(existing) !== built.sha256) {
		throw new Error(`Immutable reservation already exists with different content: ${receiptPath}`);
	}
} else {
	await fs.writeFile(receiptPath, `${JSON.stringify(built.receipt, null, 2)}\n`, {
		flag: "wx",
	});
}

const outputs = {
	reservation_id: reservationId,
	reservation_path: receiptPath.replaceAll("\\", "/"),
	reservation_sha256: built.sha256,
	utc_date: date,
	planned_month: plannedMonth,
	total_allowance: built.receipt.total_allowance,
	projected_daily_total: built.receipt.projected_daily_total,
};

console.log(JSON.stringify({ reservation: outputs, allocations }, null, 2));

if (process.env.GITHUB_OUTPUT) {
	await fs.appendFile(
		process.env.GITHUB_OUTPUT,
		Object.entries(outputs)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n") + "\n",
	);
}
