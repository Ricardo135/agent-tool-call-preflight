# Discovery Entrepreneur — NFT business discovery extension

This adds NFTs as a **non-exclusive sector** to the existing OpenClaw 6.0 mission. It does not create a second agent loop, bypass budgets, or overwrite strategic memory. The autonomous agent picks NFT submarkets and buyers from actual evidence.

## Activate on the real WSL installation (user openclaw)

Discovery 6.0 was installed locally and not yet synced to GitHub. **Back up or commit those local changes first; never force a checkout or hard reset.** This extension adds files only.

```bash
cd /home/openclaw/agent-tool-call-preflight-public
git status --short
git pull --ff-only
python3 a2a/activate-nft-business.test.py -v
node --test a2a/nft-opportunity-check.test.mjs
python3 a2a/activate-nft-business.py
python3 a2a/activate-nft-business.py --check
node a2a/nft-opportunity-check.mjs --run
systemctl --user is-active discovery-entrepreneur.service discovery-commercial-autopilot.timer
```

If git refuses to pull due to local 6.0 edits, **stop rather than forcing git**. The installer appends to existing OpenClaw job `2cd2ce28-7033-4f4c-a66d-e088e2dfec9a`. The previous message is backed up privately with 0600 permissions. The existing supervisor retains control: no cron is enabled, no immediate model run is forced, and NFT investigation waits for the next 6.0 budget-permitted cycle.

## NFT opportunity workflow

OpenClaw autonomously investigates original licensed NFTs, authorized secondary resales, membership/utility NFTs, and genuine NFT-related digital services. It records `~/.openclaw/workspace/research/agent-commerce/nft-opportunities.json` with independently researched buyer evidence, claimed intellectual-property rights, deliverable and testing, costs, contact route and status. It runs `node a2a/nft-opportunity-check.mjs --run` after updates, writing `nft-commercial-signals.json`.

The checker only classifies reported candidate evidence. It does **not** verify IP ownership, buyer identity, marketplace authorization, payments, or legal rights, and it never automatically sends a proposal. Existing MARS / ALLAGENTS guarded opt-in outreach may support nonbinding qualification where genuinely permitted, subject to all quotas and deduplication. A demand search or proposal is not a sale.

The existing x402 validation service is only a JSON contract preflight SKU. It is not an NFT minting, transfer, payment, escrow or marketplace checkout API.

## Owner-operated mint and listing capability

A separate, owner-gated production toolkit has now been added under [a2a/nft-live/](nft-live/README.md): contract compilation and deployment, ERC-721 minting with IPFS metadata, one-token OpenSea conduit approval and signed OpenSea sale listing. The user must provide a fresh, dedicated signer, Base gas allowance, properly licensed artwork, pinned metadata, RPC and OpenSea API key. It has **not been deployed or enabled on the owner's WSL yet**. No crypto transactions were broadcast by this integration. The tool must only be run from a separate trusted operator session. To expose its preparation capability to the existing OpenClaw mission without granting signatures, run `python3 a2a/nft-live/activate-issuer-capability.py` in the WSL checkout.

**Automatic minting and listing by OpenClaw remain blocked**, while manual owner-approved minting/listing is implemented. Existing autonomous spending budget remains 0 USDC. No NFTs are owned, listed, or sold merely because this code has been published. Production sales require successful chain receipts and marketplace order indexing.

No copyright infringement, wash trading, self-funded purchases, fake royalties, false scarcity or speculative investment promises. Revenue must be independently verified and exclude tests/owner-wallet movements.

Official docs: https://docs.opensea.io/docs/metadata-standards ; https://support.opensea.io/en/articles/8867083-what-are-gas-fees ; https://support.opensea.io/en/articles/8867023-how-do-i-create-an-nft

## Rollback

Mission backup: `~/.openclaw/workspace/research/agent-commerce/openclaw-mission-before-nft-v1.txt`. Before restoring, compare subsequent mission changes to avoid overwriting newer unrelated instructions. The installer is idempotent; never delete strategic memory or quota ledgers to deactivate a market.
