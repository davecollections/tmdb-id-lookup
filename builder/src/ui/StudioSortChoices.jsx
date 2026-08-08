import { STUDIO_SORT_OPTIONS } from "../source-add/index.js";

export function StudioSortChoices({
	selectedId,
	name,
	firstInputRef = null,
	onChange,
	legend = "Sort titles by",
}) {
	const selected = STUDIO_SORT_OPTIONS.find((option) => option.id === selectedId) ?? null;
	return (
		<fieldset className="studio-sort-choices">
			<legend>{legend}</legend>
			<div className="studio-sort-choice-row">
				{STUDIO_SORT_OPTIONS.map((option, index) => (
					<label key={option.id} data-selected={selectedId === option.id ? "true" : undefined}>
						<input
							ref={index === 0 ? firstInputRef : undefined}
							type="radio"
							name={name}
							value={option.id}
							checked={selectedId === option.id}
							onChange={() => onChange(option.id)}
						/>
						<span>{option.label}</span>
					</label>
				))}
			</div>
			{selected ? <p className="studio-sort-description">{selected.description}</p> : null}
		</fieldset>
	);
}
