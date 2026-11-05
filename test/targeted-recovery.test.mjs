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
  assert.match(verification, /recove(?:red|ry).?Body/);
  assert.match(verification, /mde-pr-agent-targeted-recovery:v1/);
  assert.match(verification, /appendCertification/);
});
