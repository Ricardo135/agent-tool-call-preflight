#!/usr/bin/env node
// Binds only an EVM public address; never handles a seed, private key, or funds.
import { bindWalletAddress, readWalletBinding, WALLET_FILE } from './wallet-config.mjs';
const arg=process.argv[2];
try {
  if(arg==='--check') {
    const w=await readWalletBinding();
    console.log(JSON.stringify({status:'public_wallet_bound',...w,
      configFile:WALLET_FILE, signingEnabled:false, nftTxCountClaimed:0},null,2));
  } else if(typeof arg==='string' && process.argv.length===3) {
    const {binding,created}=await bindWalletAddress(arg);
    console.log(JSON.stringify({
      status:created?'public_wallet_bound':'public_wallet_already_bound',
      ...binding, signingEnabled:false, note:'Compare this public address with the one shown in MetaMask. No secrets or spending configured.'
    },null,2));
  } else {
    throw Error('Usage: node bind-wallet.mjs <public-0x-address> | --check');
  }
} catch(e) {console.error('NFT wallet binding:',e.message);process.exitCode=1;}
