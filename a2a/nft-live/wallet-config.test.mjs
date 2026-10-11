import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {normalizeWalletAddress,validateWalletBinding} from './wallet-config.mjs';

const first='0x'+'a'.repeat(40);
const second='0x'+'b'.repeat(40);
const here=dirname(fileURLToPath(import.meta.url));
function invoke(args,home) {
  return spawnSync(process.execPath,[join(here,'bind-wallet.mjs'),...args],{
    env:{...process.env,HOME:home},encoding:'utf8',timeout:15000
  });
}
test('accepts valid public EVM address and checksum normalizes it',()=>{
  assert.equal(normalizeWalletAddress(first).toLowerCase(),first);
});
test('rejects malformed addresses and wrong EVM chain purpose',()=>{
  assert.throws(()=>normalizeWalletAddress('0xdeadbeef'),/invalid/);
  assert.throws(()=>validateWalletBinding({version:1,address:first,chainId:84532,purpose:'discovery-nft-only'}),/purpose\/network/);
});
test('bind public wallet idempotently and never expose a signer',async()=>{
  const home=await mkdtemp(join(tmpdir(),'nft-wallet-bind-'));
  try {
    const r=invoke([first],home);
    assert.equal(r.status,0,r.stderr);
    const output=JSON.parse(r.stdout);
    assert.equal(output.signingEnabled,false);
    assert.equal(output.chainId,8453);
    const next=invoke([first],home);
    assert.equal(next.status,0,next.stderr);
    assert.equal(JSON.parse(next.stdout).status,'public_wallet_already_bound');
    const read=invoke(['--check'],home);
    assert.equal(read.status,0,read.stderr);
    assert.equal(JSON.parse(read.stdout).address.toLowerCase(),first);
  } finally {await rm(home,{recursive:true,force:true});}
});
test('cannot silently switch NFT wallet after initial binding',async()=>{
  const home=await mkdtemp(join(tmpdir(),'nft-wallet-mismatch-'));
  try {
    assert.equal(invoke([first],home).status,0);
    const other=invoke([second],home);
    assert.notEqual(other.status,0);
    assert.match(other.stderr,/different NFT wallet is already bound/);
    const check=invoke(['--check'],home);
    assert.equal(JSON.parse(check.stdout).address.toLowerCase(),first);
  } finally {await rm(home,{recursive:true,force:true});}
});
