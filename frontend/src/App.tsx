import { useState } from 'react';
import { useLaceWallet } from './hooks/useLaceWallet';
import { SealedBidAuctionAPI } from './lib/contract-api';
import { AuctionRoom } from './AuctionRoom';

const button: React.CSSProperties = { padding: '0.5rem 1rem', cursor: 'pointer', marginRight: '0.5rem' };
const input: React.CSSProperties = { padding: '0.4rem', marginRight: '0.5rem' };

export function App() {
  const { state: wallet, connect } = useLaceWallet();
  const [api, setApi] = useState<SealedBidAuctionAPI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>Sealed-Bid Auction</h1>
      <p>
        Bids stay completely private while the auction is open - not even the auctioneer can see one. At close, the
        contract proves who bid highest and reveals only the winner and the winning price.
      </p>

      {wallet.status === 'disconnected' && (
        <button style={button} onClick={connect}>
          Connect wallet
        </button>
      )}
      {wallet.status === 'connecting' && <p>Connecting…</p>}
      {wallet.status === 'error' && <p style={{ color: '#f88' }}>{wallet.message}</p>}

      {wallet.status === 'connected' && !api && (
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
      )}

      {wallet.status === 'connected' && api && <AuctionRoom api={api} myAddressBytes={wallet.addressBytes} />}
    </main>
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
    <div>
      <section style={{ marginTop: '1.5rem' }}>
        <h2>List a new item</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 400 }}>
          <input
            style={input}
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="Item description"
          />
          <input
            style={input}
            value={reservePrice}
            onChange={(e) => setReservePrice(e.target.value)}
            placeholder="Reserve price"
          />
          <input
            style={input}
            value={requiredDeposit}
            onChange={(e) => setRequiredDeposit(e.target.value)}
            placeholder="Required deposit (every bidder locks this much)"
          />
          <button
            style={button}
            disabled={busy || !itemDescription || !reservePrice || !requiredDeposit}
            onClick={() => {
              try {
                onDeploy(itemDescription, BigInt(reservePrice), BigInt(requiredDeposit));
              } catch {
                /* invalid bigint input */
              }
            }}
          >
            Deploy auction
          </button>
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Join an existing auction</h2>
        <input
          style={{ ...input, width: 420 }}
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          placeholder="Contract address"
        />
        <button style={button} disabled={busy || !contractAddress} onClick={() => onJoin(contractAddress)}>
          Join
        </button>
      </section>

      {error && <p style={{ color: '#f88' }}>{error}</p>}
    </div>
  );
}
