import { isPositiveSafePersonId } from "./tmdb-person-input.js";

export const PEOPLE_LARGE_SELECTION_NOTICE_THRESHOLD = 50;

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

export function peopleSelectionNotice(state, threshold = PEOPLE_LARGE_SELECTION_NOTICE_THRESHOLD) {
	if (!Number.isSafeInteger(threshold) || threshold < 1) throw new TypeError("The People notice threshold must be a positive safe integer.");
	const count = state?.order?.length ?? 0;
	return Object.freeze({ visible: count >= threshold, count, threshold });
}

export function addSelectedPerson(state, person) {
	const normalized = normalizedPerson(person);
	if (state.byId[normalized.id]) return Object.freeze({ state, added: false, duplicate: true, limitReached: false });
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

export function toggleSelectedPerson(state, person) {
	if (state.byId[person?.id]) {
		return Object.freeze({ state: removeSelectedPerson(state, person.id), added: false, removed: true, duplicate: false, limitReached: false });
	}
	return addSelectedPerson(state, person);
}
