#!/usr/bin/env node
// Owner-authorized NFT deploy, mint, single-token approve and OpenSea listing.
// Never started by OpenClaw cron. No selling via the unrelated x402 worker.
import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, validateCollection, validateAsset, validatePrice, executionAuthorized,
  maxGasWithinBudget, validAddress } from './policy.mjs';
import {budgetReservation, budgetStatus, currentEthMxnQuote, MXN_MAX_PER_TX_ETH_WEI} from './budget.mjs';

const ROOT = join(homedir(), '.config/discovery-entrepreneur/nft-live');
const JOURNAL = join(ROOT,'operations.json');
const LOCK = join(ROOT,'operator.lock');
const CONTRACT_SOURCE = join(dirname(fileURLToPath(import.meta.url)), 'DiscoveryNFT.sol');
const CONDUIT='0x1E0049783F008A0085193E00003D00cd54003c71';
const ABI = [
  {type:'function',name:'owner',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
  {type:'function',name:'mintTo',stateMutability:'nonpayable',inputs:[{type:'address'},{type:'string'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'nextTokenId',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'ownerOf',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'address'}]},
  {type:'function',name:'tokenURI',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'string'}]},
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{type:'address'},{type:'uint256'}],outputs:[]},
  {type:'function',name:'getApproved',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'address'}]},
  {type:'function',name:'isApprovedForAll',stateMutability:'view',inputs:[{type:'address'},{type:'address'}],outputs:[{type:'bool'}]}
];
function argvValue(flag) {const index=process.argv.indexOf(flag); return index<0 ? null : process.argv[index+1];}
async function json(path, fallback={}) { try {return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomicJson(path,value) {
  const tmp=path+'.'+process.pid+'.tmp';
  await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  await rename(tmp,path);
}
async function exclusive(fn) {
  await mkdir(ROOT,{recursive:true,mode:0o700});
  // Recoverable only after manually reviewing outstanding txs. No automatic stale lock removal.
  let fd;
  try { fd=await open(LOCK,'wx',0o600); } catch(e){if(e.code==='EEXIST') throw Error('Operator lock exists: investigate prior execution before manual removal');throw e;}
  try {return await fn();} finally {await fd.close();await unlink(LOCK);}
}
function receiptSummary(x) {return {hash:x.transactionHash,status:x.status,block:x.blockNumber.toString(),gasUsed:x.gasUsed?.toString()};}
function requireExecute(id) {executionAuthorized(process.env,argvValue('--confirm'),id);assert(process.argv.includes('--execute'),'pass --execute to authorize action');}
async function operator() {
  const {createPublicClient,createWalletClient,http,parseEther}=await import('viem');
  const {privateKeyToAccount}=await import('viem/accounts');
  const {base}=await import('viem/chains');
  const account=privateKeyToAccount(process.env.NFT_SIGNER_PRIVATE_KEY);
  // Don't reuse the exposed x402 wallet; use a dedicated, low-balance operator key.
  const rpc=process.env.NFT_BASE_RPC_URL;
  const publicClient=createPublicClient({chain:base,transport:http(rpc)});
  assert(await publicClient.getChainId()===8453,'RPC is not Base Mainnet (8453)');
  const walletClient=createWalletClient({account,chain:base,transport:http(rpc)});
  const spendCap=parseEther(process.env.NFT_MAX_GAS_ETH);
  assert(spendCap<=MXN_MAX_PER_TX_ETH_WEI,'per-transaction gas ceiling exceeds authorized 0.0001 ETH');
  const fees=await publicClient.estimateFeesPerGas();
  assert(typeof fees.maxFeePerGas==='bigint','RPC must support EIP-1559 gas fee');
  return {account,publicClient,walletClient,viem:await import('viem'),spendCap,fees};
}
const FEE_ORACLE='0x420000000000000000000000000000000000000F';
const FEE_ORACLE_ABI=[
 {type:'function',name:'getL1FeeUpperBound',stateMutability:'view',inputs:[{name:'_unsignedTxSize',type:'uint256'}],outputs:[{type:'uint256'}]},
 {type:'function',name:'getOperatorFee',stateMutability:'view',inputs:[{name:'_gasUsed',type:'uint256'}],outputs:[{type:'uint256'}]}
];
async function authorizeGas(op,request,journal,action,key) {
  const gas=await op.publicClient.estimateGas({account:op.account.address,...request});
  const gasLimit=maxGasWithinBudget({gas,maxFeePerGas:op.fees.maxFeePerGas,gasBudgetWei:op.spendCap});
  assert(typeof request.data==='string' && /^0x[0-9a-f]*$/i.test(request.data),
    'transaction data required for Base L1 gas calculation');
  // Base charges L1 data availability and operator fees in addition to L2 execution.
  // Fail closed if either oracle call is unavailable; do not assume zero.
  const bytes=BigInt((request.data.length-2)/2 + 300); // conservative signed-tx overhead
  const [l1FeeWei,operatorFeeWei,quote]=await Promise.all([
    op.publicClient.readContract({address:FEE_ORACLE,abi:FEE_ORACLE_ABI,
      functionName:'getL1FeeUpperBound',args:[bytes]}),
    op.publicClient.readContract({address:FEE_ORACLE,abi:FEE_ORACLE_ABI,
      functionName:'getOperatorFee',args:[gasLimit]}),
    currentEthMxnQuote()
  ]);
  const reserved=budgetReservation(journal,{action,operationKey:key,wallet:op.account.address,
    gasLimitWei:gasLimit,maxFeePerGasWei:op.fees.maxFeePerGas,
    l1FeeWei,operatorFeeWei,quote});
  const balance=await op.publicClient.getBalance({address:op.account.address});
  assert(balance>=BigInt(reserved.maxEstimatedWei),
    'insufficient ETH for capped Base execution plus L1/operator fees');
  return {tx:{gas:gasLimit,maxFeePerGas:op.fees.maxFeePerGas,
    maxPriorityFeePerGas:op.fees.maxPriorityFeePerGas},reservation:reserved};
}
async function compile() {
  const solc=(await import('solc')).default;
  const source=await readFile(CONTRACT_SOURCE,'utf8');
  const input={language:'Solidity',sources:{'DiscoveryNFT.sol':{content:source}},
    settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
  const result=JSON.parse(solc.compile(JSON.stringify(input),{
    import:(importPath)=>{
      assert(importPath.startsWith('@openzeppelin/contracts/'),'unapproved Solidity import');
      return {contents:readFileSync(join(dirname(CONTRACT_SOURCE),'node_modules',importPath),'utf8')};
    }}));
  const errors=(result.errors||[]).filter(e=>e.severity==='error');
  assert(errors.length===0,'contract compilation failed: '+errors.map(x=>x.formattedMessage).join('\n').slice(0,700));
  const compiled=result.contracts?.['DiscoveryNFT.sol']?.DiscoveryNFT;
  assert(compiled?.evm?.bytecode?.object,'no deployable bytecode');
  return {abi:compiled.abi,bytecode:'0x'+compiled.evm.bytecode.object};
}
async function reserve(journal,key,data) {
  assert(!journal.operations?.[key],'operation already attempted or reserved; reconcile before retry');
  journal.operations ??={};
  if(['deploy','mint','approve'].includes(data.action)) {
    assert(data.budgetReservation && data.budgetReservation.wallet && data.budgetReservation.mxnCents>0,
      'on-chain NFT action requires cumulative MXN 100 budget reservation');
  }
  journal.operations[key]={status:'reserved_ambiguous_if_interrupted',at:new Date().toISOString(),...data};
  await atomicJson(JOURNAL,journal);
}
async function record(journal,key,data) {
  Object.assign(journal.operations[key],data);
  await atomicJson(JOURNAL,journal);
}
async function deploy(spec,journal) {
  const m=validateCollection(spec);
  const key='deploy:'+m.id;requireExecute(m.id);
  const op=await operator();
  const compiled=await compile();
  const args=[m.name,m.symbol,op.account.address];
  const data=op.viem.encodeDeployData({abi:compiled.abi,bytecode:compiled.bytecode,args});
  const gas=await authorizeGas(op,{data},journal,'deploy',key);
  await reserve(journal,key,{action:'deploy',collectionId:m.id,budgetReservation:gas.reservation});
  const hash=await op.walletClient.deployContract({abi:compiled.abi,bytecode:compiled.bytecode,args,...gas.tx});
  await record(journal,key,{status:'submitted',hash});
  const receipt=await op.publicClient.waitForTransactionReceipt({hash,timeout:120000});
  assert(receipt.status==='success'&&validAddress(receipt.contractAddress),'deployment not confirmed');
  await record(journal,key,{status:'confirmed',contractAddress:receipt.contractAddress,receipt:receiptSummary(receipt)});
  console.log(JSON.stringify({action:'deploy',collectionId:m.id,contractAddress:receipt.contractAddress,tx:hash,chainId:8453}));
}
async function mint(m,journal) {
  validateAsset(m);
  assert(typeof m.collectionId==='string','collectionId required');
  const deployment=journal.operations?.['deploy:'+m.collectionId];
  assert(deployment?.status==='confirmed','collection not deployed by controlled issuer');
  const contract=deployment.contractAddress;
  const key='mint:'+m.id;requireExecute(m.id);
  const op=await operator();
  const owner=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'owner'});
  assert(owner.toLowerCase()===op.account.address.toLowerCase(),'signer is not collection owner');
  const {request,result:tokenId}=await op.publicClient.simulateContract({
    address:contract,abi:ABI,functionName:'mintTo',args:[op.account.address,m.tokenUri],account:op.account});
  const data=op.viem.encodeFunctionData({abi:ABI,functionName:'mintTo',args:[op.account.address,m.tokenUri]});
  const gas=await authorizeGas(op,{to:contract,data},journal,'mint',key);
  await reserve(journal,key,{action:'mint',assetId:m.id,collectionId:m.collectionId,contract,tokenUri:m.tokenUri,estimatedTokenId:tokenId.toString(),budgetReservation:gas.reservation});
  const hash=await op.walletClient.writeContract({...request,...gas.tx});
  await record(journal,key,{status:'submitted',hash});
  const receipt=await op.publicClient.waitForTransactionReceipt({hash,timeout:120000});
  assert(receipt.status==='success','mint transaction failed');
  const actualOwner=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'ownerOf',args:[tokenId]});
  const uri=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'tokenURI',args:[tokenId]});
  assert(actualOwner.toLowerCase()===op.account.address.toLowerCase() && uri===m.tokenUri,'mint ownership/URI verification failed');
  await record(journal,key,{status:'confirmed',tokenId:tokenId.toString(),receipt:receiptSummary(receipt)});
  console.log(JSON.stringify({action:'mint',assetId:m.id,contract,tokenId:tokenId.toString(),tx:hash}));
}
async function ownedToken(m,journal,op) {
  const minted=journal.operations?.['mint:'+m.id];
  assert(minted?.status==='confirmed','mint not confirmed for asset');
  const contract=minted.contract;const tokenId=BigInt(minted.tokenId);
  const owner=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'ownerOf',args:[tokenId]});
  assert(owner.toLowerCase()===op.account.address.toLowerCase(),'NFT not owned by signing wallet');
  return {contract,tokenId};
}
async function approve(m,journal) {
  validateAsset(m);const key='approve:'+m.id;requireExecute(m.id);
  const op=await operator();const {contract,tokenId}=await ownedToken(m,journal,op);
  const previous=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'getApproved',args:[tokenId]});
  assert(previous.toLowerCase()!==CONDUIT.toLowerCase(),'token already approved; nothing to spend');
  const code=await op.publicClient.getCode({address:CONDUIT});
  assert(code && code!=='0x','OpenSea conduit missing on this chain');
  const {request}=await op.publicClient.simulateContract({address:contract,abi:ABI,
    functionName:'approve',args:[CONDUIT,tokenId],account:op.account});
  const data=op.viem.encodeFunctionData({abi:ABI,functionName:'approve',args:[CONDUIT,tokenId]});
  const gas=await authorizeGas(op,{to:contract,data},journal,'approve',key);
  await reserve(journal,key,{action:'approve',assetId:m.id,contract,tokenId:tokenId.toString(),approvedSpender:CONDUIT,budgetReservation:gas.reservation});
  const hash=await op.walletClient.writeContract({...request,...gas.tx});
  await record(journal,key,{status:'submitted',hash});
  const receipt=await op.publicClient.waitForTransactionReceipt({hash,timeout:120000});
  assert(receipt.status==='success','approval not confirmed');
  const verified=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'getApproved',args:[tokenId]});
  assert(verified.toLowerCase()===CONDUIT.toLowerCase(),'conduit approval verification failed');
  await record(journal,key,{status:'confirmed',receipt:receiptSummary(receipt)});
  console.log(JSON.stringify({action:'approve',assetId:m.id,spender:CONDUIT,tx:hash}));
}
async function list(m,journal) {
  validateAsset(m);const key='list:'+m.id;requireExecute(m.id);
  const price=validatePrice(m.priceEth);
  assert(typeof process.env.NFT_OPENSEA_API_KEY==='string'&&process.env.NFT_OPENSEA_API_KEY.length>10,'OpenSea API key required');
  const op=await operator();const {contract,tokenId}=await ownedToken(m,journal,op);
  const approved=await op.publicClient.readContract({address:contract,abi:ABI,functionName:'getApproved',args:[tokenId]});
  assert(approved.toLowerCase()===CONDUIT.toLowerCase(),'approve the single token to OpenSea conduit first');
  // Listing requires EIP-712 signature but should not send a new transaction.
  // Block ALL RPC broadcast methods on the SDK transport, even if it attempts an approval.
  const {createPublicClient,createWalletClient,http}=op.viem;
  const {base}=await import('viem/chains');
  function noBroadcastHttp(url) {
    const basic=http(url);
    return (config)=>{
      const transport=basic(config);
      return {...transport,request:async (args)=>{
        assert(!['eth_sendRawTransaction','eth_sendTransaction','personal_sendTransaction'].includes(args.method),
          'unexpected on-chain transaction requested by OpenSea SDK; aborted');
        return transport.request(args);
      }};
    };
  }
  const gated=createWalletClient({chain:base,account:op.account,transport:noBroadcastHttp(process.env.NFT_BASE_RPC_URL)});
  const publicClient=createPublicClient({chain:base,transport:http(process.env.NFT_BASE_RPC_URL)});
  const {OpenSeaSDK,Chain}=await import('@opensea/sdk/viem');
  const sdk=new OpenSeaSDK({publicClient,walletClient:gated},{chain:Chain.Base,apiKey:process.env.NFT_OPENSEA_API_KEY});
  await reserve(journal,key,{action:'list',assetId:m.id,contract,tokenId:tokenId.toString(),priceEth:m.priceEth});
  const response=await sdk.createListing({
    asset:{tokenAddress:contract,tokenId:tokenId.toString()},
    accountAddress:op.account.address,amount:price});
  await record(journal,key,{status:'submitted_to_opensea',marketplace:'OpenSea',listedAt:new Date().toISOString(),
    orderHash:response?.orderHash||response?.order_hash||null});
  console.log(JSON.stringify({action:'list',status:'submitted_to_opensea_unverified',assetId:m.id,
    nftUrl:'https://opensea.io/assets/base/'+contract+'/'+tokenId.toString(),
    note:'Verify marketplace index/order independently; no sale or profit yet.'}));
}
async function main() {
  const action=process.argv[2];
  const path=process.argv[3];
  assert(['prepare','deploy','mint','approve','list','status'].includes(action),
    'Usage: node issuer.mjs prepare|deploy|mint|approve|list|status <manifest.json> [--execute --confirm ID]');
  if(action==='status') {
    await mkdir(ROOT,{recursive:true,mode:0o700});
    const j=await json(JOURNAL,{operations:{}});
    console.log(JSON.stringify({operationCount:Object.keys(j.operations||{}).length,budget:budgetStatus(j),operations:j.operations},null,2));return;
  }
  assert(path && path.endsWith('.json'),'explicit JSON manifest path required');
  const data=await readFile(path,'utf8');assert(data.length<32000,'manifest too large');
  const manifest=JSON.parse(data);
  if(action==='prepare'){
    const clean=manifest.symbol?validateCollection(manifest):validateAsset(manifest);
    if(manifest.priceEth!==undefined)validatePrice(manifest.priceEth);
    console.log(JSON.stringify({status:'prepared_only',chain:'Base Mainnet',...clean,
      note:'Nothing minted/listed; owner-only execution required.'},null,2));return;
  }
  await exclusive(async()=>{
    const journal=await json(JOURNAL,{operations:{}});
    if(action==='deploy')await deploy(manifest,journal);
    if(action==='mint')await mint(manifest,journal);
    if(action==='approve')await approve(manifest,journal);
    if(action==='list')await list(manifest,journal);
  });
}
main().catch(e=>{console.error('NFT issuer:',e?.message||String(e));process.exitCode=1});
