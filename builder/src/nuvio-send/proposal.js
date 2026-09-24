import { createCollectionExportPayload } from "../serialize/collection-export.js";
import { deepFreeze, jsonValuesEqual } from "../application/state.js";
import { isUsableNuvioId } from "../nuvio/nuvio-ids.js";

const owners = new WeakMap();
const diagnostic = (code, path, message) => ({ code, path, message });

// Extra delivery guards only; the canonical serializer remains authoritative.
export function validateSendCollections(collections) {
	if (!Array.isArray(collections) || collections.length === 0) return [diagnostic("SEND_EMPTY", "$", "Send requires at least one Collection.")];
	const claimed = new Set();
	const errors = [];
	function check(node, path) {
		if (!isUsableNuvioId(node?.id)) errors.push(diagnostic("SEND_INVALID_ID", `${path}.id`, "Send requires a usable Collection or Folder ID without surrounding whitespace."));
		else if (claimed.has(node.id)) errors.push(diagnostic("SEND_DUPLICATE_ID", `${path}.id`, "This Collection or Folder ID is already used in the replacement."));
		else claimed.add(node.id);
	}
	collections.forEach((collection, ci) => {
		check(collection, `$[${ci}]`);
		if (!Array.isArray(collection?.folders)) errors.push(diagnostic("SEND_INVALID_FOLDERS", `$[${ci}].folders`, "Send requires canonical Folder arrays."));
		else collection.folders.forEach((folder, fi) => check(folder, `$[${ci}].folders[${fi}]`));
	});
	return errors;
}

export function prepareSendProposal(controller) {
	const payload = createCollectionExportPayload(controller)();
	const errors = payload.ok ? validateSendCollections(payload.collections) : payload.errors;
	if (errors.length) return deepFreeze({ ok: false, errors });
	// A round-trip mismatch must fail closed, never normalize the reviewed array.
	if (typeof payload.json !== "string" || !jsonValuesEqual(JSON.parse(payload.json), payload.collections)) {
		return deepFreeze({ ok: false, errors: [diagnostic("SEND_PAYLOAD_MISMATCH", "$", "The prepared JSON does not exactly represent the replacement.")] });
	}
	const proposal = deepFreeze({
		project: payload.project, projectId: payload.project.internalId,
		preparedRevision: controller.getState().revision, intended: payload,
	});
	owners.set(proposal, controller);
	return Object.freeze({ ok: true, proposal, errors: [] });
}

export function isSendProposalCurrent(proposal, controller) {
	return owners.get(proposal) === controller && controller.getState().project === proposal.project
		&& controller.getState().project.internalId === proposal.projectId;
}
