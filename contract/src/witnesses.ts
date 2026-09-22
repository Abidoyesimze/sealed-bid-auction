import { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { Ledger } from './managed/sealed-bid-auction/contract/index.js';

export const MAX_BIDDERS = 8;

// One revealed bid, gathered by the auctioneer off-chain (from each bidder
// directly) after the auction closes, so resolveAuction() can verify it
// against that bidder's on-chain commitment. bidderNullifier is the same
// public nullifier already visible as a key in bidCommitments (derived from
// the bidder's secret ID via bidderNullifierFor) - not the secret ID
// itself, which the auctioneer never needs or sees.
export type RevealedBid = {
  readonly bidderNullifier: Uint8Array;
  readonly bidValue: bigint;
  readonly bidBlinding: Uint8Array;
};

export type SealedBidAuctionPrivateState = {
  readonly secretId: Uint8Array;
  readonly bidValue: bigint;
  readonly bidBlinding: Uint8Array;
  // Only populated on the auctioneer's instance, immediately before calling
  // resolveAuction(). At most MAX_BIDDERS entries.
  readonly revealedBids: readonly RevealedBid[];
};

export const createSealedBidAuctionPrivateState = (
  secretId: Uint8Array,
  bidValue: bigint,
  bidBlinding: Uint8Array,
  revealedBids: readonly RevealedBid[] = [],
): SealedBidAuctionPrivateState => ({
  secretId,
  bidValue,
  bidBlinding,
  revealedBids,
});

const padTo = <T,>(values: readonly T[], length: number, fill: T): T[] => {
  const padded = values.slice(0, length).map((v) => v);
  while (padded.length < length) padded.push(fill);
  return padded;
};

export const witnesses = {
  mySecretId: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, Uint8Array] => [
    privateState,
    privateState.secretId,
  ],

  myBidValue: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, bigint] => [
    privateState,
    privateState.bidValue,
  ],

  myBidBlinding: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, Uint8Array] => [
    privateState,
    privateState.bidBlinding,
  ],

  resolutionActive: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, boolean[]] => [
    privateState,
    padTo(
      privateState.revealedBids.map(() => true),
      MAX_BIDDERS,
      false,
    ),
  ],

  resolutionBidderIds: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, Uint8Array[]] => [
    privateState,
    padTo(
      privateState.revealedBids.map((b) => b.bidderNullifier),
      MAX_BIDDERS,
      new Uint8Array(32),
    ),
  ],

  resolutionBidValues: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, bigint[]] => [
    privateState,
    padTo(
      privateState.revealedBids.map((b) => b.bidValue),
      MAX_BIDDERS,
      0n,
    ),
  ],

  resolutionBidBlindings: ({
    privateState,
  }: WitnessContext<Ledger, SealedBidAuctionPrivateState>): [SealedBidAuctionPrivateState, Uint8Array[]] => [
    privateState,
    padTo(
      privateState.revealedBids.map((b) => b.bidBlinding),
      MAX_BIDDERS,
      new Uint8Array(32),
    ),
  ],
};
