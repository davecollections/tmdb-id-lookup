import {
	INITIAL_PERSON_COUNT_STATE,
	beginPersonCountCheck,
	completePersonCountCheck,
	failPersonCountCheck,
	isPersonCreditCountSet,
	personCountDisplayState,
} from "../source-add/index.js";
import { canonicalPositiveId } from "./source-edit-utils.js";

export const INITIAL_PEOPLE_EDIT_COUNT_STATE = INITIAL_PERSON_COUNT_STATE;

export function peopleEditCountLabel(state, countKey) {
	const display = personCountDisplayState(state, countKey);
	if (display.status === "checking" || display.status === "not-checked") return "Checking titles…";
	if (display.status === "failed") return "Couldn’t check titles";
	if (display.status === "ready-zero") return "No titles found";
	if (display.status === "ready-positive") {
		return `${display.value} title${display.value === 1 ? "" : "s"}`;
	}
	return "Checking titles…";
}

export function createPeopleEditCountSession({ provider, personId }) {
	const canonicalPersonId = canonicalPositiveId(personId);
	if (canonicalPersonId === null || typeof provider?.getPerson !== "function") {
		throw new TypeError("People edit counts require a positive person ID and People provider.");
	}

	let currentPromise = null;

	function load({ retry = false } = {}) {
		if (!retry && currentPromise !== null) return currentPromise;
		const checking = beginPersonCountCheck();
		currentPromise = Promise.resolve(provider.getPerson(canonicalPersonId, {
			bypassCache: retry,
		})).then((result) => {
			if (result?.ok && isPersonCreditCountSet(result.data?.counts)) {
				return Object.freeze({
					...completePersonCountCheck(
						result.data.counts,
						Number.isFinite(result.checkedAt) ? result.checkedAt : Date.now(),
					),
					fromCache: result.fromCache === true,
				});
			}
			return failPersonCountCheck(checking, {
				message: "Title counts could not be checked. Editing and Save are still available.",
				retryable: true,
			});
		});
		return currentPromise;
	}

	return Object.freeze({ personId: canonicalPersonId, load });
}
