import { useEffect, useRef, useState } from "react";
import { createAsyncRequestCoordinator } from "../source-add/async-request-state.js";
import { requestTraktTitlePreview, TRAKT_TITLE_PREVIEW_LIMIT } from "../source-add/trakt-preview.js";
import { defaultTraktListTitle } from "../source-add/trakt-creation-plan.js";

// Trakt's first-page/cooldown lifecycle is a thin adapter to the shared dialog.
// Unlike source-draft Preview, it is independent of media and creation selection.
export function useTraktTitlePreview({ client, posterProvider, onUnavailable }) {
 const [preview, setPreview] = useState(null), [clock, setClock] = useState(Date.now);
 const coordinator = useRef(null), unavailable = useRef(onUnavailable);
 unavailable.current = onUnavailable;
 if (!coordinator.current) coordinator.current = createAsyncRequestCoordinator();
 useEffect(() => () => coordinator.current.cancel({ notify: false }), []);
 const cooldownUntil = Math.max(preview?.error?.notBefore ?? 0, client.getNotBefore?.() ?? 0);
 const cooling = cooldownUntil > clock;
 useEffect(() => {
  if (!cooling) return undefined;
  const timer = setTimeout(() => setClock(Date.now()), Math.max(1, cooldownUntil - Date.now()));
  return () => clearTimeout(timer);
 }, [cooling, cooldownUntil]);
 async function open(list, trigger) {
  const candidate = { request: { kind: "list", label: defaultTraktListTitle(list) } };
  setPreview({ status: "loading", list, trigger, candidate });
  const outcome = await coordinator.current.run(({ signal }) => requestTraktTitlePreview({ client, posterProvider, listId: list.id, signal }), list.id);
  if (!outcome.accepted) return;
  setClock(Date.now());
  if (outcome.result?.error?.code === "LIST_NOT_FOUND") unavailable.current?.(list);
  if (outcome.result?.error?.kind === "aborted") return;
  setPreview({ status: outcome.result?.ok ? "ready" : "error", list, trigger, candidate, data: outcome.result?.data, error: outcome.result?.error });
 }
 function close() { coordinator.current.cancel({ notify: false }); setPreview(null); }
 const error = preview?.error;
 const message = error?.code === "LIST_NOT_FOUND" ? "This Trakt List is unavailable."
  : cooling ? `Trakt requests are paused. Retry after ${new Date(cooldownUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
  : "This title preview could not be prepared.";
 return { preview, open, dialogProps: preview ? {
  preview: { ...preview, error: error ? { ...error, message } : null },
  parentTrigger: preview.trigger, previewLimit: TRAKT_TITLE_PREVIEW_LIMIT,
  onClose: close, onRetry: error?.retryable && !cooling ? () => open(preview.list, preview.trigger) : undefined,
 } : null };
}
