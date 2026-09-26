import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MERGE_ARTWORK_POLICY, planCollectionMerge } from "../import/merge-collections.js";
import { projectHasImportWork } from "./import-actions.js";
import { createWelcomeActionGate } from "./welcome-action-coordinator.js";

export function useCollectionImportReview({ controller, builderState, snapshot, applySnapshot, onImported }) {
	const [review, setReview] = useState(null);
	const [mode, setMode] = useState("");
	const [artworkPolicy, setArtworkPolicy] = useState(DEFAULT_MERGE_ARTWORK_POLICY);
	const [confirmation, setConfirmation] = useState(false);
	const [error, setError] = useState(null);
	const gate = useRef(createWelcomeActionGate());
	const latestSnapshot = useRef(snapshot);
	latestSnapshot.current = snapshot;
	function resetChoices() {
		setMode(""); setArtworkPolicy(DEFAULT_MERGE_ARTWORK_POLICY); setConfirmation(false); setError(null);
	}
	useEffect(() => {
		setReview({ snapshot, project: controller.getState().project });
		resetChoices();
	}, [snapshot, controller]);
	const hasWork = projectHasImportWork(builderState);
	const staleProject = snapshot && (review?.snapshot !== snapshot || review?.project !== builderState.project);
	const mergePreview = useMemo(() => hasWork && mode === "merge" && snapshot?.kind === "ready" && review?.snapshot === snapshot
		? planCollectionMerge(review.project, snapshot.collections, { artworkPolicy }) : null,
	[hasWork, mode, snapshot, review, artworkPolicy]);
	const importDisabled = snapshot?.kind !== "ready" || Boolean(staleProject) || (hasWork && !mode) || (mergePreview && !mergePreview.ok);
	function refresh() {
		setReview({ snapshot, project: controller.getState().project });
		resetChoices();
	}
	function perform(replaceConfirmed = false) {
		if (!gate.current.tryAcquire()) return;
		try {
			setError(null);
			if (latestSnapshot.current !== snapshot || importDisabled || controller.getState().project !== review?.project) {
				setConfirmation(false); setError("Review the incoming Collections and current project before importing."); return;
			}
			if (hasWork && mode === "replace" && !replaceConfirmed) { setConfirmation(true); return; }
			const result = applySnapshot({ controller, snapshot, project: review.project, mode: hasWork ? mode : "replace", artworkPolicy, replaceConfirmed });
			if (!result.ok) { setConfirmation(false); setError(result.message); return; }
			onImported();
		} finally { gate.current.release(); }
	}
	return { mode, setMode, artworkPolicy, setArtworkPolicy, confirmation, setConfirmation, error, setError, hasWork,
		staleProject, mergePreview, importDisabled, refresh, perform };
}
