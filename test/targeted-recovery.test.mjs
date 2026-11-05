import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(
  new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const verification = workflow.slice(workflow.indexOf("  verify-review-result:"),
  workflow.indexOf("  # SAN-1552 ·", workflow.indexOf("  verify-review-result:")));

test("recovers only after pinned initial review and before required certification", () => {
  const prep = verification.indexOf("Prepare bounded exact-blob recovery");
  const model = verification.indexOf("Re-review missing patch with pinned PR-Agent v0.49.0");
  const strict = verification.indexOf("Require a fresh base-aware PR-Agent review result");
  assert.ok(prep > 0 && model > prep && strict > model);
  assert.match(verification, /verifyRecoveredCoverage/);
  assert.match(verification, /result\.code === "INCOMPLETE_REVIEW"/);
  assert.match(verification, /core\.setFailed.*PR-Agent verification failed/);
  assert.match(verification, /fresh\.diffSha256 !== storedPlan\.diffSha256/);
  assert.match(verification, /currentPr\.head\.sha !== context\.payload\.pull_request\.head\.sha/);
});
test("executes bounded plain-diff model without a GitHub token or executable PR checkout", () => {
  const model = verification.slice(
    verification.indexOf("Re-review missing patch with pinned PR-Agent v0.49.0"),
    verification.indexOf("Require a fresh base-aware PR-Agent review result"));
  assert.match(model, /pragent\/pr-agent@sha256:b1ed6e8de56eb4d6e4169ee0d5c209bb5ed1ef071a01c0c042c64b80192a785c/);
  assert.match(model, /--diff-file \/review\/recovery\.diff/);
  assert.match(model, /--json-output \/review\/recovery\.json/);
  assert.doesNotMatch(model, /-e GITHUB_TOKEN/);
  assert.doesNotMatch(model, /checkout.*pull_request\.head\.sha/);
  assert.match(verification, /timeout-minutes: 12/);
});
test("publishes grounded merged findings only after combined coverage is proven", () => {
  assert.match(verification, /if \(recovered\) \{/);
  assert.match(verification, /Model findings withheld without changed-line proof/);
  assert.match(verification, /Additional grounded findings beyond display cap/);
  assert.match(verification, /recove(?:red|ry).?Body/);
  assert.match(verification, /mde-pr-agent-targeted-recovery:v1/);
  assert.match(verification, /appendCertification/);
});


test("bounded recovery cache only trusts source-bound bot prefix and revalidates before skip", () => {
  const prep = verification.slice(
    verification.indexOf("Prepare bounded exact-blob recovery"),
    verification.indexOf("Re-review missing patch with pinned PR-Agent v0.49.0"));
  const provider = verification.slice(
    verification.indexOf("Re-review missing patch with pinned PR-Agent v0.49.0"),
    verification.indexOf("Require a fresh base-aware PR-Agent review result"));
  const strict = verification.slice(
    verification.indexOf("Require a fresh base-aware PR-Agent review result"));
  assert.match(prep, /comment\.user\?\.login === "github-actions\[bot\]"/);
  assert.match(prep, /trustedPrefix = cacheHeader/);
  assert.match(prep, /split\(/);
  assert.match(prep, /cached\.baseSha === baseSha && cached\.headSha === headSha/);
  assert.match(prep, /cached\.path === plan\.path && cached\.diffSha256 === plan\.diffSha256/);
  assert.match(prep, /cached\.patchBytes === plan\.patchBytes/);
  assert.match(prep, /checked\.ok && checked\.coverageComplete/);
  assert.match(prep, /gunzipSync/);
  assert.match(prep, /core\.setOutput\("cached", "true"\)/);
  assert.match(provider, /steps\.recovery-plan\.outputs\.cached != 'true'/);
  assert.match(strict, /fresh\.diff !== diff/);
  assert.match(strict, /verifyRecoveredCoverage/);
  assert.match(strict, /mde-pr-agent-model-cache:v1/);
  assert.match(strict, /gzipSync/);
  assert.match(strict, /code: "SOURCE_BOUND_MODEL_RECOVERY"/);
});

test("every github-script block is valid asynchronous JavaScript", () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const lines = workflow.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)script:\s*\|\s*$/.exec(lines[i]);
    if (!match) continue;
    const prefix = match[1] + "  ";
    const block = [];
    while (i + 1 < lines.length &&
      (!lines[i + 1].trim() || lines[i + 1].startsWith(prefix))) {
      block.push(lines[++i].slice(prefix.length));
    }
    assert.doesNotThrow(() => new AsyncFunction("github", "context", "core", "require",
      block.join("\n")));
    count++;
  }
  assert.ok(count >= 4, "workflow github-script blocks were not extracted");
});
