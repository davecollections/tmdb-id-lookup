import { NETWORK_SORT_OPTIONS } from "../source-add/index.js";
import { SemanticSortChoices } from "./SemanticSortChoices.jsx";

export function NetworkSortChoices({
	selectedId,
	name,
	firstInputRef = null,
	onChange,
	legend = "Sort Series by",
}) {
	return <SemanticSortChoices options={NETWORK_SORT_OPTIONS} selectedId={selectedId} name={name} firstInputRef={firstInputRef} onChange={onChange} legend={legend} />;
}
