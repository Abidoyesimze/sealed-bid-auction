import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';
import { SealedBidAuctionAPI } from '../lib/contract-api';
import { AuctionRoom } from '../AuctionRoom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type OutletContext = { wallet: LaceConnectionState; connect: () => void };

export function CreatePage() {
  useDocumentTitle('Create an auction');
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
              You'll need the Lace wallet extension to deploy a sealed-bid auction.
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
        <div className="page-header">
          <h1>Auction deployed</h1>
          <p>
            Share this contract address with bidders — they can join it from the <Link to="/app">app</Link>.
          </p>
        </div>
        <AuctionRoom api={api} myAddressBytes={wallet.addressBytes} />
      </div>
    );
  }

  return (
    <div className="page container">
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page-header" style={{ textAlign: 'center' }}>
          <h1>Create an auction</h1>
          <p>Deploy a new sealed-bid auction contract. You'll be the auctioneer.</p>
        </div>
        <DeployForm
          busy={busy}
          error={error}
          onDeploy={async (itemDescription, reservePrice, requiredDeposit) => {
            setBusy(true);
            setError(null);
            try {
              const deployed = await SealedBidAuctionAPI.deploy(
                wallet.providers,
                itemDescription,
                reservePrice,
                requiredDeposit,
              );
              setApi(deployed);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}

function DeployForm({
  busy,
  error,
  onDeploy,
}: {
  busy: boolean;
  error: string | null;
  onDeploy: (itemDescription: string, reservePrice: bigint, requiredDeposit: bigint) => void;
}) {
  const [itemDescription, setItemDescription] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [requiredDeposit, setRequiredDeposit] = useState('');

  const canSubmit = itemDescription.trim() !== '' && reservePrice !== '' && requiredDeposit !== '';

  const submit = () => {
    try {
      onDeploy(itemDescription.trim(), BigInt(reservePrice), BigInt(requiredDeposit));
    } catch {
      /* invalid bigint input - button stays enabled, fields unchanged */
    }
  };

  return (
    <div className="card">
      <div className="card-title">Auction details</div>
      <div className="card-subtitle">
        The item description and reserve price are public. The required deposit is the fixed amount every bidder
        locks as escrow — also public; the bid amount underneath it is never disclosed.
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          {error}
        </div>
      )}

      <div className="field">
        <label htmlFor="item-description">Item description</label>
        <input
          id="item-description"
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          placeholder="e.g. Vintage synthesizer"
        />
      </div>

      <div className="field">
        <label htmlFor="reserve-price">Reserve price</label>
        <input
          id="reserve-price"
          value={reservePrice}
          onChange={(e) => setReservePrice(e.target.value)}
          placeholder="100"
          inputMode="numeric"
        />
      </div>

      <div className="field">
        <label htmlFor="required-deposit">Required deposit</label>
        <input
          id="required-deposit"
          value={requiredDeposit}
          onChange={(e) => setRequiredDeposit(e.target.value)}
          placeholder="500"
          inputMode="numeric"
        />
      </div>

      <button className="btn btn-primary btn-block" disabled={busy || !canSubmit} onClick={submit}>
        {busy ? 'Deploying…' : 'Deploy auction'}
      </button>
      {busy && (
        <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
          This can take a while against a public network (DUST sync, proof generation) — don't close this tab.
        </p>
      )}
    </div>
  );
}
