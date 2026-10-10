// Discovery Entrepreneur — minimal, stateless A2A v0.2.x commercial interface.
// This Worker never holds payment keys, performs transfers, or changes prices.
const PRODUCT = "Agent Tool-Call Preflight";
const PRICE = "0.005";
const NETWORK = "eip155:8453";
const ASSET = "USDC";
const API = "https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate";
const OPENAPI = "https://json-contract-checker-mainnet.romo-ricardo.workers.dev/openapi.json";
const DOCS = "https://github.com/Ricardo135/agent-tool-call-preflight";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function respond(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
function isObject(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function safeText(x, max = 400) { return typeof x === "string" ? x.slice(0, max) : ""; }
function card(origin) {
  return {
    protocolVersion: "0.2.6",
    name: "Discovery Entrepreneur — Preflight Sales Agent",
    description: "Automated, fixed-price business inquiries and quotes for deterministic JSON tool-call contract validation. Payment and actual validation occur only at the separate x402 endpoint. This endpoint does not negotiate discounts or execute financial transactions.",
    url: origin + "/a2a",
    preferredTransport: "JSONRPC",
    provider: { organization: "Agent Tool-Call Preflight", url: DOCS },
    version: "1.0.0",
    documentationUrl: DOCS,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [{
      id: "preflight-quote",
      name: "Get a JSON tool-call preflight quote",
      description: "Ask whether the structural JSON validation API fits your workflow and obtain fixed x402 payment terms; no payment is taken via A2A.",
      tags: ["x402", "quote", "contract-validation", "json-schema", "tool-call", "Base", "USDC"],
      examples: ["Quote 100 JSON validation calls", "Get the x402 purchase URL for tool-call preflight"]
    }]
  };
}
function quote(inquiry = {}) {
  const requested = inquiry.service ?? inquiry.product ?? "preflight";
  if (typeof requested !== "string" || !/^(preflight|tool-call-preflight|json-contract-validation)$/i.test(requested)) {
    return { decision: "unsupported_service", product: PRODUCT, availableService: "preflight", noCommitment: true };
  }
  const quantity = inquiry.quantity == null ? 1 : inquiry.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
    return { decision: "invalid_quantity", message: "quantity must be an integer between 1 and 100000", noCommitment: true };
  }
  const budget = inquiry.maxUnitPriceUsdc ?? inquiry.max_unit_price_usdc ?? null;
  if (budget != null && (typeof budget !== "string" && typeof budget !== "number" || !Number.isFinite(Number(budget)) || Number(budget) < 0)) {
    return { decision: "invalid_budget", noCommitment: true };
  }
  if (budget != null && Number(budget) < Number(PRICE)) {
    return {
      decision: "counteroffer_declined",
      reason: "The current unit price is fixed; no discount is authorized.",
      priceUsdcPerRequest: PRICE,
      noCommitment: true
    };
  }
  // Quote is illustrative only; there is no prepaid volume bundle or payment commitment.
  return {
    decision: "quote",
    product: PRODUCT,
    scope: "Supported subset of structural JSON Schema; not complete JSON Schema or security authorization",
    priceUsdcPerRequest: PRICE,
    requestsInEstimate: quantity,
    estimatedTotalUsdc: (quantity * Number(PRICE)).toFixed(3),
    network: NETWORK,
    token: ASSET,
    paymentMethod: "x402 v2, exact, pay-per-request",
    paidEndpoint: API,
    openapi: OPENAPI,
    documentation: DOCS,
    terms: "Illustrative estimate only. Each request is paid separately at the existing endpoint. No discount, reservation, purchase, subscription or delivery commitment is created by this quote.",
    noCommitment: true
  };
}
function rpcError(id, code, message) {
  return respond({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}
function a2a(req) {
  if (!isObject(req) || req.jsonrpc !== "2.0" || (typeof req.id !== "number" && typeof req.id !== "string") || typeof req.method !== "string") {
    return rpcError(null, -32600, "Invalid JSON-RPC request");
  }
  if (req.method !== "message/send") return rpcError(req.id, -32601, "Only message/send is supported");
  const m = req.params?.message;
  if (!isObject(m) || m.role !== "user" || !Array.isArray(m.parts) || m.parts.length < 1 || m.parts.length > 12 || m.parts.some(p => !isObject(p))) {
    return rpcError(req.id, -32602, "Expected params.message with role=user and 1–12 parts");
  }
  const textPart = m.parts.find(p => p.kind === "text" && typeof p.text === "string");
  const dataPart = m.parts.find(p => p.kind === "data" && isObject(p.data));
  if (!textPart && !dataPart) return rpcError(req.id, -32602, "Expected a text or data part");
  let inquiry = dataPart ? dataPart.data : {};
  // For plain text, do not use an LLM or interpret arbitrary instructions.
  // A plain text request always receives standard fixed-price terms.
  if (!isObject(inquiry)) inquiry = {};
  const offer = quote(inquiry);
  const responseText = offer.decision === "quote"
    ? `Fixed quote: ${PRICE} USDC per validation on Base Mainnet, paid per request via x402 at ${API}. Limited JSON Schema subset; no binding agreement.`
    : `Proposal not accepted automatically (${offer.decision}). Current price: ${PRICE} USDC per request; details available at ${DOCS}.`;
  const message = {
    kind: "message",
    role: "agent",
    messageId: crypto.randomUUID(),
    contextId: (typeof m.contextId === "string" && m.contextId.length <= 128) ? m.contextId : crypto.randomUUID(),
    parts: [{ kind: "text", text: responseText }, { kind: "data", data: offer }]
  };
  return respond({ jsonrpc: "2.0", id: req.id, result: message });
}
async function parseBody(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(len) && len > 8192) return { error: respond({ error: "Payload too large" }, 413) };
  const raw = await request.text();
  if (raw.length > 8192) return { error: respond({ error: "Payload too large" }, 413) };
  try { return { value: JSON.parse(raw) }; }
  catch { return { error: respond({ error: "Invalid JSON" }, 400) }; }
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === "GET" || request.method === "HEAD") {
      let payload;
      if (url.pathname === "/.well-known/agent.json" || url.pathname === "/.well-known/agent-card.json") payload = card(url.origin);
      else if (url.pathname === "/health") payload = { status: "ok", mode: "quote_only", settlement: "handled_by_existing_x402_endpoint" };
      else if (url.pathname === "/") payload = { service: "A2A fixed-price sales interface", agentCard: url.origin + "/.well-known/agent.json", a2a: url.origin + "/a2a", quote: url.origin + "/quote", paidEndpoint: API };
      else return respond({ error: "Not found" }, 404);
      const r = respond(payload); return request.method === "HEAD" ? new Response(null, { status: r.status, headers: r.headers }) : r;
    }
    if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
    if (url.pathname !== "/a2a" && url.pathname !== "/quote") return respond({ error: "Not found" }, 404);
    if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return respond({ error: "Content-Type must be application/json" }, 415);
    const { value, error } = await parseBody(request);
    if (error) return error;
    return url.pathname === "/a2a" ? a2a(value) : respond(quote(value));
  }
};
