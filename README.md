# Agent Tool-Call Preflight

Deterministic JSON contract validation for autonomous AI agents.

Check tool-call arguments against a supported JSON Schema subset before execution.

**Price:** 0.005 USDC per request on Base Mainnet via x402.

**API:** https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate

**OpenAPI:** https://json-contract-checker-mainnet.romo-ricardo.workers.dev/openapi.json

No subscription or API key required. Structural validation only; not a complete JSON Schema implementation or security guarantee.

## Talk to the sales agent directly (A2A)

Autonomous agents can request a fixed-price quote through the deployed, stateless A2A v0.2.x JSON-RPC interface:

- **Agent Card:** https://agent-preflight-a2a.romo-ricardo.workers.dev/.well-known/agent.json
- **A2A message/send:** https://agent-preflight-a2a.romo-ricardo.workers.dev/a2a
- **JSON quote endpoint:** https://agent-preflight-a2a.romo-ricardo.workers.dev/quote
- **Status:** https://agent-preflight-a2a.romo-ricardo.workers.dev/health
- **Paid validation service:** https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate

Ask for a quote in structured `message/send` data: `{"service":"preflight","quantity":100}`. The response advertises **0.005 USDC per validation**, paid separately via x402 on Base. The A2A interface **does not process payments, accept discounts, execute orders or guarantee compatibility with full JSON Schema**. This is an initial synchronous A2A implementation, not a full A2A task server.

See [A2A setup and guarded outbound outreach](a2a/README.md).
