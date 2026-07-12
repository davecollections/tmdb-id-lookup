import { useEffect } from "react";

function FieldStatus({ draft, field, statusId }) {
	const capitalized = field[0].toUpperCase() + field.slice(1);
	const hasField = draft.original[`has${capitalized}`];
	const supported = draft.original[`${field}Supported`];

	if (supported) {
		return null;
	}

	return (
		<p className="editor-field-status" id={statusId}>
			{hasField
				? "The imported value is not text. Enter a valid text replacement before applying."
				: "The imported value is absent. Enter a valid text replacement before applying."}
		</p>
	);
}

export function NodeEditor({
	draft,
	diagnostics,
	idInputRef,
	titleInputRef,
	onChange,
	onSubmit,
	onCancel,
}) {
	const noun = draft.nodeType === "folder" ? "folder" : "collection";
	const heading = `Edit ${noun}`;
	const context = noun === "folder" ? "Folder settings" : "Collection settings";
	const prefix = `node-editor-${noun}`;
	const idError = diagnostics.find((entry) => entry.path === "$ui.editor.id") ?? null;
	const titleError = diagnostics.find((entry) => entry.path === "$ui.editor.title") ?? null;

	useEffect(() => {
		idInputRef.current?.focus();
	}, [draft.internalId, idInputRef]);

	function describedBy(field, diagnostic) {
		const ids = [`${prefix}-${field}-help`];
		if (!draft.original[`${field}Supported`]) ids.push(`${prefix}-${field}-status`);
		if (diagnostic) ids.push(`${prefix}-${field}-error`);
		return ids.join(" ");
	}

	return (
		<section className="node-editor" data-node-editor={noun} aria-labelledby={`${prefix}-title`}>
		<div className="node-editor-heading">
			<div>
				<p className="panel-kicker">{context}</p>
				<h2 id={`${prefix}-title`}>{heading}</h2>
			</div>
			<p>Update the values Nuvio uses for this {noun}. Builder identity stays unchanged.</p>
		</div>

		<p className="editor-lock-note">
			Hierarchy navigation is paused until you apply or cancel this edit.
		</p>

		<form className="node-editor-form" onSubmit={onSubmit} noValidate>
			<div className="editor-field">
				<label htmlFor={`${prefix}-id`}>ID</label>
				<input
					ref={idInputRef}
					id={`${prefix}-id`}
					name="id"
					type="text"
					value={draft.values.id}
					data-editor-field="id"
					aria-invalid={idError ? "true" : undefined}
					aria-describedby={describedBy("id", idError)}
					onChange={(event) => onChange("id", event.target.value)}
				/>
				<p className="editor-field-help" id={`${prefix}-id-help`}>
					Used in the exported Nuvio collection file. This does not change the builder’s internal identity.
				</p>
				<FieldStatus draft={draft} field="id" statusId={`${prefix}-id-status`} />
			</div>

			<div className="editor-field">
				<label htmlFor={`${prefix}-title-input`}>Title</label>
				<input
					ref={titleInputRef}
					id={`${prefix}-title-input`}
					name="title"
					type="text"
					value={draft.values.title}
					data-editor-field="title"
					aria-invalid={titleError ? "true" : undefined}
					aria-describedby={describedBy("title", titleError)}
					onChange={(event) => onChange("title", event.target.value)}
				/>
				<p className="editor-field-help" id={`${prefix}-title-help`}>
					Displayed as the {noun} title in Nuvio.
				</p>
				<FieldStatus draft={draft} field="title" statusId={`${prefix}-title-status`} />
			</div>

			<div className="editor-diagnostics" role="alert" aria-atomic="true">
				{diagnostics.length > 0 ? (
					<ul>
						{diagnostics.map((entry) => (
							<li
								key={entry.code}
								id={`${prefix}-${entry.path === "$ui.editor.id" ? "id" : "title"}-error`}
							>
								{entry.message}
							</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="node-editor-actions">
				<button className="editor-apply" type="submit" data-action="apply-node-edit">Apply changes</button>
				<button className="editor-cancel" type="button" data-action="cancel-node-edit" onClick={onCancel}>Cancel</button>
			</div>
		</form>
	</section>
	);
}
