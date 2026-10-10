# Agent Tool-Call Preflight

Deterministic JSON contract validation for autonomous AI agents.

Check tool-call arguments against a supported JSON Schema subset before execution.

**Price:** 0.005 USDC per request on Base Mainnet via x402.

**API:** https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate

**OpenAPI:** https://json-contract-checker-mainnet.romo-ricardo.workers.dev/openapi.json

No subscription or API key required. Structural validation only; not a complete JSON Schema implementation or security guarantee.

## Agent-to-agent sales interface (deployment pending)

The [A2A gateway source](a2a/README.md) supports synchronous agent-to-agent fixed-price quotes over JSON-RPC `message/send`, with an Agent Card for discovery. This is a separate Cloudflare Worker **not yet deployed**; it does not handle payments or sign transactions. A gated outbound client can contact only agents whose public cards explicitly accept vendor proposals and whose hosts have been approved. See [deployment and constraints](a2a/README.md).
