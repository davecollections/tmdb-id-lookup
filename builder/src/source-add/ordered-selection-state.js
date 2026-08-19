function freezeState(order, byId) {
	return Object.freeze({
		order: Object.freeze([...order]),
		byId: Object.freeze({ ...byId }),
	});
}

export function createOrderedSelectionState() {
	return freezeState([], {});
}

export function selectedOrderedEntities(state) {
	return (state?.order ?? []).map((id) => state.byId[id]).filter(Boolean);
}

export function orderedSelectionNotice(state, threshold, label = "selection") {
	if (!Number.isSafeInteger(threshold) || threshold < 1) {
		throw new TypeError(`The ${label} notice threshold must be a positive safe integer.`);
	}
	const count = state?.order?.length ?? 0;
	return Object.freeze({ visible: count >= threshold, count, threshold });
}

export function addOrderedEntity(state, entity, normalize) {
	const normalized = normalize(entity);
	if (state.byId[normalized.id]) {
		return Object.freeze({ state, added: false, duplicate: true, limitReached: false });
	}
	return Object.freeze({
		state: freezeState([...state.order, normalized.id], { ...state.byId, [normalized.id]: normalized }),
		added: true,
		duplicate: false,
		limitReached: false,
	});
}

export function removeOrderedEntity(state, entityId, isValidId) {
	if (!isValidId(entityId) || !state.byId[entityId]) return state;
	const byId = { ...state.byId };
	delete byId[entityId];
	return freezeState(state.order.filter((id) => id !== entityId), byId);
}

export function toggleOrderedEntity(state, entity, normalize, isValidId) {
	if (state.byId[entity?.id]) {
		return Object.freeze({
			state: removeOrderedEntity(state, entity.id, isValidId),
			added: false,
			removed: true,
			duplicate: false,
			limitReached: false,
		});
	}
	return addOrderedEntity(state, entity, normalize);
}
