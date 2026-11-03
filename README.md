# pr-review-infra

Public, no-secrets reusable PR-Agent workflow infrastructure for amoai-tech repositories.

## Security boundary

- This repository contains workflow logic only; it stores no application or provider secrets.
- Caller repositories must pass `NVIDIA_API_KEY` explicitly through `workflow_call`.
- The workflow executes reviewer policy only from the caller's trusted `pull_request.base.sha` checkout.
- PR-head files are treated as review data, not executable reviewer policy.
- The caller must restrict the credentialed path to same-repository, non-bot pull requests.
- Production callers must pin this workflow by exact 40-character commit SHA.

## Current-PR scope preflight (SAN-1628)

Before invoking PR-Agent, the shared workflow uses GitHub's current
`pulls.get` and paginated `pulls.listFiles` APIs. It rejects stale base/head,
incomplete or duplicate changed filenames, missing rename provenance, and
GitHub's ambiguous 3,000-file API cap. It saves only the verified paths in
`.pr-agent/changed-files.json`. This is a manifest integrity preflight, not
a claim about the model's hidden inputs. Review command selection remains
owned by the trusted caller's `scripts/pr-agent/review-policy.mjs` and may
retain a compatibility selector returning `/review`, but the **shared workflow**
is the canonical execution owner and always enforces full `/review` mode,
including synchronize/rebase events before the caller policy reaches main.
This removes the comment-history API call and stops old base policy from
re-enabling `/review -i`.

## Required caller-local files

- `scripts/select-pr-agent-skills.mjs`
- `scripts/pr-agent/build-evidence.mjs`
- `scripts/pr-agent/review-policy.mjs`
- `package-lock.json`

The review-policy module must export `verifyReviewResult`, `appendCertification`, and `CERT_HISTORY_MARKER`. Automatic review-mode selection is owned by the shared workflow; an old base-branch `selectReviewCommand` must not override its full-review command.

## Shared production model profile

- Primary: `openai/nvidia/nemotron-3.5-lightning-30b-a3b` (NVIDIA Build endpoint)
- Fallback: `openai/nvidia/nemotron-3.5-super-vl-120b-a12b` (NVIDIA only)
- Oversized diffs: 40K-token review budget; chunk into up to 6 review calls and report uncovered files
- NVIDIA models use reasoning_effort=none; completion tokens are reserved for the review rather than a long reasoning trace
- Host review finding cap: 13 for two 6-finding chunks; the repository default-branch 6-finding policy otherwise marks their merged result incomplete
- PR-Agent: v0.49.0 immutable container digest

## Caller example

```yaml
jobs:
  pr-agent:
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      github.event.sender.type != 'Bot' &&
      github.actor != 'dependabot[bot]'
    permissions:
      actions: read
      contents: read
      issues: write
      pull-requests: write
    uses: amoai-tech/pr-review-infra/.github/workflows/pr-agent.yml@<40-char-sha>
    with:
      evidence_title: iPix PR-Agent Evidence
    secrets:
      NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}
```
