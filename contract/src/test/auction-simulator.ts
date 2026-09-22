import { type CircuitContext, QueryContext, sampleContractAddress, createConstructorContext, CostModel } from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../managed/sealed-bid-auction/contract/index.js';
import {
  type SealedBidAuctionPrivateState,
  type RevealedBid,
  witnesses,
  createSealedBidAuctionPrivateState,
} from '../witnesses.js';

/**
 * Serves as a testbed to exercise the SealedBidAuction contract in tests.
 */
export class AuctionSimulator {
  readonly contract: Contract<SealedBidAuctionPrivateState>;
  circuitContext: CircuitContext<SealedBidAuctionPrivateState>;

  constructor(itemDescription: string, reservePrice: bigint, requiredDeposit: bigint, secretId: Uint8Array) {
    this.contract = new Contract<SealedBidAuctionPrivateState>(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(createSealedBidAuctionPrivateState(secretId, 0n, new Uint8Array(32)), '0'.repeat(64)),
      itemDescription,
      reservePrice,
      requiredDeposit,
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(currentContractState.data, sampleContractAddress()),
    };
  }

  /** Switch to a different bidder identity and the bid they're about to place. */
  public switchBidder(secretId: Uint8Array, bidValue: bigint, bidBlinding: Uint8Array) {
    this.circuitContext.currentPrivateState = createSealedBidAuctionPrivateState(secretId, bidValue, bidBlinding);
  }

  /**
   * Switch to the auctioneer identity, loaded with every bid they've
   * gathered off-chain (from each bidder directly) since close - the set
   * resolveAuction() will verify against on-chain commitments and reduce
   * over to find the winner.
   */
  public switchToAuctioneer(secretId: Uint8Array, revealedBids: readonly RevealedBid[]) {
    this.circuitContext.currentPrivateState = createSealedBidAuctionPrivateState(
      secretId,
      0n,
      new Uint8Array(32),
      revealedBids,
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): SealedBidAuctionPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public placeBid(): Ledger {
    this.circuitContext = this.contract.impureCircuits.placeBid(this.circuitContext).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public closeAuction(): Ledger {
    this.circuitContext = this.contract.impureCircuits.closeAuction(this.circuitContext).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public resolveAuction(): Ledger {
    this.circuitContext = this.contract.impureCircuits.resolveAuction(this.circuitContext).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public reclaimDeposit(recipient: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.reclaimDeposit(this.circuitContext, { bytes: recipient }).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public claimWin(recipient: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.claimWin(this.circuitContext, { bytes: recipient }).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public withdrawProceeds(recipient: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.withdrawProceeds(this.circuitContext, { bytes: recipient }).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  /** Derives the public bidder nullifier for a given secret ID, without disclosing the secret ID itself. */
  public static bidderNullifierFor(secretId: Uint8Array): Uint8Array {
    return pureCircuits.bidderNullifierFor(secretId);
  }

  /** Derives the sealed commitment for a given (bidValue, blinding) pair. */
  public static bidCommitmentFor(bidValue: bigint, blinding: Uint8Array): Uint8Array {
    return pureCircuits.bidCommitmentFor(bidValue, blinding);
  }
}
