#!/usr/bin/env node
// Read-only evidence-based NFT opportunity gate. Never signs, buys, mints, lists,
// contacts buyers or interprets untrusted data as instructions. No external APIs.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = join(homedir(), '.openclaw/workspace/research/agent-commerce');
const INPUT = join(BASE, 'nft-opportunities.json');
const OUTPUT = join(BASE, 'nft-commercial-signals.json');
const TYPES = new Set(['original-nft', 'authorized-resale', 'nft-service', 'nft-license']);
const RIGHTS = new Set(['creator-owned', 'explicit-license', 'service-only']);
const CHANNELS = new Set(['mars', 'allagents-relay']);
const MAX = 50;

function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function text(x, max = 500) { return typeof x === 'string' ? x.trim().slice(0, max) : ''; }
function evidenceUrl(x) {
  if (typeof x !== 'string' || x.length > 800) return false;
  try {
    const u = new URL(x);
    return u.protocol === 'https:' && u.hostname.includes('.') &&
      !['example.com', 'example.org', 'example.net', 'localhost'].includes(u.hostname) &&
      u.pathname !== '/' && !u.username && !u.password;
  } catch { return false; }
}
export function evaluateNFT(x) {
  if (!isObject(x)) return null;
  const id = text(x.id, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{4,99}$/.test(id)) return null;
  const type = TYPES.has(x.type) ? x.type : 'unknown';
  const buyerNeed = text(x.buyerNeed, 300);
  const buyerEvidenceUrl = evidenceUrl(x.buyerEvidenceUrl) ? x.buyerEvidenceUrl : null;
  const rightsBasis = RIGHTS.has(x.rightsBasis) ? x.rightsBasis : 'unknown';
  const rightsEvidence = text(x.rightsEvidence, 400);
  const deliverable = text(x.deliverable, 400);
  const capabilityEvidence = text(x.capabilityEvidence, 400);
  const contactChannel = CHANNELS.has(x.contactChannel) ? x.contactChannel : 'unavailable';
  const estimatedCostUsdc = typeof x.estimatedCostUsdc === 'number' &&
    Number.isFinite(x.estimatedCostUsdc) && x.estimatedCostUsdc >= 0 ? x.estimatedCostUsdc : null;
  const missing = [];
  if (type === 'unknown') missing.push('valid_nft_business_model');
  if (buyerNeed.length < 20 || !buyerEvidenceUrl) missing.push('independently_evidenced_buyer_need');
  if (rightsBasis === 'unknown' || rightsEvidence.length < 20) missing.push('reviewable_ip_rights_or_service_basis');
  if (deliverable.length < 20 || capabilityEvidence.length < 20) missing.push('tested_deliverable');
  if (contactChannel === 'unavailable') missing.push('approved_opt_in_contact_channel');
  if (estimatedCostUsdc === null) missing.push('documented_cost');
  if (estimatedCostUsdc > 0) missing.push('no_outgoing_spending_authorized');
  // The live x402 price is ONLY for JSON-preflight validations.
  // This input gate does not verify NFT ownership or marketplace authorization.
  if (type !== 'nft-service') missing.push('verified_nft_listing_and_settlement_integration');
  if (type === 'nft-service' && x.paymentRoute !== 'existing-x402-json-preflight')
    missing.push('verified_payment_route_for_this_deliverable');
  if (type === 'nft-service' && x.paymentRoute === 'existing-x402-json-preflight' &&
      !/json|schema|contract|metadata/i.test(deliverable))
    missing.push('x402_service_scope_mismatch');
  const qualificationReady = missing.length === 0;
  return {
    id, type, buyerEvidenceUrl, contactChannel, missing,
    status: qualificationReady ? 'candidate_for_nonbinding_inquiry' : 'research_only',
    // Additional existing MARS/ALLAGENTS vendor opt-in and quota gates still apply.
    mayAutoContact: false,
    mayAutoListOrMint: false,
    confirmedBuyer: false,
    confirmedRevenueUsdc: null,
    note: 'Preliminary research screening only; claimed evidence requires independent checking.'
  };
}

export function evaluateLedger(x) {
  const rows = isObject(x) && Array.isArray(x.opportunities) ? x.opportunities.slice(0, MAX) : [];
  const seen = new Set();
  const evaluated = [];
  for (const r of rows) {
    const e = evaluateNFT(r);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    evaluated.push(e);
  }
  return { version: 1, candidatesEvaluated: evaluated.length, candidateForNonbindingInquiry:
    evaluated.filter(x => x.status === 'candidate_for_nonbinding_inquiry').length,
    revenueVerifiedUsdc: null, listingsVerified: 0, candidates: evaluated };
}

async function main() {
  if (!process.argv.includes('--run')) {
    console.log('Run with --run to read the OpenClaw NFT ledger and write screening signals.');
    return;
  }
  let ledger;
  try {
    const raw = await readFile(INPUT, 'utf8');
    if (raw.length > 150000) throw new Error('NFT ledger exceeds 150 KB');
    ledger = JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    ledger = {version:1, opportunities:[]};
  }
  const report = evaluateLedger(ledger);
  const output = { generatedAt: new Date().toISOString(), ...report };
  await mkdir(BASE, { recursive: true });
  const tmp = OUTPUT + '.' + process.pid + '.tmp';
  await writeFile(tmp, JSON.stringify(output, null, 2) + '\n', {mode:0o600});
  await rename(tmp, OUTPUT);
  console.log(JSON.stringify({candidates:report.candidatesEvaluated, qualificationCandidates:report.candidateForNonbindingInquiry,
    nftSalesVerified:0, outgoingPaymentsEnabled:false}));
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(e => { console.error('NFT screening failed:',e.message); process.exitCode=1; });
}
