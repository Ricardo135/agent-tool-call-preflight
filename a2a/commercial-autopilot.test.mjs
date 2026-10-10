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
    const second = spawnSync(process.execPath, ["--import",mock,script,"--run"], {env,encoding:"utf8",timeout:10000});
    assert.equal(second.status,0,second.stderr);
    assert.doesNotMatch(second.stdout,/MARS commercial operation:/);
    state=JSON.parse(await readFile(join(dir,"commercial-autopilot-state.json"),"utf8"));
    assert.equal(Object.keys(state.operations).length,1);
  } finally { await rm(home,{recursive:true,force:true}); }
});
