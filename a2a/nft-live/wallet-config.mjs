// Public-only Base NFT wallet binding. No signer credentials ever stored here.
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { getAddress } from 'viem';
import { assert, validAddress } from './policy.mjs';

export const WALLET_FILE=join(homedir(), '.config/discovery-entrepreneur/nft-live/wallet.json');

export function normalizeWalletAddress(addr) {
  assert(validAddress(addr), 'invalid 42-character EVM public address');
  return getAddress(addr.toLowerCase());
}
export function validateWalletBinding(config) {
  assert(config && typeof config==='object' && !Array.isArray(config), 'wallet binding missing');
  assert(config.version===1 && config.chainId===8453 &&
    config.purpose==='discovery-nft-only', 'wallet binding has invalid purpose/network');
  return {version:1,chainId:8453,purpose:'discovery-nft-only',
    address:normalizeWalletAddress(config.address)};
}
export async function readWalletBinding() {
  let raw;
  try {raw=await readFile(WALLET_FILE,'utf8');}
  catch(e) {if(e.code==='ENOENT')throw Error('No NFT public wallet bound. Run node bind-wallet.mjs <public 0x address> first');throw e;}
  assert(raw.length<1000,'wallet binding exceeds expected size');
  return validateWalletBinding(JSON.parse(raw));
}
export async function bindWalletAddress(address) {
  const desired=validateWalletBinding({version:1,chainId:8453,purpose:'discovery-nft-only',
    address:normalizeWalletAddress(address)});
  await mkdir(dirname(WALLET_FILE),{recursive:true,mode:0o700});
  try {
    const current=await readWalletBinding();
    assert(current.address===desired.address,
      'a different NFT wallet is already bound; STOP and reconcile existing NFT transactions before changing wallet');
    return {binding:current,created:false};
  } catch(e) {
    if(!String(e.message).startsWith('No NFT public wallet bound.'))throw e;
  }
  let fd;
  try{fd=await open(WALLET_FILE,'wx',0o600);}
  catch(e){if(e.code==='EEXIST')throw Error('wallet binding was created concurrently; inspect manually');throw e;}
  try {await fd.writeFile(JSON.stringify(desired,null,2)+'\n');}
  finally {await fd.close();}
  return {binding:desired,created:true};
}
