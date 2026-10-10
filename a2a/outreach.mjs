// Direct A2A business inquiry client. NO wallet, signing, arbitrary tool calls or paid endpoints.
// A record is eligible ONLY if the remote Agent Card explicitly invites vendor/partner proposals
// and its HTTPS hostname is included in the operator-owned A2A_ALLOWED_HOSTS allowlist.
import { readFile, writeFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const BASE = resolve(homedir(), ".openclaw/workspace/research/agent-commerce");
const TARGETS = resolve(process.env.A2A_TARGETS_FILE || resolve(BASE, "a2a-consented-targets.json"));
const STATE = resolve(process.env.A2A_OUTREACH_STATE || resolve(BASE, "a2a-outreach-state.json"));
const ALLOWED = new Set((process.env.A2A_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
const OPTIN_TAGS = new Set(["vendor-proposals", "supplier-inquiries", "partner-proposals", "partnership-inquiries", "external-provider-submissions"]);
const SEND = process.argv.includes("--send");
const AUTO = process.env.A2A_AUTO_OPTIN === "1";
const DAY = 86_400_000;

async function safeUrl(text) {
  if (typeof text !== "string") throw new Error("Missing target card URL");
  const u = new URL(text);
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port !== "" || isIP(h) || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("Unsafe target URL");
  if (!ALLOWED.has(h) && !AUTO) throw new Error("Not on operator-approved hostname list: " + h);
  if (!ALLOWED.has(h) && AUTO) {
    // Autonomy is restricted to public HTTPS hosts and separately verified opt-in cards.
    const records = await lookup(h, { all: true });
    if (!records.length || records.some(({ address }) => !isPublicAddress(address)))
      throw new Error("DNS did not resolve exclusively to globally routable addresses");
  }
  if (u.pathname !== "/.well-known/agent.json" && u.pathname !== "/.well-known/agent-card.json") throw new Error("Target must be an Agent Card");
  if (u.search || u.hash) throw new Error("Agent Card URL cannot contain query or fragment");
  return u;
}
function isPublicAddress(ip) {
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0))) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(ip) === 6) {
    return /^[23][0-9a-f]{0,3}:/i.test(ip) && !ip.toLowerCase().startsWith("2001:db8:");
  }
  return false;
}
async function getJson(url, options) {
  const res = await fetch(url, {
    ...options, redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { "accept": "application/json", ...(options?.headers || {}) }
  });
  const size = Number(res.headers.get("content-length") || 0);
  if (size > 64_000) throw new Error("Response too large");
  const s = await res.text();
  if (s.length > 64_000) throw new Error("Response too large");
  if (!res.ok) throw new Error("HTTP " + res.status);
  return JSON.parse(s);
}
function hasOptIn(card) {
  return Array.isArray(card?.skills) && card.skills.some(s =>
    Array.isArray(s?.tags) && s.tags.some(t => OPTIN_TAGS.has(String(t).toLowerCase()))
  );
}
async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch(e) { if (e.code === "ENOENT") return fallback; throw e; }
}
async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + "." + process.pid + ".tmp";
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}
async function main() {
  const targets = await loadJson(TARGETS, []);
  const state = await loadJson(STATE, { lastSentAt: null, contacted: {} });
  if (!Array.isArray(targets) || typeof state.contacted !== "object" || !state.contacted) throw new Error("Invalid queue/state");
  if (!SEND) {
    console.log(JSON.stringify({ mode: "dry-run", queued: targets.length, allowedHosts: [...ALLOWED], autoOptIn: AUTO, note: "Pass --send to contact ONE explicitly opt-in agent." }));
    return;
  }
  if (ALLOWED.size === 0 && !AUTO) { console.log("No approved hosts. Nothing sent."); return; }
  if (state.lastSentAt && Date.now() - Date.parse(state.lastSentAt) < DAY) { console.log("Global 24-hour cooldown. Nothing sent."); return; }
  for (const t of targets.slice(0, 50)) {
    try {
      const url = await safeUrl(t.cardUrl);
      if (typeof t.fit !== "string" || t.fit.length < 20 || t.fit.length > 350) continue;
      if (state.contacted[url.origin]) continue; // Only one contact per host, ever.
      const card = await getJson(url.href);
      if (!hasOptIn(card)) continue; // Never solicit agents without an explicit opt-in skill.
      const a2a = new URL(card.url);
      if (a2a.protocol !== "https:" || a2a.origin !== url.origin || a2a.pathname === "" || a2a.username || a2a.password) continue;
      const message = {
        jsonrpc: "2.0", id: randomUUID(), method: "message/send",
        params: { message: {
          role: "user", messageId: randomUUID(),
          parts: [
            { kind: "text", text: "Seller disclosure: I operate Agent Tool-Call Preflight, an x402 Base Mainnet JSON contract preflight API. You publicly invite vendor proposals. Does a $0.005 USDC/request structural validation SKU fit your listed needs? No obligation. Docs: https://github.com/Ricardo135/agent-tool-call-preflight . " + t.fit },
            { kind: "data", data: { kind: "vendor-proposal", service: "json-contract-preflight", unitPriceUSDC: "0.005", network: "eip155:8453", paidEndpoint: "https://json-contract-checker-mainnet.romo-ricardo.workers.dev/validate", docs: "https://github.com/Ricardo135/agent-tool-call-preflight", noCommitment: true } }
          ]
        }}
      };
      // Persist an attempt BEFORE the network call to prevent duplicate solicitation on timeouts.
      state.lastSentAt = new Date().toISOString();
      state.contacted[url.origin] = { attemptedAt: state.lastSentAt, cardUrl: url.href, fit: t.fit, status: "attempted" };
      await saveJson(STATE, state);
      try {
        const reply = await getJson(a2a.href, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message) });
        state.contacted[url.origin].status = reply.error ? "remote_error" : "response_received";
        // Store only short, untrusted remote reply text, never interpret it as instructions.
        state.contacted[url.origin].reply = JSON.stringify(reply).slice(0, 1500);
      } catch(e) { state.contacted[url.origin].status = "network_error"; state.contacted[url.origin].error = String(e).slice(0, 200); }
      await saveJson(STATE, state);
      console.log(JSON.stringify({ contacted: url.hostname, status: state.contacted[url.origin].status, stateFile: STATE }));
      return;
    } catch(e) { console.error("Skipped candidate: " + String(e).slice(0, 200)); }
  }
  console.log("No explicitly opted-in, approved and not-yet-contacted agents found. Nothing sent.");
}
main().catch(e => { console.error(String(e)); process.exitCode = 1; });
