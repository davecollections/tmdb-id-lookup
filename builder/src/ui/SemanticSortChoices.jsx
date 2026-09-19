export function SourceCreationSortChoices({ options, selectedIds, name, helper = "Choose one or more options. Movies and Series get separate sources.", ...props }) {
	const errorId = `${name}-error`;
	const labels = options.filter((option) => selectedIds.includes(option.id)).map((option) => option.label);
	return <>
		<SemanticSortChoices {...props} options={options} selectedIds={selectedIds} name={name} legend="Sources to create" helper={helper} validationMessageId={errorId} />
		{selectedIds.length === 0 ? <p id={errorId} className="editor-field-help" role="alert">Choose at least one option.</p> : <p className="editor-field-help">Selected: {labels.join(", ")}</p>}
	</>;
}

export function SemanticSortChoices({
	options,
	selectedId,
	selectedIds,
	name,
	firstInputRef = null,
	onChange,
	legend = "Sort titles by",
	helper = null,
	validationMessageId = null,
	disabledIds = [],
	fieldsetProps = null,
}) {
	const multiple = Array.isArray(selectedIds);
	const isSelected = (id) => multiple ? selectedIds.includes(id) : selectedId === id;
	const selected = options.find((option) => option.id === selectedId) ?? null;
	const helperId = multiple && helper ? `${name}-help` : undefined;
	const invalid = multiple && selectedIds.length === 0 && validationMessageId !== null;
	const describedBy = [fieldsetProps?.["aria-describedby"], helperId, invalid ? validationMessageId : null].filter(Boolean).join(" ") || undefined;
	return (
		<fieldset {...(fieldsetProps ?? {})} aria-describedby={describedBy} aria-invalid={invalid || fieldsetProps?.["aria-invalid"]} className="studio-sort-choices semantic-sort-choices">
			<legend>{legend}</legend>
			{helper ? <p id={helperId} className="semantic-sort-helper">{helper}</p> : null}
			<div className="studio-sort-choice-row semantic-sort-choice-row">
				{options.map((option, index) => (
					<label key={option.id} data-selection-mode={multiple ? "multiple" : "single"} data-selected={isSelected(option.id) ? "true" : undefined}>
						<input
							ref={index === 0 ? firstInputRef : undefined}
							type={multiple ? "checkbox" : "radio"}
							name={name}
							value={option.id}
							checked={isSelected(option.id)}
							disabled={disabledIds.includes(option.id)}
							onChange={() => onChange(multiple
								? options.filter((entry) => entry.id === option.id ? !isSelected(entry.id) : isSelected(entry.id)).map((entry) => entry.id)
								: option.id)}
						/>
						<span>{option.label}</span>
					</label>
				))}
			</div>
			{!multiple && selected?.description ? <p className="studio-sort-description semantic-sort-description">{selected.description}</p> : null}
		</fieldset>
	);
}
