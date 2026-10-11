import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 NFT_LIFETIME_BUDGET_MXN_CENTS,MXN_MAX_PER_TX_ETH_WEI,
 parseEthMxnQuote,budgetReservation,budgetStatus
} from './budget.mjs';

const wallet='0x'+'a'.repeat(40);
const otherWallet='0x'+'b'.repeat(40);
const quote={mxnPerEth:50000,observedAt:'2026-10-10T18:00:00Z'};
const baseArgs={action:'deploy',operationKey:'deploy:test001',wallet,
  gasLimitWei:60000n,maxFeePerGasWei:1_000_000_000n,
  l1FeeWei:10_000_000_000_000n,operatorFeeWei:0n,quote}; // 0.00008 ETH
function reserve(ledger,key,overrides={}) {
 const r=budgetReservation(ledger,{...baseArgs,operationKey:key,...overrides});
 ledger.operations[key]={action:(overrides.action||'deploy'),budgetReservation:r,status:'reserved'};
 return r;
}
test('hardcoded lifetime limit is exactly MXN 100',()=>{
 assert.equal(NFT_LIFETIME_BUDGET_MXN_CENTS,10000);
 assert.equal(MXN_MAX_PER_TX_ETH_WEI,100_000_000_000_000n);
});
test('fresh ETH/MXN quote accepted and stale blocked',()=>{
 const now=Date.parse('2026-10-10T18:01:00Z');
 assert.equal(parseEthMxnQuote({ethereum:{mxn:50000,last_updated_at:(now/1000)-60}},now).mxnPerEth,50000);
 assert.throws(()=>parseEthMxnQuote({ethereum:{mxn:50000,last_updated_at:(now/1000)-901}},now),/stale/);
});
test('absent, manipulated or malformed rates stop transactions',()=>{
 const now=Date.now();
 for(const body of [{},{ethereum:{}},{ethereum:{mxn:0,last_updated_at:now/1000}},
   {ethereum:{mxn:'50000',last_updated_at:now/1000}}]){
  assert.throws(()=>parseEthMxnQuote(body,now));
 }
});
test('new reservation accounts for L1, operator, and FX margin',()=>{
 const r=budgetReservation({operations:{}},baseArgs);
 // 0.00008 ETH * 50,000 = 4 MXN, with 25% price cushion = 5 MXN.
 assert.equal(r.mxnCents,500);
 assert.equal(r.remainingAfterReservationMxnCents,9500);
});
test('mixed NFT ops consume one wallet lifetime cap; 21st blocked',()=>{
 const j={operations:{}};
 for(let i=0;i<20;i++){
  const action=['deploy','mint','approve'][i%3];
  const key=action+':unique'+i;
  reserve(j,key,{action});
 }
 assert.equal(budgetStatus(j).remainingMxn,0);
 assert.throws(()=>reserve(j,'deploy:lastone'),/budget exhausted/);
});
test('different wallet cannot reset accumulated quota',()=>{
 const j={operations:{}};
 reserve(j,'deploy:walleta1');
 assert.throws(()=>reserve(j,'deploy:walletb1',{wallet:otherWallet}),/differs/);
});
test('over-transaction 0.0001 ETH inclusive of L1/operator fee is blocked',()=>{
 assert.throws(()=>budgetReservation({operations:{}},{...baseArgs,
  l1FeeWei:30_000_000_000_000n}),/single NFT transaction exceeds/);
});
test('unaccounted previous gas transaction blocks future spending',()=>{
 assert.throws(()=>budgetReservation({operations:{'deploy:old':{action:'deploy'}}},baseArgs),
  /lack verified cumulative budget/);
});
test('duplicate operation identifiers cannot reserve again',()=>{
 const j={operations:{}};reserve(j,'deploy:test001');
 assert.throws(()=>budgetReservation(j,baseArgs),/already executed/);
});
test('budget status refuses missing historic fees',()=>{
 assert.throws(()=>budgetStatus({operations:{old:{action:'mint'}}}),/unaccounted/);
});
test('invalid L1 and operator estimates fail closed',()=>{
 for(const l1FeeWei of [-1n,null,'0']){
  assert.throws(()=>budgetReservation({operations:{}},{...baseArgs,l1FeeWei}),/invalid gas/);
 }
});
test('price changes increase new reservation without revaluing past reserved spend',()=>{
 const j={operations:{}};reserve(j,'deploy:lowprice');
 const r=budgetReservation(j,{...baseArgs,operationKey:'deploy:higherprice',
   quote:{...quote,mxnPerEth:100000}});
 assert.equal(r.mxnCents,1000);
 assert.equal(r.remainingAfterReservationMxnCents,8500);
});
test('never claims actual onchain fee is confirmed',()=>{
 const j={operations:{}};reserve(j,'deploy:test001');
 assert.match(budgetStatus(j).note,/not verified actual/);
});
