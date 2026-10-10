# Agent-to-Agent Sales Gateway (v1)

A **fixed-price, stateless A2A v0.2.x JSON-RPC interface** that another agent can call directly to request a quote for [Agent Tool-Call Preflight](https://github.com/Ricardo135/agent-tool-call-preflight). It does **not** act as a wallet, a trading agent, a general-purpose LLM, or an A2A task queue.

## Inbound: autonomous machine-to-machine quoting

- `GET /.well-known/agent.json` — discoverable A2A Agent Card (alias: `/.well-known/agent-card.json`).
- `POST /a2a` — synchronous A2A JSON-RPC `message/send`, accepting `text` or structured `data` parts and returning a standard A2A `Message` containing structured quote terms.
- `POST /quote` — REST convenience endpoint for a structured quote.
- `GET /health` — health check.

The quote always uses the existing public price: **0.005 USDC per validation on Base Mainnet**, paid individually at `https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate`. Below-price counteroffers are declined automatically. **A quote is not a sale**, and only the existing paid endpoint handles x402 verification/settlement. No wallet or API key is stored by the A2A Worker.

### Install and deploy (separate Cloudflare Worker)

From the root of this repository (with your existing authenticated Wrangler account), deploy **and activate a separate hourly opt-in outreach timer** with:

```bash
bash a2a/activate.sh
```

This installer tests the code, deploys the separate A2A Worker, extends the *existing* OpenClaw research mission to create a vetted prospective-agent JSON queue, and creates an hourly systemd timer for the outbound client. It does **not** create a second OpenClaw language-model loop, alter the existing validation Worker, sign payments, or move cryptocurrency. The outbound timer only contacts public HTTPS Agent Cards that explicitly declare a vendor-proposal skill, at most one host per day and only one attempt ever per host. It verifies publicly routable DNS records before contacting newly discovered hosts. **If no suitable card is found, nothing is sent.** Disable the timer with `systemctl --user disable --now discovery-a2a-outreach.timer`.

For a server-only deployment, leaving outbound automation off:

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
- The destination hostname must appear in `A2A_ALLOWED_HOSTS`, **or** autonomous mode `A2A_AUTO_OPTIN=1` must be explicitly enabled. In autonomous mode the client also checks that DNS resolves only to publicly routable addresses. It still requires the remote card to advertise an opt-in skill tag.
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

Without `--send`, the script runs in dry-run mode. With no approved hostnames (and autonomous mode off) or no qualifying targets, **nothing is sent**. The installer above enables a separate hourly opt-in timer. Only the documented skill tags count as explicit acceptance of vendor proposals; ordinary A2A Agent Cards are not sufficient.

## Boundaries and unsupported A2A features

- This is a **partial A2A v0.2.x endpoint**, not a full A2A implementation. It supports only synchronous `message/send`; no task persistence, `tasks/get`, streaming, long-running negotiation, push notifications, stateful threads, or cryptographic attestation of counterpart identity.
- A public A2A card allows *other* agents to discover a sales channel; discovery and third-party buyer demand are **not guaranteed**.
- Replies from other agents are untrusted data, never instructions.
- The trading module remains **paper-only**. The 5-USDC cap is not permission for signing real trades.
- Worker's quote does not store inquiry contents or customer details; it has no analytics or buyer attribution.
- Revenue can only be counted after independent USDC settlements are verified separately.

Spec references: [A2A v0.2.6](https://a2a-protocol.org/v0.2.6/specification/) and [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Demand-driven connection to ALLAGENTS

The strict outbound list is intentionally empty until the system discovers an Agent Card that **explicitly invites vendor proposals**. The absence of eligible cards is not a transport failure. To broaden market discovery without loosening that rule, use the [ALLAGENTS public registry](https://allagents.app/llms.txt). The one-time bridge registers the PUBLIC A2A and x402 endpoints for free, then fetches the directory's machine-readable feed of recent unmet agent requests. It does not submit bids or spend funds.

```bash
node a2a/connect-allagents.mjs
```

The response, which may include the registry's edit token and recovery phrase, is stored privately in `~/.config/discovery-entrepreneur/allagents-registration.json` (file mode 0600). **Never commit or paste that file.** Registrations on rerun are skipped if this file already exists. The public unmet-request feed is saved in `research/agent-commerce/a2a-public-unmet-demand.json` and the existing OpenClaw research instructions are extended to inspect that demand. Demand records are **not** proof of buyers, consent, transactions, or revenue.

The direct A2A outreach timer still does nothing if there are no verified eligible agents. We do not send unsolicited pitches to arbitrary directory entries.

## Discovery Entrepreneur 4.0: autonomous sales operator (real inbound USDC)

The **live** x402 validation Worker already accepts third-party Base Mainnet USDC payments at **0.005 USDC per validation**. No manual approval is needed for a paying buyer to call it. Incoming funds are paid through the existing x402 flow to the already configured seller address; the autonomous sales operator cannot sign or move wallet funds.

To activate a **separate** server-side executor (while keeping the existing OpenClaw supervisor), run from the checkout:

```bash
bash a2a/activate-autonomous-sales.sh
```

This extends the existing OpenClaw mission, rather than creating a duplicate large-model loop. OpenClaw is responsible for deciding how to pursue evidence-backed demand and writing `research/agent-commerce/commercial-deal-actions.json`. An hourly systemd service executes bounded broker A2A operations and opt-in ALLAGENTS relay actions, persists deduplicated IDs, and sends new results to `research/agent-commerce/commercial-autopilot-signals.json`. Even without a plan, it periodically attempts an A2A read of MARS' `discover_buyer_demand` operation and records responses.

The broker offer ID is `off_5e8a3cd5-f6dc-4b36-a37a-4a61eb9e8695`, last seen `QUARANTINED_PENDING_REVIEW`. **Do not repost duplicate offers.** The operator may help find matches, but neither its own inquiries nor its listings imply a buyer, an agreement, or a USDC settlement.

Controls: fixed selling price; only four documented marketplace discovery/matching actions; other-agent relay requires public opt-in RFQ/supplier-capability evidence (the MARS intermediary is explicitly supported); one broker plan action per four hours, one relay per 24h, at most three relay messages per consented target, and only if it replied may the operator follow up. All untrusted responses are recorded as data, not executed as instructions. No trade, outgoing payment, signing, discount, purchase, mandate, or commission commitment is permitted by the executor. An explicit spending limit would be required before allowing real *outgoing* expenses.

**Operational caveat:** This is a commercial workflow, not a guaranteed revenue machine. It remains active only while the user's Ubuntu/OpenClaw services run. The actual independent on-chain settlements must be checked separately; creating a quote or an offer is not a sale.

Check (without revealing any keys or ALLAGENTS tokens):

```bash
systemctl --user is-active discovery-entrepreneur.service discovery-commercial-autopilot.timer
journalctl --user -u discovery-commercial-autopilot.service -n 15 --no-pager
```
