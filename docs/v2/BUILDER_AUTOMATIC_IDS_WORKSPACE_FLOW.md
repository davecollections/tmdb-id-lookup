# Builder Automatic IDs and Workspace Flow

Status: implemented for issue [#43](https://github.com/davecollections/tmdb-id-lookup/issues/43)

Last reviewed: 2026-07-12

## Purpose and identity boundary

Collection and folder Nuvio-facing IDs are now hidden implementation details. New nodes receive automatic IDs, usable imported IDs are preserved exactly, and missing, invalid, whitespace-padded, or later duplicated IDs are repaired silently. Builder-only `internalId` values remain a separate controller identity system and are never exported or displayed.

`builder/src/nuvio/nuvio-ids.js` is framework-independent. Its production factory delegates to `globalThis.crypto.randomUUID()` with no weak fallback. Tests inject deterministic factories. Generation accepts only non-empty strings without leading or trailing whitespace, retries collisions with a deterministic 100-attempt limit, and contains factory exceptions behind the stable `NUVIO_ID_GENERATION_FAILED` controller diagnostic.

## Import normalization

Controller import performs structural import first, then normalizes collection/folder IDs before committing the project. Traversal is collection order followed by each collection's folder order. The first usable occurrence keeps its exact value; later duplicates are replaced. One namespace covers every collection and folder, and generated values avoid all usable imported IDs plus earlier generated values.

Only `editable.id` changes. Complete `rawImported` snapshots, unknown/community fields, source categories and order, `catalogSources` evidence, and importer diagnostics remain unchanged. A repaired import remains clean and does not apply addon migration. Failure is atomic and retains the prior project, selection, and dirty state.

## Creation and editing

`createBuilderController` accepts independent `idFactory` and `nuvioIdFactory` options. Collection/folder creation preserves a supplied usable unique Nuvio ID or generates a replacement before commit. Source creation never uses this factory. UI draft helpers submit titles only and choose the smallest available exact `Untitled Collection` or `Untitled Folder` suffix.

The collection/folder editor contains one Title field. Its UI draft contains target internal identity/type, title form/original metadata, title touched state, and title diagnostics only. Validation checks trimmed length without trimming the submitted title. Patches are `{}` or `{ title }`; IDs never enter production UI patches.

## Workspace flow

Collection/folder IDs, project title, and dirty badges are absent from hierarchy cards, details, editor markup, visible status text, and accessible labels. Dirty state remains controller-owned.

The workspace provides a distinct **Back to builder home** button and one global **?** control in the former V1-link position; the welcome footer uses a text **About** control for the same modal. The V1 TMDB ID Lookup remains available from that modal instead of appearing as a separate shell backlink. Clean return resets the controller before showing welcome. Dirty return opens one inline confirmation with **Stay here** and **Discard and return**. Return completion uses a synchronous exact-once gate: successful completion keeps the gate held until workspace unmount, while structured or contained unexpected failure releases it for retry. While confirmation is open, workspace mutation/navigation controls are disabled and only the confirmation controls remain available. No routes, history APIs, browser confirmation, or persistence are used.

Collection and folder empty states contain real creation buttons sharing the heading-action helpers. The source empty state is neutral and has no plus or source-creation control.

## Accessibility, responsive behavior, and markers

The flow uses native buttons and `disabled`, moves focus to **Stay here**, restores return-button focus on cancellation, keeps approximately 48px targets, strong focus styles, semantic headings, and an inline section rather than a modal. The confirmation section programmatically associates both its heading and explanatory description. Layout remains mobile-first at 360, 384, 393, 402, 412, and 768px, with the three-panel desktop workspace at 1024 and 1280px.

Stable markers include `return-builder-home`, `data-return-confirmation`, `stay-in-workspace`, `discard-and-return`, `create-collection-empty`, `create-folder-empty`, `data-node-editor`, and `data-editor-field="title"`. `data-editor-field="id"` is removed.

## Exclusions and required checkpoint

This milestone adds no presentation settings, final edit-icon redesign, source creation/editing/deletion, hierarchy deletion/reordering, export, persistence, routing, networking, migration automation, dependencies, v1, or Worker changes.

Required product sequence:

1. Complete automatic IDs and workspace corrections.
2. Add collection and folder presentation settings.
3. Stop for owner UI/flow review.
4. Resolve review findings.
5. Only then begin source creation.

The review must cover edit/settings affordance, settings layout, title interaction, button hierarchy, header, empty states, mobile flow, desktop layout, and visual polish.
