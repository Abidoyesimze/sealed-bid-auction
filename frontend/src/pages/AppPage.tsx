import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';
import { SealedBidAuctionAPI, type SealedBidAuctionPublicPreview, type SealedBidAuctionProviders } from '../lib/contract-api';
import { AuctionRoom } from '../AuctionRoom';

type OutletContext = { wallet: LaceConnectionState; connect: () => void };

// There's no on-chain registry/indexer for "every deployed SealedBidAuction"
// - Midnight's indexer looks up one contract by address, it doesn't list
// instances of a compiled contract. So this is a manually curated list of
// auctions we know about, not an automatic discovery feed.
const KNOWN_AUCTIONS = [
  {
    label: 'Live demo auction (Preview)',
    address: 'ced650ce3235c82e03d7a112e6b6d40647295c3d32ffdf82df649be3e044281f',
  },
];

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

  const join = async (contractAddress: string) => {
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
  };

  return (
    <div className="page container">
      <div className="page-header">
        <h1>Join an auction</h1>
        <p>Pick a known auction below, or paste any auction's contract address.</p>
      </div>
      <JoinAuction busy={busy} error={error} onJoin={join} providers={wallet.providers} />
    </div>
  );
}

function StatusBadge({ preview }: { preview: SealedBidAuctionPublicPreview }) {
  if (preview.resolved) return <span className="badge badge-resolved">Resolved</span>;
  if (preview.open) return <span className="badge badge-open">Open</span>;
  return <span className="badge badge-closed">Closed</span>;
}

function KnownAuctionCard({
  label,
  address,
  providers,
  busy,
  onJoin,
}: {
  label: string;
  address: string;
  providers: SealedBidAuctionProviders;
  busy: boolean;
  onJoin: (address: string) => void;
}) {
  const [preview, setPreview] = useState<SealedBidAuctionPublicPreview | null | 'error'>(null);

  useEffect(() => {
    let cancelled = false;
    SealedBidAuctionAPI.queryPublicState(providers, address)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview('error');
      });
    return () => {
      cancelled = true;
    };
  }, [providers, address]);

  return (
    <button
      className="btn btn-secondary btn-block"
      style={{ textAlign: 'left', height: 'auto', padding: 'var(--space-4)' }}
      disabled={busy}
      onClick={() => onJoin(address)}
    >
      <div className="row gap-3" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <span style={{ fontWeight: 650 }}>{label}</span>
        {preview && preview !== 'error' && <StatusBadge preview={preview} />}
      </div>
      {preview === null && <p className="text-sm text-muted">Loading details…</p>}
      {preview === 'error' && <p className="text-sm text-muted">Couldn't load details - click to try joining anyway.</p>}
      {preview && preview !== 'error' && (
        <>
          <p className="text-sm" style={{ marginBottom: 'var(--space-2)' }}>
            {preview.itemDescription}
          </p>
          <div className="row gap-4 text-sm text-muted">
            <span>Reserve: {preview.reservePrice.toString()}</span>
            <span>Deposit: {preview.requiredDeposit.toString()}</span>
            <span>{preview.bidderCount.toString()} bidder(s)</span>
          </div>
        </>
      )}
      <div className="mono text-faint text-sm" style={{ marginTop: 'var(--space-2)' }}>
        {address.slice(0, 14)}…
      </div>
    </button>
  );
}

function JoinAuction({
  busy,
  error,
  onJoin,
  providers,
}: {
  busy: boolean;
  error: string | null;
  onJoin: (contractAddress: string) => void;
  providers: SealedBidAuctionProviders;
}) {
  const [contractAddress, setContractAddress] = useState('');

  return (
    <div className="stack gap-4" style={{ maxWidth: 480 }}>
      {error && <div className="alert alert-error">{error}</div>}

      {KNOWN_AUCTIONS.length > 0 && (
        <div className="card">
          <div className="card-title">Known auctions</div>
          <div className="card-subtitle">A short, manually curated list - not every auction ever deployed.</div>
          <div className="stack gap-2">
            {KNOWN_AUCTIONS.map((auction) => (
              <KnownAuctionCard
                key={auction.address}
                label={auction.label}
                address={auction.address}
                providers={providers}
                busy={busy}
                onJoin={onJoin}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Join by address</div>
        <div className="card-subtitle">Paste any other auction's contract address.</div>

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
      </div>
    </div>
  );
}
