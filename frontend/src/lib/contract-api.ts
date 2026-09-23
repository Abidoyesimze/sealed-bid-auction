/**
 * Deploy/join/interact wiring for the SealedBidAuction contract - the
 * browser counterpart to running everything through the vitest simulator.
 * Modeled directly on the sibling ShadowPoll project's proven api/src/index.ts
 * (same @midnight-ntwrk/midnight-js-* versions), folded into the frontend
 * package since this project has no separate `api` workspace.
 */
import * as SealedBidAuction from '@sealed-bid-auction/contract';
import {
  CompiledSealedBidAuctionContractContract,
  createSealedBidAuctionPrivateState,
  type SealedBidAuctionPrivateState,
  type RevealedBid,
} from '@sealed-bid-auction/contract';

import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, from, type Observable } from 'rxjs';
import { Buffer } from 'buffer';

// A minimal logger shape (pino satisfies it) - avoids pulling pino itself
// into the frontend bundle just for a type.
export type Logger = { info: (obj: unknown) => void; trace: (obj: unknown) => void };

export const sealedBidAuctionPrivateStateKey = 'sealedBidAuctionPrivateState';
export type PrivateStateId = typeof sealedBidAuctionPrivateStateKey;

export type PrivateStates = {
  readonly sealedBidAuctionPrivateState: SealedBidAuctionPrivateState;
};

export type SealedBidAuctionContract = SealedBidAuction.Contract<
  SealedBidAuctionPrivateState,
  SealedBidAuction.Witnesses<SealedBidAuctionPrivateState>
>;

export type SealedBidAuctionCircuitKeys = Exclude<
  keyof SealedBidAuctionContract['impureCircuits'],
  number | symbol
>;

export type SealedBidAuctionProviders = MidnightProviders<
  SealedBidAuctionCircuitKeys,
  PrivateStateId,
  SealedBidAuctionPrivateState
>;

export type DeployedSealedBidAuctionContract = FoundContract<SealedBidAuctionContract>;

/** The derived combination of public (ledger) state and this wallet's private state. */
export type SealedBidAuctionDerivedState = {
  readonly itemDescription: string;
  readonly reservePrice: bigint;
  readonly requiredDeposit: bigint;
  readonly bidderCount: bigint;
  readonly open: boolean;
  readonly resolved: boolean;
  readonly winnerNullifier: Uint8Array;
  readonly winningPrice: bigint;
  /** Whether this identity deployed the auction (and so can close/resolve/withdraw). */
  readonly isAuctioneer: boolean;
  /** Whether this identity has already placed a (sealed) bid. */
  readonly hasBid: boolean;
  /** Only meaningful once `resolved` is true. */
  readonly isWinner: boolean;
  readonly winnerClaimed: boolean;
  readonly proceedsWithdrawn: boolean;
  /**
   * Every bidder's public nullifier -> sealed commitment. Public ledger
   * state already, so exposing it here adds no privacy cost - the
   * auctioneer's resolve panel uses it to match a decrypted reveal back to
   * the bidder it belongs to (see App's ResolvePanel).
   */
  readonly bidCommitments: SealedBidAuction.Ledger['bidCommitments'];
};

const randomBytes32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

export interface DeployedSealedBidAuctionAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SealedBidAuctionDerivedState>;

  /** Seals a bid: locks `requiredDeposit` in escrow, commits `hash(bidValue, freshBlinding)`. */
  placeBid: (bidValue: bigint) => Promise<void>;
  closeAuction: () => Promise<void>;
  /**
   * Resolves the auction. `revealedBids` is every bidder's (bidderNullifier,
   * bidValue, bidBlinding), gathered off-chain after close (see
   * `src/lib/reveal.ts` for the encrypted hand-off) - auctioneer-only.
   */
  resolveAuction: (revealedBids: readonly RevealedBid[]) => Promise<void>;
  /** Reclaims this identity's escrowed deposit. Rejects for the winner (use claimWin) or before resolution. */
  reclaimDeposit: (recipientAddressBytes: Uint8Array) => Promise<void>;
  /** Winner-only: claims back the unused portion of the deposit (requiredDeposit - winningPrice). */
  claimWin: (recipientAddressBytes: Uint8Array) => Promise<void>;
  /** Auctioneer-only: withdraws the winning price from escrow. */
  withdrawProceeds: (recipientAddressBytes: Uint8Array) => Promise<void>;
}

export class SealedBidAuctionAPI implements DeployedSealedBidAuctionAPI {
  /** @internal */
  private constructor(
    public readonly deployedContract: DeployedSealedBidAuctionContract,
    private readonly providers: SealedBidAuctionProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);
    this.state$ = combineLatest(
      [
        providers.publicDataProvider
          .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
          .pipe(map((contractState) => SealedBidAuction.ledger(contractState.data))),
        from(
          providers.privateStateProvider.get(sealedBidAuctionPrivateStateKey) as Promise<SealedBidAuctionPrivateState>,
        ),
      ],
      (ledgerState, privateState) => {
        const bidderNullifier = SealedBidAuction.pureCircuits.bidderNullifierFor(privateState.secretId);
        const auctioneerNullifier = SealedBidAuction.pureCircuits.auctioneerNullifierFor(privateState.secretId);

        return {
          itemDescription: ledgerState.itemDescription,
          reservePrice: ledgerState.reservePrice,
          requiredDeposit: ledgerState.requiredDeposit,
          bidderCount: ledgerState.bidderCount,
          open: ledgerState.open,
          resolved: ledgerState.resolved,
          winnerNullifier: ledgerState.winnerNullifier,
          winningPrice: ledgerState.winningPrice,
          isAuctioneer: Buffer.compare(auctioneerNullifier, ledgerState.auctioneerNullifier) === 0,
          hasBid: ledgerState.bidCommitments.member(bidderNullifier),
          isWinner: Buffer.compare(bidderNullifier, ledgerState.winnerNullifier) === 0,
          winnerClaimed: ledgerState.winnerClaimed,
          proceedsWithdrawn: ledgerState.proceedsWithdrawn,
          bidCommitments: ledgerState.bidCommitments,
        };
      },
    );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SealedBidAuctionDerivedState>;

  /**
   * Reads back this wallet's own (bidderNullifier, bidValue, bidBlinding),
   * for the UI's "encrypt my reveal for the auctioneer" step - never leaves
   * this device except as whatever the caller does with the return value.
   */
  async getMyBid(): Promise<{ bidderNullifier: Uint8Array; bidValue: bigint; bidBlinding: Uint8Array } | null> {
    const state = (await this.providers.privateStateProvider.get(sealedBidAuctionPrivateStateKey)) as
      | SealedBidAuctionPrivateState
      | null;
    if (!state || state.bidValue === 0n) return null;
    return {
      bidderNullifier: SealedBidAuction.pureCircuits.bidderNullifierFor(state.secretId),
      bidValue: state.bidValue,
      bidBlinding: state.bidBlinding,
    };
  }

  async placeBid(bidValue: bigint): Promise<void> {
    this.logger?.info({ placingBid: { bidValue } });

    const existing = (await this.providers.privateStateProvider.get(sealedBidAuctionPrivateStateKey)) as
      | SealedBidAuctionPrivateState
      | null;
    const secretId = existing?.secretId ?? randomBytes32();
    await this.providers.privateStateProvider.set(
      sealedBidAuctionPrivateStateKey,
      createSealedBidAuctionPrivateState(secretId, bidValue, randomBytes32()),
    );

    const txData = await this.deployedContract.callTx.placeBid();
    this.logger?.trace({ transactionAdded: { circuit: 'placeBid', txHash: txData.public.txHash } });
  }

  async closeAuction(): Promise<void> {
    this.logger?.info('closingAuction');
    const txData = await this.deployedContract.callTx.closeAuction();
    this.logger?.trace({ transactionAdded: { circuit: 'closeAuction', txHash: txData.public.txHash } });
  }

  async resolveAuction(revealedBids: readonly RevealedBid[]): Promise<void> {
    this.logger?.info({ resolvingAuction: { bidderCount: revealedBids.length } });

    const existing = (await this.providers.privateStateProvider.get(sealedBidAuctionPrivateStateKey)) as
      | SealedBidAuctionPrivateState
      | null;
    const secretId = existing?.secretId ?? randomBytes32();
    await this.providers.privateStateProvider.set(
      sealedBidAuctionPrivateStateKey,
      createSealedBidAuctionPrivateState(secretId, existing?.bidValue ?? 0n, existing?.bidBlinding ?? randomBytes32(), revealedBids),
    );

    const txData = await this.deployedContract.callTx.resolveAuction();
    this.logger?.trace({ transactionAdded: { circuit: 'resolveAuction', txHash: txData.public.txHash } });
  }

  async reclaimDeposit(recipientAddressBytes: Uint8Array): Promise<void> {
    this.logger?.info('reclaimingDeposit');
    const txData = await this.deployedContract.callTx.reclaimDeposit({ bytes: recipientAddressBytes });
    this.logger?.trace({ transactionAdded: { circuit: 'reclaimDeposit', txHash: txData.public.txHash } });
  }

  async claimWin(recipientAddressBytes: Uint8Array): Promise<void> {
    this.logger?.info('claimingWin');
    const txData = await this.deployedContract.callTx.claimWin({ bytes: recipientAddressBytes });
    this.logger?.trace({ transactionAdded: { circuit: 'claimWin', txHash: txData.public.txHash } });
  }

  async withdrawProceeds(recipientAddressBytes: Uint8Array): Promise<void> {
    this.logger?.info('withdrawingProceeds');
    const txData = await this.deployedContract.callTx.withdrawProceeds({ bytes: recipientAddressBytes });
    this.logger?.trace({ transactionAdded: { circuit: 'withdrawProceeds', txHash: txData.public.txHash } });
  }

  /** Finds an already-deployed SealedBidAuction contract on the network, and joins it. */
  static async join(
    providers: SealedBidAuctionProviders,
    contractAddress: ContractAddress,
    logger?: Logger,
  ): Promise<SealedBidAuctionAPI> {
    logger?.info({ joinContract: { contractAddress } });

    // getPrivateState() below reads from privateStateProvider, which requires
    // the provider to already be scoped to a contract address - normally set
    // by the SealedBidAuctionAPI constructor, but that only runs after this
    // whole method returns. Set it explicitly first so the read doesn't throw.
    providers.privateStateProvider.setContractAddress(contractAddress);

    const deployed = await findDeployedContract<SealedBidAuctionContract>(providers, {
      contractAddress,
      compiledContract: CompiledSealedBidAuctionContractContract,
      privateStateId: sealedBidAuctionPrivateStateKey,
      initialPrivateState: await SealedBidAuctionAPI.getPrivateState(providers),
    });

    logger?.trace({ contractJoined: { finalizedDeployTxData: deployed.deployTxData.public } });
    return new SealedBidAuctionAPI(deployed, providers, logger);
  }

  private static async getPrivateState(providers: SealedBidAuctionProviders): Promise<SealedBidAuctionPrivateState> {
    const existing = await providers.privateStateProvider.get(sealedBidAuctionPrivateStateKey);
    return existing ?? createSealedBidAuctionPrivateState(randomBytes32(), 0n, randomBytes32());
  }
}
