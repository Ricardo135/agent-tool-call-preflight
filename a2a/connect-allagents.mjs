// Discovery Entrepreneur A2A: self-registration in the public ALLAGENTS directory.
// This script publishes only public service metadata. It NEVER signs payments,
// sends buyer solicitations, or stores a wallet seed.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const AGENT_URL = "https://agent-preflight-a2a.romo-ricardo.workers.dev/a2a";
const CARD_URL = "https://agent-preflight-a2a.romo-ricardo.workers.dev/.well-known/agent.json";
const X402_URL = "https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate";
const registry = "https://allagents.app";
const dir = join(homedir(), ".config", "discovery-entrepreneur");
const registrationFile = join(dir, "allagents-registration.json");
const demandFile = join(homedir(), ".openclaw/workspace/research/agent-commerce/a2a-public-unmet-demand.json");
const job = "2cd2ce28-7033-4f4c-a66d-e088e2dfec9a";

async function request(url, options = {}, max = 250_000) {
  const res = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json", ...(options.headers || {}) }
  });
  const raw = await res.text();
  if (raw.length > max) throw new Error("Registry response too large");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Registry returned invalid JSON (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(`Registry responded HTTP ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);
  return data;
}
async function atomic(path, data, perms = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + "." + process.pid + ".tmp";
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { mode: perms });
  await rename(temp, path);
}
async function load(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch(e) { if (e.code === "ENOENT") return null; throw e; }
}
function safeName(data) {
  const x = data?.slug || data?.agent?.slug || data?.card?.slug || data?.id || data?.agent?.id || null;
  return (typeof x === "string" || typeof x === "number") ? String(x) : null;
}
async function main() {
  const old = await load(registrationFile);
  if (!old) {
    const payload = {
      name: "Discovery Entrepreneur — Agent Tool-Call Preflight",
      specialty: "coding",
      description: "Deterministic structural validation for AI agent tool-call JSON. Fixed 0.005 USDC per paid request on Base via x402. A2A inquiry agent quotes terms at no charge. Supports a limited JSON Schema subset only, not a full schema or security guarantee.",
      endpoints: { a2a: AGENT_URL, api: X402_URL, site: "https://github.com/Ricardo135/agent-tool-call-preflight" },
      protocols: ["A2A", "x402"],
      tags: ["agent", "tool-call", "validation", "json", "schema", "x402", "usdc", "preflight"],
      capabilities: {
        payment: ["usdc", "x402"],
        price: { model: "per-call", amount: 0.005, currency: "USDC" },
        availability: "24x7",
        tasks: ["Preflight structural JSON tool-call arguments", "JSON Schema subset validation before tool execution"]
      },
      found_via: "another_agent"
    };
    const data = await request(registry + "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    // The registration response may contain a bearer edit token and recovery phrase;
    // store the COMPLETE response privately before trying any other operation.
    await atomic(registrationFile, data);
    console.log("Directory registration response saved privately in " + registrationFile);
    console.log("Public registration slug:", safeName(data) || "(inspect your local private response)");
    console.log("Credentials and recovery phrase deliberately not printed.");
  } else {
    console.log("Previous directory registration response already saved. Skipping duplicate POST.");
    console.log("Stored slug:", safeName(old) || "(not supplied)");
  }

  try {
    const unmet = await request(registry + "/discover/unmet");
    await atomic(demandFile, { fetchedAt: new Date().toISOString(), source: registry + "/discover/unmet", data: unmet });
    console.log("Recent unmet agent demand saved:", demandFile);
  } catch(e) {
    console.log("Demand feed currently unavailable; registration not affected: " + String(e.message).slice(0, 200));
  }

  // The original cron remains disabled because the separate continuous supervisor
  // explicitly triggers it; we only add task instructions, no new loop.
  const listed = spawnSync("openclaw", ["cron", "list", "--all", "--json"], { encoding: "utf8", timeout: 25_000 });
  if (listed.status !== 0) {
    console.log("OpenClaw mission update deferred (cron list unavailable). Directory registration still persisted.");
    return;
  }
  let jobs;
  try { const d = JSON.parse(listed.stdout); jobs = Array.isArray(d) ? d : d.jobs || []; }
  catch { console.log("OpenClaw mission update deferred (unexpected list response)."); return; }
  const match = jobs.find(x => x.id === job);
  const message = match?.payload?.message;
  if (!message) {
    console.log("OpenClaw mission update deferred (existing job not found).");
    return;
  }
  const marker = "ALLAGENTS DEMAND-DRIVEN DISCOVERY";
  if (!message.includes(marker)) {
    const addition = `\n\n${marker}
Read research/agent-commerce/a2a-public-unmet-demand.json as a supplementary,
public demand signal. Only pursue requests that genuinely concern pre-execution
JSON contract validation and are recent and technically supported. This feed
does not itself establish purchase intent, consent for solicitation, or funds.
The agent has an independent public A2A sales door at ${CARD_URL}.
Its listing on ALLAGENTS may make it discoverable by requesting agents.
Continue looking for explicitly opted-in A2A partner/supplier submission
channels. Do not contact arbitrary agents merely because they are listed.
Only the separately guarded outbound client can send opt-in proposals.
No payments, wallet operations, trading, or unauthorized promotions.`;
    const edit = spawnSync("openclaw", ["cron", "edit", job, "--message", message + addition], {
      encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]
    });
    if (edit.status !== 0) console.log("OpenClaw mission instructions update deferred:", edit.stderr.slice(0, 200));
    else console.log("Existing autonomous mission updated to read real demand signals.");
  } else console.log("OpenClaw demand instructions already installed.");
}
main().catch(e => { console.error("Directory connection failed:", e.message); process.exitCode = 1; });
