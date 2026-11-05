import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const review = section("\n  review:\n", "\n  verify-review-result:\n");
const verify = section("\n  verify-review-result:\n", "\n  retire-stale-fix-prompt:\n");

test("only missing high-risk file enters bounded existing PR-Agent follow-up", () => {
  assert.match(review, /prepareRecoveryFromGithub\(/);
  assert.match(review, /candidates\.length !== 1/);
  assert.match(review, /steps\.recovery-plan\.outputs\.ready == 'true'/);
  assert.match(review, /--diff-file \/review\/recovery\.diff/);
  assert.match(review, /--json-output \/review\/recovery\.json/);
  assert.match(review, /pragent\/pr-agent@sha256:[a-f0-9]{64}/);
  assert.match(review, /config\.num_retries=0/);
  assert.match(review, /!checked\.coverageComplete/);
  assert.doesNotMatch(review, /-e GITHUB_TOKEN|--privileged/);
});

test("verifier accepts only same-run artifact and independently reconstructs source", () => {
  assert.match(review, /name: pr-agent-trusted-recovery/);
  assert.match(verify, /if: needs\.review\.outputs\.recovery_verified == 'true'/);
  assert.match(verify, /pr-agent-trusted-recovery/);
  assert.match(verify, /result\.code === "INCOMPLETE_REVIEW"/);
  assert.match(verify, /prepareRecoveryFromGithub\(/);
  assert.match(verify, /validateTargetedModelOutput\(/);
  assert.match(verify, /evidence\.reviewCommentId !== candidates\[0\]\.comment\.id/);
  assert.match(verify, /plan\.diffSha256 !== evidence\.diffSha256/);
  assert.match(verify, /!checked\.coverageComplete/);
  assert.match(verify, /STALE_PR_REVISION: PR changed before review certification/);
  assert.match(verify, /finalPr\.base\.sha !== context\.payload\.pull_request\.base\.sha/);
  assert.match(verify, /finalPr\.head\.sha !== context\.payload\.pull_request\.head\.sha/);
  assert.match(verify, /result = \{\s*ok: true, code: "OK_RECOVERED"/);
  assert.match(verify, /if \(!result\.ok\) \{/);
  assert.doesNotMatch(verify, /core\.setNeutral\(/);
});

test("all GitHub script blocks compile as asynchronous JavaScript", () => {
  const lines = source.split("\n");
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s+script: \|\s*$/.test(lines[i])) continue;
    const indent = lines[i].match(/^(\s+)/)[1].length + 2;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && lines[j].length - lines[j].trimStart().length < indent) break;
      body.push(lines[j].slice(indent));
    }
    bodies.push(body.join("\n"));
  }
  assert.ok(bodies.length >= 6);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  bodies.forEach((body, i) => assert.doesNotThrow(
    () => new AsyncFunction("github", "context", "core", "process", body),
    "Invalid github-script #" + i));
});
