export function ChoiceCards({ legend, hideLegend = false, helper = null, name, options, selectedId, onChange, gridClassName = "" }) {
	return (
		<fieldset className="decades-choice-group">
			<legend className={hideLegend ? "visually-hidden" : undefined}>{legend}</legend>
			{helper ? <p>{helper}</p> : null}
			<div className={`decades-choice-grid${gridClassName ? ` ${gridClassName}` : ""}`}>
				{options.map((option) => (
					<label key={option.id} data-selected={selectedId === option.id ? "true" : undefined} data-choice-id={option.id}>
						<input type="radio" name={name} value={option.id} checked={selectedId === option.id} onChange={() => onChange(option.id)} />
						<span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}{option.preview ?? null}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
