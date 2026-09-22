import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';
import { SealedBidAuctionAPI } from '../lib/contract-api';
import { AuctionRoom } from '../AuctionRoom';

type OutletContext = { wallet: LaceConnectionState; connect: () => void };

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
              You'll need the Lace wallet extension to list or join a sealed-bid auction.
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
        <h1>Launch or join an auction</h1>
        <p>List a new item, or join an auction someone else has already deployed by its contract address.</p>
      </div>
      <DeployOrJoin
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

function DeployOrJoin({
  busy,
  error,
  onDeploy,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  onDeploy: (itemDescription: string, reservePrice: bigint, requiredDeposit: bigint) => void;
  onJoin: (contractAddress: string) => void;
}) {
  const [itemDescription, setItemDescription] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [requiredDeposit, setRequiredDeposit] = useState('');
  const [contractAddress, setContractAddress] = useState('');

  return (
    <div className="stack gap-4">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="two-col">
        <div className="card">
          <div className="card-title">List a new item</div>
          <div className="card-subtitle">Deploy a fresh sealed-bid auction contract.</div>

          <div className="field">
            <label htmlFor="item-description">Item description</label>
            <input
              id="item-description"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Vintage synthesizer"
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
            <span className="field-hint">Every bidder locks this much — it caps, but never reveals, their bid.</span>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={busy || !itemDescription || !reservePrice || !requiredDeposit}
            onClick={() => {
              try {
                onDeploy(itemDescription, BigInt(reservePrice), BigInt(requiredDeposit));
              } catch {
                /* invalid bigint input */
              }
            }}
          >
            {busy ? 'Deploying…' : 'Deploy auction'}
          </button>
        </div>

        <div className="card">
          <div className="card-title">Join an existing auction</div>
          <div className="card-subtitle">Connect to an auction someone else already deployed.</div>

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
            className="btn btn-secondary btn-block"
            disabled={busy || !contractAddress}
            onClick={() => onJoin(contractAddress)}
          >
            {busy ? 'Joining…' : 'Join auction'}
          </button>
        </div>
      </div>
    </div>
  );
}
