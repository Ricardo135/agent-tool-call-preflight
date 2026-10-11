// NFT issuance conservative lifetime network-fee budget, MXN centavos.
// This is a software stop, NOT an on-chain spending restriction or security
// boundary against processes that can edit this ledger or use the signer.
export const NFT_LIFETIME_BUDGET_MXN_CENTS = 10_000; // MXN 100.00
export const NFT_PRICE_BUFFER_BPS = 12_500; // 25% FX/gas uncertainty cushion
export const MXN_MAX_PER_TX_ETH_WEI = 100_000_000_000_000n; // 0.0001 ETH
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const NFT_GAS_ACTIONS = new Set(['deploy','mint','approve']);

export function requireBudget(ok, message) {
  if (!ok) throw new Error(message);
}

export function parseEthMxnQuote(body, nowMillis=Date.now()) {
  const row=body?.ethereum;
  const p=row?.mxn, t=row?.last_updated_at;
  requireBudget(typeof p==='number' && Number.isFinite(p) &&
    p>1000 && p<10_000_000,'invalid CoinGecko ETH/MXN quote');
  requireBudget(Number.isInteger(t) && t>0 && Math.abs(nowMillis/1000-t)<900,
    'stale ETH/MXN quote (>15 minutes); transaction blocked');
  return {mxnPerEth:p, observedAt:new Date(t*1000).toISOString()};
}

export async function currentEthMxnQuote(fetchFn=fetch, nowMillis=Date.now()) {
  const response=await fetchFn(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=mxn&include_last_updated_at=true',
    {redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(10_000)});
  requireBudget(response.ok,'ETH/MXN price unavailable; no financial transaction');
  const raw=await response.text();
  requireBudget(raw.length>0&&raw.length<=2000,'ETH/MXN provider response invalid');
  return parseEthMxnQuote(JSON.parse(raw),nowMillis);
}

export function budgetReservation(ledger,{action,operationKey,wallet,gasLimitWei,maxFeePerGasWei,
  l1FeeWei,operatorFeeWei,quote}) {
  requireBudget(NFT_GAS_ACTIONS.has(action),'unexpected NFT gas action');
  requireBudget(typeof wallet==='string' && /^0x[0-9a-fA-F]{40}$/.test(wallet),
    'NFT signer wallet must be known');
  requireBudget(typeof operationKey==='string' && operationKey.startsWith(action+':'),
    'invalid operation key');
  for(const x of [gasLimitWei,maxFeePerGasWei,l1FeeWei,operatorFeeWei]) {
    requireBudget(typeof x==='bigint'&&x>=0n,'invalid gas budget data');
  }
  requireBudget(gasLimitWei>0n && maxFeePerGasWei>0n,'empty gas estimate');
  requireBudget(Number.isFinite(quote?.mxnPerEth) && quote.mxnPerEth>1000 &&
    typeof quote?.observedAt==='string', 'fresh ETH/MXN quote required');
  const gasCostWei=gasLimitWei*maxFeePerGasWei;
  const totalWei=gasCostWei + l1FeeWei*2n + operatorFeeWei*2n;
  requireBudget(totalWei>0n && totalWei<=MXN_MAX_PER_TX_ETH_WEI,
    'single NFT transaction exceeds authorized 0.0001 ETH (includes reserved L1/operator fees)');
  const rateInCentavosPerEth=BigInt(Math.ceil(quote.mxnPerEth*100));
  const mxnCentsBig=(totalWei*rateInCentavosPerEth*BigInt(NFT_PRICE_BUFFER_BPS)
    + WEI_PER_ETH*10_000n-1n)/(WEI_PER_ETH*10_000n);
  requireBudget(mxnCentsBig>0n && mxnCentsBig<=BigInt(NFT_LIFETIME_BUDGET_MXN_CENTS),
    'single NFT transaction exceeds MXN 100 budget');
  const operations=ledger?.operations||{};
  requireBudget(!Object.prototype.hasOwnProperty.call(operations,operationKey),
    'operation already executed or reserved');
  let used=0;
  let existingWallet=null;
  for(const operation of Object.values(operations)){
    if(!operation || !NFT_GAS_ACTIONS.has(operation.action))continue;
    const r=operation.budgetReservation;
    requireBudget(r && Number.isSafeInteger(r.mxnCents) && r.mxnCents>0 &&
      typeof r.wallet==='string',
      'previous NFT transactions lack verified cumulative budget accounting: stop');
    requireBudget(r.mxnCents<=NFT_LIFETIME_BUDGET_MXN_CENTS,
      'malformed previous budget reservation');
    if(existingWallet===null) existingWallet=r.wallet.toLowerCase();
    requireBudget(existingWallet===r.wallet.toLowerCase(),
      'NFT transaction ledger contains more than one wallet');
    used += r.mxnCents;
  }
  requireBudget(existingWallet===null || existingWallet===wallet.toLowerCase(),
    'new signer differs from wallet bound to NFT gas budget');
  const cost=Number(mxnCentsBig);
  requireBudget(used+cost<=NFT_LIFETIME_BUDGET_MXN_CENTS,
    'NFT cumulative MXN 100 budget exhausted: no more transactions');
  return {
    wallet:wallet.toLowerCase(),
    maxEstimatedWei:totalWei.toString(),
    mxnCents:cost,
    mxnPerEthQuoted:quote.mxnPerEth,
    quoteObservedAt:quote.observedAt,
    priceCushionBps:NFT_PRICE_BUFFER_BPS,
    remainingAfterReservationMxnCents:NFT_LIFETIME_BUDGET_MXN_CENTS-used-cost
  };
}

export function budgetStatus(ledger) {
  const operations=Object.values(ledger?.operations||{}).filter(x=>x && NFT_GAS_ACTIONS.has(x.action));
  let used=0;
  for(const op of operations) {
    const r=op.budgetReservation;
    requireBudget(r && Number.isSafeInteger(r.mxnCents) && r.mxnCents>0,
      'unaccounted NFT gas operation; stop');
    used += r.mxnCents;
  }
  requireBudget(used<=NFT_LIFETIME_BUDGET_MXN_CENTS,'lifetime NFT gas budget corrupted');
  return {maxMxn:100, reservedMxn:Number((used/100).toFixed(2)),
    remainingMxn:Number(((NFT_LIFETIME_BUDGET_MXN_CENTS-used)/100).toFixed(2)),
    wallet:operations[0]?.budgetReservation?.wallet||null,
    note:'Reserved worst-case gas, including estimated L1/operator components and FX buffer; not verified actual realized spending.'};
}
