# Discovery Entrepreneur NFT issuer — Base Mainnet + OpenSea

This is an **actual, operator-controlled** ERC-721 contract deploy/mint/listing implementation. It is **not** activated in WSL just by committing files and **does not grant the OpenClaw research agent access to any signing key**. Outbound spending remains disabled in automatic services. OpenSea listings are priced in **ETH on Base**, NOT the existing x402 preflight USDC payment rail. Public NFT minting/sales are not guaranteed.

## Prerequisites

- New dedicated wallet on Base, under the owner's control, funded with a *small* amount of ETH for gas, **never the exposed legacy x402 wallet**. No keys in chat, files under GitHub, OpenClaw workspace or terminal commands preserved in history.
- A private HTTPS Base RPC provider URL, an OpenSea API key, Node 20+, and npm dependencies.
- Artwork you own or have explicit rights to mint and sell, published on IPFS; metadata JSON already pinned to IPFS. Name, description, image link, license terms must be accurate and public. IPFS persistence requires pinning arrangements.
- **Approved NFT fee allowance:** MXN 100 **total lifetime**, not per operation; the hardcoded software gate also permits at most 0.0001 ETH **per on-chain transaction**. It converts ETH gas estimates into MXN using a fresh CoinGecko ETH/MXN rate, reserves 25% FX margin and double the estimated Base L1 and operator components, and fails closed when any rate/fee input is missing. A new human authorization is necessary to raise either limit.
- Manual confirmation for every deployment, mint, approval and listing. The MXN 100 authorization does **not** enable unattended wallets or signing by OpenClaw.

The NFT compiler was updated to `solc@0.8.37` in response to GHSA-52f5-9888-hmc6 and GHSA-ph9p-34f9-6g65 in its old transitive `tmp` dependency. A later advisory (GHSA-7c78-jf6q-g5cm) also affects `tmp@0.2.6`, so `package.json` pins a transitive override to patched `tmp@0.2.7`; the compilation test verifies the resolved version. The new `compiler.test.mjs` runs a no-wallet OpenZeppelin ERC721 compilation regression. **Do not provide signer keys or enable transactions until `npm audit --omit=dev` reports zero vulnerabilities and all tests pass on the actual WSL installation.** If the audit still reports a vulnerable dependency, stop and report its dependency path; don't run `npm audit fix --force` blindly.

**The smart contract has not been externally audited.** OpenZeppelin components reduce risk but do not establish full contract security.

## Installation in WSL

The working WSL checkout contains unpublished 6.0 changes. Preserve and merge them first; never `git reset --hard`, force-pull or overwrite Codex's local changes.

```bash
cd /home/openclaw/agent-tool-call-preflight-public
git status --short
git pull --ff-only
cd a2a/nft-live
npm install --ignore-scripts
npm ls tmp # must resolve tmp@0.2.7
npm audit --omit=dev
npm test # includes full ERC721 compile and patched tmp resolution
node issuer.mjs status
```

For deployment, avoid entering a key in shell history; use a separate, trusted owner session and preferably hardware-backed signing. The basic CLI currently supports a dedicated local-account signer supplied through the **temporary operator shell environment**; this key is necessarily accessible to that process, so **do not run it with OpenClaw's agent tools and do not leave it in a daemon's environment**.

```bash
export NFT_BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC_ENDPOINT'
export NFT_OPENSEA_API_KEY='YOUR_OPENSEA_API_KEY'
export NFT_MAX_GAS_ETH='0.0001' # must not exceed this approved ceiling
export NFT_ENABLE_EXECUTION='I_AUTHORIZE_NFT_TRANSACTIONS'
read -rsp 'Dedicated NFT operator private key (0x...): ' NFT_SIGNER_PRIVATE_KEY; echo
export NFT_SIGNER_PRIVATE_KEY
```

Never paste the key into ChatGPT or GitHub. Use your **own estimate and balance** before funding the dedicated wallet. The total authorized fee **ceiling is MXN 100**, implemented as conservative cumulative software reservations in `operations.json`, plus the smaller 0.0001 ETH ceiling per transaction. `NFT_MAX_GAS_ETH` is an additional per-transaction cap, never a way to increase the MXN 100 lifetime budget. The balance should be funded minimally, not beyond the intended amount.

The price API is a **live quote** and cannot guarantee the eventual fiat value if crypto prices change. The budget is a restrictive internal estimate (not a smart-contract enforced allowance, bank limit, or tamper-proof spending boundary). It covers this tool's gas, including conservative Base L1/operator fee estimates; it excludes separate external charges such as exchange deposits, conversion spreads, marketplace commissions or optional Pinata fees. The ledger accounts for full **reserved maximum** even after transaction failure or timeout and does not automatically refund it. A missing ETH/MXN quote, missing fee oracle, changed wallet or missing historical reservation stops further sends. Do not reset/delete the ledger to bypass a cap.

## Publish NFT artwork and metadata to IPFS (optional)

Use a Pinata account with an owner-controlled JWT. First upload a locally owned image and note its real CID, then build a local JSON metadata file of the form:

```json
{"name":"Owned original #1","description":"Authentic original artwork with commercial mint/sale permission.","image":"ipfs://REAL_IMAGE_CID"}
```

In the owner-only shell:

```bash
read -rsp 'Pinata JWT: ' NFT_PINATA_JWT; echo
export NFT_PINATA_JWT
node pin.mjs image ./artwork.png --run
node pin.mjs metadata ./metadata.json --run
unset NFT_PINATA_JWT
```

These commands issue authenticated pin requests and print the IPFS URI. Replace the image CID in metadata with the **actual first response**, then replace `asset.json`'s token URI with the **actual second response**. The files must stay pinned and publicly accessible. No signatures, NFTs or listings are created by `pin.mjs`.

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

State lives under `~/.config/discovery-entrepreneur/nft-live/operations.json` (mode 0600) with a single-writer lock. `node issuer.mjs status` reports the lifetime MXN 100 budget's reserved and remaining amount.  **An ambiguous timeout or crashed write is never automatically replayed.** Investigate the on-chain hash and OpenSea order first. Never delete or edit the ledger/lock just to force repeated spending or listing. If the operator key or wallet has been exposed, replace it and revoke approvals.

Only run **one operator-issued command at a time**, in a separate trusted terminal. The CLI is not a secure financial sandbox against someone controlling the Linux user account or editing code. No continuous autonomous wallet signer is connected to the research loop.

## What OpenClaw may do unattended

Research NFT buyer requests, estimate economics, prepare legally supportable license/metadata candidates and run `prepare` without a key. It can submit a concise **issuance proposal** with buyer evidence, IPFS metadata URL, price, fee estimate and proof of rights for separate operator approval. It cannot access this operator key, spend gas, execute mints or sign sell orders.

Official documentation: https://docs.opensea.io/reference/opensea-sdk ; https://docs.opensea.io/docs/metadata-standards ; https://docs.openzeppelin.com/contracts/5.x

**Audit caveats:** Built from current public SDK API, but integration has not been executed against a live funded wallet, OpenSea account or Base node in this environment. Before any production value, perform test deployment and thorough review. Production listings may fail if OpenSea changes the API, approval conduit or collection indexing.
