export function LauncherOptionIcon({ icon }) {
	let drawing = null;
	if (icon === "blank") {
		drawing = <><path d="M7 3.5h7l3 3v14H7z" /><path d="M14 3.5v3h3M12 10v6M9 13h6" /></>;
	} else if (icon === "decades") {
		drawing = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16M8 13h2M14 13h2M8 17h2" /></>;
	} else if (icon === "people") {
		drawing = <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="10" r="2.25" /><path d="M3.5 20c.4-3.7 2.3-5.5 5.5-5.5s5.1 1.8 5.5 5.5M14.5 15.5c3.2-.3 5.2 1.2 5.8 4.5" /></>;
	} else if (icon === "franchises") {
		drawing = <><rect x="3.5" y="4.5" width="8" height="10" rx="1.5" /><rect x="12.5" y="9.5" width="8" height="10" rx="1.5" /><path d="M7.5 14.5v3h5M11.5 9.5h1" /></>;
	} else if (icon === "lists") {
		drawing = <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /><circle cx="7" cy="9" r=".5" /><circle cx="7" cy="13" r=".5" /><circle cx="7" cy="17" r=".5" /></>;
	} else if (icon === "studios") {
		drawing = <><path d="M4 20h16M6 20V9h12v11M4.5 9 12 4l7.5 5M9 12v5M12 12v5M15 12v5" /></>;
	} else if (icon === "networks") {
		drawing = <><rect x="3.5" y="5" width="17" height="12" rx="2" /><circle cx="12" cy="11" r="1" /><path d="M9.3 8.4a3.7 3.7 0 0 0 0 5.2M14.7 8.4a3.7 3.7 0 0 1 0 5.2M9 21l3-4 3 4" /></>;
	} else if (icon === "genres") {
		drawing = <><path d="M4 5h7l9 9-6 6L4 10z" /><circle cx="8.5" cy="9.5" r="1" /></>;
	} else if (icon === "streaming-services") {
		drawing = <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="m10 9 5 3-5 3zM7 3h10" /></>;
	}

	return (
		<span className="creation-option-icon-shell" aria-hidden="true">
			<svg className="creation-option-icon" viewBox="0 0 24 24" focusable="false">{drawing}</svg>
		</span>
	);
}

export function LauncherOptionCard({ buttonRef = null, className, dataAttribute, icon, label, onSelect, optionId, supportingText = null }) {
	const dataProperties = dataAttribute ? { [dataAttribute]: optionId } : {};
	return (
		<button
			ref={buttonRef}
			className={className}
			type="button"
			{...dataProperties}
			onClick={() => onSelect(optionId)}
		>
			<LauncherOptionIcon icon={icon} />
			<span className="creation-option-copy">
				<strong>{label}</strong>
				{supportingText ? <small>{supportingText}</small> : null}
			</span>
		</button>
	);
}
