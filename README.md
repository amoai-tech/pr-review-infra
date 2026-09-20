# pr-review-infra

Public, no-secrets reusable PR-Agent workflow infrastructure for amoai-tech repositories.

## Security boundary

- This repository contains workflow logic only; it stores no application or provider secrets.
- Caller repositories must pass `NVIDIA_API_KEY` explicitly through `workflow_call`.
- The workflow executes reviewer policy only from the caller's trusted `pull_request.base.sha` checkout.
- PR-head files are treated as review data, not executable reviewer policy.
- The caller must restrict the credentialed path to same-repository, non-bot pull requests.
- Production callers must pin this workflow by exact 40-character commit SHA.

## Required caller-local files

- `scripts/select-pr-agent-skills.mjs`
- `scripts/pr-agent/build-evidence.mjs`
- `scripts/pr-agent/review-policy.mjs`
- `package-lock.json`

The review-policy module must export `selectReviewCommand`, `verifyReviewResult`, `appendCertification`, and `CERT_HISTORY_MARKER`.

## Shared production model profile

- Primary: `nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b`
- Fallback: `nvidia_nim/nvidia/nemotron-3.5-lightning-30b-a3b`
- PR-Agent: v0.45.0 immutable container digest

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
