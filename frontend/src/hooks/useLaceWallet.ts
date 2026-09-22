import { useCallback, useState } from 'react';
import { LaceWalletBridge } from '../lib/wallet-bridge';
import { buildAuctionProviders } from '../lib/providers';
import type { SealedBidAuctionProviders } from '../lib/contract-api';

export type LaceConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string; addressBytes: Uint8Array; providers: SealedBidAuctionProviders }
  | { status: 'error'; message: string };

// Handles connecting to the injected wallet and building the provider bundle
// any contract interaction needs (deploy, join, bid, or resolve/settle).
export const useLaceWallet = () => {
  const [state, setState] = useState<LaceConnectionState>({ status: 'disconnected' });

  const connect = useCallback(async () => {
    setState({ status: 'connecting' });
    try {
      const wallet = await LaceWalletBridge.connect();
      const providers = await buildAuctionProviders(wallet);
      setState({
        status: 'connected',
        address: wallet.unshieldedAddress,
        addressBytes: wallet.unshieldedAddressBytes,
        providers,
      });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ status: 'disconnected' });
  }, []);

  return { state, connect, disconnect };
};
