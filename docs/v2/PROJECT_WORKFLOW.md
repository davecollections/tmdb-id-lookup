# TMDB ID Lookup — Project Workflow

Status: Durable owner, planning, repository, and review process

Last reviewed: 2026-09-14

This document describes how Dave, the ChatGPT planning/review chat, Codex, GitHub, and repository evidence work together. Repository-specific enforceable rules remain in [`AGENTS.md`](../../AGENTS.md); current product direction is in [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md).

## 1. Roles

### Dave

- Owns product decisions and final approval.
- Supplies manual UI, artwork, and Nuvio-client evidence where repository checks cannot establish behaviour.
- Approves task scope (with or without an issue), pull-request creation, merge, production Worker deployment, and branch cleanup.
- May challenge ChatGPT or Codex and expects them to challenge risky assumptions appropriately.

### ChatGPT planning and review chat

- Investigates, reconstructs product context, and prepares focused Codex prompts.
- Reviews completed branches and pull requests independently.
- Tracks continuity and prepares handovers.
- Does not edit the repository unless Dave explicitly asks.
- Separates evidence, inference, recommendation, and owner decision.

### Codex

- Reads repository guidance, the approved task scope, the relevant issue when one exists, and required specialist documentation.
- Performs only the approved repository changes.
- Selects checks proportionate to the change and reports evidence; commits and pushes only after Dave authorises them.
- Stops at owner, manual-test, pull-request, and merge gates.
- Never deploys the production Cloudflare Worker or requests its secrets.
- Does not broaden scope to solve adjacent problems.

## 2. New chat versus same chat

Dave decides externally when to start a new Codex chat. Use a new chat when:

- beginning a separately scoped repository task, whether issue-backed or no-issue;
- the previous task is complete;
- fresh context is needed to load substantially updated repository guidance.

Continue in the same Codex chat when:

- refining the current task or addressing its review findings;
- committing or pushing follow-up changes on the same branch;
- opening or reviewing the approved pull request for that task;
- completing its approved merge and branch cleanup.

Continuity follows the current task, branch and PR through review and closeout; an issue is not required for that continuity.

The first prompt in a new Codex chat begins with:

`Rename this chat to: <descriptive title>`

Never include `Start a new Codex chat` inside the copyable Codex prompt.

Every follow-up prompt in the same Codex chat begins with:

`Continue in the current Codex chat. Do not rename it.`

Do not repeatedly ask an existing chat to rename itself. Provide prompts as one uninterrupted copyable block where practical.

## 3. Model, effort, and speed guidance

This is an operating preference, not a repository requirement:

- Model: GPT-5.6 SOL.
- Speed: Fast.
- High effort: contained changes, UI fixes, and straightforward migrations.
- Xtra High effort: architecture, shared modules, importers, serializers, cache pipelines, compatibility research, and normal substantial features.
- Ultra effort: broad audits, major restructuring, or unusually risky cross-system work.

The planning chat recommends effort for each task based on scope and risk.

## 4. Issue and branch workflow

### Discovery before issues

Dave and the ChatGPT planning/review chat may discuss, compare, investigate, and decide whether repository work is justified before an issue or branch exists. Read-only research does not require either. Roadmap ideas do not automatically become issues merely because they exist.

An **issue** records planning and why the work matters when a durable record is useful. Use one for substantial features, bugs needing investigation, compatibility/evidence investigations, architectural/refactor work, and substantial or multi-step product changes when it adds planning value. Small or medium isolated improvements with clear scope, documentation corrections, copy changes, maintenance and other bounded tasks can proceed without one.

A **branch** isolates one bounded task. A **PR** records the exact repository change, final-head CI and integration. Both are required for every repository change, including tiny work. For no-issue tasks, the approved scope and PR explain the change without inventing an issue.

The two paths are:

- **Substantial / planning-heavy work:** discussion → focused issue → branch → implementation/review → PR → merge.
- **Bounded no-issue work:** discussion/approval → branch → implementation/review → PR → merge.

Both follow the same review and integration process:

1. Agree the task scope; create or use a focused issue when durable planning/tracking is useful.
2. Verify updated `main`, then create a dedicated branch for that task.
3. Implement the approved scope. Run focused checks and broader validation when warranted by the change, including owner/manual evidence where needed.
4. Prepare the branch for owner/review-chat inspection. Commit and push only after Dave authorises them.
5. Dave authorises opening the PR. PR CI validates the final pushed head; review any later changes against the updated head.
6. Dave approves merge after the required checks and review pass. Use a normal merge commit unless he explicitly chooses another method.
7. Merge through the PR, using issue-closing syntax where appropriate when an issue exists.
8. Verify applicable issue closure, post-merge checks and automatic Pages publication. Perform approved branch cleanup and return to clean synchronized `main`.

Earlier direct branch merges are historical practice, superseded by the PR gate for all repository changes. There is no direct-main exception for tiny work.

The following remain absolute:

- one bounded task per branch; when issue-backed, keep it focused on that issue;
- do not open a PR unless Dave asks;
- do not merge unless Dave explicitly approves;
- do not squash, rebase, or force-push unless Dave specifically authorises it;
- do not close an associated issue or delete branches before successful merge, applicable checks and approval.

## 5. Repository preflight

Before repository-changing work begins:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
```

This formal Git preflight is not required for ordinary conversation or read-only product research. Before edits begin, confirm that `main` equals `origin/main` and the worktree is clean. Inspect every unexpected newer commit before continuing. Legitimate automated maintenance may be accepted only after confirming that it does not overlap the task. Stop for conflicts, unexpected manual changes, unrelated local work, or ambiguous scope.

## 6. Scope control

- Every repository-changing task uses one dedicated branch and PR for one bounded outcome; an issue is optional when no separate planning record is needed.
- Do not begin a second task on the current branch. If issue-backed, keep work limited to that focused issue.
- Do not work directly on `main`.
- Do not force-push or rewrite reviewed commits.
- Do not include unrelated cleanup.
- Do not hide production fixes inside documentation or test-only tasks.
- Do not add dependencies without explicit approval.
- Preserve stable V1 and the current Builder contract unless the approved task scope explicitly changes them.
- Treat a comparison project as research, not permission to copy code, wording, branding, layout, data, or artwork.

## 7. Review and testing gates

Run checks when they answer an unanswered question about the change. During implementation, run focused checks and tests introduced or materially affected. Broaden to the full suite when scope or regression risk warrants it; for meaningful implementation, this normally happens once around implementation/owner-review readiness when useful. Documentation/copy-only and bounded maintenance work can use targeted validation when it cannot affect runtime behavior.

PR CI remains independent evidence for the final pushed head. Passing CI on the unchanged reviewed head does not require another automatic full local run immediately before merge. New changes, failures or unresolved evidence can justify further checks; reaching a new stage alone does not. Keep `git diff --check` and worktree/status checks as lightweight hygiene.

Repository checks do not replace manual UI or Nuvio-client testing where visual or runtime evidence matters.

- Dave’s UI/flow review is mandatory after major visible phases and specifically after collection/folder presentation work before source creation begins.
- Visual judgement, artwork publication, import behaviour, and client compatibility may require owner evidence.
- Report material findings as soon as they are known.
- A failed check, conflict, or ambiguous evidence stops progression until resolved.
- Resolve required implementation checks and owner evidence before opening the PR. Then let PR CI validate the pushed head; do not merge while required final-head checks or evidence are pending or failing.
- Do not present a build-specific observation as a universal Nuvio guarantee.

Detailed validation scope and live-versus-pure-unit policy are owned by [`docs/TESTING.md`](../TESTING.md). Risk-based validation does not permit bypassing, fabricating or silently downgrading required live evidence. External-service mounted, integration, end-to-end, owner-review, and live-behaviour evidence must use the approved production integration path; an unavailable service is reported as an external failure rather than replaced with fabricated behaviour.

### Production Worker owner gate

Codex never deploys the production Cloudflare Worker. When an approved task changes Worker source:

1. Codex implements and fully tests the complete Worker source on the task branch.
2. Before commit or publication, Codex gives Dave the complete reviewed working-tree Worker source, its exact deployment-handoff source-byte SHA-256, the current branch and HEAD as repository context, and deterministic test evidence, then stops. When the change is uncommitted, branch and HEAD do not identify the changed Worker source.
3. Dave manually replaces and deploys that complete source in Cloudflare.
4. Dave replies `Worker deployed` and supplies the deployment/version identity when available.
5. Only then may Codex run the separately approved live Worker/Builder validation through production.
6. Commit, push, and pull-request publication remain separate later owner gates.

The deployment-handoff source SHA-256 identifies the exact reviewed byte sequence supplied or intended for owner deployment. A tracked Git blob OID becomes useful only after the reviewed source is later committed or published; record and compare it then to verify that repository source remained the reviewed source. It is not a prerequisite for the pre-commit owner-deployment handoff. If `git hash-object` is deliberately used on an uncommitted file, describe the result as a computed blob OID, not a tracked blob identity, and do not make it mandatory. Git normalizes tracked Worker text to LF while a Windows checkout may contain CRLF, so a CRLF-only working-tree SHA-256 difference is not tracked-source divergence. Do not claim byte-for-byte equivalence with deployed source unless the exact compared byte sequence establishes it. Worker deployment is separate from automatic main-triggered GitHub Pages publication, and Codex must not silently deploy, patch production, or ask for credentials.

## 8. Pull requests

- Pull requests are the final repository integration gate for every change, whether issue-backed or no-issue, V1 or V2.
- Codex does not open one automatically.
- The ChatGPT planning/review chat reviews the task changes before PR creation; the final pushed head must contain those reviewed changes.
- Dave authorises pull-request creation.
- When an issue exists, the PR body links it and uses closing syntax where appropriate. Otherwise, it records the approved task scope, reason for the change and validation without inventing an issue.
- The final head SHA must remain the SHA that was reviewed; later changes require renewed review.
- All PRs use a normal merge commit by default unless Dave explicitly chooses another method.
- Do not squash, rebase, or force-push unless Dave specifically authorises it.
- Successful merge is followed by issue-closure verification when applicable, required post-merge checks, and automatic Pages-publication verification when triggered, before approved branch cleanup.

## 9. Final reports

Every Codex implementation report includes:

- issue number and URL when present, or an explicit statement such as `Issue: none; approved no-issue maintenance task`;
- branch and commit SHA, or current HEAD and uncommitted status when stopping before commit;
- complete changed-file list;
- checks and results, with the scope/risk reason for broader validation not run;
- production behaviour impact;
- assumptions and unverified points;
- whether production files changed;
- confirmation that no unrelated changes were made;
- current branch and worktree status;
- the recommended next step without beginning it.

PR and merge reports also include:

- PR URL;
- final checks;
- merge SHA and method;
- issue-closure state when applicable, otherwise `No issue`;
- local and remote branch-cleanup state;
- final `main` synchronization.

## 10. Cross-project artwork boundary

- `nuvio-assets` owns artwork generation, replacement, review, publication, runtime schema, and asset-contract questions.
- `tmdb-id-lookup` consumes the approved published runtime.
- V2 must not silently work around an assets-owned defect.
- Exact entity type plus TMDB ID is authoritative; names do not substitute for typed identity.
- When repository evidence is insufficient, prepare a focused question for the assets chat.
- Do not mix repository writes between the two workstreams or use a V2 task to alter the assets repository.

## 11. Continuity and chat handovers

The project has previously reached the end of a long planning chat without a useful warning. Long phases therefore need proactive continuity management.

Before a major new phase in an already long chat, prepare a handover rather than waiting for context failure. Include:

- current repository and relevant branch SHA;
- completed tasks, associated issues when present, and pull requests;
- current architecture and evidence boundaries;
- confirmed product decisions;
- unresolved questions;
- the next approved step.

Repository documents remain the durable source of truth. Conversational handovers should not be committed unless they are specifically needed and approved. The planning chat should warn Dave when continuity risk is becoming material, but must not promise a precise context percentage when none is available.

## 12. Decision quality

Dave’s standing expectation is:

- do not agree merely for the sake of agreeing;
- acknowledge useful ideas;
- challenge risky, inconsistent, unnecessarily complex, or low-value ideas;
- offer a better bounded alternative when one exists;
- do not overengineer;
- distinguish technical fact, recorded evidence, inference, recommendation, and owner decision;
- keep unresolved product choices open instead of silently converting them into requirements.
