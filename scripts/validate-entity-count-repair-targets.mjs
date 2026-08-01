import { loadTargetSnapshot } from "./lib/entity-count-progress.mjs";
import {
	TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH,
	compareUtcMonths,
	utcMonth,
} from "./lib/entity-title-counts.mjs";

const month = process.env.COUNT_MONTH || utcMonth();
if (compareUtcMonths(month, TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH) < 0) {
	console.log(`Typed targets are inactive before ${TYPED_COUNT_AUTOMATIC_ACTIVATION_MONTH}; validating legacy repair only.`);
	process.exit(0);
}

const [company, network] = await Promise.all([
	loadTargetSnapshot({ month, entityType: "company" }),
	loadTargetSnapshot({ month, entityType: "network" }),
]);
if (!company || !network) throw new Error(`Frozen Company and Network targets are required for ${month}.`);
console.log(
	JSON.stringify({
		month,
		company_target_fingerprint: company.target_fingerprint,
		network_target_fingerprint: network.target_fingerprint,
	}),
);
