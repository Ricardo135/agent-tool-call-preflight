#!/usr/bin/env python3
"""Announce owner-gated NFT issuance capability to existing OpenClaw research job.

Does not run commands, enable cron, restart services, spend gas or expose keys.
"""
import json
import subprocess
import sys
from pathlib import Path

ID = '2cd2ce28-7033-4f4c-a66d-e088e2dfec9a'
MARKER = 'DISCOVERY NFT ISSUER CAPABILITY V1 — OWNER GATED'
ADDENDUM = """
DISCOVERY NFT ISSUER CAPABILITY V1 — OWNER GATED
An optional REAL ERC721 issuance tool exists in the repository at
a2a/nft-live/issuer.mjs and a2a/nft-live/pin.mjs. On independent,
evidence-driven NFT opportunities, YOU MAY prepare a factual NFT metadata
manifest, rights/licensing dossier, genuine buyer demand source, cost
estimate and candidate price. Use 'node a2a/nft-live/issuer.mjs prepare
<manifest-file>' to validate candidates without any wallet, gas or sale.
The human owner controls the isolated execution session required to
deploy, mint, approve and list via OpenSea. Do NOT invoke --execute,
--confirm, wallet signing, pin publication or API keys from OpenClaw or
from any background task. No preauthorized spending or automated NFT
transaction capability is granted. Do not copy wallet keys into the
research workspace; use an owner-created, dedicated signer, never the
legacy x402 receiving wallet. Record status as 'ready_for_owner_approval'
only when original/explicitly licensed rights, real IPFS image and
metadata, a genuine commercial rationale and clear costs are documented.
Do not imply a token has been minted, publicly listed or sold until
the independently confirmed chain receipt and marketplace order exist.
The existing x402 SKU cannot take payment for an NFT sale. Continue
all other sectors, safety controls, budgets and sales services.
""".strip()

def main():
    out = subprocess.run(['openclaw','cron','list','--all','--json'],capture_output=True,text=True,check=True,timeout=40)
    body=json.loads(out.stdout)
    jobs=body if isinstance(body,list) else body.get('jobs',[])
    job=next((j for j in jobs if isinstance(j,dict) and j.get('id')==ID),None)
    message=job.get('payload',{}).get('message') if job else None
    if not isinstance(message,str) or not message.strip():raise RuntimeError('Original job not found; no change')
    if MARKER in message:
        print('NFT issuer capability already announced in existing mission.');return
    destination=Path.home()/'.openclaw/workspace/research/agent-commerce'
    destination.mkdir(parents=True,exist_ok=True)
    backup=destination/'openclaw-mission-before-nft-issuer-v1.txt'
    if not backup.exists():
        with backup.open('x') as f: f.write(message+'\n')
        backup.chmod(0o600)
    new=message.rstrip()+'\n\n'+ADDENDUM
    subprocess.run(['openclaw','cron','edit',ID,'--message',new],check=True,timeout=60,stdout=subprocess.DEVNULL)
    print('NFT issuer preparation added to existing OpenClaw job. No new cron, signer, mint or marketplace listing.')

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('NFT issuer mission activation failed:',str(e),file=sys.stderr)
        sys.exit(1)
