# Builder Welcome Screen and Local JSON Import

Status: Local JSON import was introduced by [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41); unified connected Import is merged through #238 / PR #239 and shared PIN/retained Send presentation through #244 / PR #245.

Last reviewed: 2026-09-26

## Purpose and scope

The `/builder/` entry opens the welcome screen for **Dingo’s Collection Builder**, with **Built for Nuvio collections** and **Create, import and organise Nuvio collections.** It starts a clean project or offers Import from Nuvio, Import from file and Import from JSON before entering the hierarchy workspace. V2 remains a development preview under its separate release boundary.

The controller remains the sole owner of project state, while the importer owns JSON parsing, structural validation, source classification, ordering and unknown-field preservation. This document describes Welcome and local File/JSON import; the [connection contract](./BUILDER_NUVIO_CONNECTION.md) owns connected Import and PIN behavior.

## Screen and controller boundary

`builder/src/main.jsx` still creates one controller outside React rendering and passes it to `BuilderApp`. `BuilderApp` subscribes through the existing `useSyncExternalStore` adapter before choosing either the welcome or workspace presentation. The controller is therefore subscribed on both screens and is never replaced during a transition.

Welcome’s local presentation/transport state includes:

- `welcome` or `workspace` screen;
- selected import method and browser file;
- pasted text;
- UI-owned import diagnostics;
- current asynchronous import action.

Project, collection, folder, source, selection, dirty, migration-preview and controller diagnostics remain in the controller snapshot. BuilderApp separately owns the memory-only Nuvio connection and Send coordinator; neither is project data. Refresh returns to Welcome disconnected, without persistent project/session storage. Retained dispatched Send evidence keeps a quiet Export & Send/history entry or unresolved-attention entry reachable while the current page remains open.

Welcome project actions are mutually exclusive. A synchronous in-flight gate protects the shared controller before React repaint. Starting a project or importing disables competing project actions and import-method changes; inactive File/JSON forms cannot receive focus or submit. Pasted import yields one browser task so its busy presentation can paint before synchronous parsing. Success and structured/unexpected failure release the gate; local input cleanup completes before the workspace transition.

## Start New Project

Visible wording now speaks about creating a Nuvio collection rather than creating a collection file, while avoiding a saved or switchable project model. The create route reads **Start a new collection**, **Open a clean workspace and build your Nuvio collection**, and **Create new collection**. `startNewBuilderProject(controller)` still calls the existing internal controller method:

```js
controller.startNewProject({ title: "Untitled project" })
```

A successful result clears the controller project to one clean empty project and enters the workspace with its existing Create Collection picker open on the first render. The same canonical family registry, modal lifecycle and creation flows serve Welcome and ordinary workspace entry; starting alone creates no collection or folder. Cancelling this initial journey returns to Welcome and focuses Create new collection only while the exact opening project snapshot and controller revision remain unchanged and clean. Successful creation consumes the session and keeps normal workspace selection/focus. Imported/opened empty projects and later workspace creation have no special cancellation behavior. Failure remains on Welcome and uses the controller's structured operation diagnostic.

The import route reads **Open an existing collection** and initially shows **Choose an import method** / **Select an option to continue.** Its three controls are **Import from Nuvio**, **Import from file** and **Import from JSON**. File/JSON selection opens the local form; Nuvio opens the shared connection dialog directly. Switching methods retains the selected native file and pasted draft. Closing Nuvio restores its trigger and the local method/drafts. File wording remains **Choose a JSON file**, **Collection JSON file** and **Import selected file**; the native picker is the sole filename display.

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

Welcome errors use `role="alert"` and stable messages/codes; importer warnings remain non-fatal. Connected Import groups preservation/limited-editing notes in its Review. The workspace does not render an import-warning panel: connected Import supplies transient success feedback that survives selection/scrolling and clears on the next project content change.

Operation diagnostics and non-interactive migration notices retain their separate workspace treatment.

## Privacy boundary

Local File/JSON import reads and parses the selected or pasted document in the browser without uploading it. Its file/paste transport does not send imported JSON to analytics, logs, URLs or browser persistence, and original text is not stored in controller state. This local-import boundary does not describe optional Nuvio operations: connected Import and explicitly reviewed Send communicate directly with Nuvio through the separate connection contract. Ordinary Download/Copy requires no connection.

## Accessibility and responsive behavior

Each screen renders exactly one page-level `h1`. Welcome uses labelled file/textarea controls, native method buttons with correct selected/dialog semantics, real forms, live diagnostics, busy/disabled states and visible focus treatment. Hidden local forms cannot receive focus. The About control provides credits and access to the stable root lookup tool. Connected Import and Send reuse the existing modal focus/body-lock behavior.

The layout is mobile-first for 360, 384, 393, 402 and 412px. Inputs remain within the viewport and content wraps. From 900px, the compact method column sits beside the selected form; phone layouts stack the form below the methods. The JSON field scrolls internally and remains vertically resizable. See the connection contract for the unified Import presentation and responsive PIN placement.

## Stable DOM markers

The welcome milestone adds:

- `data-builder-welcome="true"`;
- `data-action="start-new-project"`;
- `data-action="import-file"`;
- `data-action="import-pasted-json"`;
- `data-import-control="file"`;
- `data-import-control="pasted-json"`.

Connected Import adds `data-action="open-nuvio-import"`; the local method controls use `choose-import-file` and `choose-import-json`. Retained Send history uses `open-nuvio-send-status`. Existing local transport markers remain unchanged.

The workspace can now return to welcome only after resetting the shared controller. Dirty workspaces require the inline discard flow documented in [BUILDER_AUTOMATIC_IDS_WORKSPACE_FLOW.md](./BUILDER_AUTOMATIC_IDS_WORKSPACE_FLOW.md).

## Historical issue #41 exclusions

The following exclusions describe issue #41 only and are retained as historical scope, not current product limitations. Later issues added editing, creation, manual Export, unified connected Import and Send.

This milestone does not add export, save/download, copy JSON, persistence, recent files, autosave, service workers, return-to-welcome or open-another-file actions, dirty-replacement UI, drag-and-drop, the File System Access API, URL/network import, Nuvio connections, login, authentication, editing, source creation, deletion, reordering, migration actions, automatic migration, TMDB search, addon loading, artwork tools, Ultra MAX or AIO Metadata conversion, account-manager transforms, Trakt, language support, routing, React Router, v1 runtime changes, a v1 builder link, Worker/CSP/CORS changes, dependencies, lockfile changes, Pages allowlist/preparation/deployment changes, or unrelated cleanup.

## Historical extension boundary

At the issue #41 checkpoint, the next milestone was a separately approved edit/export workflow. Editing and Export are now implemented; the [Product Plan](./BUILDER_PRODUCT_PLAN.md#18-roadmap-and-mandatory-gates) owns the current sequence. Persistence and a saved/switchable cloud-project model remain outside this local session flow.
