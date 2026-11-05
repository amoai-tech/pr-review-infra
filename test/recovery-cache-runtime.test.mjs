import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

const workflow=readFileSync(new URL("../.github/workflows/pr-agent.yml",import.meta.url),"utf8");
const lines=workflow.split("\n");
const start=lines.findIndex(x=>x.includes("- name: Prepare bounded exact-blob recovery"));
const at=lines.findIndex((x,i)=>i>start && x.trim()==="script: |");
assert.ok(start>=0 && at>start,"trusted preparation action exists");
const body=[];
for(let i=at+1;i<lines.length;i++){
  if(!lines[i].trim()){body.push("");continue;}
  if(!lines[i].startsWith("            "))break;
  body.push(lines[i].slice(12));
}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const prepare=new AsyncFunction("github","context","core","require",body.join("\n"));
const require=createRequire(import.meta.url);

test("previous-run cache only prevents new model I/O with a successful GitHub strict check",async()=>{
  const base="a".repeat(40),head="b".repeat(40),diffSha="c".repeat(64);
  const path="src/components/events/event-ticket-tiers.tsx";
  const diff="diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n";
  const plan={ok:true,baseSha:base,headSha:head,diffSha256:diffSha,
    source:"exact-blob-diff",path,patchBytes:Buffer.byteLength(diff),diff};
  const profile="v0.49.0-nvidia-lightning-target-v1";
  const model={review:{valid:true},coverage:{files_not_reviewed:[],files_partially_reviewed:[]}};
  const cache={v:1,profile,baseSha:base,headSha:head,diffSha256:diffSha,
    path,patchBytes:plan.patchBytes,output:model};
  const cacheBlob=gzipSync(Buffer.from(JSON.stringify(cache))).toString("base64url");
  const marker="<!-- mde-pr-agent-targeted-recovery:v1 -->";
  const header=marker+"\n## Verified bounded follow-up\n\n"+
    "**File:** "+path+"\n**Base/head:** "+base+" / "+head+"\n"+
    "**Diff SHA-256:** "+diffSha+"\n**Reviewer profile:** "+profile+"\n"+
    "**Verified run:** 11\n"+
    "**Model coverage:** no omissions reported for this targeted patch\n"+
    "<!-- mde-pr-agent-model-cache:v1:"+cacheBlob+" -->\n"+
    "**Model findings withheld without changed-line proof:** 0\n";
  const cases=[
    {name:"success",reuse:true},
    {name:"previous run failed",prevConclusion:"failure",reuse:false},
    {name:"previous required job failed",jobConclusion:"failure",reuse:false},
    {name:"different merge sha",priorHead:"d".repeat(40),reuse:false},
    {name:"different workflow",priorWorkflow:999,reuse:false},
    {name:"wrong pull request",prNumber:456,reuse:false},
    {name:"cached JSON malformed",badBlob:true,reuse:false},
    {name:"no previous cache",noCache:true,reuse:false},
  ];
  for(const scenario of cases){
    const dir=mkdtempSync(join(tmpdir(),"mde-pr-cache-"));
    const priorCwd=process.cwd(),priorEnv=process.env.GITHUB_WORKSPACE;
    try{
      process.chdir(dir);process.env.GITHUB_WORKSPACE=dir;
      mkdirSync(join(dir,"scripts/pr-agent"),{recursive:true});
      writeFileSync(join(dir,"scripts/pr-agent/prepare-recovery.mjs"),
        'export async function prepareRecoveryFromGithub(){return '+JSON.stringify(plan)+';}\n'+
        'export function validateTargetedModelOutput({output}){return {ok:output?.review?.valid===true,coverageComplete:output?.coverage?.files_not_reviewed?.length===0};}');
      writeFileSync(join(dir,"scripts/pr-agent/review-policy.mjs"),
        'export function parseReviewEnvelope(){return {valid:true,baseSha:"'+base+'",headSha:"'+head+'",type:"canonical",command:"/review",body:"<!-- pr-agent:review:full -->"};}');
      const previous={user:{login:"github-actions[bot]"},
        body:scenario.badBlob?header.replace(cacheBlob,"bm90LWpzb24"):header,
        updated_at:"2026-11-05T19:01:00Z"};
      const current={user:{login:"github-actions[bot]"},
        body:"<!-- pr-agent:review:full -->",updated_at:"2026-11-05T20:01:00Z"};
      const listComments=()=>{},listFiles=()=>{},listJobsForWorkflowRun=()=>{};
      const github={rest:{
        actions:{getWorkflowRun:async({run_id})=>({data:{
          id:run_id,conclusion:run_id===11?(scenario.prevConclusion??"success"):null,
          event:"pull_request",workflow_id:run_id===11?(scenario.priorWorkflow??777):777,
          head_sha:run_id===11?(scenario.priorHead??head):head,
          head_branch:"feat/example",pull_requests:[{number:scenario.prNumber??123}],
          created_at:run_id===11?"2026-11-05T19:00:00Z":"2026-11-05T20:00:00Z",
          run_started_at:run_id===11?"2026-11-05T19:00:00Z":"2026-11-05T20:00:00Z",
        }}),listJobsForWorkflowRun},
        issues:{listComments,updateComment:async()=>({})},
        pulls:{get:async()=>({data:{changed_files:1}}),listFiles},
      },paginate:async(fn)=>fn===listComments?[...(scenario.noCache?[]:[previous]),current]:
        fn===listJobsForWorkflowRun?[{name:"review / verify-review-result",conclusion:scenario.jobConclusion??"success"}]:
        fn===listFiles?[{filename:path}]:[]};
      const outputs={},messages=[];
      const core={setOutput:(k,v)=>{outputs[k]=v;},info:x=>messages.push(x),
        notice:x=>messages.push(x),warning:x=>messages.push(x)};
      const ctx={repo:{owner:"amoai-tech",repo:"mdeai"},runId:12,
        payload:{pull_request:{number:123,base:{sha:base},head:{sha:head}}}};
      await prepare(github,ctx,core,require);
      assert.equal(outputs.ready,"true",scenario.name+" prepared");
      assert.equal(outputs.cached==="true",scenario.reuse,scenario.name+" cached");
      assert.equal(outputs.verified_prior_run==="11",scenario.reuse,scenario.name+" proven run");
      if(scenario.reuse)assert.deepEqual(
        JSON.parse(readFileSync(join(dir,".pr-agent/recovery.json"),"utf8")),model);
      else assert.equal(existsSync(join(dir,".pr-agent/recovery.json")),false);
    }finally{
      process.chdir(priorCwd);process.env.GITHUB_WORKSPACE=priorEnv;
      rmSync(dir,{recursive:true,force:true});
    }
  }
});
