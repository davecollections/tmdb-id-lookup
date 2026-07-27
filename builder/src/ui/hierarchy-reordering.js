const MOVE_DIRECTIONS = new Set(["up", "down"]);

export const REORDER_DRAG_THRESHOLD_PX = 6;

function collectionPinGroup(node) {
	return node?.editable?.pinToTop === true ? "pinned" : "ordinary";
}

/**
 * Maps visible sibling order to the authoritative array indexes accepted by
 * controller.moveNode(internalId, targetIndex).
 *
 * Pinned collections are displayed as one stable group before the stable
 * ordinary group. Movement stays within that visible group so it never
 * changes or implies a change to pinToTop.
 */
export function buildSiblingMovements(nodes, { groupPinnedCollections = false } = {}) {
	const indexed = nodes.map((node, rawIndex) => ({
		node,
		rawIndex,
		group: groupPinnedCollections ? collectionPinGroup(node) : "siblings",
	}));
	const visible = groupPinnedCollections
		? [
			...indexed.filter((entry) => entry.group === "pinned"),
			...indexed.filter((entry) => entry.group === "ordinary"),
		]
		: indexed;
	const groups = new Map();

	for (const entry of visible) {
		const group = groups.get(entry.group) ?? [];
		group.push(entry);
		groups.set(entry.group, group);
	}

	return visible.map((entry, visiblePosition) => {
		const group = groups.get(entry.group);
		const groupIndex = group.indexOf(entry);
		return {
			node: entry.node,
			reorderGroup: entry.group,
			reorderGroupPosition: groupIndex,
			reorderGroupSize: group.length,
			reorderVisiblePosition: visiblePosition,
			reorderVisibleSize: visible.length,
			reorderTargetIndexes: group.map((groupEntry) => groupEntry.rawIndex),
			moveUpTargetIndex: groupIndex > 0 ? group[groupIndex - 1].rawIndex : null,
			moveDownTargetIndex: groupIndex < group.length - 1 ? group[groupIndex + 1].rawIndex : null,
		};
	});
}

export function moveTargetForDirection(item, direction) {
	if (!MOVE_DIRECTIONS.has(direction)) {
		return null;
	}
	return direction === "up" ? item.moveUpTargetIndex : item.moveDownTargetIndex;
}

/**
 * Boundary actions are controller-free no-ops. Valid movement delegates once
 * to the existing public controller method.
 */
export function moveSiblingNode(controller, item, direction) {
	const targetIndex = moveTargetForDirection(item, direction);
	if (!Number.isInteger(targetIndex)) {
		return { ok: true, moved: false };
	}

	const result = controller.moveNode(item.internalId, targetIndex);
	return {
		...result,
		moved: result.ok === true,
	};
}

export function moveSiblingNodeToPosition(controller, item, groupPosition) {
	const targetIndex = item.reorderTargetIndexes?.[groupPosition];
	if (
		!Number.isInteger(targetIndex)
		|| groupPosition === item.reorderGroupPosition
	) {
		return { ok: true, moved: false };
	}

	const result = controller.moveNode(item.internalId, targetIndex);
	return {
		...result,
		moved: result.ok === true,
	};
}

export function establishPointerCapture(handle, pointerId) {
	if (typeof handle?.setPointerCapture !== "function") {
		return false;
	}

	try {
		handle.setPointerCapture(pointerId);
		return (
			typeof handle.hasPointerCapture !== "function"
			|| handle.hasPointerCapture(pointerId) === true
		);
	} catch {
		return false;
	}
}

export function pointerSessionLocksInteraction(session) {
	return session !== null;
}

export function crossedDragThreshold(
	startY,
	currentY,
	threshold = REORDER_DRAG_THRESHOLD_PX,
) {
	return (
		Number.isFinite(startY)
		&& Number.isFinite(currentY)
		&& Number.isFinite(threshold)
		&& threshold >= 0
		&& Math.abs(currentY - startY) >= threshold
	);
}

export function dragOverlayTop(pointerY, grabOffsetY) {
	if (!Number.isFinite(pointerY) || !Number.isFinite(grabOffsetY)) {
		return null;
	}
	return pointerY - grabOffsetY;
}

export function pointerDestinationForY(cardBounds, pointerY) {
	if (!Array.isArray(cardBounds) || cardBounds.length === 0 || !Number.isFinite(pointerY)) {
		return null;
	}

	const orderedBounds = cardBounds
		.filter((entry) => (
			Number.isInteger(entry.position)
			&& Number.isFinite(entry.top)
			&& Number.isFinite(entry.bottom)
			&& entry.bottom >= entry.top
		))
		.sort((left, right) => left.position - right.position);
	if (orderedBounds.length === 0) {
		return null;
	}

	for (const entry of orderedBounds) {
		if (pointerY < entry.top + ((entry.bottom - entry.top) / 2)) {
			return entry.position;
		}
	}
	return orderedBounds.at(-1).position;
}

export function insertionIndicatorForDestination(items, activeInternalId, destinationPosition) {
	const active = items.find((item) => item.internalId === activeInternalId);
	const target = items.find((item) => item.reorderGroupPosition === destinationPosition);
	if (!active || !target || active.reorderGroupPosition === destinationPosition) {
		return null;
	}

	return {
		internalId: target.internalId,
		edge: destinationPosition < active.reorderGroupPosition ? "before" : "after",
	};
}

export function visiblePositionForGroupDestination(items, destinationPosition) {
	const destination = items.find((item) => (
		item.reorderGroupPosition === destinationPosition
	));
	return Number.isInteger(destination?.reorderVisiblePosition)
		? destination.reorderVisiblePosition
		: null;
}

/**
 * Produces a visual-only FLIP layout for a drag placeholder and the siblings
 * crossed by it. Bounds are captured before transforms begin so hovering never
 * mutates project data and never feeds transformed geometry back into target
 * calculation.
 */
export function provisionalDragLayout(
	cardBounds,
	activeInternalId,
	destinationPosition,
) {
	if (!Array.isArray(cardBounds) || !Number.isInteger(destinationPosition)) {
		return null;
	}

	const orderedBounds = cardBounds
		.filter((entry) => (
			typeof entry.internalId === "string"
			&& Number.isInteger(entry.position)
			&& Number.isFinite(entry.top)
			&& Number.isFinite(entry.bottom)
			&& entry.bottom >= entry.top
		))
		.sort((left, right) => left.position - right.position);
	const activeIndex = orderedBounds.findIndex((entry) => (
		entry.internalId === activeInternalId
	));
	const destinationIndex = orderedBounds.findIndex((entry) => (
		entry.position === destinationPosition
	));
	if (activeIndex < 0 || destinationIndex < 0) {
		return null;
	}

	const active = orderedBounds[activeIndex];
	const target = orderedBounds[destinationIndex];
	const displacements = Object.fromEntries(
		orderedBounds.map((entry) => [entry.internalId, 0]),
	);
	if (destinationIndex === activeIndex) {
		return {
			placeholderShiftY: 0,
			displacements,
		};
	}

	if (destinationIndex > activeIndex) {
		const next = orderedBounds[activeIndex + 1];
		const siblingShift = active.top - next.top;
		displacements[active.internalId] = target.bottom - active.bottom;
		for (let index = activeIndex + 1; index <= destinationIndex; index += 1) {
			displacements[orderedBounds[index].internalId] = siblingShift;
		}
	} else {
		const previous = orderedBounds[activeIndex - 1];
		const siblingShift = active.bottom - previous.bottom;
		displacements[active.internalId] = target.top - active.top;
		for (let index = destinationIndex; index < activeIndex; index += 1) {
			displacements[orderedBounds[index].internalId] = siblingShift;
		}
	}

	return {
		placeholderShiftY: displacements[active.internalId],
		displacements,
	};
}

export function reorderAutoScrollDelta(
	pointerY,
	viewportHeight,
	{ edgeSize = 72, maxStep = 12 } = {},
) {
	if (
		!Number.isFinite(pointerY)
		|| !Number.isFinite(viewportHeight)
		|| !Number.isFinite(edgeSize)
		|| !Number.isFinite(maxStep)
		|| viewportHeight <= 0
		|| edgeSize <= 0
		|| maxStep <= 0
	) {
		return 0;
	}

	if (pointerY < edgeSize) {
		return -Math.ceil(maxStep * Math.min(1, (edgeSize - pointerY) / edgeSize));
	}
	const lowerEdge = viewportHeight - edgeSize;
	if (pointerY > lowerEdge) {
		return Math.ceil(maxStep * Math.min(1, (pointerY - lowerEdge) / edgeSize));
	}
	return 0;
}

export function reorderHandleLabel(noun, accessibleName) {
	return `Reorder ${noun} “${accessibleName}”`;
}

export function movementAnnouncement(noun, accessibleName, direction) {
	return `Moved ${noun} “${accessibleName}” ${direction}`;
}

export function movementPositionAnnouncement(noun, accessibleName, position) {
	return `Moved ${noun} “${accessibleName}” to position ${position}`;
}
