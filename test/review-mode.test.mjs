import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const file = readFileSync(new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const section = file.split("      - name: Select full PR review\n")[1]
  ?.split("      - name: Select trusted caller review skills\n")[0];
test("full-review mode is enforced by shared workflow before any user policy can override it", () => {
  assert.ok(section, "workflow must have one canonical full-review selection step");
  assert.match(section, /id: review-mode/);
  assert.doesNotMatch(section, /listComments|selectReviewCommand|github\.paginate|\/review -i/);
  assert.match(file, /github_action_config\.handle_push_trigger: "true"/);
  assert.match(file, /steps\.review-mode\.outputs\.push_commands/);
  assert.match(file, /steps\.review-mode\.outputs\.review_command/);
});
for (const action of ["opened", "synchronize", "reopened", "ready_for_review"]) {
  test(`automatic ${action} mode publishes only /review without GitHub comment API`, () => {
    const folder = mkdtempSync(join(tmpdir(), "mde-full-pr-review-"));
    const output = join(folder, "output");
    try {
      const script = section.split("        run: |\n")[1].split("\n")
        .map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
      const run = spawnSync("bash", ["-eu", "-c", script], {
        env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_EVENT_ACTION: action },
        encoding: "utf8",
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /PR-Agent review command: \/review/);
      assert.equal(readFileSync(output, "utf8"),
        'review_command=/review\npush_commands=["/review"]\n');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
}
