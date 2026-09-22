import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { SealedBidAuctionPrivateState, Contract, Witnesses } from '@sealed-bid-auction/contract';

export const sealedBidAuctionPrivateStateKey = 'sealedBidAuctionPrivateState';
export type PrivateStateId = typeof sealedBidAuctionPrivateStateKey;

export type SealedBidAuctionContract = Contract<SealedBidAuctionPrivateState, Witnesses<SealedBidAuctionPrivateState>>;

export type SealedBidAuctionCircuitKeys = Exclude<keyof SealedBidAuctionContract['impureCircuits'], number | symbol>;

export type SealedBidAuctionProviders = MidnightProviders<
  SealedBidAuctionCircuitKeys,
  PrivateStateId,
  SealedBidAuctionPrivateState
>;

export type DeployedSealedBidAuctionContract = FoundContract<SealedBidAuctionContract>;
