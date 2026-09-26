import { isValidNuvioTitle } from "../nuvio/titles.js";

// Names are session-only presentation drafts. The caller supplies the existing
// family identity; no recipe or identity is inferred from display text.
export function sourceNameState(generatedTitle, draft) {
	const value = typeof draft === "string" ? draft : generatedTitle;
	const trimmed = value.trim();
	const automatic = !trimmed || trimmed === generatedTitle;
	const valid = automatic || isValidNuvioTitle(trimmed);
	return { value, title: automatic || !valid ? generatedTitle : trimmed,
		customised: !automatic && valid, resettable: !automatic,
		error: valid ? null : "Enter a name with visible characters, or reset the name." };
}

export function resolveSourceNames(drafts, names, keyOf) {
	const rows = drafts.map((draft) => {
		const key = keyOf(draft);
		if (typeof key !== "string" || !key) throw new TypeError("Source naming requires an existing candidate identity.");
		return { key, generatedTitle: draft.editable.title, draft, ...sourceNameState(draft.editable.title, names[key]) };
	});
	if (new Set(rows.map((row) => row.key)).size !== rows.length) throw new TypeError("Source naming requires distinct candidates.");
	return { rows, customisedCount: rows.filter((row) => row.customised).length,
		invalid: rows.some((row) => row.error),
		drafts: rows.map((row) => row.title === row.generatedTitle ? row.draft
			: { ...row.draft, editable: { ...row.draft.editable, title: row.title } }) };
}

// Used only by selected-folder Add validation. Replace titles in a comparison
// view, never in a saved recipe, and leave every other field/order check intact.
export function sourceDraftsWithGeneratedTitles(drafts, generated) {
	if (!Array.isArray(drafts) || drafts.length !== generated.length) return drafts;
	return drafts.map((draft, index) => {
		const title = draft?.editable?.title;
		return typeof title === "string" && title === title.trim() && isValidNuvioTitle(title)
			? { ...draft, editable: { ...draft.editable, title: generated[index].editable.title } }
			: draft;
	});
}
