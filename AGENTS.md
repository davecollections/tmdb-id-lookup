# Repository Working Guide

## Scope and required reading

These instructions apply to the entire repository unless a nested `AGENTS.md` or `AGENTS.override.md` supplies narrower rules.

Before v2, builder, Nuvio schema, or export work, read:

- `README.md`
- `docs/v2/BUILDER_KNOWLEDGE.md`
- the relevant GitHub issue when one exists, otherwise the approved task scope

Before v2 product, UX, startup, template, recipe, Search/Add, presentation, or project-workflow work, also read:

- `docs/v2/BUILDER_PRODUCT_PLAN.md`
- `docs/v2/PROJECT_WORKFLOW.md`

Before hierarchy creation or a new hierarchy-family task, also read:

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

- Never work directly on `main`. Every repository-changing task needs its own dedicated branch from updated `main` and a pull request, including tiny changes.
- Issues provide a durable planning/why record when useful; they are not required for every change. Use one for substantial features, bugs needing investigation, compatibility/evidence investigations, architectural/refactor work, and substantial or multi-step product changes when that record adds value.
- Small or medium isolated improvements with clear scope, documentation corrections, copy changes, maintenance, and other bounded work may proceed without an issue. Discussion and read-only investigation do not require one. Roadmap ideas do not automatically become issues; create focused issues when work is selected and durable tracking is useful.
- Keep one bounded task per branch. For issue-backed work, keep the branch focused on that issue; for no-issue work, the branch and PR provide the change record. Do not include unrelated cleanup.
- Inspect unexpected main commits, including legitimate automated maintenance, before synchronising them into task work.
- Commit, push, and open a pull request only after Dave authorises those actions. A PR is the final repository integration gate for all changes, not just V2 work.
- Use a normal merge commit by default. Do not squash, rebase, or force-push unless Dave explicitly authorises it. Link the issue and use issue-closing syntax where appropriate when an issue exists.
- Do not merge, close an associated issue, or delete the branch until Dave explicitly approves after the relevant review and validation.
- After successful merge, verify applicable post-merge checks and automatic Pages publication before approved local/remote branch cleanup. Return to clean, synchronized `main`.
- Stop and report conflicts, unexpected local changes, or ambiguous scope.
- Use clear commits and report the final commit hash, or current HEAD and uncommitted status when stopping before commit.

## Production safeguards

- Preserve existing export behaviour unless the approved task scope explicitly changes it.
- Preserve imported unknown/community JSON fields wherever possible.
- Do not invent or guess unsupported Nuvio source types.
- Do not represent direct movie, direct series, or season sources as supported unless current Nuvio evidence confirms them.
- Never commit API keys, bearer tokens, credentials, or private data. TMDB credentials remain behind the Cloudflare Worker.
- Do not broaden Worker routes, CORS, CSP, or external hosts without explicit owner-approved scope.
- Codex never deploys the production Cloudflare Worker. Worker changes stop at the separately authorised owner-deployment gate described in `docs/v2/PROJECT_WORKFLOW.md` and `cloudflare-worker/README.md`.
- Do not add production dependencies without explicit approval.
- Check the licence before reusing external code. Studying patterns is not permission to copy code.

## Upstream-first Nuvio review

- Before designing or implementing Nuvio-facing behaviour, inspect the relevant current upstream implementation where available: models, import/validation, serialization/preservation, resolver/runtime, editor/UI, and tests. Use upstream Nuvio code as authoritative evidence for the inspected client's contract and behaviour, then implement Dingo's validators and behaviour independently.
- Inspect relevant NuvioTV, NuvioDesktop, NuvioMobile, and nuvio.tv/web evidence in proportion to the feature and risk of client divergence; every task does not need every client. Record material differences and explicitly decide Dingo's supported contract from the evidence and approved scope.
- Retain Dingo's preservation-first import/edit/serialization, no silent normalization of unsupported imports, and exact/fail-closed Preview when semantics cannot be represented safely. Emit correct supported Nuvio JSON without reproducing known client bugs, and retain approved Dingo UX/product decisions that intentionally differ.
- The current Nuvio repositories used as upstream source evidence are GPL-3.0. Verify the specific repository licence before any code reuse. Extract contract facts and expected behaviour as evidence; do not copy substantive implementation code merely because it is available. Copying or adapting substantive GPL code requires deliberate review and acceptance of licensing compatibility and obligations first.
- This is a proportionate discovery step, with independent implementation tested against the evidence, not a mandatory audit or a new investigation issue for every feature. The existing issue/branch/PR policy remains unchanged; see [the workflow explanation](docs/v2/PROJECT_WORKFLOW.md#upstream-first-nuvio-review).

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
- Before adding a Builder component, helper, picker, selector, catalogue, search hook, ordered-selection store, plan, modal, validator, source constructor, identity or duplicate helper, artwork resolver, review block, presentation control, Preview shell/provider, requester, response normalizer, request coordinator, bounded cache, responsive shell, focus/history/scroll behavior, controller operation, test fixture, or test harness, inspect the existing Builder for the same or substantially similar behavior. Prefer, in order: direct reuse; extraction into a shared abstraction; extension of an existing abstraction; and new code only when semantics materially differ. Keep family-specific semantics in thin adapters instead of forcing them into a generic abstraction for symmetry. Do not create parallel screen-specific copies merely because consumers live in different flows; record any material semantic difference in the issue when present, otherwise the PR, and in the final report.
- New hierarchy families must use the scope-aware creation registry, generate ordinary Collection → Folder → Source nodes through an ephemeral revalidated plan, and apply atomically through existing controller operations; do not add parallel launchers or persisted hierarchy/recipe nodes.
- Do not add an arbitrary bulk-selection hard cap. Keep one intentional scroll owner per creation stage and verify that partially clipped card focus leaves the outer modal and document stable.
- Bulk hierarchy creators expose only batch-safe artwork/presentation choices; per-item artwork URLs and focus overrides belong to ordinary Edit Folder unless focused owner-approved scope establishes a real batch-edit need.
- Source-family sort values must be evidenced by that family's current contract; shared sort UI does not authorize normalizing options across families.
- Naming normalization is family-specific. Preserve meaningful semantic wording and do not copy cleanup rules across families merely to shorten generated names.
- Keep new builder work isolated from v1 until explicit integration work is approved.
- Do not introduce React/Vite merely because comparison sites use it.
- Use wizard or step-based flows for complex collection creation.
- Give controls large, mobile-friendly tap targets.
- Use progressive disclosure for advanced options.
- On browse/select catalogue screens, do not auto-focus Search or automatically summon the mobile keyboard; focus Search only after explicit user interaction. Auto-focus editable text only when typing is the primary task and the mobile keyboard does not obstruct the intended flow.
- Test mobile-first work at common widths including 360, 384, 393, 402, and 412 pixels.
- Treat desktop layouts as polished extensions of the mobile-first layout.
- Follow a modern, dark, sleek direction with restrained TMDB-inspired blue, cyan, and green accents.
- The visual direction is not warm or cosy.
- For full-card choices, indicate retained/additive multi-selection with green and single selected/current choices with teal/cyan, using a surface and border plus a non-hue structural inset; visually hide the native checkbox/radio while preserving its semantics, programmatic checked state, and complete card-level keyboard focus. Do not render a radio dot, circular checkbox substitute, decorative tick, or plus-to-tick marker. Shape choices may also strengthen the selected schematic preview. Compact pills, segments, tabs, and retained-choice buttons use selected styling only with correct `aria-pressed`/`aria-selected` semantics. Independent booleans keep a visible conventional checkbox or switch and a neutral container. Semantic Include/Exclude takes precedence over ordinary cardinality: Include mode and included selections retain established green; Exclude mode and excluded selections retain red with dashed borders. Any/All and ordinary exclusive choices remain cyan. Disabled/unavailable remains grey, and success may separately use scoped green. Do not infer semantics from input type. Do not add a coloured leading/left-edge rail for selection. Notices, warnings and errors also prohibit emphasized left edges: use a subtle semantic tint and an even thin border around the full message, following the approved People warning treatment. Structural hierarchy-diagram lines and drag-placement indicators are unaffected. Keep selected state distinguishable in grayscale and forced colours.
- For source review, keep candidate rows visually neutral and communicate readiness, destination duplicates, and elsewhere matches with concise shared status text. Use semantic notices only when explanation, locations, or an override action is needed; differently configured valid sources remain normally addable unless a future approved related-variant feature says otherwise.
- Do not copy reference-site branding, wording, or layouts.
- For long-running phases, prepare a handover before context loss rather than relying on chat memory.

## Verification

[`docs/TESTING.md`](docs/TESTING.md) owns risk-based validation and the live-versus-pure-unit evidence boundary. Run checks to answer unanswered questions about the change, not merely because another workflow stage has been reached.

- During implementation, run focused checks for the changed area and tests introduced or materially affected by the change.
- Run broader/full validation when scope or risk warrants it. For meaningful implementation, the full suite normally runs once around implementation/owner-review readiness when it provides useful regression evidence. `scripts\check.cmd` is the full Windows entry point; `node scripts/check-all.mjs` runs the equivalent sequence.
- PR CI provides independent evidence for the final pushed head. If the reviewed head is unchanged and PR CI passes, do not automatically repeat the full local suite immediately before merge.
- Documentation/copy-only and bounded maintenance changes use proportionate checks. When they cannot affect runtime behavior, inspect Markdown, practical local links/heading targets, stale wording, formatting, and Git hygiene instead of running the full application suite.
- Visual/runtime/manual evidence remains required when the change depends on it. Required external-service mounted, integration, end-to-end, owner-review, or live-behaviour checks must use the approved production integration path; risk-based selection is not permission to fake, bypass, or silently downgrade that evidence.

Before reporting completion, run these lightweight hygiene checks and report the relevant validation performed:

```powershell
git diff --check
git status --short
```

## Final reporting

Every implementation report must include:

- issue number and URL when present; otherwise an explicit no-issue description, such as `Issue: none; approved no-issue maintenance task`
- branch and commit hash, or current HEAD with the uncommitted status
- files changed
- checks run, results, and the scope/risk reason for any broader validation not run
- production behaviour impact
- assumptions or unverified points
- whether production files changed
- confirmation that no unrelated changes were made
- the recommended next step, without starting it or creating an issue unless asked
