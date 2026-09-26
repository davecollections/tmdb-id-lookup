# Builder Welcome Screen and Local JSON Import

Status: Local JSON import was introduced by [#41](https://github.com/davecollections/tmdb-id-lookup/issues/41); unified connected Import is merged through #238 / PR #239 and shared PIN/retained Send presentation through #244 / PR #245.

Last reviewed: 2026-09-26

## Purpose and scope

The `/builder/` entry opens the welcome screen for **Dingo’s Collection Builder**, with **Built for Nuvio collections** and **Create, import and organise Nuvio collections.** It starts a clean project or offers Import from Nuvio, Import from file and Import from JSON before entering the hierarchy workspace. V2 remains a development preview under its separate release boundary.

The controller remains the sole owner of project state, while the importer owns JSON parsing, structural validation, source classification, ordering and unknown-field preservation. This document describes Welcome and local File/JSON import; the [connection contract](./BUILDER_NUVIO_CONNECTION.md) owns connected Import and PIN behavior.

## Workspace Import and Merge artwork (#259)

The workspace header now says **Import**; **Export & Send** is unchanged. The modal reuses Welcome's `ImportMethods` presentation, method order, native file control and pasted-text form. It does not return to Home. Workspace actions read **Review selected file** and **Review pasted JSON**; Welcome keeps direct-import actions and Start a new collection behavior.

Workspace review calls the same `parseNuvioJsonText` importer without a controller, retaining frozen exact incoming Collection values, counts, warnings and limited-source notes. It neither serializes/rewrites the snapshot nor uploads JSON. File type, exact 10 MiB limit, filename title and sanitized diagnostics remain unchanged. Drafts and the native file input stay mounted through method switching; hidden forms cannot focus or submit. Cancel during a file read invalidates late completion.

Workspace Nuvio runs inside the existing Import content panel. `NuvioImportFlow` owns the shared login, account, profiles, avatar/PIN, snapshot, expiry, notices and review presentation; it owns no portal, dialog, trap or body lock. `WorkspaceImportDialog` owns the sole backdrop, dialog semantics, Visual Viewport handling, scroll area, focus trap, body lock and Close/Cancel. Its outer heading remains **Import** while subordinate Nuvio headings advance through Connect, Select profile and Review. Desktop retains the method column alongside the flow (sticky during longer reviews when height permits); phones stack methods above it. The existing bounded scroll/focus restoration helper brings a newly focused stage into view without focusing a text field.

The workspace Nuvio card is an ordinary selected method (`aria-pressed`), with no dialog-trigger semantics. Switching away unmounts its flow and cancels reviewed snapshot authority, retaining the valid memory-only account/profile session. Returning requires a new valid snapshot and resets mode/artwork choices. Active login, refresh, PIN and pull operations disable method switching through the existing synchronous busy guard. Outer Close cancels pending request/review authority and restores workspace Import; explicit Disconnect retains its established meaning. Review Back returns locally to profiles. File/JSON retain local-browser privacy copy; Nuvio displays the existing direct-to-Nuvio credential and memory-only-session explanation.

`NuvioConnectionDialog` remains the standalone shell around that same flow for Welcome and Export & Send → Merge instead. Welcome keeps its dialog-trigger card and direct file/JSON import. No workspace suspend/hide handoff or second Nuvio modal remains. This amendment leaves transport, session, PIN, planner and controller behavior unchanged. Owner acceptance before merge still requires a real authenticated snapshot reaching shared review in the embedded flow, plus physical-phone review; mocked mechanics and responsive evidence do not satisfy that gate. Destructive Replace is not required for that acceptance.

`useCollectionImportReview`, `CollectionImportReview` and `importCollectionSnapshot` share the review/application contract. The Nuvio adapter additionally verifies exact connection-snapshot authority. All sources use `appendImportedCollections` for Add, `mergeImportedCollections(value, { artworkPolicy })` for Merge, and `importValue` for Replace. Replace requires an explicit irreversible confirmation initially focused on **Keep current work**. The existing Collections-or-dirty rule defines current work; an empty workspace reviews then opens on the final action without mode/policy choices.

All modes bind the reviewed project reference. Changed content blocks Apply until **Review current project** resets the choices; selection-only changes are harmless. New incoming snapshots reset mode and artwork policy. Policy/mode switching is preview-only and never rereads a file/refetches Nuvio.

### Artwork in exact matches

| Policy | Matched-node result |
| --- | --- |
| **Keep existing artwork** (default / `keep-existing`) | Keep every existing field exactly, including absence, blanks, nulls and unsupported values. |
| **Fill missing artwork** (`fill-missing`) | Fill missing fields from usable incoming text; never replace usable existing artwork. |
| **Prefer incoming artwork** (`prefer-incoming`) | Fill missing fields or replace different usable text when usable incoming text exists; otherwise retain existing artwork. |

The allowlist is Collection `backdropImageUrl` and Folder `coverImageUrl`, `coverEmoji`, `heroBackdropUrl`, `heroVideoUrl`, `titleLogoUrl`, `focusGifUrl`. Hidden/compatibility-only fields participate without new ordinary editing controls. Missing means absent/null/empty/whitespace-only string. Usable means a nonblank string under the existing text contract, copied exactly without new URL validation, trimming or normalization. Other non-null JSON types remain unsupported/preserved; existing unsupported values are never overwritten, and unsupported incoming values do nothing.

This is field-by-field. Only changed allowlisted fields gain editable overlays. Existing `rawImported` remains unchanged; incoming unknown fields never overlay matched nodes. Identical values stay unchanged. All non-artwork settings (IDs, titles, layout, shape, title visibility, Focus GIF enabled), matching, Source equality/dedupe and order remain current. Unmatched inserted nodes retain complete incoming data through the existing import contract.

The same pure `planCollectionMerge(current, value, { artworkPolicy })` supplies preview and Apply. Its separate `artworkCounts: { kept, filled, replaced }` counts fields on matched nodes: retained usable existing text; missing → usable; and different usable → usable. Missing-both and unsupported existing fields do not count. Identical usable text counts as kept. The controller returns these counts beside unchanged structural counts and commits at most one revision. Unknown policies fail closed; omitted policy defaults to Keep existing.

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
