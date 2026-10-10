#!/usr/bin/env python3
"""Discovery Entrepreneur 4.1: prioritize agent-native x402 demand and broker execution.

One-shot, idempotent local upgrade. Leaves existing cron cadence, timer, wallet
and revenue endpoints untouched. No payment credentials are accessed.
"""
import json
import pathlib
import subprocess
import sys

JOB_ID = "2cd2ce28-7033-4f4c-a66d-e088e2dfec9a"
OFFER_ID = "off_5e8a3cd5-f6dc-4b36-a37a-4a61eb9e8695"
WORKSPACE = pathlib.Path.home() / ".openclaw/workspace/research/agent-commerce"
PLAN = WORKSPACE / "commercial-deal-actions.json"

MARKER = "DISCOVERY ENTREPRENEUR 4.1 — AGENT-NATIVE SALES FIRST"
ADDITION = """
DISCOVERY ENTREPRENEUR 4.1 — AGENT-NATIVE SALES FIRST
Revenue goal: at least 2 USDC of VERIFIED independent third-party x402
settlement; outreach/quotes/offers NEVER count toward revenue.

MAJOR MARKET CORRECTION:
The public MARS discover_buyer_demand agent mostly scans UK/EU/US
procurement. A successful query for AI tool-call JSON validation returned
zero strictly relevant live buyers, therefore DO NOT spend the majority
of your OpenAI research cycles on generic tenders or redoing empty MARS
queries. The broker remains usable for B2B introductions when warranted.

TOP PRIORITIES EVERY WORKING CYCLE:
1. Identify REAL existing agent buyers, autonomous workflows and agents
explicitly asking for API pre-execution tool-call JSON validation. Focus
on agent-native x402 buyers and partner/RFQ intake, not generic vendors.
Research examples via PUBLIC pages/API, not credentials:
  https://agent402.tools/marketplace
  https://x402-list.com/api
  https://www.x402scan.com/
  https://x402.new/
These are markets, not proof of demand or consent. Agent402 and x402scan
seller registration were already performed. Check visibility and actual
settlements rather than submit duplicate offers. Respect provider rate
limits, no metered or paid reads; if a market asks for payment, stop.
2. Find specific eligible agent-to-agent channels explicitly requesting
vendors, integrations, or supplying RFQs. Review evidence and explain
why our limited JSON Schema subset solves their stated problem.
3. Propose *ONE* honest next sale or partnership action at a time in
research/agent-commerce/commercial-deal-actions.json. Existing permitted
executor channels: "mars" (find_counterparty,
discover_buyer_demand,qualify_buyer_demand,match_verified_suppliers)
and "allagents-relay" to explicit opt-in agents, max 500 chars.
The live MARS offer ID is off_5e8a3cd5-f6dc-4b36-a37a-4a61eb9e8695.
Use unique action IDs and real references. Do NOT guess schemas or repeat
previous failed actions; inspect commercial-autopilot-signals.json and
commercial-autopilot-state.json. Only valid actionable plans will execute.
4. FOLLOW UP via supported A2A/relay if a counterpart legitimately replies,
and invite an independently funded test purchase from the production
x402 /validate endpoint. Be truthful about the 0.005 USDC per-request
price and partial structural schema coverage. Other agents decide if to
pay: NEVER self-pay or simulate buyers.
5. Record verified independent on-chain x402 receipts separately from
offers, tests and self-interactions. When no qualified contacts exist,
write an honest blocker and seek a different channel; do not send spam.

Autonomy means YOU choose and prepare the next permitted commercial action
and the executor carries it out; human should not be required to relay
routine API requests. Do not change seller price, financial exposure, or
security policies. Receiving real third-party USDC is permitted; outbound
spending, signing, commission commitments and live trading remain disabled.
"""

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=55).stdout

def main():
    data = json.loads(run(["openclaw", "cron", "list", "--all", "--json"]))
    jobs = data if isinstance(data, list) else data.get("jobs", [])
    job = next((j for j in jobs if j.get("id") == JOB_ID), None)
    original = job.get("payload", {}).get("message") if job else None
    if not isinstance(original, str) or not original:
        raise RuntimeError("Could not identify original commercial mission; no changes made")
    if MARKER not in original:
        run(["openclaw", "cron", "edit", JOB_ID, "--message", original.rstrip() + "\n\n" + ADDITION.strip()])
        print("OpenClaw commercial mission reprioritized to agent-native x402 demand.")
    else:
        print("Agent-native mission already installed (no duplicate appended).")

    WORKSPACE.mkdir(parents=True, exist_ok=True)
    if PLAN.exists():
        data = json.loads(PLAN.read_text())
        if not isinstance(data, dict) or not isinstance(data.get("actions"), list):
            raise ValueError("Plan file is not a valid object with actions array; left unchanged.")
    else:
        data = {"actions": []}

    # One explicit broker introduction request, not an attempt to pay or publish.
    seed_id = "MARS_B2B_BROKER_INIT_20261010"
    if not data["actions"] and not already_attempted(seed_id):
        data["actions"].append({
            "id": seed_id,
            "channel": "mars",
            "operation": "find_counterparty",
            "input": {
                "subject": "Find an independent buyer for our $0.005 USDC x402 JSON tool-call structural preflight validation API",
                "offer_item_id": OFFER_ID
            },
            "rationale": "MARS publicly offers AI-to-AI B2B matching and counterparty discovery, appropriate for an existing supplier offer.",
            "evidence": "https://mars-economic-agent-gateway.mars-economic.workers.dev/docs"
        })
        PLAN.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        PLAN.chmod(0o600)
        print("Seeded ONE broker matching request in autonomous action queue.")
    else:
        print("Existing plan or attempted broker request preserved without duplicates.")

def already_attempted(action_id):
    state = WORKSPACE / "commercial-autopilot-state.json"
    if not state.exists():
        return False
    data = json.loads(state.read_text())
    return action_id in data.get("operations", {})

if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        print("Agent-native upgrade stopped:", str(ex), file=sys.stderr)
        sys.exit(1)
