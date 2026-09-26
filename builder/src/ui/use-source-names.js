import { useMemo, useState } from "react";
import { resolveSourceNames } from "../source-add/source-names.js";

export function useSourceNames(generatedDrafts, keyOf) {
	const [names, setNames] = useState({});
	const resolved = useMemo(() => resolveSourceNames(generatedDrafts, names, keyOf), [generatedDrafts, names, keyOf]);
	function reset(keys) {
		if (!keys.length) return;
		setNames((current) => {
			const next = { ...current };
			for (const key of keys) delete next[key];
			return next;
		});
	}
	return { ...resolved,
		change: (key, value) => setNames((current) => {
			const next = { ...current };
			// Equivalent text is automatic immediately, even before a later blur.
			if (value.trim() === resolved.rows.find((row) => row.key === key)?.generatedTitle) delete next[key];
			else next[key] = value;
			return next;
		}),
		reset: (key) => reset([key]),
		resetAll: () => reset(resolved.rows.map((row) => row.key)),
		commit: (key = null) => reset(resolved.rows.filter((row) => (key === null || key === row.key)
			&& (!row.value.trim() || row.value.trim() === row.generatedTitle)).map((row) => row.key)),
	};
}
