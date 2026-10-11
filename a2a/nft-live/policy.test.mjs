import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAsset,validateCollection,validatePrice,executionAuthorized,
  maxGasWithinBudget,validIpfs
} from './policy.mjs';

const asset={
  id:'nft_licensed_123',
  name:'Authorized collectible',
  tokenUri:'ipfs://bafybeigdyrzt6r74urln54vmr5vk4qv4yhe7ktyomdqc2zehx78yeo4dmi',
  rightsBasis:'original-owned',
  rightsEvidence:'Original work by the collection owner, artwork registration in private ledger.',
  rightsConfirmedByOwner:true,
  collectionId:'collection_first'
};
const collection={id:'collection_first',name:'Discovery Originals',symbol:'DISC',rightsConfirmedByOwner:true};
test('validate approved original-owned NFT asset',()=>assert.equal(validateAsset(asset).id,'nft_licensed_123'));
test('validate approved new collection',()=>assert.equal(validateCollection(collection).symbol,'DISC'));
test('refuse NFT without IPFS-pinned metadata',()=>assert.throws(()=>validateAsset({...asset,tokenUri:'https://attacker.com/metadata.json'}),/IPFS/));
test('reject unsupported NFT rights basis',()=>assert.throws(()=>validateAsset({...asset,rightsBasis:'unknown'}),/rights/));
test('reject non-attested rights',()=>assert.throws(()=>validateAsset({...asset,rightsConfirmedByOwner:false}),/attest/));
test('reject missing rights evidence',()=>assert.throws(()=>validateAsset({...asset,rightsEvidence:'trust me'}),/evidence/));
test('collection rights attestation required',()=>assert.throws(()=>validateCollection({...collection,rightsConfirmedByOwner:false}),/rights/));
test('validate positive price ETH',()=>assert.equal(validatePrice('0.015'),0.015));
test('reject free, negative, scientific prices and huge amounts',()=>{
  for(const p of ['0','-0.1','1e4','1000','0.0000000001'])assert.throws(()=>validatePrice(p));
});
test('operator execute gate cannot be bypassed by a model plan',()=>{
 assert.throws(()=>executionAuthorized({},'nft_licensed_123','nft_licensed_123'),/disabled/);
});
test('operator confirmation must match individual asset',()=>{
 const env={NFT_ENABLE_EXECUTION:'I_AUTHORIZE_NFT_TRANSACTIONS',
 NFT_BASE_RPC_URL:'https://mainnet.base.org',NFT_MAX_GAS_ETH:'0.0001',
 NFT_SIGNER_PRIVATE_KEY:'0x'+'1'.repeat(64)};
 assert.throws(()=>executionAuthorized(env,'other_token','nft_licensed_123'),/matching id/);
 assert.doesNotThrow(()=>executionAuthorized(env,'nft_licensed_123','nft_licensed_123'));
});
test('gas quote refuses over-budget even after margin',()=>{
 assert.throws(()=>maxGasWithinBudget({gas:100000n,maxFeePerGas:100n,gasBudgetWei:1000000n}),/exceeds/);
 assert.equal(maxGasWithinBudget({gas:100000n,maxFeePerGas:100n,gasBudgetWei:12000000n}),120000n);
});
test('unsupported URLs blocked for minted metadata',()=>assert.equal(validIpfs('https://example.com'),false));
