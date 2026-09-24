import { performance } from "node:perf_hooks";

// Measures sequential phases without imposing deadlines or changing their results.
export function createValidationTiming(scope, { now = () => performance.now(), log = console.log } = {}) {
	const totals = new Map();
	const started = now();
	let since = started;
	let current = "Setup and initial fixture scenarios";
	let finished = false;
	function record() {
		const at = now();
		const previous = totals.get(current) ?? { ms: 0, segments: 0 };
		totals.set(current, { ms: previous.ms + at - since, segments: previous.segments + 1 });
		since = at;
	}
	return {
		stage(label) {
			if (finished) return;
			record();
			current = label;
		},
		finish() {
			if (finished) return;
			record();
			finished = true;
			for (const [label, { ms, segments }] of totals) {
				log(`[CI timing] ${scope} / ${label}: ${(ms / 1000).toFixed(1)}s${segments > 1 ? ` (${segments} segments)` : ""}`);
			}
			log(`[CI timing] ${scope} total: ${((since - started) / 1000).toFixed(1)}s elapsed`);
		},
	};
}
