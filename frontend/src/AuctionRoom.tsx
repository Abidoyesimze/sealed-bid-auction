import { useEffect, useState } from 'react';
import { pureCircuits, type RevealedBid } from '@sealed-bid-auction/contract';
import type { SealedBidAuctionAPI, SealedBidAuctionDerivedState } from './lib/contract-api';
import { generateAuctioneerKeyPair, encryptReveal, decryptReveal, type EncryptedReveal } from './lib/reveal';

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const AUCTIONEER_KEY_PREFIX = 'sealed-bid-auction:auctioneer-key:';

const section: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: 8,
  padding: '1rem 1.25rem',
  marginTop: '1rem',
};
const button: React.CSSProperties = { padding: '0.5rem 1rem', cursor: 'pointer' };
const textarea: React.CSSProperties = { width: '100%', minHeight: 80, fontFamily: 'monospace', fontSize: 12 };

export function AuctionRoom({
  api,
  myAddressBytes,
}: {
  api: SealedBidAuctionAPI;
  myAddressBytes: Uint8Array;
}) {
  const [state, setState] = useState<SealedBidAuctionDerivedState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = api.state$.subscribe({
      next: setState,
      error: (err) => setError(err instanceof Error ? err.message : String(err)),
    });
    return () => subscription.unsubscribe();
  }, [api]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <p>Loading auction state…</p>;

  return (
    <div>
      <h2>{state.itemDescription}</h2>
      <p>
        Reserve price: {state.reservePrice.toString()} · Required deposit per bid: {state.requiredDeposit.toString()}{' '}
        · Bidders so far: {state.bidderCount.toString()}
      </p>
      <p>
        Status: {state.open ? 'open' : state.resolved ? 'resolved' : 'closed, not yet resolved'}
        {state.isAuctioneer ? ' · you are the auctioneer' : ''}
        {state.hasBid ? ' · you have placed a bid' : ''}
      </p>
      {error && <p style={{ color: '#f88' }}>{error}</p>}

      {state.open && !state.hasBid && !state.isAuctioneer && (
        <BidForm busy={busy} onSubmit={(amount) => run(() => api.placeBid(amount))} />
      )}

      {state.open && state.isAuctioneer && (
        <button style={button} disabled={busy} onClick={() => run(() => api.closeAuction())}>
          Close auction
        </button>
      )}

      {!state.open && !state.resolved && !state.hasBid && !state.isAuctioneer && (
        <BidderRevealPanel api={api} />
      )}

      {!state.open && !state.resolved && state.isAuctioneer && (
        <AuctioneerResolvePanel
          api={api}
          contractAddress={api.deployedContractAddress}
          bidderCount={state.bidderCount}
          bidCommitments={state.bidCommitments}
          busy={busy}
          onResolve={(revealed) => run(() => api.resolveAuction(revealed))}
        />
      )}

      {state.resolved && (
        <div style={section}>
          <h3>Resolved</h3>
          <p>
            {state.winningPrice > 0n
              ? `Winning price: ${state.winningPrice.toString()}`
              : 'No bid met the reserve price - no winner.'}
          </p>
          {state.isWinner && !state.winnerClaimed && (
            <button style={button} disabled={busy} onClick={() => run(() => api.claimWin(myAddressBytes))}>
              Claim my change
            </button>
          )}
          {state.hasBid && !state.isWinner && (
            <button style={button} disabled={busy} onClick={() => run(() => api.reclaimDeposit(myAddressBytes))}>
              Reclaim my deposit
            </button>
          )}
          {state.isAuctioneer && !state.proceedsWithdrawn && (
            <button style={button} disabled={busy} onClick={() => run(() => api.withdrawProceeds(myAddressBytes))}>
              Withdraw proceeds
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BidForm({ busy, onSubmit }: { busy: boolean; onSubmit: (amount: bigint) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div style={section}>
      <h3>Place a sealed bid</h3>
      <p>Your bid amount is never disclosed to anyone - only a commitment to it is.</p>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bid amount" />
      <button
        style={button}
        disabled={busy || !amount}
        onClick={() => {
          try {
            onSubmit(BigInt(amount));
          } catch {
            /* invalid bigint input - button stays enabled, input unchanged */
          }
        }}
      >
        Seal bid
      </button>
    </div>
  );
}

/** Bidder-side: encrypt this wallet's own reveal to the auctioneer's shared public key. */
function BidderRevealPanel({ api }: { api: SealedBidAuctionAPI }) {
  const [auctioneerKeyJson, setAuctioneerKeyJson] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const encrypt = async () => {
    setError(null);
    setOutput(null);
    try {
      const myBid = await api.getMyBid();
      if (!myBid) throw new Error('No local record of your bid on this device/browser profile.');
      const auctioneerKey = JSON.parse(auctioneerKeyJson) as JsonWebKey;
      const encrypted = await encryptReveal(auctioneerKey, myBid.bidValue, myBid.bidBlinding);
      setOutput(JSON.stringify(encrypted));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={section}>
      <h3>Reveal your bid to the auctioneer</h3>
      <p>
        Paste the auctioneer's public key (shared with you out of band), then send them the encrypted output below
        by whatever channel they asked for - it reveals your bid only to them, not to this app or anyone else.
      </p>
      <textarea
        style={textarea}
        value={auctioneerKeyJson}
        onChange={(e) => setAuctioneerKeyJson(e.target.value)}
        placeholder="Auctioneer's public key (JSON)"
      />
      <div>
        <button style={button} onClick={encrypt} disabled={!auctioneerKeyJson}>
          Encrypt my reveal
        </button>
      </div>
      {error && <p style={{ color: '#f88' }}>{error}</p>}
      {output && (
        <>
          <p>Send this to the auctioneer:</p>
          <textarea style={textarea} readOnly value={output} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  );
}

/** Auctioneer-side: gather every bidder's encrypted reveal, decrypt locally, then resolve. */
function AuctioneerResolvePanel({
  api,
  contractAddress,
  bidderCount,
  bidCommitments,
  busy,
  onResolve,
}: {
  api: SealedBidAuctionAPI;
  contractAddress: string;
  bidderCount: bigint;
  bidCommitments: SealedBidAuctionDerivedState['bidCommitments'];
  busy: boolean;
  onResolve: (revealed: RevealedBid[]) => void;
}) {
  const storageKey = AUCTIONEER_KEY_PREFIX + contractAddress;
  const [publicKeyJson, setPublicKeyJson] = useState<string | null>(null);
  const [privateKeyJwk, setPrivateKeyJwk] = useState<JsonWebKey | null>(null);
  const [pasted, setPasted] = useState('');
  const [gathered, setGathered] = useState<RevealedBid[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey };
      setPublicKeyJson(JSON.stringify(parsed.publicKeyJwk));
      setPrivateKeyJwk(parsed.privateKeyJwk);
    }
  }, [storageKey]);

  const generateKey = async () => {
    const keyPair = await generateAuctioneerKeyPair();
    localStorage.setItem(storageKey, JSON.stringify(keyPair));
    setPublicKeyJson(JSON.stringify(keyPair.publicKeyJwk));
    setPrivateKeyJwk(keyPair.privateKeyJwk);
  };

  const addReveal = async () => {
    setError(null);
    if (!privateKeyJwk) return;
    try {
      const encrypted = JSON.parse(pasted) as EncryptedReveal;
      const { bidValue, blinding } = await decryptReveal(privateKeyJwk, encrypted);
      const commitment = new Uint8Array(pureCircuits.bidCommitmentFor(bidValue, blinding));

      let matchedNullifier: Uint8Array | null = null;
      for (const [nullifier, storedCommitment] of bidCommitments) {
        if (bytesEqual(new Uint8Array(storedCommitment), commitment)) {
          matchedNullifier = new Uint8Array(nullifier);
          break;
        }
      }
      if (!matchedNullifier) throw new Error("Decrypted reveal doesn't match any bid on this auction.");
      if (gathered.some((g) => bytesEqual(g.bidderNullifier, matchedNullifier as Uint8Array))) {
        throw new Error('This bidder has already been added.');
      }

      setGathered([...gathered, { bidderNullifier: matchedNullifier, bidValue, bidBlinding: blinding }]);
      setPasted('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={section}>
      <h3>Resolve the auction</h3>
      {!publicKeyJson ? (
        <>
          <p>Generate a resolution key once - its public half goes to every bidder so they can send you their reveal.</p>
          <button style={button} onClick={generateKey}>
            Generate resolution key
          </button>
        </>
      ) : (
        <>
          <p>Share this public key with every bidder:</p>
          <textarea style={textarea} readOnly value={publicKeyJson} onFocus={(e) => e.currentTarget.select()} />
          <p>
            Paste each bidder's encrypted reveal below ({gathered.length}/{bidderCount.toString()} gathered):
          </p>
          <textarea
            style={textarea}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Encrypted reveal (JSON)"
          />
          <div>
            <button style={button} onClick={addReveal} disabled={!pasted}>
              Add reveal
            </button>
            <button
              style={button}
              disabled={busy || gathered.length === 0}
              onClick={() => onResolve(gathered)}
            >
              Resolve with {gathered.length} gathered reveal{gathered.length === 1 ? '' : 's'}
            </button>
          </div>
          {error && <p style={{ color: '#f88' }}>{error}</p>}
        </>
      )}
    </div>
  );
}

export { toHex };
