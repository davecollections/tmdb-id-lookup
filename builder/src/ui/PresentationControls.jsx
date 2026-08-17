function isSelected(value, canonicalValue) {
	return typeof value === "string" && value.toUpperCase() === canonicalValue;
}

export function PresentationSwitch({
	label,
	description,
	descriptionId,
	checked,
	describedBy = descriptionId,
	controlName,
	onChange,
}) {
	return (
		<label className="editor-switch">
			<span>
				<strong>{label}</strong>
				<small id={descriptionId}>{description}</small>
			</span>
			<input
				type="checkbox"
				role="switch"
				data-editor-control={controlName}
				checked={checked}
				aria-describedby={describedBy || undefined}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span className="editor-switch-control" aria-hidden="true" />
		</label>
	);
}

export function CollectionTitleVisibilitySwitch({
	checked,
	onChange,
	descriptionId,
	controlName = "hideNuvioTitle",
}) {
	return (
		<PresentationSwitch
			label="Hide collection title in Nuvio"
			description="Uses an invisible character to hide the collection title in Nuvio."
			descriptionId={descriptionId}
			controlName={controlName}
			checked={checked}
			onChange={onChange}
		/>
	);
}

export function FolderShapeChoices({ selectedId, name, idPrefix, onChange, posterLabel = "Poster" }) {
	const posterSelected = isSelected(selectedId, "POSTER");
	const landscapeSelected = isSelected(selectedId, "LANDSCAPE");
	return (
		<div className="editor-choice-grid editor-shape-choice-grid" data-control-presentation="visual-cards">
			<label
				className={`editor-choice editor-shape-choice${posterSelected ? " is-selected" : ""}`}
				htmlFor={`${idPrefix}-poster-shape`}
				onClick={(event) => {
					if (event.target.closest("input")) return;
					onChange("POSTER");
				}}
			>
				<input
					className="visually-hidden"
					id={`${idPrefix}-poster-shape`}
					type="radio"
					name={name}
					value="POSTER"
					data-editor-choice="poster"
					checked={posterSelected}
					onChange={() => onChange("POSTER")}
				/>
				<span className="shape-preview is-poster" aria-hidden="true" />
				<span>
					<strong>{posterLabel}</strong>
					<small>Tall artwork for poster-style folders.</small>
				</span>
				<span className="editor-choice-check" aria-hidden="true">{posterSelected ? "✓" : ""}</span>
			</label>
			<label
				className={`editor-choice editor-shape-choice${landscapeSelected ? " is-selected" : ""}`}
				htmlFor={`${idPrefix}-landscape-shape`}
				onClick={(event) => {
					if (event.target.closest("input")) return;
					onChange("LANDSCAPE");
				}}
			>
				<input
					className="visually-hidden"
					id={`${idPrefix}-landscape-shape`}
					type="radio"
					name={name}
					value="LANDSCAPE"
					data-editor-choice="landscape"
					checked={landscapeSelected}
					onChange={() => onChange("LANDSCAPE")}
				/>
				<span className="shape-preview is-landscape" aria-hidden="true" />
				<span>
					<strong>Landscape</strong>
					<small>Wide artwork for horizontal folders.</small>
				</span>
				<span className="editor-choice-check" aria-hidden="true">{landscapeSelected ? "✓" : ""}</span>
			</label>
		</div>
	);
}

export function FolderTitleVisibilityChoices({ selectedId, name, onChange }) {
	const options = [
		{ id: "SHOW_EVERYWHERE", marker: "show-everywhere", label: "Show everywhere", description: "Home screen and open folder" },
		{ id: "HIDE_HOME_SCREEN", marker: "hide-home-screen", label: "Hide on home screen only", description: "Still shown inside the folder" },
		{ id: "HIDE_EVERYWHERE", marker: "hide-everywhere", label: "Hide everywhere", description: "Uses an invisible title" },
	];
	return (
		<div className="editor-compact-radio-grid" data-control-presentation="compact-radios">
			{options.map((option) => (
				<label key={option.id} className={`editor-compact-radio${selectedId === option.id ? " is-selected" : ""}`}>
					<input
						type="radio"
						name={name}
						value={option.id}
						data-editor-choice={option.marker}
						checked={selectedId === option.id}
						onChange={() => onChange(option.id)}
					/>
					<span><strong>{option.label}</strong><small>{option.description}</small></span>
				</label>
			))}
		</div>
	);
}

export function TitleOptions({
	idPrefix,
	collectionTitleVisibility = null,
	collectionStatus = null,
	folderTitleVisibility,
}) {
	const headingId = `${idPrefix}-title-options-title`;
	return (
		<section className="review-title-options" data-review-title-options="true" aria-labelledby={headingId}>
			<h4 id={headingId}>Title options</h4>
			{collectionTitleVisibility ? (
				<div className="editor-switch-field" data-editor-field="hideNuvioTitle">
					<CollectionTitleVisibilitySwitch
						checked={collectionTitleVisibility.checked}
						onChange={collectionTitleVisibility.onChange}
						descriptionId={collectionTitleVisibility.descriptionId}
						controlName={collectionTitleVisibility.controlName}
					/>
				</div>
			) : null}
			{collectionStatus}
			<fieldset className="editor-field editor-choice-field editor-compact-radio-field" data-editor-field="folderTitleVisibility">
				<legend>{folderTitleVisibility.legend}</legend>
				<FolderTitleVisibilityChoices
					selectedId={folderTitleVisibility.selectedId}
					name={folderTitleVisibility.name}
					onChange={folderTitleVisibility.onChange}
				/>
			</fieldset>
		</section>
	);
}
