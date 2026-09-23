# Sealed-Bid Auction

[![CI](https://github.com/Abidoyesimze/sealed-bid-auction/actions/workflows/ci.yml/badge.svg)](https://github.com/Abidoyesimze/sealed-bid-auction/actions/workflows/ci.yml)
[![Built on Midnight](https://img.shields.io/badge/built%20on-Midnight-8b6cf5)](https://midnight.network/)

A full-stack, privacy-preserving sealed-bid auction platform built on [Midnight](https://midnight.network/): a Compact smart contract, a React web app people actually use to deploy and bid, and CLI tooling to run it all against a real network. Bids stay sealed until the auction closes — no one, not other bidders, not the auctioneer, not even the contract's own deployer, can see a bid amount while the auction is open. At close, the contract *proves* who bid highest using a zero-knowledge circuit and discloses only that: the winner's identity and the winning price. Every losing bid's amount is never written to ledger state, never appears in a transaction, and never appears in chain history — permanently.

<p align="center">
  <img src="docs/screenshots/home.png" alt="Sealed-Bid Auction landing page" width="720">
</p>

## Live links

| | |
|---|---|
| **Live app** | [sealed-bid-auction-frontend-chi.vercel.app](https://sealed-bid-auction-frontend-chi.vercel.app/) |
| **Live network** | Preview |
| **Contract address** | [`ced650ce3235c82e03d7a112e6b6d40647295c3d32ffdf82df649be3e044281f`](https://indexer.preview.midnight.network/api/v4/graphql) |
| **Demo video** | [Loom walkthrough](https://www.loom.com/share/3d07f8b3157c4002935ca48342463bd9) |
| **Follow along** | [@SealedBidMN on X](https://x.com/SealedBidMN) |
| **CI** | [GitHub Actions](https://github.com/Abidoyesimze/sealed-bid-auction/actions/workflows/ci.yml) |
| **Give feedback** | [Tester feedback form](https://forms.gle/dVscjEc3WjV4eNuj6) |

> **Why Preview, not Preprod:** we tried Preprod first, since it tracks mainnet most closely. Across many attempts (here and independently, in a sibling project using this exact deploy code) it never completed a deploy — a real, currently-unresolved reliability issue in the public Preprod tooling, not something in this codebase. See [Known reliability issue](#deploying-a-new-auction-cli) below for the full writeup. Preview is the stable, working target for now - including for the program's Preprod-specific submission requirements, where the same substitution applies for the same reason.
>
> **On deploy timing:** getting the live deployment above through took roughly 6 hours of a single CLI process waiting through the wallet's full three-lane (shielded/unshielded/DUST) sync before it would build a valid spend proof — the funds and DUST were confirmed present on-chain almost immediately, the wait was entirely this client-side sync catching up. This matches the exact flow in Midnight's own official CLI tutorial (no shortcut skipped), so it's a current characteristic of the public Preview network/tooling, not a bug in this project.

## Contents

- [What this is](#what-this-is)
- [Why this needs Midnight](#why-this-needs-midnight)
- [Architecture](#architecture)
- [Design deep dive](#design-deep-dive)
  - [The contract](#the-contract-contractsrcsealed-bid-auctioncompact-18-passing-vitest-tests)
  - [Escrow](#escrow)
  - [How resolution actually achieves privacy (and its one honest limitation)](#how-resolution-actually-achieves-privacy-and-its-one-honest-limitation)
  - [The frontend](#the-frontend-frontendsrc)
- [Getting started](#getting-started)
- [Using the app](#using-the-app)
- [Deploying a new auction (`cli/`)](#deploying-a-new-auction-cli)
- [Feedback loop](#feedback-loop)
- [Open items](#open-items)

## What this is

This isn't just a smart contract — it's a complete product with three parts that all ship together in this one repo:

| | |
|---|---|
| **`contract/`** | The Compact smart contract itself: sealed bids, ZK-proven resolution, escrow, settlement. 18 passing vitest tests running entirely in the local simulator. |
| **`frontend/`** | A real React web app — home page, wallet connect, deploy a new auction or join an existing one, place bids, resolve, settle — not a bare-bones demo page. Live at [sealed-bid-auction-frontend-chi.vercel.app](https://sealed-bid-auction-frontend-chi.vercel.app/). |
| **`cli/`** | Direct-SDK deploy tooling that talks to a real Midnight network (local, Preview, or Preprod) from a seed/mnemonic-based wallet, no browser extension needed. This is what put the live contract address above on-chain. |

All three are wired together end to end and covered by one CI pipeline (compile the contract, run its tests, typecheck and build every workspace) that has to stay green for a change to merge.

## Why this needs Midnight

On a transparent smart-contract chain, bid amounts as calldata are public even without a UI for them — anyone can read the mempool or contract state. "Private bidding" there means trusting an off-chain auctioneer to honestly evaluate sealed bids, with no way for participants to verify afterward that the declared winner is actually correct. Midnight's shielded state and ZK circuits let the contract prove a comparative claim ("bidder A's committed value is greater than every other committed value") without disclosing the operands on-chain, so this gets verifiable correctness *and* on-chain bid privacy without a trusted intermediary. (See [How resolution actually achieves privacy](#how-resolution-actually-achieves-privacy-and-its-one-honest-limitation) below for the one place this project still relies on a single party, off-chain.)

Who uses it: NFT marketplaces, real-estate/asset auctions, and procurement/RFP processes, where bid privacy prevents collusion and bid-sniping, and participants need a publicly verifiable guarantee the auction wasn't rigged.

## Architecture

```
sealed-bid-auction/
├── contract/     Compact contract, compiled circuits (managed/), and unit tests (vitest)
│   └── src/sealed-bid-auction.compact
├── frontend/     React 19 + Vite 6 web app: home page, wallet connect, deploy/join, bid, resolve, settle
│   └── src/pages/{HomePage,AppPage,CreatePage}.tsx, AuctionRoom.tsx, lib/contract-api.ts
├── cli/          Direct-SDK deploy tooling (no browser needed) - local, Preview, or Preprod
│   └── src/direct-deploy.ts
└── .github/workflows/ci.yml   Compile → test → typecheck → build, for all three workspaces
```

It's an npm workspaces monorepo. The frontend imports the contract package's compiled output directly (`@sealed-bid-auction/contract`), so contract and client are always built from the same source of truth — no copy-pasted ABI or manually kept-in-sync types.

**Tech stack:** Compact (Midnight's contract language) · `@midnight-ntwrk/midnight-js-*` 4.1.1 · React 19 · Vite 6 · React Router 7 · RxJS · vitest · GitHub Actions · Vercel.

## Design deep dive

### The contract (`contract/src/sealed-bid-auction.compact`, 18 passing vitest tests)

- **Constructor:** sets the public item description, reserve price, and `requiredDeposit` (the fixed escrow amount every bidder locks - see [Escrow](#escrow) below), and commits the auctioneer's nullifier.
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

### The frontend (`frontend/src`)

A real product, not a single test page: a marketing home page, a sticky navbar with wallet-connect, and three routes.

- **`/` (`pages/HomePage.tsx`):** the pitch, why it matters, and a five-step "how it works" walkthrough.
- **`/create` (`pages/CreatePage.tsx`):** deploy a brand new auction - item description, reserve price, required deposit - then drops straight into the auction room to manage it.
- **`/app` (`pages/AppPage.tsx`):** join an existing auction. A "known auctions" list shows a curated set of addresses (currently just the live demo) with a live preview of each one's public details - item, reserve price, deposit, bidder count, status - fetched read-only before you commit to joining. You can also paste any other auction's contract address directly. (There's no on-chain registry for "every deployed instance of this contract" on Midnight - the indexer looks up one contract by address, it doesn't list a type's instances - so this is necessarily a curated list, not automatic discovery.)
- **`AuctionRoom.tsx`:** the shared auction-interaction UI once you've deployed or joined - place a sealed bid, and (as auctioneer) close the auction, generate a resolution key, gather bidders' encrypted reveals, resolve, then reclaim/claim/withdraw.

Supporting libraries:
- `lib/wallet-bridge.ts`, `lib/providers.ts`, `hooks/useLaceWallet.ts`: connect to an injected Lace wallet and build the full Midnight provider bundle (indexer, private state, ZK config, proof delegation to the wallet).
- `lib/contract-api.ts`: deploys a new `SealedBidAuction` contract, joins an existing one by address, or reads one's public state read-only for a preview - and calls every circuit; derives a per-wallet view of auction state (is this identity the auctioneer? have they bid? did they win?).
- `lib/reveal.ts`: the encrypted bidder → auctioneer reveal hand-off described [above](#how-resolution-actually-achieves-privacy-and-its-one-honest-limitation).

**What's verified end to end:** the CLI deploy path (`cli/`) has been run successfully against both a local `midnight-local-dev` stack and the **public Preview network** (see the live contract address above) - real node + indexer + proof server, not the vitest simulator - with the ledger state read back afterward matching exactly what the contract should produce on a fresh deploy. That's a genuine proof the full pipeline (Compact contract → compiled circuits → TypeScript bindings → wallet/provider wiring) works against a real public chain, not just local unit tests. The frontend itself typechecks against the real `@midnight-ntwrk/midnight-js-*` types, production-builds cleanly, is live on Vercel, and renders correctly at both desktop and mobile widths.

## Getting started

**Prerequisites:**
- [Node.js 22+](https://nodejs.org) (see `.nvmrc`)
- The [Compact compiler](https://docs.midnight.network/develop/tutorial/building/) (`compact` CLI)
- [Docker](https://www.docker.com/), only if/when running a local proof server for deploys
- The [Lace wallet](https://www.lace.io/) browser extension, to actually use the frontend

**Setup:**

```bash
git clone https://github.com/Abidoyesimze/sealed-bid-auction.git
cd sealed-bid-auction
npm install --legacy-peer-deps          # a committed .npmrc also sets this automatically
npm run compact --workspace=contract    # compiles src/sealed-bid-auction.compact -> src/managed/
npm run build --workspace=contract      # compiles src/managed -> dist/ (frontend imports the built package)
npm run test --workspace=contract       # vitest, runs entirely in the local simulator
npm run dev --workspace=frontend        # http://localhost:5173
```

Note: a fresh install used to resolve `@swc/core` to a version that crashes `vite-plugin-top-level-await` during `vite build` ("missing field `type`"). The root `package.json`'s `overrides` field pins a known-working `@swc/core` version - if you ever remove that override, you'll likely hit the same crash.

## Using the app

The live app is at [sealed-bid-auction-frontend-chi.vercel.app](https://sealed-bid-auction-frontend-chi.vercel.app/), or run it locally with the setup above. Either way:

1. Install the [Lace wallet](https://www.lace.io/) extension, switch its network to **Preview** in its settings.
2. Fund it from the Preview faucet: https://midnight-tmnight-preview.nethermind.dev/ (captcha-gated - manual, not automatable).
3. Click **Connect wallet**, then either:
   - **Create an auction** - deploy a new one with your own item description, reserve price, and deposit (can take a while against a public network, see the timing note at the top).
   - **Launch App** → join an existing one - pick the live demo from the known-auctions list, or paste any other deployed contract's address.

## Deploying a new auction (`cli/`)

The frontend can deploy too (see above), but `cli/src/direct-deploy.ts` deploys the same contract directly from a seed/mnemonic-based wallet - no browser extension needed - against Preview, Preprod, or a fully local network. This is what actually put the live contract address at the top of this README on-chain.

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

**Known reliability issue (Preprod especially):** this direct-SDK path works reliably against a local network but is currently unreliable against the public testnets. Confirmed causes hit while building this: (1) the underlying wallet-sdk's sync-wait loop leaks memory badly enough to OOM a multi-GB Node heap during a long wait; (2) a fresh wallet with no known "birthday" has to walk its full DUST event history from genesis before showing a balance, which the SDK gives no way to persist or resume across process restarts - documented elsewhere as ~78 minutes on Preprod; (3) `submitAndWatchExtrinsic` intermittently loses its WebSocket connection mid-submission. None of this is specific to one machine - a sibling project using this exact ported code logged 0 successful Preprod deploys across 12 attempts over a month, and gave up on Preprod in favor of Preview for that reason. Preview eventually succeeds; it just needs patience (see the live contract address above) - retry loops and/or a long uninterrupted run are the practical workaround.

## Feedback loop

Testers give feedback through a short [Google Form](https://forms.gle/dVscjEc3WjV4eNuj6), linked from the app's footer and directly inside the auction room after connecting a wallet. It asks for: the tester's wallet address, a transaction hash/link proving they actually interacted with the contract (not just a claimed address), which flows they tried, an ease-of-use rating, and free-text on what confused them or broke.

How responses turn into changes:
1. Each response is triaged against the app - reproduced if it describes a bug, or weighed against existing [Open items](#open-items) if it's a design/UX suggestion.
2. Confirmed bugs get fixed in a commit that references what was reported, same as any other fix in this repo's history.
3. The list of tester wallet addresses (each backed by their submitted transaction proof) is published in [`docs/testers.md`](docs/testers.md) as responses come in.

This loop was already running before the form existed: every UI fix in this repo from `c5def58` onward (the "use the live demo" button not actually joining, known-auction cards overflowing off-screen, the join/create forms sitting left-aligned instead of centered) came from the same pattern - someone actually using the app with a real wallet, screenshotting what looked wrong, and that becoming a commit within the hour. The form formalizes that same loop for testers who aren't in direct conversation with the person building it.

## Open items

1. **Raising or removing the 8-bidder cap** — bigger fixed width, or a batched/recursive design, if a real auction needs more bidders.
2. **Full lifecycle verification against a real Lace wallet in the browser** - deployment is proven (see the live contract address above, deployed via the CLI); joining, bidding from multiple identities, reveal, resolve, and settle through the frontend are being exercised live against a real wallet as this README is being written.
3. **Reveal hand-off transport UX** - `reveal.ts` only handles the encryption; bidders and the auctioneer currently copy/paste JSON blobs by hand. A real deployment would want a small relay (or QR codes, or email) instead.
4. **Preprod support once its tooling stabilizes** - the contract and deploy code already support it (`npm run preprod-direct`); only the public network's current reliability is the blocker.
5. **A real auction registry** - the "known auctions" list in the frontend is manually curated; a factory contract or off-chain indexer would let it grow automatically as auctions get deployed.
