import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  mySecretId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  myBidValue(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  myBidBlinding(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  resolutionActive(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, boolean[]];
  resolutionBidderIds(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array[]];
  resolutionBidValues(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint[]];
  resolutionBidBlindings(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array[]];
}

export type ImpureCircuits<PS> = {
  placeBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  resolveAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  reclaimDeposit(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  withdrawProceeds(context: __compactRuntime.CircuitContext<PS>,
                   recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  placeBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  resolveAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  reclaimDeposit(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  withdrawProceeds(context: __compactRuntime.CircuitContext<PS>,
                   recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  bidderNullifierFor(secretId_0: Uint8Array): Uint8Array;
  auctioneerNullifierFor(secretId_0: Uint8Array): Uint8Array;
  bidCommitmentFor(bidValue_0: bigint, blinding_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  placeBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  resolveAuction(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  reclaimDeposit(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimWin(context: __compactRuntime.CircuitContext<PS>,
           recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  withdrawProceeds(context: __compactRuntime.CircuitContext<PS>,
                   recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  bidderNullifierFor(context: __compactRuntime.CircuitContext<PS>,
                     secretId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  auctioneerNullifierFor(context: __compactRuntime.CircuitContext<PS>,
                         secretId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  bidCommitmentFor(context: __compactRuntime.CircuitContext<PS>,
                   bidValue_0: bigint,
                   blinding_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly itemDescription: string;
  readonly reservePrice: bigint;
  readonly requiredDeposit: bigint;
  readonly auctioneerNullifier: Uint8Array;
  bidCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly bidderCount: bigint;
  readonly open: boolean;
  readonly resolved: boolean;
  readonly winnerNullifier: Uint8Array;
  readonly winningPrice: bigint;
  reclaimed: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly winnerClaimed: boolean;
  readonly proceedsWithdrawn: boolean;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               itemDescription__0: string,
               reservePrice__0: bigint,
               requiredDeposit__0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
