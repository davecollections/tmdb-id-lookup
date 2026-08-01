import {
	COUNT_SCHEMA_VERSION,
	COUNT_PARSER_SEMANTIC_VERSION,
	validateAuditFreshness,
	validateTargetSnapshot,
} from "./entity-title-counts.mjs";

export function validateRepairAuditBinding({
	audit,
	target,
	expectedDataset,
	expectedMonth,
	now = new Date(),
	maxAgeHours = 36,
	requireTypedTarget = true,
}) {
	if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
		throw new TypeError("Repair audit must be an object.");
	}
	if (audit.schema_version !== COUNT_SCHEMA_VERSION) {
		throw new TypeError(`Unsupported repair audit schema version: ${audit.schema_version}`);
	}
	if (audit.parser_semantic_version !== COUNT_PARSER_SEMANTIC_VERSION) {
		throw new TypeError(
			`Unsupported repair audit parser semantic version: ${audit.parser_semantic_version}`,
		);
	}
	if (audit.dataset !== expectedDataset) {
		throw new TypeError(`Expected ${expectedDataset} audit, received ${audit.dataset}.`);
	}
	if (!requireTypedTarget) {
		return validateAuditFreshness({ auditedAt: audit.audited_at, now, maxAgeHours });
	}
	const entityType = expectedDataset === "companies" ? "company" : "network";
	validateTargetSnapshot(target, { entityType, month: expectedMonth });
	if (audit.export_target_month !== expectedMonth) {
		throw new TypeError(
			`Repair audit month ${audit.export_target_month} does not match ${expectedMonth}.`,
		);
	}
	if (audit.export_target_fingerprint !== target.target_fingerprint) {
		throw new TypeError("Repair audit fingerprint does not match the frozen target.");
	}
	if (
		audit.export_target_schema_version !== target.schema_version ||
		audit.export_target_parser_semantic_version !== target.parser_semantic_version
	) {
		throw new TypeError("Repair audit target schema/parser contract does not match the frozen target.");
	}
	return validateAuditFreshness({ auditedAt: audit.audited_at, now, maxAgeHours });
}
