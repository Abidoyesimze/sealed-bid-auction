import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';
import { SealedBidAuctionAPI } from '../lib/contract-api';
import { AuctionRoom } from '../AuctionRoom';

type OutletContext = { wallet: LaceConnectionState; connect: () => void };

// The live auction deployed via cli/direct-deploy.ts - see README. Contracts
// are deployed with the CLI (proven reliable against a real network); this
// app is for interacting with one that already exists, not deploying new
// ones.
const LIVE_CONTRACT_ADDRESS = 'ced650ce3235c82e03d7a112e6b6d40647295c3d32ffdf82df649be3e044281f';

export function AppPage() {
  const { wallet, connect } = useOutletContext<OutletContext>();
  const [api, setApi] = useState<SealedBidAuctionAPI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (wallet.status !== 'connected') {
    return (
      <div className="page container">
        <div className="connect-prompt">
          <h1 style={{ marginBottom: 'var(--space-4)' }}>Connect your wallet</h1>
          <div className="card">
            <p className="card-subtitle" style={{ marginBottom: 'var(--space-4)' }}>
              You'll need the Lace wallet extension to join a sealed-bid auction.
            </p>
            {wallet.status === 'error' && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                {wallet.message}
              </div>
            )}
            <button
              className="btn btn-primary btn-block"
              onClick={connect}
              disabled={wallet.status === 'connecting'}
            >
              {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (api) {
    return (
      <div className="page container">
        <AuctionRoom api={api} myAddressBytes={wallet.addressBytes} />
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Join an auction</h1>
        <p>Connect to a sealed-bid auction contract by its address.</p>
      </div>
      <JoinAuction
        busy={busy}
        error={error}
        onJoin={async (contractAddress) => {
          setBusy(true);
          setError(null);
          try {
            const joined = await SealedBidAuctionAPI.join(wallet.providers, contractAddress);
            setApi(joined);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function JoinAuction({
  busy,
  error,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  onJoin: (contractAddress: string) => void;
}) {
  const [contractAddress, setContractAddress] = useState('');

  return (
    <div className="stack gap-4">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">Contract address</div>
        <div className="card-subtitle">Paste an auction's contract address, or use the live demo below.</div>

        <div className="field">
          <label htmlFor="contract-address">Contract address</label>
          <input
            id="contract-address"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x…"
            className="mono"
          />
        </div>

        <button
          className="btn btn-primary btn-block"
          disabled={busy || !contractAddress}
          onClick={() => onJoin(contractAddress)}
        >
          {busy ? 'Joining…' : 'Join auction'}
        </button>

        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 'var(--space-2)' }}
          disabled={busy}
          onClick={() => setContractAddress(LIVE_CONTRACT_ADDRESS)}
        >
          Use the live demo auction
        </button>
      </div>
    </div>
  );
}
