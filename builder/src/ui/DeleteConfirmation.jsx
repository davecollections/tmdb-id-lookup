import { useEffect, useRef } from "react";
import { handleDialogKeyDown } from "./modal-focus.js";

export function DeleteConfirmation({
	impact,
	onCancel,
	onConfirm,
}) {
	const dialogRef = useRef(null);
	const cancelButtonRef = useRef(null);

	useEffect(() => {
		cancelButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		document.body.classList.add("settings-modal-open");
		return () => document.body.classList.remove("settings-modal-open");
	}, []);

	return (
		<div
			className="settings-modal-backdrop delete-modal-backdrop"
			data-delete-modal-backdrop="true"
			data-backdrop-dismiss="false"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					event.preventDefault();
					dialogRef.current?.focus();
				}
			}}
		>
			<section
				ref={dialogRef}
				className="delete-confirmation"
				data-delete-confirmation={impact.nodeType}
				role="dialog"
				aria-modal="true"
				aria-labelledby="delete-confirmation-title"
				aria-describedby="delete-confirmation-description"
				tabIndex={-1}
				onKeyDown={(event) => handleDialogKeyDown(
					event,
					dialogRef.current,
					onCancel,
				)}
			>
				<div className="delete-confirmation-heading">
					<p className="panel-kicker">Permanent deletion</p>
					<h2 id="delete-confirmation-title">{impact.confirmationTitle}</h2>
					<p id="delete-confirmation-description">{impact.confirmationBody}</p>
				</div>
				<div className="delete-confirmation-actions">
					<button
						ref={cancelButtonRef}
						className="editor-cancel"
						type="button"
						data-action="cancel-delete"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						className="danger-action delete-confirm-action"
						type="button"
						data-action="confirm-delete"
						onClick={onConfirm}
					>
						{impact.submitLabel}
					</button>
				</div>
			</section>
		</div>
	);
}
