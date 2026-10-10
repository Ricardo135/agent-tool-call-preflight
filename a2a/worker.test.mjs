import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const host = "https://agent-preflight-a2a.example.workers.dev";
const call = (path, options = {}) => worker.fetch(new Request(host + path, options));

test("discovery returns a valid A2A card describing honest capabilities", async () => {
  const response = await call("/.well-known/agent.json");
  assert.equal(response.status, 200);
  const card = await response.json();
  assert.equal(card.protocolVersion, "0.2.6");
  assert.equal(card.url, host + "/a2a");
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.skills[0].id, "preflight-quote");
});

test("fixed-price JSON-RPC A2A quote", async () => {
  const response = await call("/a2a", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "message/send",
      params: { message: { role: "user", messageId: "m1", parts: [{ kind: "data", data: { service: "preflight", quantity: 40, maxUnitPriceUsdc: "0.01" } }] } } })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.id, 42);
  assert.equal(data.result.role, "agent");
  assert.equal(data.result.parts[1].data.estimatedTotalUsdc, "0.200");
  assert.equal(data.result.parts[1].data.priceUsdcPerRequest, "0.005");
});

test("counteroffers below floor are declined; no payments made", async () => {
  const response = await call("/quote", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 1, maxUnitPriceUsdc: "0.001" })
  });
  assert.equal((await response.json()).decision, "counteroffer_declined");
});

test("rejects unsupported A2A methods", async () => {
  const response = await call("/a2a", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tasks/get", params: {} })
  });
  assert.equal((await response.json()).error.code, -32601);
});

test("rejects overly large bodies", async () => {
  const response = await call("/quote", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(8200) })
  });
  assert.equal(response.status, 413);
});
