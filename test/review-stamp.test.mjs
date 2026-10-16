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
