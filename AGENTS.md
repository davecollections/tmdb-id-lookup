# Repository Working Guide

## Scope and required reading

These instructions apply to the entire repository unless a nested `AGENTS.md` or `AGENTS.override.md` supplies narrower rules.

Before v2, builder, Nuvio schema, or export work, read:

- `README.md`
- `docs/v2/BUILDER_KNOWLEDGE.md`
- the relevant GitHub issue

Before v2 product, UX, startup, template, recipe, Search/Add, presentation, or project-workflow work, also read:

- `docs/v2/BUILDER_PRODUCT_PLAN.md`
- `docs/v2/PROJECT_WORKFLOW.md`

Before hierarchy creation or a new hierarchy-family issue, also read:

- `docs/v2/BUILDER_HIERARCHY_CREATION.md`
- the focused document for every existing family being reused or changed

`BUILDER_PRODUCT_PLAN.md` is the durable product-direction source. `PROJECT_WORKFLOW.md` is the durable Dave/ChatGPT/Codex process. Repository implementation, deterministic tests, and confirmed manual evidence override obsolete plans. Do not silently treat an open product decision as a confirmed requirement.

## Product boundaries

- v1 is the stable TMDB ID lookup and Nuvio JSON export application at the repository root.
- v2 is the active, isolated mobile-first visual Nuvio Collection Builder under `/builder/`, powered primarily by TMDB. It is not yet advertised as a released replacement for v1.
- Existing lookup and copy-ID workflows remain part of the product.
- Do not rewrite or remove stable v1 features merely to modernise the code.
- React/Vite under `/builder/` is the confirmed builder direction; keep domain, parsing, validation, migration, serialization, and ID logic framework-independent.
- Trakt integration is outside the current project scope unless explicitly approved in a future issue.

## Git and issue workflow

- Never work directly on `main`.
- Discussion, discovery, comparison, and read-only investigation do not require a GitHub issue.
- Before making a meaningful repository change, create or approve one focused GitHub issue and one dedicated branch from updated `main`.
- A substantial investigation may use an issue for durable tracking when helpful, but an issue is not required merely to explore an idea.
- Use one issue per branch. Inspect unexpected main commits, including legitimate automated maintenance, before synchronising them into task work.
- Keep work limited to the approved issue; do not include unrelated cleanup.
- Do not open a pull request unless Dave asks.
- After Dave authorises it, a pull request is the normal final review gate for meaningful v2 work.
- Do not merge, close the issue, or delete the branch until Dave explicitly approves after review and testing.
- Stop and report conflicts, unexpected local changes, or ambiguous scope.
- Use clear commits and report the final commit hash.

## Production safeguards

- Preserve existing export behaviour unless the issue explicitly changes it.
- Preserve imported unknown/community JSON fields wherever possible.
- Do not invent or guess unsupported Nuvio source types.
- Do not represent direct movie, direct series, or season sources as supported unless current Nuvio evidence confirms them.
- Never commit API keys, bearer tokens, credentials, or private data. TMDB credentials remain behind the Cloudflare Worker.
- Do not broaden Worker routes, CORS, CSP, or external hosts without explicit issue scope.
- Do not add production dependencies without explicit approval.
- Check the licence before reusing external code. Studying patterns is not permission to copy code.

## Nuvio source rules

The currently supported native TMDB source types are:

- `LIST`
- `COLLECTION`
- `COMPANY`
- `NETWORK`
- `DISCOVER`
- `PERSON`
- `DIRECTOR`

For future builder work:

- `sources` is the authoritative current source representation.
- `catalogSources` is a compatibility projection/fallback for addon-backed sources.
- Native TMDB sources do not belong in `catalogSources`.
- Addon-backed sources may have matching projections in both arrays when compatibility output requires them.
- Do not change existing v1 output merely to enforce a future canonical policy.
- Source and folder ordering is meaningful.
- Preserve imported opaque/community sources without guessing them into known types.
- Keep detailed evidence in `docs/v2/BUILDER_KNOWLEDGE.md`.

## Architecture and design

- Keep framework-independent source, validation, parsing, migration, serialization, and ID logic outside UI components.
- Before adding a Builder component, helper, picker, selector, catalogue, modal, validator, source constructor, identity or duplicate helper, review block, presentation control, responsive shell, focus/history/scroll behavior, controller operation, test fixture, or test harness, inspect the existing Builder for the same or substantially similar behavior. Prefer, in order: direct reuse; extraction into a shared abstraction; extension of an existing abstraction; and new code only when semantics materially differ. Do not create parallel screen-specific copies merely because consumers live in different flows; record any material semantic difference in the issue and final report.
- New hierarchy families must use the scope-aware creation registry, generate ordinary Collection → Folder → Source nodes through an ephemeral revalidated plan, and apply atomically through existing controller operations; do not add parallel launchers or persisted hierarchy/recipe nodes.
- Do not add an arbitrary bulk-selection hard cap. Keep one intentional scroll owner per creation stage and verify that partially clipped card focus leaves the outer modal and document stable.
- Bulk hierarchy creators expose only batch-safe artwork/presentation choices; per-item artwork URLs and focus overrides belong to ordinary Edit Folder unless a focused issue proves a real batch-edit need.
- Source-family sort values must be evidenced by that family's current contract; shared sort UI does not authorize normalizing options across families.
- Naming normalization is family-specific. Preserve meaningful semantic wording and do not copy cleanup rules across families merely to shorten generated names.
- Keep new builder work isolated from v1 until explicit integration issues are approved.
- Do not introduce React/Vite merely because comparison sites use it.
- Use wizard or step-based flows for complex collection creation.
- Give controls large, mobile-friendly tap targets.
- Use progressive disclosure for advanced options.
- On browse/select catalogue screens, do not auto-focus Search or automatically summon the mobile keyboard; focus Search only after explicit user interaction. Auto-focus editable text only when typing is the primary task and the mobile keyboard does not obstruct the intended flow.
- Test mobile-first work at common widths including 360, 384, 393, 402, and 412 pixels.
- Treat desktop layouts as polished extensions of the mobile-first layout.
- Follow a modern, dark, sleek direction with restrained TMDB-inspired blue, cyan, and green accents.
- The visual direction is not warm or cosy.
- For selectable option or choice cards, indicate selection with the established border, check or radio state, and restrained selected surface; do not add a coloured leading/left-edge accent rail solely to indicate selection. Reserve accent rails for non-selectable semantic messaging such as warnings, errors, or notices where appropriate.
- For source review, keep candidate rows visually neutral and communicate readiness, destination duplicates, and elsewhere matches with concise shared status text. Use semantic notices only when explanation, locations, or an override action is needed; differently configured valid sources remain normally addable unless a future approved related-variant feature says otherwise.
- Do not copy reference-site branding, wording, or layouts.
- For long-running phases, prepare a handover before context loss rather than relying on chat memory.

## Verification

At minimum, before reporting completion run:

```powershell
.\scripts\check.cmd
git diff --check
git status --short
```

Also run issue-specific checks and any tests introduced by the branch. After contract fixtures are merged, `scripts\check.cmd` should remain the main Windows entry point for frontend and contract validation.

## Final reporting

Every implementation report must include:

- issue number and URL
- branch and commit hash
- files changed
- checks run and results
- production behaviour impact
- assumptions or unverified points
- whether production files changed
- confirmation that no unrelated changes were made
- the recommended next issue, without creating it unless asked
