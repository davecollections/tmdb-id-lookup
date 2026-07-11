# Builder Welcome Screen and Local JSON Import

Status: implemented for issue [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41)

Last reviewed: 2026-07-12

## Purpose and scope

The `/builder/` entry now opens on a real welcome screen for the **TMDB Collection Builder**. The supporting line is **Built for Nuvio collections**, and the interface retains the small **Development preview** label. The welcome screen starts a clean project or imports an existing Nuvio collection JSON document before entering the existing hierarchy workspace.

This is an entry/import milestone, not a complete editor. The existing controller remains the sole owner of project state, while the importer remains authoritative for JSON parsing, structural validation, source classification, ordering, and unknown-field preservation.

## Screen and controller boundary

`builder/src/main.jsx` still creates one controller outside React rendering and passes it to `BuilderApp`. `BuilderApp` subscribes through the existing `useSyncExternalStore` adapter before choosing either the welcome or workspace presentation. The controller is therefore subscribed on both screens and is never replaced during a transition.

Only the following presentation/transport values use local React state:

- `welcome` or `workspace` screen;
- selected browser file;
- pasted text;
- UI-owned import diagnostics;
- current asynchronous import action.

Project, collection, folder, source, selection, dirty, migration-preview, and controller diagnostic values remain in the controller snapshot. Refresh creates the normal production presentation again and returns to welcome; there is no persistence, route, or browser-history entry.

Welcome project actions are mutually exclusive. A synchronous in-flight gate held by the welcome presentation protects the shared controller before React state can repaint. While Start New Project, file import, or pasted import is active, all five project-changing controls are disabled: the start button, file input, file-import button, pasted textarea, and pasted-import button. A second action is ignored while the gate is held. Pasted import yields one browser task after setting its busy presentation so disabled controls and **Importing…** can paint before synchronous controller parsing begins. Success and every structured or unexpected failure release the gate and clear the busy presentation; successful local input cleanup happens before the final workspace transition.

## Start New Project

`startNewBuilderProject(controller)` calls:

```js
controller.startNewProject({ title: "Untitled project" })
```

A successful result clears the controller project to one clean empty project and enters the workspace. It creates no collection or folder. Failure remains on welcome and uses the controller's structured operation diagnostic.

## Pasted JSON import

The labelled multiline input retains the exact entered text. The UI trims only to detect a visibly empty submission. Non-empty text is passed unchanged to:

```js
controller.importJsonText(text, { projectTitle: "Imported project" })
```

Empty text returns `IMPORT_TEXT_REQUIRED` at `$ui.import`. The UI never calls `JSON.parse`, and no import applies migration automatically. A failed controller import stays on welcome, retains the pasted text, and preserves the previous project atomically. Success clears the textarea, leaves the imported project clean, and enters the workspace.

## Local JSON-file import

The labelled file control accepts `.json,application/json`. Selection alone never imports; the selected filename is shown and the user must activate **Import selected file**. The browser transport helper validates the file, calls `await file.text()`, then delegates the original string to `controller.importJsonText`.

A file is supported when its trimmed filename ends in `.json` case-insensitively or its MIME type is `application/json`. The maximum accepted size is exactly 10 MiB (`10 * 1024 * 1024` bytes). Larger files are rejected before reading.

The builder-only project title is the trimmed filename with one final case-insensitive `.json` suffix removed. A blank or unusable result becomes `Imported project`. Imported collection and folder titles are untouched.

Stable UI-owned diagnostics are:

| Code | Message |
| --- | --- |
| `IMPORT_TEXT_REQUIRED` | `Paste a Nuvio collection JSON document before importing.` |
| `IMPORT_FILE_REQUIRED` | `Choose a JSON file before importing.` |
| `UNSUPPORTED_IMPORT_FILE` | `Choose a JSON file to import.` |
| `IMPORT_FILE_TOO_LARGE` | `Choose a JSON file smaller than 10 MiB.` |
| `IMPORT_FILE_READ_FAILED` | `The selected JSON file could not be read.` |

Every UI diagnostic has exactly `code`, `path`, and `message`; the path is `$ui.import`. Browser exception messages and stack traces are not returned.

## Diagnostics and warnings

Welcome errors use `role="alert"` and show stable messages and codes. Controller import warnings remain non-fatal. After a successful warned import, the workspace shows a collapsed native `<details>` summary using **Imported with 1 warning** or **Imported with N warnings**. The bounded list contains only stable warning messages and codes; it does not expose the imported document.

Operation diagnostics and non-interactive migration notices retain their separate workspace treatment.

## Privacy boundary

Selected or pasted JSON is processed locally in the browser and is not uploaded. Welcome/import production modules do not use `fetch`, XMLHttpRequest, WebSocket, `sendBeacon`, FormData submission, analytics events carrying file content, object URLs, localStorage, IndexedDB, service-worker persistence, or external resources. Imported JSON is not logged, placed in URLs, rendered back into the DOM, or stored as original text in controller state.

## Accessibility and responsive behavior

Each screen renders exactly one page-level `h1`. Welcome uses labelled file and textarea controls, visible selected-file text, valid description targets, real forms/buttons, a real root anchor, live filename announcement, `aria-busy` state, disabled in-progress actions, visible focus treatment, and approximately 48px action targets. It does not use application, dialog, tab, or tree roles.

The layout is mobile-first for 360, 384, 393, 402, and 412px. Inputs remain within the viewport, filenames wrap, and actions stack. The 768px layout remains restrained; at 900px and above the two import methods use balanced columns. The existing workspace behavior remains unchanged at its mobile widths and at 1024 and 1280px.

## Stable DOM markers

The welcome milestone adds:

- `data-builder-welcome="true"`;
- `data-action="start-new-project"`;
- `data-action="import-file"`;
- `data-action="import-pasted-json"`;
- `data-import-control="file"`;
- `data-import-control="pasted-json"`.

The existing builder root, workspace shell, backlink, panel, action, and node markers remain unchanged.

## Deliberate exclusions

This milestone does not add export, save/download, copy JSON, persistence, recent files, autosave, service workers, return-to-welcome or open-another-file actions, dirty-replacement UI, drag-and-drop, the File System Access API, URL/network import, Nuvio connections, login, authentication, editing, source creation, deletion, reordering, migration actions, automatic migration, TMDB search, addon loading, artwork tools, Ultra MAX or AIO Metadata conversion, account-manager transforms, Trakt, language support, routing, React Router, v1 runtime changes, a v1 builder link, Worker/CSP/CORS changes, dependencies, lockfile changes, Pages allowlist/preparation/deployment changes, or unrelated cleanup.

## Next likely milestone

A later separately approved issue can add one contained edit or export workflow. It must retain controller ownership, preservation-first import/serialization, explicit dirty replacement decisions, and the established local-only boundary.
