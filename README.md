# Sealed-Bid Auction

[![CI](https://github.com/Abidoyesimze/sealed-bid-auction/actions/workflows/ci.yml/badge.svg)](https://github.com/Abidoyesimze/sealed-bid-auction/actions/workflows/ci.yml)

A Midnight contract where anyone can list an item with a reserve price, and anyone can submit a bid that stays completely private while the auction is open — no one, including the auctioneer, can see any bid amount until the auction closes. At close, the contract proves who submitted the highest bid and reveals only that: the winner's identity and the winning price. Every losing bid's amount is never written to ledger state or disclosed in any transaction — it never appears in chain history.

**Live Preview demo:** _pending first deployment — see [Deploying to Preview via the browser](#deploying-to-preview-via-the-browser-recommended)_
**Contract address:** _pending_
**Follow along / product profile:** _pending_ — built in public, link goes here once the X profile is live.

> **Why Preview, not Preprod:** we tried Preprod first, since it tracks mainnet most closely. Across many attempts (here and independently, in a sibling project using this exact deploy code) it never completed a deploy — a real, currently-unresolved reliability issue in the public Preprod tooling, not something in this codebase. See [Known reliability issue](#deploying-cli) below for the full writeup. Preview is the stable, working target for now.

## Why this needs Midnight

On a transparent smart-contract chain, bid amounts as calldata are public even without a UI for them — anyone can read the mempool or contract state. "Private bidding" there means trusting an off-chain auctioneer to honestly evaluate sealed bids, with no way for participants to verify afterward that the declared winner is actually correct. Midnight's shielded state and ZK circuits let the contract prove a comparative claim ("bidder A's committed value is greater than every other committed value") without disclosing the operands on-chain, so this gets verifiable correctness *and* on-chain bid privacy without a trusted intermediary. (See "How resolution actually achieves privacy" below for the one place this project still relies on a single party, off-chain.)

Who uses it: NFT marketplaces, real-estate/asset auctions, and procurement/RFP processes, where bid privacy prevents collusion and bid-sniping, and participants need a publicly verifiable guarantee the auction wasn't rigged.

## Repo layout

```
contract/   Compact contract, compiled circuits (managed/), and unit tests (vitest)
frontend/   React/Vite web UI: wallet connect, deploy/join, bid, resolve, settle
```

## Current status

Implemented, tested, and wired up end to end - contract logic through the browser UI (wallet interaction itself untested here; see "What's not verified" below).

### Contract (`contract/src/sealed-bid-auction.compact`, 18 passing vitest tests)

- **Constructor:** sets the public item description, reserve price, and `requiredDeposit` (the fixed escrow amount every bidder locks - see Escrow below), and commits the auctioneer's nullifier.
- **`placeBid`:** seals a bid as `hash(bidValue, blindingFactor)`, keyed by the bidder's own nullifier so one identity can't bid twice, and locks `requiredDeposit` in escrow via `receiveUnshielded`. Neither the bid amount nor the blinding factor is ever written to ledger state. Capped at 8 bidders per auction (see below).
- **`closeAuction`:** auctioneer-only, stops further bidding.
- **`resolveAuction`:** proves which sealed bid was highest and discloses *only* the winner's nullifier and bid amount. The whole comparison - verifying every bid against its commitment, checking for duplicates/omissions, and reducing to a max - happens inside this single circuit call, so no intermediate "currently leading bid" is ever written to ledger state. If no bid met the reserve, resolves to "no winner" (an all-zero sentinel) rather than failing, so deposits never get stuck. That "never expose an intermediate leader" property is the trap two real reference sealed-bid-auction implementations on Midnight fell into when we checked them before building this (one makes all bid amounts public with only pseudonymous identity; the other has every bidder unconditionally disclose their own amount during an on-chain reveal step) - neither actually keeps losing bid amounts off the chain.
- **`reclaimDeposit` / `claimWin` / `withdrawProceeds`:** post-resolution escrow settlement (see below).

### Escrow

Every bidder locks the *same, public* `requiredDeposit` amount when bidding (via Midnight's native unshielded token transfer, `receiveUnshielded(nativeToken(), requiredDeposit)`), and `placeBid` privately asserts `bidValue <= requiredDeposit` without ever disclosing `bidValue`. Because every bidder posts the identical public amount, the deposit itself reveals nothing about any individual bid beyond the shared upper bound the auctioneer chose for everyone - the actual bid amount stays exactly as private as before.

After `resolveAuction`:
- Losing bidders call `reclaimDeposit` to get their full deposit back.
- The winner calls `claimWin` to get back the unused portion (`requiredDeposit - winningPrice`).
- The auctioneer calls `withdrawProceeds` to pull `winningPrice` out of escrow.

Each of these is one-shot (tracked via a `reclaimed` set / `winnerClaimed` / `proceedsWithdrawn` flags) and callable by anyone who can prove the right nullifier - no coordination needed beyond knowing the auction has resolved.

### How resolution actually achieves privacy (and its one honest limitation)

Compact circuits are single-prover ZK-SNARKs: one circuit call has one transaction sender, and that sender supplies every witness value the proof needs. There is no primitive in Compact for computing a function jointly over *multiple parties'* secret inputs (that's MPC/FHE territory, not what a ZK circuit does) - so **some** party has to locally hold every bid value in cleartext for the moment it takes to build the `resolveAuction` proof. That party is the auctioneer here: after `closeAuction`, each bidder encrypts their `(bidValue, blinding)` to the auctioneer's public key (`frontend/src/lib/reveal.ts` - ECDH P-256 + HKDF + AES-256-GCM, standard Web Crypto, no extra crypto dependency) and sends the ciphertext to them by whatever channel; the auctioneer decrypts each one locally and supplies them all as witnesses to one `resolveAuction` call.

What this design still guarantees, and what real off-chain sealed auctions can't:
- The auctioneer **cannot lie** about the winner or the price - the ZK proof enforces the comparison was done correctly over bids that really match their on-chain commitments, with none omitted or duplicated.
- **Nothing is ever persisted on-chain, or appears in any transaction, for a losing bid** - not the amount, not even transiently as an intermediate "leader." Chain history contains only the final `(winnerNullifier, winningPrice)`.
- The reveal hand-off itself is end-to-end encrypted, so no third party (including whatever channel carries the ciphertext) sees a bid either.

What it does *not* guarantee: the auctioneer's own device sees every bid's plaintext locally while building that one proof, even though none of it is ever written anywhere. That's a materially weaker trust requirement than a traditional off-chain sealed auction (which can also lie about the outcome and typically persists bid data indefinitely) - but it's not literally zero-knowledge-to-every-party-always, which is what the original one-line pitch implied. Getting to that stronger guarantee would need an MPC or threshold-decryption layer on top of Compact, out of scope here unless a Midnight-native primitive for it is confirmed to exist.

**8-bidder cap:** Compact circuits are statically sized - there's no dynamic-length loop over ledger state - so `resolveAuction` is a fixed-width reduction over exactly 8 bid slots (unused slots are padding). Raising the cap means widening every `Vector<8, ...>` in the contract and recompiling; it isn't a runtime parameter.

**Tie-breaking:** currently arbitrary (whichever candidate appears first in the auctioneer-submitted resolution order) - Compact's `Bytes<32>` has no ordering comparison to break ties canonically by nullifier, and ties are rare enough with real bid amounts that this wasn't worth engineering around further.

### Frontend (`frontend/src`)

- `lib/wallet-bridge.ts`, `lib/providers.ts`, `hooks/useLaceWallet.ts`: connects to an injected Lace wallet and builds the full Midnight provider bundle (indexer, private state, ZK config, proof delegation to the wallet). Modeled directly on the sibling ShadowPoll project's proven equivalent code.
- `lib/contract-api.ts`: deploy/join a `SealedBidAuction` contract instance and call every circuit; derives a per-wallet view of auction state (is this identity the auctioneer? have they bid? did they win?).
- `lib/reveal.ts`: the encrypted bidder → auctioneer reveal hand-off described above.
- `App.tsx` / `AuctionRoom.tsx`: connect wallet → deploy a new auction or join one by address → place a sealed bid → (auctioneer) close, generate a resolution key, gather encrypted reveals, resolve → reclaim/claim/withdraw.

**What's verified end to end:** the CLI deploy path (`cli/`) has been run against a real, live Midnight network - a local `midnight-local-dev` stack (real node + indexer + proof server, not the vitest simulator) - and successfully deployed this contract, with the ledger state read back afterward matching exactly what the contract should produce on a fresh deploy. That's a genuine proof the full pipeline (Compact contract → compiled circuits → TypeScript bindings → wallet/provider wiring) works against a real chain, not just local unit tests.

**What's not yet verified:** the browser frontend's wallet-connect → deploy → bid → resolve flow has not been exercised against a real Lace wallet (no Lace extension available in the environment this was built in). What has been verified there: it typechecks against the real `@midnight-ntwrk/midnight-js-*` types, production-builds cleanly, and the app renders and fails gracefully with no wallet installed (checked via headless Chrome + DevTools Protocol - zero console errors on load, "No Midnight wallet extension found" rather than a crash on connect).

## Prerequisites

- [Node.js 22+](https://nodejs.org) (see `.nvmrc`)
- The [Compact compiler](https://docs.midnight.network/develop/tutorial/building/) (`compact` CLI) — already installed on this machine (`compact --version`)
- [Docker](https://www.docker.com/), only if/when running a local proof server for deploys
- The [Lace wallet](https://www.lace.io/) browser extension, to actually use the frontend

## Setup

```bash
npm install --legacy-peer-deps  # plain "npm install" hits a known npm/arborist bug
                                 # around vitest's optional peer deps (npm 11.3.0)
npm run compact --workspace=contract   # compiles src/sealed-bid-auction.compact -> src/managed/
npm run build --workspace=contract     # compiles src/managed -> dist/ (frontend imports the built package)
npm run test --workspace=contract      # vitest, runs entirely in the local simulator
npm run dev --workspace=frontend       # http://localhost:5173
```

Note: a fresh install also resolves `@swc/core` to a version that crashes `vite-plugin-top-level-await` during `vite build` ("missing field `type`"). The root `package.json`'s `overrides` field pins a known-working `@swc/core` version - if you ever remove that override, you'll likely hit the same crash.

## Deploying to Preview via the browser (recommended)

The direct-SDK CLI path below (`cli/`) hits a real, currently-unresolved reliability wall against the public testnets - confirmed not just here but across a sibling project's own deploy logs (0 successful Preprod deploys in 12 attempts over a month, same code; Preview only 2/16). A real Lace wallet in the browser uses a more mature sync/caching path and doesn't share that specific failure mode, so it's the reliable way to get a live deployment. Preprod itself never completed a deploy across many attempts either way, so **Preview** is the target used here:

```bash
git clone https://github.com/Abidoyesimze/sealed-bid-auction.git
cd sealed-bid-auction
npm install --legacy-peer-deps
npm run compact --workspace=contract
npm run build --workspace=contract
cp frontend/.env.example frontend/.env.local   # sets VITE_NETWORK_ID=preview
npm run dev --workspace=frontend               # http://localhost:5173
```

Then:
1. Install the [Lace wallet](https://www.lace.io/) extension, switch its network to **Preview** in its settings.
2. Fund it from the Preview faucet: https://midnight-tmnight-preview.nethermind.dev/ (captcha-gated - manual, not automatable).
3. Open the app, click **Connect wallet**, then **List a new item** to deploy. The deployed contract address appears once the transaction confirms - that's your live demo link/address for the submission.

## Deploying (`cli/`)

`cli/src/direct-deploy.ts` deploys this contract directly from a seed/mnemonic-based wallet - no browser extension needed - against Preview, Preprod, or a fully local network.

**Local (fastest, no faucet):**

```bash
git clone https://github.com/midnightntwrk/midnight-local-dev.git && cd midnight-local-dev && npm install
docker compose -f standalone.yml up -d                     # node + indexer + proof server
cp accounts.example.json accounts.json
npm start -- --fund-config ./accounts.json                 # funds the standard Alice/Bob test accounts

cd ../sealed-bid-auction/cli
WALLET_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art" \
  npm run local-direct
```

**Preview / Preprod (public testnets):**

```bash
cd cli
docker compose -f proof-server-local.yml up -d              # local proof server, still required
npm run preview-direct    # or: npm run preprod-direct
```

The first run with no `WALLET_SEED`/`WALLET_MNEMONIC` generates a fresh wallet, logs its address, and waits for it to be funded - the public testnet faucets are captcha-gated, so fund that address manually at the network's faucet UI (e.g. `https://midnight-tmnight-preview.nethermind.dev/`), then either let the same run keep waiting or re-run with `WALLET_SEED=<the logged seed>` once funded. `ITEM_DESCRIPTION`, `RESERVE_PRICE`, and `REQUIRED_DEPOSIT` env vars override the deployed listing's defaults.

**Known reliability issue (Preprod especially):** this direct-SDK path works reliably against a local network but is currently unreliable against the public testnets. Confirmed causes hit while building this: (1) the underlying wallet-sdk's sync-wait loop leaks memory badly enough to OOM a multi-GB Node heap during a long wait; (2) a fresh wallet with no known "birthday" has to walk its full DUST event history from genesis before showing a balance, which the SDK gives no way to persist or resume across process restarts - documented elsewhere as ~78 minutes on Preprod; (3) `submitAndWatchExtrinsic` intermittently loses its WebSocket connection mid-submission. None of this is specific to one machine - a sibling project using this exact ported code logged 0 successful Preprod deploys across 12 attempts over a month, and gave up on Preprod in favor of Preview for that reason. Use the browser+Lace path above instead if you hit this.

## Open items

1. **Raising or removing the 8-bidder cap** — bigger fixed width, or a batched/recursive design, if a real auction needs more bidders.
2. **Live end-to-end verification** against a real Lace wallet and a real Midnight network (Preview/Preprod/mainnet) - deploy, bid from multiple identities, reveal, resolve, settle.
3. **Reveal hand-off transport UX** - `reveal.ts` only handles the encryption; bidders and the auctioneer currently copy/paste JSON blobs by hand. A real deployment would want a small relay (or QR codes, or email) instead.
