import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";

export function NestedPreviewDialog({
	ariaLabelledBy,
	backdropClassName = "",
	backdropProps = {},
	children,
	dialogClassName,
	dialogProps = {},
	dialogRef = null,
	initialFocusRef = null,
	onClose,
}) {
	const localDialogRef = useRef(null);
	const activeDialogRef = dialogRef ?? localDialogRef;
	useEffect(() => {
		focusElementWithoutScroll(initialFocusRef?.current ?? activeDialogRef.current);
	}, []);
	const content = (
		<div
			className={`settings-modal-backdrop nested-modal-backdrop${backdropClassName ? ` ${backdropClassName}` : ""}`}
			data-nested-modal-backdrop="true"
			{...backdropProps}
			onMouseDown={(event) => {
				backdropProps.onMouseDown?.(event);
				if (!event.defaultPrevented && event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={activeDialogRef}
				className={dialogClassName}
				role="dialog"
				aria-modal="true"
				aria-labelledby={ariaLabelledBy}
				tabIndex={-1}
				{...dialogProps}
				onKeyDown={(event) => {
					dialogProps.onKeyDown?.(event);
					if (event.defaultPrevented) return;
					event.stopPropagation();
					handleDialogKeyDown(event, activeDialogRef.current, onClose);
				}}
			>
				{children}
			</section>
		</div>
	);
	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
