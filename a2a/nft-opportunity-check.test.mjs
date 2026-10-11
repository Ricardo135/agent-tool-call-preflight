import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNFT, evaluateLedger } from './nft-opportunity-check.mjs';
const valid = {id:'nft_opp_001',type:'nft-service',
  buyerNeed:'Public buyer explicitly wants NFT metadata JSON schema validation',
  buyerEvidenceUrl:'https://buyers.org/requests/nft-metadata-101',
  rightsBasis:'service-only', rightsEvidence:'Our own code validates structural JSON contracts only',
  deliverable:'JSON schema preflight for NFT metadata structure only',
  capabilityEvidence:'Local test fixtures pass for supported JSON schema subset',
  contactChannel:'mars', paymentRoute:'existing-x402-json-preflight', estimatedCostUsdc:0};
test('evidence-backed NFT-adjacent validated offer can be screened for nonbinding inquiry',()=>{
 const r=evaluateNFT(valid);
 assert.equal(r.status,'candidate_for_nonbinding_inquiry');
 assert.equal(r.mayAutoContact,false);
 assert.equal(r.mayAutoListOrMint,false);
 assert.equal(r.confirmedRevenueUsdc,null);
});
test('no real buyer URL means no qualification',()=>{
 const r=evaluateNFT({...valid,buyerEvidenceUrl:'https://example.com/fiction'});
 assert.ok(r.missing.includes('independently_evidenced_buyer_need'));
});
test('mint and resale still require real marketplace connection and settlement',()=>{
 for(const type of ['original-nft','authorized-resale','nft-license']) {
  const r=evaluateNFT({...valid,type,rightsBasis:'creator-owned'});
  assert.ok(r.missing.includes('verified_nft_listing_and_settlement_integration'));
  assert.equal(r.mayAutoListOrMint,false);
 }
});
test('non-JSON business may not claim existing x402 payment rail',()=>{
 const r=evaluateNFT({...valid,deliverable:'Illustrated collectible token marketplace sale'});
 assert.ok(r.missing.includes('x402_service_scope_mismatch'));
});
test('outgoing fees are not authorized',()=>{
 const r=evaluateNFT({...valid,estimatedCostUsdc:1});
 assert.ok(r.missing.includes('no_outgoing_spending_authorized'));
});
test('unknown IP rights not promoted',()=>{
 const r=evaluateNFT({...valid,rightsBasis:'unknown',rightsEvidence:''});
 assert.ok(r.missing.includes('reviewable_ip_rights_or_service_basis'));
});
test('duplicate IDs cannot invent repeated opportunities',()=>{
 const r=evaluateLedger({opportunities:[valid,valid,{...valid,id:'bad'}]});
 assert.equal(r.candidatesEvaluated,1);
 assert.equal(r.revenueVerifiedUsdc,null);
});
