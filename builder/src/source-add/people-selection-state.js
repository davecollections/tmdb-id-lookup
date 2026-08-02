import { isPositiveSafePersonId } from "./tmdb-person-input.js";

export const PEOPLE_SELECTION_LIMIT = 20;

function freezeState(order, byId) {
	return Object.freeze({
		order: Object.freeze([...order]),
		byId: Object.freeze({ ...byId }),
	});
}

function normalizedPerson(person) {
	if (!isPositiveSafePersonId(person?.id) || typeof person.name !== "string" || !person.name.trim()) {
		throw new TypeError("A canonical TMDB person result is required.");
	}
	return Object.freeze({ ...person, name: person.name.trim() });
}

export function createPeopleSelectionState() {
	return freezeState([], {});
}

export function selectedPeople(state) {
	return (state?.order ?? []).map((id) => state.byId[id]).filter(Boolean);
}

export function addSelectedPerson(state, person, limit = PEOPLE_SELECTION_LIMIT) {
	const normalized = normalizedPerson(person);
	if (!Number.isInteger(limit) || limit < 1 || limit > PEOPLE_SELECTION_LIMIT) {
		throw new TypeError(`People selection limit must be between 1 and ${PEOPLE_SELECTION_LIMIT}.`);
	}
	if (state.byId[normalized.id]) return Object.freeze({ state, added: false, duplicate: true, limitReached: false });
	if (state.order.length >= limit) return Object.freeze({ state, added: false, duplicate: false, limitReached: true });
	return Object.freeze({
		state: freezeState([...state.order, normalized.id], { ...state.byId, [normalized.id]: normalized }),
		added: true,
		duplicate: false,
		limitReached: false,
	});
}

export function removeSelectedPerson(state, personId) {
	if (!isPositiveSafePersonId(personId) || !state.byId[personId]) return state;
	const byId = { ...state.byId };
	delete byId[personId];
	return freezeState(state.order.filter((id) => id !== personId), byId);
}

export function toggleSelectedPerson(state, person, limit = PEOPLE_SELECTION_LIMIT) {
	if (state.byId[person?.id]) {
		return Object.freeze({ state: removeSelectedPerson(state, person.id), added: false, removed: true, duplicate: false, limitReached: false });
	}
	return addSelectedPerson(state, person, limit);
}
