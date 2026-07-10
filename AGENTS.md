# Repository Working Guide

## Scope and required reading

These instructions apply to the entire repository unless a nested `AGENTS.md` or `AGENTS.override.md` supplies narrower rules.

Before v2, builder, Nuvio schema, or export work, read:

- `README.md`
- `docs/v2/BUILDER_KNOWLEDGE.md`
- the relevant GitHub issue

Repository evidence and confirmed manual tests override old assumptions.

## Product boundaries

- v1 is the stable TMDB ID lookup and Nuvio JSON export application at the repository root.
- v2 is planned as a mobile-first visual Nuvio Collection Builder powered primarily by TMDB.
- Existing lookup and copy-ID workflows remain part of the product.
- Do not rewrite or remove stable v1 features merely to modernise the code.
- React/Vite under `/builder/` is the confirmed builder direction; keep domain, parsing, validation, migration, serialization, and ID logic framework-independent.
- Trakt integration is outside the current project scope unless explicitly approved in a future issue.

## Git and issue workflow

- Never work directly on `main`.
- Each meaningful task requires a GitHub issue and a dedicated branch from an updated `main`.
- Keep work limited to the approved issue; do not include unrelated cleanup.
- Do not open a pull request unless Dave asks.
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
- Keep new builder work isolated from v1 until explicit integration issues are approved.
- Do not introduce React/Vite merely because comparison sites use it.
- Use wizard or step-based flows for complex collection creation.
- Give controls large, mobile-friendly tap targets.
- Use progressive disclosure for advanced options.
- Test mobile-first work at common widths including 360, 384, 393, 402, and 412 pixels.
- Treat desktop layouts as polished extensions of the mobile-first layout.
- Follow a modern, dark, sleek direction with restrained TMDB-inspired blue, cyan, and green accents.
- The visual direction is not warm or cosy.
- Do not copy reference-site branding, wording, or layouts.

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
