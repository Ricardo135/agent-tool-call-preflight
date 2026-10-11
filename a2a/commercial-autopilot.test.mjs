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
      if (action === "find_counterparty") {
        const input = req.params.message.parts[0].data.input;
        if (typeof input.query !== "string" || input.query.length < 5 ||
            input.item_type !== "DEMAND" || !Number.isInteger(input.limit) ||
            input.subject !== undefined || input.offer_item_id !== undefined) {
          throw new Error("Invalid MARS broker search schema");
        }
      }
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

test("An already-failed legacy MARS broker attempt is repaired only once using query/item_type", async () => {
  const home=await mkdtemp(join(tmpdir(),"broker-schema-repair-"));
  try {
    const dir=join(home,".openclaw/workspace/research/agent-commerce");
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,"commercial-autopilot-state.json"),JSON.stringify({
      version:1,discoveryQueryVersion:1,lastDiscoveryAt:new Date().toISOString(),
      lastMarsActionAt:new Date().toISOString(),lastRelayAt:null,relayTargets:{},
      operations:{
        MARS_B2B_BROKER_INIT_20261010:{
          status:"TASK_STATE_FAILED",action:"find_counterparty",
          reply:{state:"TASK_STATE_FAILED",operationStatus:422,operationOk:false,
                 operationResult:JSON.stringify({status:"QUERY_REQUIRED"})}
        }
      }
    }));
    const mock=join(home,"mock-broker-repair.mjs");
    await writeFile(mock,`globalThis.fetch=async (url,opts)=>{
      const req=JSON.parse(opts.body);
      const payload=req.params.message.parts[0].data;
      if(payload.action!=="find_counterparty" ||
         !payload.input.query || payload.input.item_type!=="DEMAND" ||
         payload.input.offer_item_id!==undefined || !Number.isInteger(payload.input.limit)){
        throw new Error("INVALID_BROKER_CONTRACT");
      }
      return new Response(JSON.stringify({jsonrpc:"2.0",result:{task:{
        id:"repair_mock",status:{state:"TASK_STATE_COMPLETED"},
        metadata:{operationResult:{ok:true,status:200,data:{status:"OK",rows:[]}}}
      }}}),{status:200,headers:{"content-type":"application/json"}});
    };`);
    const script=resolve("a2a/commercial-autopilot.mjs");
    const env={...process.env,HOME:home};
    const run=()=>spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    const first=run();
    assert.equal(first.status,0,first.stderr);
    assert.match(first.stdout,/MARS commercial operation: find_counterparty TASK_STATE_COMPLETED/);
    const state=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(state.operations.MARS_B2B_BROKER_SCHEMA_REPAIR_V2.status,"TASK_STATE_COMPLETED");
    assert.equal(state.operations.MARS_B2B_BROKER_SCHEMA_REPAIR_V2.input.item_type,"DEMAND");
    const second=run();
    assert.equal(second.status,0,second.stderr);
    assert.doesNotMatch(second.stdout,/MARS commercial operation:/);
  } finally { await rm(home,{recursive:true,force:true}); }
});

test("Cross-sector AI buyer qualification is sent only to explicit RFQ opt-in, without invented product claims", async () => {
  const home=await mkdtemp(join(tmpdir(),"sector-qualification-test-"));
  try {
    const dir=join(home,".openclaw/workspace/research/agent-commerce");
    const cfg=join(home,".config/discovery-entrepreneur");
    await mkdir(dir,{recursive:true});
    await mkdir(cfg,{recursive:true});
    await writeFile(join(cfg,"allagents-registration.json"), JSON.stringify({token:"fake-test-token-1234567"}));
    await writeFile(join(dir,"commercial-autopilot-state.json"),JSON.stringify({
      version:1,discoveryQueryVersion:1,lastDiscoveryAt:new Date().toISOString(),
      operations:{},lastRelayAt:null,relayTargets:{}
    }));
    await writeFile(join(dir,"commercial-deal-actions.json"),JSON.stringify({actions:[{
      id:"CROSS_SECTOR_NEED_001",channel:"allagents-relay",purpose:"buyer-qualification",
      to:"optin-sector-agent",
      buyerNeed:"workflow integration and testable process automation",
      rationale:"This published vendor-intake channel invites proposals for a specific workflow need.",
      evidence:"https://example.org/public/rfq/123"
    }]}));
    const mock=join(home,"mock-sector.mjs");
    await writeFile(mock,`globalThis.fetch=async (url,opt={})=>{
      if(String(url).includes("/agent/optin-sector-agent?format=json"))
        return new Response(JSON.stringify({agent:{tags:["vendor-proposals"]}}),{status:200,headers:{"content-type":"application/json"}});
      if(String(url)==="https://allagents.app/relay") {
        const req=JSON.parse(opt.body);
        if(req.to!=="optin-sector-agent" || !req.text.includes("acceptance criteria") ||
           !req.text.includes("workflow integration") || req.text.includes("0.005 USDC"))
          throw new Error("Cross-sector qualification missing or falsely advertises fixed SKU");
        return new Response(JSON.stringify({reply:"Please send requirements."}),{status:200,headers:{"content-type":"application/json"}});
      }
      throw new Error("Unexpected fetch: "+url);
    };`);
    const env={...process.env,HOME:home};
    const script=resolve("a2a/commercial-autopilot.mjs");
    const first=spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    assert.equal(first.status,0,first.stderr);
    const state=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(state.operations.CROSS_SECTOR_NEED_001.status,"response_received");
    assert.equal(state.relayTargets["optin-sector-agent"].count,1);
    const second=spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    assert.equal(second.status,0,second.stderr);
    const after=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(after.relayTargets["optin-sector-agent"].count,1);
  } finally { await rm(home,{recursive:true,force:true}); }
});

test("OpenClaw-selected market research overrides fixed JSON-validation queries without duplicates", async () => {
  const home=await mkdtemp(join(tmpdir(),"openclaw-market-selected-"));
  try {
    const dir=join(home,".openclaw/workspace/research/agent-commerce");
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,"commercial-market-placeholder.txt"),"none");
    await writeFile(join(dir,"market-demand-plan.json"),JSON.stringify({queries:[
      {query:"autonomous manufacturing workflow integration procurement",
       evidence:"https://example.org/rfq/manufacturing-automation",
       rationale:"A public buyer request explicitly calls for automation workflow integration.",status:"search"},
      {query:"autonomous manufacturing workflow integration procurement",
       evidence:"https://example.org/rfq/manufacturing-automation",
       rationale:"Duplicate public need must not create extra queries.",status:"search"},
      {query:"unrelated repeated query should not be used",
       evidence:"https://example.org/invalid",
       rationale:"This candidate was already disqualified by the autonomous agent.",status:"disqualified"}
    ]}));
    const mock=join(home,"mock-market.mjs");
    await writeFile(mock,`globalThis.fetch=async (url,opt={})=>{
      const data=JSON.parse(opt.body);
      const p=data?.params?.message?.parts?.[0]?.data;
      if(p?.action!=="discover_buyer_demand" || p?.input?.query!=="autonomous manufacturing workflow integration procurement")
        throw new Error("Executor ignored OpenClaw-selected query");
      return new Response(JSON.stringify({jsonrpc:"2.0",result:{task:{
        id:"discovery_agent_chosen",status:{state:"TASK_STATE_COMPLETED"},
        metadata:{operationResult:{ok:true,status:200,data:{demands:[]}}}
      }}}),{status:200,headers:{"content-type":"application/json"}});
    };`);
    const script=resolve("a2a/commercial-autopilot.mjs");
    const env={...process.env,HOME:home};
    const run=()=>spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    const first=run();
    assert.equal(first.status,0,first.stderr);
    const signals=JSON.parse(await readFile(join(dir,"commercial-autopilot-signals.json"),"utf8"));
    assert.equal(signals.latestDiscovery.query,"autonomous manufacturing workflow integration procurement");
    assert.equal(signals.latestDiscovery.source,"agent_selected_public_market_research");
    const second=run();
    assert.equal(second.status,0,second.stderr);
    assert.doesNotMatch(second.stdout,/MARS demand discovery:/);
  } finally { await rm(home,{recursive:true,force:true}); }
});

test("Empty OpenClaw market plan suspends legacy MARS searches after bounded attempts", async () => {
  const home=await mkdtemp(join(tmpdir(),"openclaw-no-market-"));
  try {
    const dir=join(home,".openclaw/workspace/research/agent-commerce");
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,"commercial-autopilot-state.json"),JSON.stringify({
      version:1,operations:{},discoveryCycle:4,
      discoveryQueryVersion:1,lastDiscoveryAt:new Date().toISOString(),
      relayTargets:{},lastRelayAt:null
    }));
    await writeFile(join(dir,"market-demand-plan.json"),'{"queries":[]}');
    const mock=join(home,"mock-never-network.mjs");
    await writeFile(mock,`globalThis.fetch=async ()=>{ throw new Error("No old MARS searches allowed"); };`);
    const script=resolve("a2a/commercial-autopilot.mjs");
    const env={...process.env,HOME:home};
    const result=spawnSync(process.execPath,["--import",mock,script,"--run"],{env,encoding:"utf8",timeout:10000});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/MARS buyer discovery suspended/);
    const signals=JSON.parse(await readFile(join(dir,"commercial-autopilot-signals.json"),"utf8"));
    assert.equal(signals.latestDiscovery.status,"suspended_no_agent_selected_demand");
  } finally {await rm(home,{recursive:true,force:true});}
});
