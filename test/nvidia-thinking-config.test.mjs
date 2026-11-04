import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Exercise the host workflow's literal env configuration without requiring
// live NVIDIA credentials. A separate live smoke verifies provider acceptance.
const workflow = readFileSync(new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const reviewer = workflow.split("      - name: Review pull request\n")[1]
  ?.split("      - name: Stamp exact review identity\n")[0];

test("reviewer sends the provider-native non-thinking option to both NVIDIA models", () => {
  assert.ok(reviewer, "canonical reviewer step must exist");
  assert.match(reviewer, /config\.model: "openai\/nvidia\/nemotron-3\.5-lightning-30b-a3b"/);
  assert.match(reviewer, /config\.fallback_models: '[^']*nemotron-3\.5-super-vl-120b-a12b[^']*'/);
  const match = reviewer.match(/^          litellm\.extra_body: '([^'\n]+)'$/m);
  assert.ok(match, "host must set an explicit JSON literal via litellm.extra_body");
  assert.deepEqual(JSON.parse(match[1]), {chat_template_kwargs: {enable_thinking: false}});
  assert.match(reviewer, /config\.reasoning_effort: "none"/);
  assert.match(reviewer, /config\.additional_reasoning_effort_models: '\[\]'/);
});

test("fix retains bounded review, fallback, full-diff and fail-closed publication", () => {
  for (const expected of [
    'config.max_model_tokens: "40000"',
    'config.custom_model_max_tokens: "40000"',
    'config.max_output_tokens: "16384"',
    'pr_reviewer.enable_large_pr_chunking: "true"',
    'pr_reviewer.enable_review_coverage_footer: "true"',
    'pr_reviewer.max_number_of_calls: "6"',
    'config.ai_timeout: "300"',
    'config.num_retries: "0"',
    'config.propagate_tool_errors: "true"',
  ]) assert.ok(reviewer.includes(expected), `missing safeguard: ${expected}`);
  assert.match(workflow, /- name: Select full PR review/);
  assert.match(workflow, /- name: Require a fresh base-aware PR-Agent review result/);
  assert.match(workflow, /- name: Read changed filenames/);
  assert.doesNotMatch(workflow, /enable_thinking":true/);
});
