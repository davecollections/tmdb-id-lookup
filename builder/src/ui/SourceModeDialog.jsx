import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AVAILABLE_SOURCE_MODES } from "../source-add/index.js";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { LauncherOptionCard } from "./LauncherOptionCard.jsx";
import { handleDialogKeyDown } from "./modal-focus.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SourceModeDialog({ folderName, initialFocusModeId = null, onCancel, onSelectMode }) {
	const dialogRef = useRef(null);
	const firstModeRef = useRef(null);
	const [viewportStyle, setViewportStyle] = useState(() => (
		typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window)
	));

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		const returningMode = initialFocusModeId
			? dialogRef.current?.querySelector?.(`[data-source-mode-option="${initialFocusModeId}"]`)
			: null;
		focusElementWithoutScroll(returningMode ?? firstModeRef.current ?? dialogRef.current);
		return () => {
			stopObservingViewport();
			unlockBody();
		};
	}, [initialFocusModeId]);

	const content = (
		<div className="add-source-portal" data-add-source-portal="true" data-mobile-surface="opaque">
			<div
				className="settings-modal-backdrop add-source-backdrop"
				data-add-source-modal-backdrop="true"
				data-backdrop-dismiss="false"
				style={viewportStyle ?? undefined}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) {
						event.preventDefault();
						focusElementWithoutScroll(dialogRef.current);
					}
				}}
			>
				<section
					ref={dialogRef}
					className="add-source-dialog source-mode-dialog"
					data-add-source-modal="true"
					data-source-mode-chooser="true"
					role="dialog"
					aria-modal="true"
					aria-labelledby="source-mode-title"
					aria-describedby="source-mode-description"
					tabIndex={-1}
					onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
				>
					<header className="add-source-heading">
						<div className="add-source-heading-row">
							<span className="add-source-header-spacer" aria-hidden="true" />
							<div>
								<h2 id="source-mode-title">Add source</h2>
								<p>Starting from {folderName}</p>
							</div>
							<button
								className="add-source-header-action add-source-close-action"
								type="button"
								aria-label="Close Add source"
								onClick={onCancel}
							>
								Close
							</button>
						</div>
						<p id="source-mode-description" className="add-source-heading-description source-mode-heading-description">
							<span>Choose what you want to add.</span>
							<span>All available source families use <strong>TMDB</strong>.</span>
						</p>
					</header>
					<ul className="add-source-scroll source-mode-list" aria-label="Source families">
						{AVAILABLE_SOURCE_MODES.map((mode, index) => (
							<li key={mode.id}>
								<LauncherOptionCard
									buttonRef={index === 0 ? firstModeRef : null}
									className="source-mode-option"
									dataAttribute="data-source-mode-option"
									icon={mode.icon}
									label={mode.label}
									onSelect={onSelectMode}
									optionId={mode.id}
									supportingText={mode.description}
								/>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);

	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
