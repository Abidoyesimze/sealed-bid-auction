import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

export * from './managed/sealed-bid-auction/contract/index.js';
export * from './witnesses';

import * as CompiledSealedBidAuctionContract from './managed/sealed-bid-auction/contract/index.js';
import * as Witnesses from './witnesses';

export const CompiledSealedBidAuctionContractContract = CompiledContract.make<
  CompiledSealedBidAuctionContract.Contract<Witnesses.SealedBidAuctionPrivateState>
>('SealedBidAuction', CompiledSealedBidAuctionContract.Contract<Witnesses.SealedBidAuctionPrivateState>).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets('./managed/sealed-bid-auction'),
);
