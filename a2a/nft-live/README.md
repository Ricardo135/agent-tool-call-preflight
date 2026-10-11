# Discovery Entrepreneur NFT issuer — Base Mainnet + OpenSea

This is an **actual, operator-controlled** ERC-721 contract deploy/mint/listing implementation. It is **not** activated in WSL just by committing files and **does not grant the OpenClaw research agent access to any signing key**. Outbound spending remains disabled in automatic services. OpenSea listings are priced in **ETH on Base**, NOT the existing x402 preflight USDC payment rail. Public NFT minting/sales are not guaranteed.

## Prerequisites

- New dedicated wallet on Base, under the owner's control, funded with a *small* amount of ETH for gas, **never the exposed legacy x402 wallet**. No keys in chat, files under GitHub, OpenClaw workspace or terminal commands preserved in history.
- A private HTTPS Base RPC provider URL, an OpenSea API key, Node 20+, and npm dependencies.
- Artwork you own or have explicit rights to mint and sell, published on IPFS; metadata JSON already pinned to IPFS. Name, description, image link, license terms must be accurate and public. IPFS persistence requires pinning arrangements.
- Manual confirmation for every deployment, mint, approval and listing, and a gas cap chosen by the owner. No owner spending budget was previously granted, so this module never auto-executes.

**The smart contract has not been externally audited.** OpenZeppelin components reduce risk but do not establish full contract security.

## Installation in WSL

The working WSL checkout contains unpublished 6.0 changes. Preserve and merge them first; never `git reset --hard`, force-pull or overwrite Codex's local changes.

```bash
cd /home/openclaw/agent-tool-call-preflight-public
git status --short
git pull --ff-only
cd a2a/nft-live
npm install
npm test
```

For deployment, avoid entering a key in shell history; use a separate, trusted owner session and preferably hardware-backed signing. The basic CLI currently supports a dedicated local-account signer supplied through the **temporary operator shell environment**; this key is necessarily accessible to that process, so **do not run it with OpenClaw's agent tools and do not leave it in a daemon's environment**.

```bash
export NFT_BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC_ENDPOINT'
export NFT_OPENSEA_API_KEY='YOUR_OPENSEA_API_KEY'
export NFT_MAX_GAS_ETH='0.0001'
export NFT_ENABLE_EXECUTION='I_AUTHORIZE_NFT_TRANSACTIONS'
read -rsp 'Dedicated NFT operator private key (0x...): ' NFT_SIGNER_PRIVATE_KEY; echo
export NFT_SIGNER_PRIVATE_KEY
```

Never paste the key into ChatGPT or GitHub. Use your **own estimate and balance** before funding the dedicated wallet. `NFT_MAX_GAS_ETH` applies per transaction, not to an unlimited series; it is not a daily budget or a profit guarantee.

## Create and mint collection

Example `collection.json`:

```json
{"id":"discovery_collection_01","name":"Discovery Originals","symbol":"DISC","rightsConfirmedByOwner":true}
```

Example `asset.json`:

```json
{"id":"discovery_asset_01","collectionId":"discovery_collection_01",
"name":"First Licensed Original","tokenUri":"ipfs://bafy...(real CID)",
"rightsBasis":"original-owned",
"rightsEvidence":"Owned original artwork with documented provenance and permission to mint/sell.",
"rightsConfirmedByOwner":true,"priceEth":"0.005"}
```

The `tokenUri` must be **real pinned metadata JSON**, including image IPFS URI, not the placeholder above.

```bash
node issuer.mjs prepare collection.json
node issuer.mjs prepare asset.json
node issuer.mjs deploy collection.json --execute --confirm discovery_collection_01
node issuer.mjs mint asset.json --execute --confirm discovery_asset_01
node issuer.mjs approve asset.json --execute --confirm discovery_asset_01
node issuer.mjs list asset.json --execute --confirm discovery_asset_01
node issuer.mjs status
```

- **Deploy:** compiles the minimal OpenZeppelin-derived ERC721, estimates and caps gas, broadcasts on Base, waits for confirmation, records new contract.
- **Mint:** simulates `mintTo` to the isolated wallet, sends bounded transaction and verifies token ownership/URI.
- **Approve:** authorizes **a single token only** for the publicly documented OpenSea conduit, with gas estimation/cap; never uses broad `setApprovalForAll`.
- **List:** uses the official OpenSea viem SDK to sign and submit a listing at the asset's ETH price. It requires the prior token approval and a working API key. The SDK transport is blocked from broadcasting any additional blockchain transaction. Marketplace indexing, order acceptance, sales and actual receipts must be checked separately.

State lives under `~/.config/discovery-entrepreneur/nft-live/operations.json` (mode 0600) with a single-writer lock. **An ambiguous timeout or crashed write is never automatically replayed.** Investigate the on-chain hash and OpenSea order first. Never delete or edit the ledger/lock just to force repeated spending or listing. If the operator key or wallet has been exposed, replace it and revoke approvals.

Only run **one operator-issued command at a time**, in a separate trusted terminal. The CLI is not a secure financial sandbox against someone controlling the Linux user account or editing code. No continuous autonomous wallet signer is connected to the research loop.

## What OpenClaw may do unattended

Research NFT buyer requests, estimate economics, prepare legally supportable license/metadata candidates and run `prepare` without a key. It can submit a concise **issuance proposal** with buyer evidence, IPFS metadata URL, price, fee estimate and proof of rights for separate operator approval. It cannot access this operator key, spend gas, execute mints or sign sell orders.

Official documentation: https://docs.opensea.io/reference/opensea-sdk ; https://docs.opensea.io/docs/metadata-standards ; https://docs.openzeppelin.com/contracts/5.x

**Audit caveats:** Built from current public SDK API, but integration has not been executed against a live funded wallet, OpenSea account or Base node in this environment. Before any production value, perform test deployment and thorough review. Production listings may fail if OpenSea changes the API, approval conduit or collection indexing.
