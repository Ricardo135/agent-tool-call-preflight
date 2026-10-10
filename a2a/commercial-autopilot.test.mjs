import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("Autonomous seller runs broker discovery and one planned matching request, saves responses, and deduplicates", async () => {
  const home = await mkdtemp(join(tmpdir(), "autonomous-sales-test-"));
  try {
    const dir = join(home, ".openclaw/workspace/research/agent-commerce");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "commercial-deal-actions.json"), JSON.stringify({
      actions: [{
        id:"TEST_MATCH_001",
        channel:"mars", operation:"find_counterparty",
        input:{subject:"Independent buyer for JSON tool-call preflight",offer_item_id:"off_5e8a3cd5-f6dc-4b36-a37a-4a61eb9e8695"},
        rationale:"A real intermediary can match our product with qualified buyers.",
        evidence:"https://mars-economic-agent-gateway.mars-economic.workers.dev/docs"
      }]
    }));
    const mock = join(home, "mock-fetch.mjs");
    await writeFile(mock, `globalThis.fetch = async (url, options) => {
      const req = JSON.parse(options.body);
      const action = req.params.message.parts[0].data.action;
      if (!["discover_buyer_demand","find_counterparty"].includes(action)) throw new Error("Unexpected action");
      if (action === "discover_buyer_demand" &&
          (typeof req.params.message.parts[0].data.input?.query !== "string" ||
           req.params.message.parts[0].data.input.query.trim().length < 10)) {
        throw new Error("QUERY_REQUIRED: invalid empty buyer-demand query");
      }
      return new Response(JSON.stringify({
        jsonrpc:"2.0",result:{task:{
          id:"mock_"+action,
          status:{state:"TASK_STATE_COMPLETED"},
          metadata:{operationResult:{ok:true,status:200,data:{action, demands:[]}}}
        }}
      }),{status:200,headers:{"content-type":"application/json"}});
    };`);
    const script = resolve("a2a/commercial-autopilot.mjs");
    const env = { ...process.env, HOME:home };
    const first = spawnSync(process.execPath, ["--import",mock,script,"--run"], {env,encoding:"utf8",timeout:10000});
    assert.equal(first.status,0,first.stderr);
    assert.match(first.stdout,/MARS demand discovery/);
    assert.match(first.stdout,/MARS commercial operation/);
    let state=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(state.operations.TEST_MATCH_001.status,"TASK_STATE_COMPLETED");
    const signals=JSON.parse(await readFile(join(dir,"commercial-autopilot-signals.json"),"utf8"));
    assert.equal(signals.ourOfferId,"off_5e8a3cd5-f6dc-4b36-a37a-4a61eb9e8695");
    assert.ok(signals.latestDiscovery.query.length > 10);
    assert.equal(signals.latestDiscovery.reply.state,"TASK_STATE_COMPLETED");
    const second = spawnSync(process.execPath, ["--import",mock,script,"--run"], {env,encoding:"utf8",timeout:10000});
    assert.equal(second.status,0,second.stderr);
    assert.doesNotMatch(second.stdout,/MARS commercial operation:/);
    state=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(Object.keys(state.operations).length,1);
  } finally { await rm(home,{recursive:true,force:true}); }
});

test("Previous MARS QUERY_REQUIRED failure is retried at once with a real query, but not duplicated", async () => {
  const home = await mkdtemp(join(tmpdir(),"autonomous-retry-test-"));
  try {
    const dir=join(home,".openclaw/workspace/research/agent-commerce");
    await mkdir(dir,{recursive:true});
    const previousAt=new Date().toISOString();
    await writeFile(join(dir,"commercial-autopilot-state.json"),JSON.stringify({
      version:1,operations:{},lastDiscoveryAt:previousAt,lastRelayAt:null,
      relayTargets:{},lastDiscovery:{
        at:previousAt,channel:"mars",action:"discover_buyer_demand",
        reply:{state:"TASK_STATE_FAILED",operationStatus:422,operationResult:JSON.stringify({status:"QUERY_REQUIRED"})}
      }
    }));
    const mock=join(home,"mock-query-required.mjs");
    await writeFile(mock,`globalThis.fetch=async (url,opts)=>{
      const data=JSON.parse(opts.body);
      const query=data.params?.message?.parts?.[0]?.data?.input?.query;
      if(typeof query!=="string" || query.trim().length<10) throw new Error("QUERY_REQUIRED");
      return new Response(JSON.stringify({jsonrpc:"2.0",result:{task:{
        id:"mock_matched",status:{state:"TASK_STATE_COMPLETED"},
        metadata:{operationResult:{ok:true,status:200,data:{status:"OK",rows:[]}}}
      }}}),{status:200,headers:{"content-type":"application/json"}});
    };`);
    const script=resolve("a2a/commercial-autopilot.mjs");
    const env={...process.env,HOME:home};
    const run=()=>spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    const first=run();
    assert.equal(first.status,0,first.stderr);
    const signals=JSON.parse(await readFile(join(dir,"commercial-autopilot-signals.json"),"utf8"));
    assert.equal(signals.latestDiscovery.reply.state,"TASK_STATE_COMPLETED");
    assert.ok(signals.latestDiscovery.query.length > 10);
    const second=run();
    assert.equal(second.status,0,second.stderr);
    assert.doesNotMatch(second.stdout,/MARS demand discovery:/);
  } finally { await rm(home,{recursive:true,force:true}); }
});
