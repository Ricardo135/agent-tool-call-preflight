#!/usr/bin/env node
// Optional IPFS publishing tool for a separate owner-operated session.
// Pinata must be configured beforehand. Does not mint, list or transact.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { assert, validIpfs } from './policy.mjs';
const kind=process.argv[2], filename=process.argv[3];
assert(['image','metadata'].includes(kind) && typeof filename==='string',
 'Usage: node pin.mjs image <file> | metadata <json-file> --run');
assert(process.argv.includes('--run'),'dry-run default; add --run for external IPFS pin');
const jwt=process.env.NFT_PINATA_JWT;
assert(jwt && jwt.length>30,'NFT_PINATA_JWT is required only in a trusted owner session');
const bytes=await readFile(filename);
assert(bytes.length>0 && bytes.length<=8*1024*1024,'file must be 1 byte to 8 MiB');
let body, endpoint;
if(kind==='metadata'){
  const m=JSON.parse(bytes.toString('utf8'));
  assert(m && typeof m.name==='string' && m.name.length>=3 && m.name.length<=150,
    'NFT metadata name required');
  assert(typeof m.description==='string' && m.description.length>=10 && m.description.length<=4000,
    'NFT description required');
  assert(validIpfs(m.image),'metadata image must be a pre-pinned IPFS URI');
  body=JSON.stringify({pinataContent:m,pinataOptions:{cidVersion:1}});
  endpoint='https://api.pinata.cloud/pinning/pinJSONToIPFS';
}else{
  const ext=filename.split('.').pop()?.toLowerCase();
  const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
  assert(types[ext],'supported image type required (png/jpg/webp/gif)');
  const form=new FormData();
  form.append('file',new Blob([bytes],{type:types[ext]}),basename(filename));
  form.append('pinataOptions',JSON.stringify({cidVersion:1}));
  body=form;
  endpoint='https://api.pinata.cloud/pinning/pinFileToIPFS';
}
const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),45000);
let resp;
try {
  resp=await fetch(endpoint,{method:'POST',headers:{
    Authorization:'Bearer '+jwt,...(kind==='metadata'?{'Content-Type':'application/json'}:{})
  },body,signal:controller.signal,redirect:'error'});
}finally{clearTimeout(timer)}
assert(resp.ok,'Pinata pin failed with HTTP '+resp.status);
const reply=await resp.json();
assert(typeof reply.IpfsHash==='string' && /^[A-Za-z0-9]{40,110}$/.test(reply.IpfsHash),'invalid returned CID');
console.log(JSON.stringify({kind,uri:'ipfs://'+reply.IpfsHash,
  note:'Verify gateway availability and long-term pinning independently. No mint/listing was created.'}));
