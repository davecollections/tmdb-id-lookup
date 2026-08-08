import { STUDIO_SORT_OPTIONS } from "../source-add/index.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";

export function StudioSortChoices({
	selectedId,
	name,
	firstInputRef = null,
	onChange,
	legend = "Sort titles by",
}) {
	return (
		<SemanticSortChoices options={STUDIO_SORT_OPTIONS} selectedId={selectedId} name={name} firstInputRef={firstInputRef} onChange={onChange} legend={legend} />
	);
}
