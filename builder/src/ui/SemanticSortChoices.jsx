export function SemanticSortChoices({
	options,
	selectedId,
	name,
	firstInputRef = null,
	onChange,
	legend = "Sort titles by",
}) {
	const selected = options.find((option) => option.id === selectedId) ?? null;
	return (
		<fieldset className="studio-sort-choices semantic-sort-choices">
			<legend>{legend}</legend>
			<div className="studio-sort-choice-row semantic-sort-choice-row">
				{options.map((option, index) => (
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
			{selected?.description ? <p className="studio-sort-description semantic-sort-description">{selected.description}</p> : null}
		</fieldset>
	);
}
