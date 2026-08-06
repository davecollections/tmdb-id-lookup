import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildReservationReceipt,
	RESERVATION_BUCKETS,
	validateReservationReceipt,
} from "../scripts/lib/tmdb-request-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgetRoot = path.join(root, "maintenance", "tmdb-request-budget");
const fixedNow = new Date("2026-08-06T09:00:00.000Z");

function buildTestReceipt(options = {}) {
	const allocations = options.allocations || { collection: 1 };
	const bindings =
		options.bindings ||
		Object.fromEntries(
			Object.entries(allocations).map(([key, allowance]) => [
				key,
				{
					request_class: `test-${key}`,
					target_dimension: "company-movie",
					approved_allowance: allowance,
				},
			]),
		);
	return buildReservationReceipt({
		date: fixedNow,
		reservationId: "test-reservation",
		workflow: "Test",
		runId: "1",
		runAttempt: "1",
		job: "reserve",
		plannedMonth: "2026-08",
		plannedUtcDate: "2026-08-06",
		...options,
		allocations,
		bindings,
	});
}

function assertRequiredProperties(value, required, label) {
	for (const key of required || []) {
		assert.ok(Object.hasOwn(value, key), `${label}: ${key}`);
	}
}

function assertUsageConditionalShape(schema, receipt, label) {
	for (const rule of schema.allOf || []) {
		const requestClass = rule.if?.properties?.request_class;
		const matches = requestClass?.const
			? receipt.request_class === requestClass.const
			: requestClass?.enum?.includes(receipt.request_class);
		if (!matches) continue;
		assertRequiredProperties(receipt, rule.then?.required, label);
		const allowedDimensions = rule.then?.properties?.target_dimension?.enum;
		if (allowedDimensions) {
			assert.ok(allowedDimensions.includes(receipt.target_dimension), `${label}: target_dimension`);
		}
		if (rule.then?.anyOf) {
			assert.ok(
				rule.then.anyOf.some((branch) =>
					(branch.required || []).every((key) => Object.hasOwn(receipt, key)),
				),
				`${label}: conditional receipt shape`,
			);
		}
	}
}

test("request-budget reservations retain protected commitments and hard ceilings", () => {
	const company = buildTestReceipt({
		reservationId: "company",
		bucket: RESERVATION_BUCKETS.GENERAL,
		allocations: { collection: 55_000, target_export: 7 },
	});
	assert.equal(company.receipt.projected_daily_total, 59_057);
	assert.throws(
		() => buildTestReceipt({ allocations: { collection: 86_000 } }),
		/preferred 90000/,
	);
	assert.throws(
		() =>
			buildTestReceipt({
				allocations: { collection: 96_000 },
				allowPreferredOverride: true,
				overrideReason: "test",
			}),
		/absolute 100000/,
	);
});

test("all historical reservation receipts remain valid without modification", async () => {
	let validated = 0;
	for (const date of await fs.readdir(budgetRoot)) {
		const reservationDirectory = path.join(budgetRoot, date, "reservations");
		let names;
		try {
			names = await fs.readdir(reservationDirectory);
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		for (const name of names.filter((value) => value.endsWith(".json"))) {
			const receipt = JSON.parse(
				await fs.readFile(path.join(reservationDirectory, name), "utf8"),
			);
			assert.doesNotThrow(() => validateReservationReceipt(receipt), name);
			validated += 1;
		}
	}
	assert.ok(validated > 0);
});

test("request-usage schema covers every historical usage receipt shape", async () => {
	const schema = JSON.parse(
		await fs.readFile(path.join(root, "schemas", "tmdb-request-usage.schema.json"), "utf8"),
	);
	const allowedKeys = new Set(Object.keys(schema.properties));
	assert.ok(schema.properties.target_dimension.enum.includes("companies"));
	assert.ok(schema.properties.target_dimension.enum.includes("networks"));
	assert.doesNotThrow(() =>
		assertUsageConditionalShape(
			schema,
			{
				request_class: "audit-export",
				target_dimension: "companies",
				datasets: ["companies"],
				targets: { companies: `sha256:${"a".repeat(64)}` },
			},
			"manual Company audit",
		),
	);
	assert.throws(() =>
		assertUsageConditionalShape(
			schema,
			{ request_class: "audit-export", target_dimension: "companies" },
			"incomplete audit",
		),
	);
	let validated = 0;
	for (const date of await fs.readdir(budgetRoot)) {
		const usageDirectory = path.join(budgetRoot, date, "usage");
		let names;
		try {
			names = await fs.readdir(usageDirectory);
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		for (const name of names.filter((value) => value.endsWith(".json"))) {
			const receipt = JSON.parse(await fs.readFile(path.join(usageDirectory, name), "utf8"));
			assert.deepEqual(Object.keys(receipt).filter((key) => !allowedKeys.has(key)), [], name);
			for (const required of schema.required) {
				assert.ok(Object.hasOwn(receipt, required), `${name}: ${required}`);
			}
			assert.ok(schema.properties.target_dimension.enum.includes(receipt.target_dimension), name);
			assertUsageConditionalShape(schema, receipt, name);
			assert.equal(receipt.attempts_used + receipt.unused_allowance, receipt.allowance, name);
			assert.equal(
				Object.values(receipt.by_host).reduce((total, value) => total + value, 0),
				receipt.attempts_used,
				name,
			);
			assert.equal(
				Object.values(receipt.by_status_or_outcome).reduce(
					(total, value) => total + value,
					0,
				),
				receipt.attempts_used,
				name,
			);
			assert.ok(receipt.retries <= receipt.attempts_used, name);
			validated += 1;
		}
	}
	assert.ok(validated > 0);
});
