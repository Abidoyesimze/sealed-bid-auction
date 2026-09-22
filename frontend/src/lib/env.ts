import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Which Midnight network this app talks to. Defaults to Preview - override
// with VITE_NETWORK_ID once deploying elsewhere (e.g. 'preprod', 'mainnet').
export const NETWORK: NetworkId = (import.meta.env.VITE_NETWORK_ID as NetworkId) ?? 'preview';

export const INDEXER_HTTP_URL =
  import.meta.env.VITE_INDEXER_HTTP_URL ?? `https://indexer.${NETWORK}.midnight.network/api/v4/graphql`;
export const INDEXER_WS_URL =
  import.meta.env.VITE_INDEXER_WS_URL ?? `wss://indexer.${NETWORK}.midnight.network/api/v4/graphql/ws`;

// By default, proving is delegated to the connected wallet (see
// wallet-bridge.ts's getProvingProvider), so this frontend works for any
// visitor with a compatible wallet installed - no local setup needed. Set
// VITE_USE_LOCAL_PROOF_SERVER=true to instead prove against a proof server
// you run yourself.
export const USE_LOCAL_PROOF_SERVER = import.meta.env.VITE_USE_LOCAL_PROOF_SERVER === 'true';
export const PROOF_SERVER_URL = import.meta.env.VITE_PROOF_SERVER_URL ?? 'http://localhost:6300';

// FetchZkConfigProvider requires an absolute URL (it does `new URL(baseURL)`
// with no base, which throws on a plain path like "/managed/sealed-bid-auction") -
// resolve against the current origin to make it one. Matches where
// scripts/copy-managed.mjs copies the compiled contract artifacts.
export const ZK_CONFIG_BASE_URL = new URL(
  `${import.meta.env.BASE_URL}managed/sealed-bid-auction`,
  window.location.origin,
).toString();
