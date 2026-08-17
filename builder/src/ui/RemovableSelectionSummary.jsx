export function RemovableSelectionSummary({
	items,
	onRemove,
	ariaLabel,
	disclosureLabel,
	compactThreshold = 6,
	alwaysDisclose = false,
	showDisclosureCount = true,
}) {
	if (!Array.isArray(items) || items.length === 0) return null;
	if (!alwaysDisclose && items.length <= compactThreshold) {
		return (
			<ul className="genre-selection-pills removable-selection-pills" aria-label={ariaLabel}>
				{items.map((item) => (
					<li key={item.id}>
						<button type="button" onClick={() => onRemove(item.id)}>
							<span>{item.label}</span>
							<span aria-hidden="true">×</span>
							<span className="visually-hidden">Remove {item.label}</span>
						</button>
					</li>
				))}
			</ul>
		);
	}
	return (
		<details className="genre-selected-disclosure removable-selection-disclosure">
			<summary>{disclosureLabel}{showDisclosureCount ? ` · ${items.length}` : ""}</summary>
			<ul>
				{items.map((item) => (
					<li key={item.id}>
						<div><strong>{item.label}</strong>{item.detail ? <span>{item.detail}</span> : null}</div>
						<button type="button" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item.id)}>×</button>
					</li>
				))}
			</ul>
		</details>
	);
}
