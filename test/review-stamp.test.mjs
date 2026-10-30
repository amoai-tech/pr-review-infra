import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const file = readFileSync(new URL("../.github/workflows/pr-agent.yml", import.meta.url), "utf8");
const section = file.slice(file.indexOf("      - name: Stamp exact review identity\n"));
const block = section.slice(section.indexOf("          script: |\n") + "          script: |\n".length, section.indexOf("\n  verify-review-result:"));
const source = block.split("\n").map(x => x.startsWith("            ") ? x.slice(12) : x).join("\n");
const Fn = Object.getPrototypeOf(async function() {}).constructor;
const invoke = new Fn("github","context","core","process","setTimeout",source);
const base="a".repeat(40),head="b".repeat(40),stale="c".repeat(40);
const state=(sha=head, complete=true)=>`<!-- pr-agent-review-state:v1
${JSON.stringify({findings:[],last_run:{complete,head_sha:sha},schema_version:1})}
-->`;
const full=(sha=head,complete=true)=>`## MDE PR Review
<!-- pr-agent:review:full -->
#### (Review updated until commit https://github.com/amoai-tech/mdeai/commit/${sha})
${state(sha,complete)}`;
const comment=(body,updated_at="2026-10-16T12:02:16Z",who="github-actions[bot]")=>({id:17,body,updated_at,user:{login:who}});
async function run(comments,command="/review -i",updateFails=false){
 const result={failures:[],outputs:[],updates:[]};
 const github={paginate:async()=>comments,rest:{issues:{listComments:async()=>({data:comments}),updateComment:async x=>{if(updateFails)throw Error("API down");result.updates.push(x);}}}};
 const context={repo:{owner:"amoai-tech",repo:"mdeai"},issue:{number:336}};
 const core={setFailed:x=>result.failures.push(x),setOutput:(k,v)=>result.outputs.push([k,v])};
 await invoke(github,context,core,{env:{REVIEW_COMMAND:command,REVIEW_STARTED_AT:String(Date.parse("2026-10-16T12:02:00Z")),BASE_SHA:base,HEAD_SHA:head}},(fn) => { fn(); });
 return result;
}
test("incremental→full fallback with exact fresh completed head uses real command",async()=>{
 const x=await run([comment(full())]);
 assert.deepEqual(x.failures,[]);
 assert.deepEqual(x.outputs,[["review_command","/review"]]);
 assert.match(x.updates[0].body,new RegExp(`^<!-- mde-agent-review:v1 base=${base} head=${head} command="/review" type=canonical -->`));
});
test("clean incremental→full fallback accepts PR-Agent's exact-head header without finding state",async()=>{
 const body=`## MDE PR Review 🔍
<!-- pr-agent:review:full -->
#### (Review updated until commit https://github.com/amoai-tech/mdeai/commit/${head})
No key issues identified.`;
 const x=await run([comment(body)]);
 assert.deepEqual(x.failures,[]);
 assert.deepEqual(x.outputs,[["review_command","/review"]]);
 assert.match(x.updates[0].body,new RegExp(`^<!-- mde-agent-review:v1 base=${base} head=${head} command="/review" type=canonical -->`));
});
for(const [label,body] of [
 ["stale clean header",`## MDE PR Review 🔍\n<!-- pr-agent:review:full -->\n#### (Review updated until commit https://github.com/amoai-tech/mdeai/commit/${stale})`],
 ["wrong repository",`## MDE PR Review 🔍\n<!-- pr-agent:review:full -->\n#### (Review updated until commit https://evil.example/repo/commit/${head})`],
 ["embedded heading",`## MDE PR Review 🔍\n<!-- pr-agent:review:full -->\n${"x".repeat(800)}\n#### (Review updated until commit https://github.com/amoai-tech/mdeai/commit/${head})`],
 ["malformed finding state",`## MDE PR Review 🔍\n<!-- pr-agent:review:full -->\n#### (Review updated until commit https://github.com/amoai-tech/mdeai/commit/${head})\n<!-- pr-agent-review-state:v1\nBAD\n-->`],
 ["incomplete finding state",full(head,false)],
]) {
 test(`clean fallback rejects ${label}`, async()=>{
  const x=await run([comment(body)]);
  assert.match(x.failures[0],/NO_REVIEW/);
  assert.deepEqual(x.updates,[]);
 });
}
test("ordinary incremental remains incremental",async()=>{
 const x=await run([comment("## MDE PR Review\n<!-- pr-agent:review:incremental -->")]);
 assert.deepEqual(x.failures,[]);
 assert.deepEqual(x.outputs,[["review_command","/review -i"]]);
});
test("ordinary full remains full",async()=>{
 const x=await run([comment(full())],"/review");
 assert.deepEqual(x.failures,[]);
 assert.deepEqual(x.outputs,[["review_command","/review"]]);
});
for(const [label,body] of [
 ["stale head",full(stale)],
 ["incomplete head",full(head,false)],
 ["missing state","## MDE PR Review\n<!-- pr-agent:review:full -->"],
 ["malformed state","<!-- pr-agent:review:full -->\n<!-- pr-agent-review-state:v1\nBAD\n-->"],
 ["duplicate state",full()+state()],
]){
 test(`incremental→full rejects ${label}`,async()=>{
  const x=await run([comment(body)]);
  assert.match(x.failures[0],/NO_REVIEW/);
  assert.deepEqual(x.outputs,[]);
 });
}
test("old timestamp is rejected",async()=>{
 const x=await run([comment(full(),"2026-10-16T12:01:59Z")]);
 assert.match(x.failures[0],/NO_REVIEW/);
});
test("nonbot comment is rejected",async()=>{
 const x=await run([comment(full(),undefined,"outside-user")]);
 assert.match(x.failures[0],/NO_REVIEW/);
});
test("ambiguous two fresh full reviews fail closed",async()=>{
 const x=await run([comment(full()),{...comment(full()),id:18}]);
 assert.match(x.failures[0],/INVALID_ENVELOPE/);
});
test("GitHub write failure cannot claim a verified result",async()=>{
 const x=await run([comment(full())],"/review -i",true);
 assert.match(x.failures[0],/GITHUB_UPDATE_FAILED/);
 assert.deepEqual(x.outputs,[]);
});


test("large reviews use bounded 48K chunks with a coverage footer", () => {
  assert.match(file, /config\.max_model_tokens: "48000"/);
  assert.match(file, /config\.custom_model_max_tokens: "48000"/);
  assert.match(file, /pr_reviewer\.enable_large_pr_chunking: "true"/);
  assert.match(file, /pr_reviewer\.enable_review_coverage_footer: "true"/);
  assert.match(file, /pr_reviewer\.max_number_of_calls: "6"/);
  assert.match(file, /pr_reviewer\.num_max_findings: "13"/);
  assert.match(file, /config\.max_output_tokens: "8192"/);
  assert.match(file, /config\.reasoning_effort: "none"/);
  assert.match(file, /config\.additional_reasoning_effort_models: /);
  assert.match(file, /config\.ai_timeout: "120"/);
  assert.match(file, /docker:\/\/pragent\/pr-agent@sha256:65e5b196e38cecd7df8a71fe29942052e081a0c6645132c2ac874df60b1760c7/);
});


test("fix-prompt publication revalidates the live PR head and base before reading changed files", () => {
  const publish = file.slice(file.indexOf("const rendererPath = \x60\x24{process.env.GITHUB_WORKSPACE}/scripts/pr-agent/render-fix-prompt.mjs\x60;"));
  assert.match(publish, /github\.rest\.pulls\.get\(/);
  assert.match(publish, /livePr\.head\.sha/);
  assert.match(publish, /livePr\.base\.sha/);
  assert.match(publish, /STALE_PR_REVISION/);
  assert.ok(publish.indexOf("github.rest.pulls.get(") < publish.indexOf("github.paginate(github.rest.pulls.listFiles"), "revalidate before fetching diff");
});

test("live-head publication guard rejects both head and base races before any GitHub diff read", async () => {
  const from = file.indexOf("const { data: livePr } = await github.rest.pulls.get(");
  const to = file.indexOf("const changedFiles = await github.paginate(github.rest.pulls.listFiles", from);
  assert.ok(from > 0 && to > from);
  const guard = file.slice(from, to).split("\n").map((line) =>
    line.startsWith("            ") ? line.slice(12) : line
  ).join("\n");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const invokeGuard = new AsyncFunction("github", "context", "core", guard + '\nreturn "accepted";');
  const context = { repo: { owner: "amoai-tech", repo: "mdeai" }, payload: {
    pull_request: { number: 422, base: { sha: base }, head: { sha: head } }
  }};
  const run = async (liveHead, liveBase) => {
    const failed = [], calls = [];
    const github = {rest:{pulls:{get:async (args) => {
      calls.push(args);
      return {data:{head:{sha:liveHead},base:{sha:liveBase}}};
    }}}};
    const result = await invokeGuard(github, context, {setFailed:(msg)=>failed.push(msg)});
    return {result,failed,calls};
  };
  const current = await run(head, base);
  assert.equal(current.result, "accepted");
  assert.deepEqual(current.failed, []);
  assert.equal(current.calls.length, 1);
  const movedHead = await run(stale, base);
  assert.equal(movedHead.result, undefined);
  assert.match(movedHead.failed[0], /STALE_PR_REVISION/);
  const movedBase = await run(head, stale);
  assert.equal(movedBase.result, undefined);
  assert.match(movedBase.failed[0], /STALE_PR_REVISION/);
});

test("retirement cannot replace a newer head's fix prompt from a superseded review run", async () => {
  const start = file.indexOf("  retire-stale-fix-prompt:");
  assert.ok(start > 0);
  const retire = file.slice(start);
  const liveAt = retire.indexOf("const { data: livePr } = await github.rest.pulls.get(");
  const commentsAt = retire.indexOf("const comments = await github.paginate(github.rest.issues.listComments");
  assert.ok(liveAt >= 0 && commentsAt > liveAt, "retirement must check the live revision before reading/updating comments");
  const snippet = retire.slice(liveAt, commentsAt).split("\n").map((line) =>
    line.startsWith("            ") ? line.slice(12) : line
  ).join("\n");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const invokeGuard = new AsyncFunction("github", "context", "core", snippet + '\nreturn "current";');
  const context = { repo: { owner: "amoai-tech", repo: "mdeai" }, payload: {
    pull_request: { number: 422, base: { sha: base }, head: { sha: head } }
  }};
  const run = async (liveHead, liveBase) => {
    const messages = [];
    const github = {rest:{pulls:{get:async()=>({data:{head:{sha:liveHead},base:{sha:liveBase}}})}}};
    const response = await invokeGuard(github, context, {info:(text)=>messages.push(text)});
    return {response,messages};
  };
  assert.equal((await run(head,base)).response, "current");
  const movedHead = await run(stale,base);
  assert.equal(movedHead.response, undefined);
  assert.match(movedHead.messages[0], /superseded/);
  const movedBase = await run(head,stale);
  assert.equal(movedBase.response, undefined);
  assert.match(movedBase.messages[0], /superseded/);
});

test("global processing budget matches the custom-model budget (prevents 32K silent pruning)", () => {
  const globalLimit = file.match(/config\.max_model_tokens: "(\d+)"/);
  const customLimit = file.match(/config\.custom_model_max_tokens: "(\d+)"/);
  assert.ok(globalLimit, "global max_model_tokens override must be supplied");
  assert.ok(customLimit, "custom model metadata must be supplied");
  assert.equal(Number(globalLimit[1]), 48000);
  assert.equal(globalLimit[1], customLimit[1]);
});

test("hosted NVIDIA review uses fast Lightning and independent hosted fallback", () => {
  assert.match(file, /config\.model: "openai\/nvidia\/nemotron-3\.5-lightning-30b-a3b"/);
  assert.match(file, /config\.fallback_models: '\["openai\/openai\/gpt-oss-20b"\]'/);
  assert.doesNotMatch(file, /GEMINI|GOOGLE_GENERATIVE_AI/);
  assert.match(file, /OPENAI_API_KEY: \$\{\{ secrets\.NVIDIA_API_KEY \}\}/);
});
