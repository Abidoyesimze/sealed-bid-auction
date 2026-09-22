import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';
import { AuctionSimulator } from './auction-simulator.js';
import { randomBytes } from './utils.js';

setNetworkId('undeployed');

describe('SealedBidAuction smart contract', () => {
  it('initializes public ledger state deterministically', () => {
    const auctioneerId = randomBytes(32);
    const s0 = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
    const s1 = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);

    expect(s0.getLedger().itemDescription).toEqual('Vintage synthesizer');
    expect(s0.getLedger().reservePrice).toEqual(100n);
    expect(s0.getLedger().open).toEqual(true);
    expect(s0.getLedger().resolved).toEqual(false);
    expect(s0.getLedger().bidderCount).toEqual(0n);
    // One sentinel row for the all-zero "padding" bidder ID that unused
    // resolution slots use - see the constructor's comment. Not a real bid.
    expect(s0.getLedger().bidCommitments.size()).toEqual(1n);
    // Deterministic: the same auctioneer identity always produces the same
    // public nullifier, without ever revealing the identity itself.
    expect(s0.getLedger().auctioneerNullifier).toEqual(s1.getLedger().auctioneerNullifier);
  });

  it('lets a bidder seal a bid, revealing only that a commitment now exists', () => {
    const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, randomBytes(32));
    const bidderId = randomBytes(32);
    const bidValue = 250n;
    const blinding = randomBytes(32);
    simulator.switchBidder(bidderId, bidValue, blinding);

    const ledgerState = simulator.placeBid();

    expect(ledgerState.bidderCount).toEqual(1n);
    const nullifier = AuctionSimulator.bidderNullifierFor(bidderId);
    expect(ledgerState.bidCommitments.member(nullifier)).toEqual(true);

    // The stored commitment matches the bid - but the bid amount itself
    // never appears anywhere in ledger state.
    const expectedCommitment = AuctionSimulator.bidCommitmentFor(bidValue, blinding);
    expect(ledgerState.bidCommitments.lookup(nullifier)).toEqual(expectedCommitment);
  });

  it('rejects a second bid from the same identity', () => {
    const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, randomBytes(32));
    const bidderId = randomBytes(32);
    simulator.switchBidder(bidderId, 250n, randomBytes(32));
    simulator.placeBid();

    simulator.switchBidder(bidderId, 300n, randomBytes(32));
    expect(() => simulator.placeBid()).toThrow(/already bid/);
  });

  it('lets only the auctioneer close the auction', () => {
    const auctioneerId = randomBytes(32);
    const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);

    simulator.switchBidder(randomBytes(32), 250n, randomBytes(32));
    expect(() => simulator.closeAuction()).toThrow(/Only the auctioneer/);

    simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
    const ledgerState = simulator.closeAuction();
    expect(ledgerState.open).toEqual(false);
  });

  it('rejects bids once the auction is closed', () => {
    const auctioneerId = randomBytes(32);
    const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
    simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
    simulator.closeAuction();

    simulator.switchBidder(randomBytes(32), 250n, randomBytes(32));
    expect(() => simulator.placeBid()).toThrow(/not open/);
  });

  describe('resolveAuction', () => {
    type Bidder = { id: Uint8Array; value: bigint; blinding: Uint8Array };

    /** Places bids for each bidder and returns them in the shape resolveAuction's witnesses expect. */
    const placeBids = (simulator: AuctionSimulator, bids: readonly [bigint][]): Bidder[] =>
      bids.map(([value]) => {
        const bidder: Bidder = { id: randomBytes(32), value, blinding: randomBytes(32) };
        simulator.switchBidder(bidder.id, bidder.value, bidder.blinding);
        simulator.placeBid();
        return bidder;
      });

    const asRevealedBids = (bidders: readonly Bidder[]) =>
      bidders.map((b) => ({
        bidderNullifier: AuctionSimulator.bidderNullifierFor(b.id),
        bidValue: b.value,
        bidBlinding: b.blinding,
      }));

    it('reveals only the winner and winning price, never a losing bid amount', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n], [400n], [250n]]);

      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      simulator.switchToAuctioneer(auctioneerId, asRevealedBids(bidders));
      const ledgerState = simulator.resolveAuction();

      expect(ledgerState.resolved).toEqual(true);
      expect(ledgerState.winningPrice).toEqual(400n);
      expect(ledgerState.winnerNullifier).toEqual(AuctionSimulator.bidderNullifierFor(bidders[1].id));
      // The Ledger type itself has no field capable of holding a per-bidder
      // amount - winningPrice is the only bid value the contract can ever
      // expose, and it's fixed to the winner's.
      expect(Object.keys(ledgerState)).not.toContain('bids');
    });

    it('rejects resolution before the auction is closed', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n]]);

      simulator.switchToAuctioneer(auctioneerId, asRevealedBids(bidders));
      expect(() => simulator.resolveAuction()).toThrow(/must be closed/);
    });

    it('rejects resolution by anyone other than the auctioneer', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n]]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      simulator.switchToAuctioneer(randomBytes(32), asRevealedBids(bidders));
      expect(() => simulator.resolveAuction()).toThrow(/Only the auctioneer/);
    });

    it('rejects a resolution set that omits a real bidder', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n], [400n]]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      // Drops the 400 bid - the honest count (bidderCount) is 2, this only supplies 1.
      simulator.switchToAuctioneer(auctioneerId, asRevealedBids([bidders[0]]));
      expect(() => simulator.resolveAuction()).toThrow(/does not cover every bidder/);
    });

    it('rejects a resolution set with a duplicated bidder', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n], [400n]]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      // Same bidder listed twice to hit the right count while still omitting bidders[1].
      simulator.switchToAuctioneer(auctioneerId, asRevealedBids([bidders[0], bidders[0]]));
      expect(() => simulator.resolveAuction()).toThrow(/Duplicate bidder/);
    });

    it('rejects a revealed bid that does not match its sealed commitment', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n]]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      // Auctioneer claims a different amount than what was actually committed.
      const tampered = [{ ...bidders[0], value: 999n }];
      simulator.switchToAuctioneer(auctioneerId, asRevealedBids(tampered));
      expect(() => simulator.resolveAuction()).toThrow(/does not match its sealed commitment/);
    });

    it('resolves to "no winner" - rather than failing - when no bid meets the reserve, so every deposit stays reclaimable', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 500n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [[150n], [400n]]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();

      simulator.switchToAuctioneer(auctioneerId, asRevealedBids(bidders));
      const ledgerState = simulator.resolveAuction();

      expect(ledgerState.resolved).toEqual(true);
      expect(ledgerState.winningPrice).toEqual(0n);
      expect(ledgerState.winnerNullifier).toEqual(new Uint8Array(32));

      // Neither bidder's nullifier can ever equal the all-zero sentinel, so
      // both are free to reclaim their deposit.
      const recipient = randomBytes(32);
      simulator.switchBidder(bidders[0].id, bidders[0].value, bidders[0].blinding);
      expect(() => simulator.reclaimDeposit(recipient)).not.toThrow();
    });
  });

  describe('escrow settlement', () => {
    type Bidder = { id: Uint8Array; value: bigint; blinding: Uint8Array };

    const placeBids = (simulator: AuctionSimulator, bids: readonly bigint[]): Bidder[] =>
      bids.map((value) => {
        const bidder: Bidder = { id: randomBytes(32), value, blinding: randomBytes(32) };
        simulator.switchBidder(bidder.id, bidder.value, bidder.blinding);
        simulator.placeBid();
        return bidder;
      });

    const asRevealedBids = (bidders: readonly Bidder[]) =>
      bidders.map((b) => ({
        bidderNullifier: AuctionSimulator.bidderNullifierFor(b.id),
        bidValue: b.value,
        bidBlinding: b.blinding,
      }));

    const resolvedAuction = (bids: readonly bigint[], reservePrice = 100n, requiredDeposit = 500n) => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', reservePrice, requiredDeposit, auctioneerId);
      const bidders = placeBids(simulator, bids);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      simulator.closeAuction();
      simulator.switchToAuctioneer(auctioneerId, asRevealedBids(bidders));
      simulator.resolveAuction();
      return { simulator, auctioneerId, bidders };
    };

    it('rejects a bid larger than the required deposit', () => {
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 200n, randomBytes(32));
      simulator.switchBidder(randomBytes(32), 250n, randomBytes(32));
      expect(() => simulator.placeBid()).toThrow(/cannot exceed the required deposit/);
    });

    it('lets a losing bidder reclaim their deposit exactly once', () => {
      const { simulator, bidders } = resolvedAuction([150n, 400n]);
      const loser = bidders[0];
      simulator.switchBidder(loser.id, loser.value, loser.blinding);

      const recipient = randomBytes(32);
      expect(() => simulator.reclaimDeposit(recipient)).not.toThrow();
      expect(() => simulator.reclaimDeposit(recipient)).toThrow(/already reclaimed/);
    });

    it("rejects the winner's attempt to reclaimDeposit instead of claimWin", () => {
      const { simulator, bidders } = resolvedAuction([150n, 400n]);
      const winner = bidders[1];
      simulator.switchBidder(winner.id, winner.value, winner.blinding);
      expect(() => simulator.reclaimDeposit(randomBytes(32))).toThrow(/must use claimWin/);
    });

    it('lets the winner claim their change exactly once', () => {
      const { simulator, bidders } = resolvedAuction([150n, 400n]);
      const winner = bidders[1];
      simulator.switchBidder(winner.id, winner.value, winner.blinding);

      const recipient = randomBytes(32);
      expect(() => simulator.claimWin(recipient)).not.toThrow();
      expect(() => simulator.claimWin(recipient)).toThrow(/already claimed/);
    });

    it('lets the auctioneer withdraw proceeds exactly once', () => {
      const { simulator, auctioneerId } = resolvedAuction([150n, 400n]);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));

      const recipient = randomBytes(32);
      expect(() => simulator.withdrawProceeds(recipient)).not.toThrow();
      expect(() => simulator.withdrawProceeds(recipient)).toThrow(/already withdrawn/);
    });

    it('rejects settlement calls before the auction is resolved', () => {
      const auctioneerId = randomBytes(32);
      const simulator = new AuctionSimulator('Vintage synthesizer', 100n, 500n, auctioneerId);
      const bidders = placeBids(simulator, [150n]);
      simulator.switchBidder(bidders[0].id, bidders[0].value, bidders[0].blinding);

      expect(() => simulator.reclaimDeposit(randomBytes(32))).toThrow(/has not been resolved/);
      expect(() => simulator.claimWin(randomBytes(32))).toThrow(/has not been resolved/);
      simulator.switchBidder(auctioneerId, 0n, new Uint8Array(32));
      expect(() => simulator.withdrawProceeds(randomBytes(32))).toThrow(/has not been resolved/);
    });
  });
});
