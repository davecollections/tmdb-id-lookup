import { isPositiveSafePersonId } from "./tmdb-person-input.js";
import {
	addOrderedEntity,
	createOrderedSelectionState,
	orderedSelectionNotice,
	removeOrderedEntity,
	selectedOrderedEntities,
	toggleOrderedEntity,
} from "./ordered-selection-state.js";

export const PEOPLE_LARGE_SELECTION_NOTICE_THRESHOLD = 50;

function normalizedPerson(person) {
	if (!isPositiveSafePersonId(person?.id) || typeof person.name !== "string" || !person.name.trim()) {
		throw new TypeError("A canonical TMDB person result is required.");
	}
	return Object.freeze({ ...person, name: person.name.trim() });
}

export function createPeopleSelectionState() {
	return createOrderedSelectionState();
}

export function selectedPeople(state) {
	return selectedOrderedEntities(state);
}

export function peopleSelectionNotice(state, threshold = PEOPLE_LARGE_SELECTION_NOTICE_THRESHOLD) {
	return orderedSelectionNotice(state, threshold, "People");
}

export function addSelectedPerson(state, person) {
	return addOrderedEntity(state, person, normalizedPerson);
}

export function removeSelectedPerson(state, personId) {
	return removeOrderedEntity(state, personId, isPositiveSafePersonId);
}

export function toggleSelectedPerson(state, person) {
	return toggleOrderedEntity(state, person, normalizedPerson, isPositiveSafePersonId);
}
