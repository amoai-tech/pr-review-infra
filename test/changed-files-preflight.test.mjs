import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readFileSync as read, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const section = workflow.split("      - name: Read changed filenames\n")[1]
  .split("      - name: Checkout PR head lockfile")[0];
const script = section.split("          script: |\n")[1].split("\n")
  .map((line) => line.startsWith("            ") ? line.slice(12) : line).join("\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction("github", "context", "core", "process", "require", script);
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const names = Array.from({ length: 6 }, (_, i) => ({ filename: `src/chat/file-${i}.tsx`, status: "modified" }));

async function run({ files = names, count = files.length, priorCount = count, afterCount = count,
  priorHead = HEAD, afterHead = HEAD, priorBase = BASE, afterBase = BASE } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "mde-pr-agent-preflight-"));
  const outputs = [];
  const snapshots = [
    { changed_files: priorCount, base: { sha: priorBase }, head: { sha: priorHead } },
    { changed_files: afterCount, base: { sha: afterBase }, head: { sha: afterHead } },
  ];
  let calls = 0;
  const github = {
    rest: { pulls: { get: async () => ({ data: snapshots[calls++] }),
      listFiles: async () => ({}) } },
    paginate: async () => files,
  };
  const context = { repo: { owner: "amoai-tech", repo: "mdeai" }, payload: {
    pull_request: { number: 490, base: { sha: BASE }, head: { sha: HEAD } },
  } };
  const core = { setOutput: (...a) => outputs.push(a), info: () => {} };
  try {
    await execute(github, context, core, { env: { GITHUB_WORKSPACE: temp } }, (name) => {
      if (name !== "fs") throw new Error("Unexpected require: " + name);
      return requireFs;
    });
    const saved = JSON.parse(read(join(temp, ".pr-agent/changed-files.json"), "utf8"));
    return { outputs, saved, calls };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
const requireFs = await import("node:fs");

test("PR #490-sized current diff: exactly 6 current paths, no historical merge files", async () => {
  const result = await run();
  assert.deepEqual(result.saved, names.map(f => f.filename));
  assert.deepEqual(result.outputs, [["files", JSON.stringify(result.saved)]]);
  assert.equal(result.calls, 2);
});
test("renames and removals use current path, never count previous name twice", async () => {
  const files = [{ filename: "new.ts", previous_filename: "old.ts", status: "renamed" },
    { filename: "deleted.ts", status: "removed" }];
  assert.deepEqual((await run({ files })).saved, ["new.ts", "deleted.ts"]);
});
test("rejects missing pages and count mismatch", async () => {
  await assert.rejects(run({ files: names.slice(0, 5), count: 6 }), /PR_SCOPE_INCOMPLETE/);
});
test("rejects duplicate and missing filenames", async () => {
  await assert.rejects(run({ files: [...names.slice(0, 5), names[0]] }), /PR_SCOPE_AMBIGUOUS/);
  await assert.rejects(run({ files: [...names.slice(0, 5), { status: "modified" }] }), /PR_SCOPE_AMBIGUOUS/);
});
test("rejects malformed rename provenance", async () => {
  await assert.rejects(run({ files: [{ filename: "new.ts", status: "renamed" }] }), /PR_SCOPE_AMBIGUOUS/);
});
test("rejects stale base/head before and after pagination", async () => {
  await assert.rejects(run({ priorHead: "c".repeat(40) }), /PR_SCOPE_CHANGED/);
  await assert.rejects(run({ afterBase: "c".repeat(40) }), /PR_SCOPE_CHANGED/);
});
test("rejects concurrent PR changed-file count", async () => {
  await assert.rejects(run({ afterCount: 7 }), /PR_SCOPE_CHANGED/);
});
test("rejects API 3000 file cap and empty manifest", async () => {
  await assert.rejects(run({ count: 3001 }), /PR_SCOPE_UNAVAILABLE/);
  await assert.rejects(run({ count: 3000 }), /PR_SCOPE_UNAVAILABLE/);
  await assert.rejects(run({ count: 0, files: [] }), /PR_SCOPE_UNAVAILABLE/);
});

test("100-file PR inventory remains bounded to the declared current diff", async () => {
  const files = Array.from({ length: 100 }, (_, i) =>
    ({ filename: `src/events/change-${i}.tsx`, status: "modified" }));
  const { saved } = await run({ files });
  assert.equal(saved.length, 100);
  assert.ok(saved.every(path => path.startsWith("src/events/")));
});
test("one-file docs PR needs no extra history", async () => {
  assert.deepEqual((await run({ files: [{ filename: "docs/update.md", status: "modified" }] })).saved, ["docs/update.md"]);
});
