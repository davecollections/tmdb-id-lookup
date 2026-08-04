import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	focusElementWithoutScroll,
	placeAnchoredMenu,
	resolveVisibleViewport,
} from "./hierarchy-menu-placement.js";

function MoreIcon() {
	return (
		<svg className="hierarchy-actions-icon" viewBox="0 0 20 20" aria-hidden="true">
			<circle cx="10" cy="4" r="1.7" />
			<circle cx="10" cy="10" r="1.7" />
			<circle cx="10" cy="16" r="1.7" />
		</svg>
	);
}

function menuItems(panel) {
	return [...(panel?.querySelectorAll('[role="menuitem"]') ?? [])].filter(
		(item) => !item.disabled,
	);
}

export function handleHierarchyMenuKeyDown(
	event,
	panel,
	onClose,
	activeElement = globalThis.document?.activeElement,
) {
	const items = menuItems(panel);
	const currentIndex = items.indexOf(activeElement);
	if (event.key === "Escape" || event.key === "Tab") {
		event.preventDefault();
		event.stopPropagation();
		onClose({ restoreFocus: true });
		if (event.key === "Escape") return "closed-escape";
		return event.shiftKey ? "closed-shift-tab" : "closed-tab";
	}
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
		return "unhandled";
	}
	event.preventDefault();
	event.stopPropagation();
	const direction = event.key === "ArrowDown" ? 1 : -1;
	const nextIndex = currentIndex < 0
		? 0
		: (currentIndex + direction + items.length) % items.length;
	items[nextIndex]?.focus();
	return "moved";
}

export function HierarchyActionsMenu({
	node,
	noun,
	open,
	disabled,
	onOpen,
	onClose,
	onEdit = null,
	editLabel = "Edit",
	onDelete,
	registerTrigger,
}) {
	const rootRef = useRef(null);
	const triggerRef = useRef(null);
	const panelRef = useRef(null);
	const menuId = useId();
	const [placement, setPlacement] = useState(null);

	useEffect(() => {
		registerTrigger(node.internalId, triggerRef.current);
		return () => registerTrigger(node.internalId, null);
	}, [node.internalId, registerTrigger]);

	useLayoutEffect(() => {
		if (!open) {
			if (placement !== null) setPlacement(null);
			return;
		}
		if (placement !== null) return;
		const triggerRect = triggerRef.current?.getBoundingClientRect?.();
		const menuRect = panelRef.current?.getBoundingClientRect?.();
		if (!triggerRect || !menuRect) return;
		setPlacement(placeAnchoredMenu(
			triggerRect,
			{ width: menuRect.width, height: menuRect.height },
			resolveVisibleViewport(),
		));
	}, [open, placement]);

	useLayoutEffect(() => {
		if (!open || placement === null) return;
		focusElementWithoutScroll(menuItems(panelRef.current)[0]);
	}, [open, placement]);

	useEffect(() => {
		if (!open || placement === null) return;
		function handleOutsidePointer(event) {
			if (
				rootRef.current?.contains(event.target)
				|| panelRef.current?.contains(event.target)
			) return;
			onClose({ restoreFocus: true });
		}

		function handleVisibleViewportChange() {
			onClose({ restoreFocus: false });
		}

		document.addEventListener("pointerdown", handleOutsidePointer);
		window.addEventListener("resize", handleVisibleViewportChange, { passive: true });
		window.addEventListener("scroll", handleVisibleViewportChange, {
			capture: true,
			passive: true,
		});
		window.visualViewport?.addEventListener(
			"resize",
			handleVisibleViewportChange,
			{ passive: true },
		);
		window.visualViewport?.addEventListener(
			"scroll",
			handleVisibleViewportChange,
			{ passive: true },
		);
		return () => {
			document.removeEventListener("pointerdown", handleOutsidePointer);
			window.removeEventListener("resize", handleVisibleViewportChange);
			window.removeEventListener("scroll", handleVisibleViewportChange, true);
			window.visualViewport?.removeEventListener(
				"resize",
				handleVisibleViewportChange,
			);
			window.visualViewport?.removeEventListener(
				"scroll",
				handleVisibleViewportChange,
			);
		};
	}, [onClose, open, placement]);

	function runAction(action) {
		const trigger = triggerRef.current;
		onClose({ restoreFocus: false });
		action(node.internalId, trigger);
	}

	const panel = (
		<div
			ref={panelRef}
			id={menuId}
			className="hierarchy-actions-menu"
			data-actions-menu={noun}
			data-menu-placement={placement?.verticalPlacement}
			role="menu"
			aria-label={`${noun} actions`}
			hidden={!open}
			style={open ? {
				top: placement?.top ?? 0,
				left: placement?.left ?? 0,
				visibility: placement === null ? "hidden" : "visible",
			} : undefined}
			onKeyDown={(event) => handleHierarchyMenuKeyDown(
				event,
				panelRef.current,
				onClose,
			)}
		>
			{onEdit ? (
				<button
					type="button"
					role="menuitem"
					tabIndex={-1}
					data-action={`edit-${noun}`}
					disabled={disabled || !open}
					onClick={() => runAction(onEdit)}
				>
					{editLabel}
				</button>
			) : null}
			<button
				className="hierarchy-menu-delete"
				type="button"
				role="menuitem"
				tabIndex={-1}
				data-action={`delete-${noun}`}
				disabled={disabled || !open}
				onClick={() => runAction(onDelete)}
			>
				Delete
			</button>
		</div>
	);

	return (
		<div
			ref={rootRef}
			className="hierarchy-actions"
			data-hierarchy-actions={noun}
		>
			<button
				ref={triggerRef}
				className="hierarchy-actions-trigger"
				type="button"
				data-action={`open-${noun}-actions`}
				data-hierarchy-menu-trigger="true"
				aria-label={`Actions for ${noun} “${node.accessibleName}”`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				disabled={disabled}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (open) {
						onClose({ restoreFocus: true });
					} else {
						onOpen(node.internalId);
					}
				}}
				onKeyDown={(event) => {
					if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
					event.preventDefault();
					event.stopPropagation();
					onOpen(node.internalId);
				}}
			>
				<MoreIcon />
			</button>
			{open && typeof document !== "undefined"
				? createPortal(panel, document.body)
				: panel}
		</div>
	);
}
