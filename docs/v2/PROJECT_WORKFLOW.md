# TMDB ID Lookup — Project Workflow

Status: Durable owner, planning, repository, and review process

Last reviewed: 2026-08-20

This document describes how Dave, the ChatGPT planning/review chat, Codex, GitHub, and repository evidence work together. Repository-specific enforceable rules remain in [`AGENTS.md`](../../AGENTS.md); current product direction is in [`BUILDER_PRODUCT_PLAN.md`](./BUILDER_PRODUCT_PLAN.md).

## 1. Roles

### Dave

- Owns product decisions and final approval.
- Supplies manual UI, artwork, and Nuvio-client evidence where repository checks cannot establish behaviour.
- Approves issue scope, pull-request creation, merge, production Worker deployment, and branch cleanup.
- May challenge ChatGPT or Codex and expects them to challenge risky assumptions appropriately.

### ChatGPT planning and review chat

- Investigates, reconstructs product context, and prepares focused Codex prompts.
- Reviews completed branches and pull requests independently.
- Tracks continuity and prepares handovers.
- Does not edit the repository unless Dave explicitly asks.
- Separates evidence, inference, recommendation, and owner decision.

### Codex

- Reads repository guidance, the relevant issue, and required specialist documentation.
- Performs only the approved repository changes.
- Runs checks and reports evidence; commits and pushes only after Dave authorises them.
- Stops at owner, manual-test, pull-request, and merge gates.
- Never deploys the production Cloudflare Worker or requests its secrets.
- Does not broaden scope to solve adjacent problems.

## 2. New chat versus same chat

Dave decides externally when to start a new Codex chat. Use a new chat when:

- starting a new GitHub issue;
- beginning a separately scoped implementation task;
- the previous issue is complete;
- fresh context is needed to load substantially updated repository guidance.

Continue in the same Codex chat when:

- refining the current issue;
- addressing review findings for that issue;
- committing or pushing follow-up changes on the same branch;
- opening the approved pull request for the same issue;
- completing the approved merge and cleanup for that issue.

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

Dave and the ChatGPT planning/review chat may discuss, compare, investigate, and decide whether repository work is justified before an issue or branch exists. Read-only product or repository research does not require either, and no issue is needed when the decision is to take no action. Do not turn every conversation into an issue.

Once Dave approves a durable repository change, its focused issue records the decided scope and enough context to explain why the change is being made. A substantial investigation may use an issue earlier when durable tracking is helpful, but exploratory discussion alone does not require one.

The normal sequence is:

1. Discuss, investigate, and decide whether repository work is justified.
2. Once a durable repository change is approved, define one focused issue.
3. Update `main`, then create one dedicated branch.
4. Implement only that issue.
5. Run repository and issue-specific checks.
6. Complete owner/manual testing where evidence requires it.
7. Have the ChatGPT planning/review chat independently review the branch.
8. Dave approves opening a pull request.
9. Run PR checks and final review against the unchanged reviewed head.
10. Dave approves merge; a normal merge commit is the meaningful-V2 default unless Dave explicitly chooses another method.
11. Merge through the pull request, using issue-closing syntax where applicable.
12. Confirm issue closure, required checks, and automatic Pages publication; then delete approved local/remote branches and return to clean synchronized `main`.

Earlier V1 work sometimes merged feature branches directly. That practice is **superseded for meaningful V2 work**: a pull request is now the normal final integration gate.

The following remain absolute:

- one issue per branch;
- do not open a pull request unless Dave asks;
- do not merge unless Dave explicitly approves;
- do not squash, rebase, or force-push unless Dave specifically authorises it;
- do not close the issue or delete branches before successful merge and approval.

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

This formal Git preflight is not required for ordinary conversation or read-only product research. Before edits begin, confirm that `main` equals `origin/main` and the worktree is clean. Inspect every unexpected newer commit before continuing. Legitimate automated maintenance may be accepted only after confirming that it does not overlap the issue. Stop for conflicts, unexpected manual changes, unrelated local work, or ambiguous scope.

## 6. Scope control

- Once repository work starts, use one issue and one dedicated branch for one bounded outcome.
- Do not begin a second issue on the current branch.
- Do not work directly on `main`.
- Do not force-push or rewrite reviewed commits.
- Do not include unrelated cleanup.
- Do not hide production fixes inside documentation or test-only tasks.
- Do not add dependencies without explicit approval.
- Preserve stable V1 and the current Builder contract unless the issue explicitly changes them.
- Treat a comparison project as research, not permission to copy code, wording, branding, layout, data, or artwork.

## 7. Review and testing gates

Repository checks do not replace manual UI or Nuvio-client testing where visual or runtime evidence matters.

- Dave’s UI/flow review is mandatory after major visible phases and specifically after collection/folder presentation work before source creation begins.
- Visual judgement, artwork publication, import behaviour, and client compatibility may require owner evidence.
- Report material findings as soon as they are known.
- A failed check, conflict, or ambiguous evidence stops progression until resolved.
- Do not open a pull request or merge while required checks or evidence are pending or failing.
- Do not present a build-specific observation as a universal Nuvio guarantee.

Detailed live-versus-pure-unit policy is owned by [`docs/TESTING.md`](../TESTING.md). External-service mounted, integration, end-to-end, owner-review, and live-behaviour evidence must use the approved production integration path; an unavailable service is reported as an external failure rather than replaced with fabricated behaviour.

### Production Worker owner gate

Codex never deploys the production Cloudflare Worker. When an approved issue changes Worker source:

1. Codex implements and fully tests the complete Worker source on the issue branch.
2. Codex gives Dave the complete reviewed source, its exact deployment-handoff source-byte SHA-256, the branch/head and tracked Git blob identities, and the test evidence, then stops.
3. Dave manually replaces and deploys that complete source in Cloudflare.
4. Dave replies `Worker deployed` and supplies the deployment/version identity when available.
5. Only then may Codex run the separately approved live Worker/Builder validation through production.

The deployment-handoff SHA-256, Git blob OID, and Windows working-tree byte hash are different identity layers. Git normalizes the tracked Worker text to LF while a Windows checkout may contain CRLF; a CRLF-only raw-byte hash difference is not tracked-source divergence. Do not claim byte-for-byte equivalence with deployed source unless the exact compared byte sequence establishes it. Worker deployment is separate from automatic main-triggered GitHub Pages publication, and Codex must not silently deploy, patch production, or ask for credentials.

## 8. Pull requests

- Pull requests are the normal final integration gate for meaningful V2 work.
- Codex does not open one automatically.
- The ChatGPT planning/review chat reviews the completed pushed branch first.
- Dave authorises pull-request creation.
- The PR body links the issue and uses closing syntax where appropriate.
- The final head SHA must remain the SHA that was reviewed; later changes require renewed review.
- Meaningful V2 pull requests use a normal merge commit by default unless Dave explicitly chooses another method.
- Do not squash, rebase, or force-push unless Dave specifically authorises it.
- Successful merge is followed by issue-closure, required-check, and automatic Pages-publication verification before approved branch cleanup.

## 9. Final reports

Every Codex implementation report includes:

- issue number and URL;
- branch and commit SHA;
- complete changed-file list;
- checks and results;
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
- issue-closure state;
- local and remote branch-cleanup state;
- final `main` synchronization.

## 10. Cross-project artwork boundary

- `nuvio-assets` owns artwork generation, replacement, review, publication, runtime schema, and asset-contract questions.
- `tmdb-id-lookup` consumes the approved published runtime.
- V2 must not silently work around an assets-owned defect.
- Exact entity type plus TMDB ID is authoritative; names do not substitute for typed identity.
- When repository evidence is insufficient, prepare a focused question for the assets chat.
- Do not mix repository writes between the two workstreams or use a V2 issue to alter the assets repository.

## 11. Continuity and chat handovers

The project has previously reached the end of a long planning chat without a useful warning. Long phases therefore need proactive continuity management.

Before a major new phase in an already long chat, prepare a handover rather than waiting for context failure. Include:

- current repository and relevant branch SHA;
- completed issues and pull requests;
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
