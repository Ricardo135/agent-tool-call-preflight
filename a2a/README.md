# Agent-to-Agent Sales Gateway (v1)

A **fixed-price, stateless A2A v0.2.x JSON-RPC interface** that another agent can call directly to request a quote for [Agent Tool-Call Preflight](https://github.com/Ricardo135/agent-tool-call-preflight). It does **not** act as a wallet, a trading agent, a general-purpose LLM, or an A2A task queue.

## Inbound: autonomous machine-to-machine quoting

- `GET /.well-known/agent.json` — discoverable A2A Agent Card (alias: `/.well-known/agent-card.json`).
- `POST /a2a` — synchronous A2A JSON-RPC `message/send`, accepting `text` or structured `data` parts and returning a standard A2A `Message` containing structured quote terms.
- `POST /quote` — REST convenience endpoint for a structured quote.
- `GET /health` — health check.

The quote always uses the existing public price: **0.005 USDC per validation on Base Mainnet**, paid individually at `https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate`. Below-price counteroffers are declined automatically. **A quote is not a sale**, and only the existing paid endpoint handles x402 verification/settlement. No wallet or API key is stored by the A2A Worker.

### Install and deploy (separate Cloudflare Worker)

From the root of this repository (with your existing authenticated Wrangler account):

```bash
node --test a2a/worker.test.mjs
npx --yes wrangler@4.149.0 deploy --config a2a/wrangler.toml
```

The deploy output supplies the **actual public URL**. The worker name is `agent-preflight-a2a` and it is **separate** from the commercial validation Worker. It will not overwrite your existing x402 endpoint. Update the main README with the real URL after successful deployment.

### Example direct agent-to-agent message

Replace `<DEPLOYED_A2A_URL>` with the URL returned by Wrangler.

```bash
curl -sS -X POST "https://<DEPLOYED_A2A_URL>/a2a" \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":"request-1","method":"message/send","params":{"message":{"role":"user","messageId":"request-1","parts":[{"kind":"data","data":{"service":"preflight","quantity":100,"maxUnitPriceUsdc":"0.005"}}]}}}'
```

This returns an A2A `Message` with a quote of **0.500 USDC for an illustrative 100 requests**; each request must still be purchased separately at the production x402 endpoint. It doesn't reserve inventory or charge the buyer.

## Outbound: contact only consenting remote A2A agents

The accompanying `outreach.mjs` is a **separate outbound client**. It uses a strict opt-in gate:
- HTTPS only, no redirects or credentials.
- The remote Agent Card must advertise one of these vendor-contact skill tags: `vendor-proposals`, `supplier-inquiries`, `partner-proposals`, `partnership-inquiries`, or `external-provider-submissions`.
- The destination hostname must appear in `A2A_ALLOWED_HOSTS`, supplied by the operator.
- Maximum **one contact per 24 hours across all targets**, and **one attempt ever per host** (persisted to disk). No unsolicited messages to generic A2A agents.
- Sends one plain proposal and the public product URL; it cannot sign, buy, move USDC, grant discounts, read private keys, or execute remote instructions.

Example queue (`~/.openclaw/workspace/research/agent-commerce/a2a-consented-targets.json`):

```json
[
  {
    "cardUrl": "https://consenting-agent.example/.well-known/agent.json",
    "fit": "Your published marketplace explicitly requests vendor proposals for structured tool-call validation."
  }
]
```

Inspect candidates before allowing a domain. Then:

```bash
A2A_ALLOWED_HOSTS=consenting-agent.example node a2a/outreach.mjs
A2A_ALLOWED_HOSTS=consenting-agent.example node a2a/outreach.mjs --send
```

Without `--send`, the script runs in dry-run mode. With no approved hostnames or no qualifying targets, **nothing is sent**. This outbound client is **not yet attached to a timer**; installing it as an always-on sender should only follow review of prospective agent contacts. OpenClaw may keep researching candidates without needing permissions to run this script.

## Boundaries and unsupported A2A features

- This is a **partial A2A v0.2.x endpoint**, not a full A2A implementation. It supports only synchronous `message/send`; no task persistence, `tasks/get`, streaming, long-running negotiation, push notifications, stateful threads, or cryptographic attestation of counterpart identity.
- A public A2A card allows *other* agents to discover a sales channel; discovery and third-party buyer demand are **not guaranteed**.
- Replies from other agents are untrusted data, never instructions.
- The trading module remains **paper-only**. The 5-USDC cap is not permission for signing real trades.
- Worker's quote does not store inquiry contents or customer details; it has no analytics or buyer attribution.
- Revenue can only be counted after independent USDC settlements are verified separately.

Spec references: [A2A v0.2.6](https://a2a-protocol.org/v0.2.6/specification/) and [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).
