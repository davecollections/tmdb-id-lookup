// Presentation only: each flow owns its stage number, wording and navigation.
export function CreationStageIntro({ step, phase = null, title, description = null, headingId, headingRef = null, tabIndex }) {
	return (
		<div className="creation-stage-intro">
			<p className="panel-kicker">Step {step}{phase ? ` · ${phase}` : ""}</p>
			<h3 id={headingId} ref={headingRef} tabIndex={tabIndex}>{title}</h3>
			{description ? <p className="creation-stage-description">{description}</p> : null}
		</div>
	);
}
