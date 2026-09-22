import { useEffect, useState } from 'react';
import { pureCircuits, type RevealedBid } from '@sealed-bid-auction/contract';
import type { SealedBidAuctionAPI, SealedBidAuctionDerivedState } from './lib/contract-api';
import { generateAuctioneerKeyPair, encryptReveal, decryptReveal, type EncryptedReveal } from './lib/reveal';

const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const AUCTIONEER_KEY_PREFIX = 'sealed-bid-auction:auctioneer-key:';

function StatusBadge({ state }: { state: SealedBidAuctionDerivedState }) {
  if (state.resolved) return <span className="badge badge-resolved">Resolved</span>;
  if (state.open) return <span className="badge badge-open">Open</span>;
  return <span className="badge badge-closed">Closed</span>;
}

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

  if (!state) {
    return (
      <div className="card">
        <p>Loading auction state…</p>
      </div>
    );
  }

  return (
    <div className="stack gap-4">
      <div className="card">
        <div className="row gap-3" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <h1 style={{ fontSize: '1.4rem' }}>{state.itemDescription}</h1>
          <StatusBadge state={state} />
        </div>

        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Reserve price</span>
            <span className="stat-value">{state.reservePrice.toString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Required deposit</span>
            <span className="stat-value">{state.requiredDeposit.toString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Bidders</span>
            <span className="stat-value">{state.bidderCount.toString()}</span>
          </div>
        </div>

        {(state.isAuctioneer || state.hasBid) && (
          <div className="row gap-2" style={{ marginTop: 'var(--space-4)' }}>
            {state.isAuctioneer && <span className="badge badge-neutral">You're the auctioneer</span>}
            {state.hasBid && <span className="badge badge-neutral">You've placed a bid</span>}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {state.open && !state.hasBid && !state.isAuctioneer && (
        <BidForm busy={busy} onSubmit={(amount) => run(() => api.placeBid(amount))} />
      )}

      {state.open && state.isAuctioneer && (
        <div className="card">
          <div className="card-title">Auctioneer controls</div>
          <div className="card-subtitle">Stop accepting bids once you're ready to resolve.</div>
          <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => api.closeAuction())}>
            Close auction
          </button>
        </div>
      )}

      {!state.open && !state.resolved && !state.hasBid && !state.isAuctioneer && <BidderRevealPanel api={api} />}

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
        <div className="card">
          <div className="card-title">Resolved</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            {state.winningPrice > 0n
              ? `Winning price: ${state.winningPrice.toString()}`
              : 'No bid met the reserve price — no winner.'}
          </p>
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            {state.isWinner && !state.winnerClaimed && (
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.claimWin(myAddressBytes))}>
                Claim my change
              </button>
            )}
            {state.hasBid && !state.isWinner && (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => run(() => api.reclaimDeposit(myAddressBytes))}
              >
                Reclaim my deposit
              </button>
            )}
            {state.isAuctioneer && !state.proceedsWithdrawn && (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => run(() => api.withdrawProceeds(myAddressBytes))}
              >
                Withdraw proceeds
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BidForm({ busy, onSubmit }: { busy: boolean; onSubmit: (amount: bigint) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div className="card">
      <div className="card-title">Place a sealed bid</div>
      <div className="card-subtitle">Your bid amount is never disclosed to anyone — only a commitment to it is.</div>
      <div className="row gap-3">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Bid amount"
          inputMode="numeric"
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          disabled={busy || !amount}
          onClick={() => {
            try {
              onSubmit(BigInt(amount));
            } catch {
              /* invalid bigint input - button stays enabled, input unchanged */
            }
          }}
        >
          {busy ? 'Sealing…' : 'Seal bid'}
        </button>
      </div>
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
    <div className="card">
      <div className="card-title">Reveal your bid to the auctioneer</div>
      <div className="card-subtitle">
        Paste the auctioneer's public key (shared with you out of band), then send them the encrypted output below
        by whatever channel they asked for — it reveals your bid only to them, not to this app or anyone else.
      </div>
      <div className="field">
        <label htmlFor="auctioneer-key">Auctioneer's public key</label>
        <textarea
          id="auctioneer-key"
          className="mono"
          style={{ minHeight: 80, fontSize: 12 }}
          value={auctioneerKeyJson}
          onChange={(e) => setAuctioneerKeyJson(e.target.value)}
          placeholder="Paste the JSON public key here"
        />
      </div>
      <button className="btn btn-primary" onClick={encrypt} disabled={!auctioneerKeyJson}>
        Encrypt my reveal
      </button>
      {error && (
        <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>
          {error}
        </div>
      )}
      {output && (
        <div className="field" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
          <label>Send this to the auctioneer</label>
          <textarea
            className="mono"
            style={{ minHeight: 80, fontSize: 12 }}
            readOnly
            value={output}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
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
    <div className="card">
      <div className="card-title">Resolve the auction</div>
      {!publicKeyJson ? (
        <>
          <div className="card-subtitle">
            Generate a resolution key once — its public half goes to every bidder so they can send you their reveal.
          </div>
          <button className="btn btn-primary" onClick={generateKey}>
            Generate resolution key
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label>Share this public key with every bidder</label>
            <textarea
              className="mono"
              style={{ minHeight: 80, fontSize: 12 }}
              readOnly
              value={publicKeyJson}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="field">
            <label>
              Paste each bidder's encrypted reveal ({gathered.length}/{bidderCount.toString()} gathered)
            </label>
            <textarea
              className="mono"
              style={{ minHeight: 80, fontSize: 12 }}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Encrypted reveal (JSON)"
            />
          </div>
          <div className="row gap-2">
            <button className="btn btn-secondary" onClick={addReveal} disabled={!pasted}>
              Add reveal
            </button>
            <button className="btn btn-primary" disabled={busy || gathered.length === 0} onClick={() => onResolve(gathered)}>
              {busy ? 'Resolving…' : `Resolve with ${gathered.length} gathered reveal${gathered.length === 1 ? '' : 's'}`}
            </button>
          </div>
          {error && (
            <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
