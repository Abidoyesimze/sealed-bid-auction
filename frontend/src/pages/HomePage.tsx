import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <main>
      <section className="hero container">
        <span className="hero-eyebrow">🌙 Built on Midnight</span>
        <h1>Sealed bids. Verifiable results. Nothing else revealed.</h1>
        <p className="hero-sub">
          List an item with a reserve price. Bidders submit bids that stay completely private while the auction is
          open — not even the auctioneer can see one. When it closes, the contract proves who bid highest and
          reveals only the winner and the winning price. Every losing bid stays private, permanently.
        </p>
        <div className="hero-actions">
          <Link to="/app" className="btn btn-primary">
            Launch app
          </Link>
          <a
            href="https://github.com/Abidoyesimze/sealed-bid-auction"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            View source
          </a>
        </div>
      </section>

      <section className="section container">
        <div className="section-header">
          <div className="section-eyebrow">Why it matters</div>
          <h2>Open auctions leak information. Off-chain sealed auctions leak trust.</h2>
          <p>
            On a transparent chain, bid amounts are public even without a UI for them. Off-chain sealed auctions fix
            that, but only by trusting an auctioneer to evaluate bids honestly — with no way to check afterward.
          </p>
        </div>
        <div className="grid-3">
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Bids stay sealed</h3>
            <p>
              Each bid is a cryptographic commitment. No one — not other bidders, not the auctioneer, not the
              contract's own deployer — can see an amount while the auction is open.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">✅</div>
            <h3>Verifiably correct</h3>
            <p>
              Resolution happens inside a single zero-knowledge circuit call. The winner is provably the highest
              bidder — no one has to just take the auctioneer's word for it.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🪙</div>
            <h3>Escrowed automatically</h3>
            <p>
              Bidders lock funds when they bid. Losers reclaim their deposit privately after close; the winner gets
              back the unused portion — no manual settlement required.
            </p>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section-header">
          <div className="section-eyebrow">How it works</div>
          <h2>Four steps, one privacy-preserving circuit</h2>
        </div>
        <div className="stack gap-4" style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="step">
            <span className="step-number">1</span>
            <div>
              <h3>Deploy an auction</h3>
              <p>The auctioneer deploys the contract with a public reserve price and the deposit every bidder must lock.</p>
            </div>
          </div>
          <div className="step">
            <span className="step-number">2</span>
            <div>
              <h3>Bidders seal their bids</h3>
              <p>Each bid is committed as a hash — the amount never touches the ledger.</p>
            </div>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <div>
              <h3>Close and resolve</h3>
              <p>One circuit call proves the highest bid and discloses only the winner and price.</p>
            </div>
          </div>
          <div className="step">
            <span className="step-number">4</span>
            <div>
              <h3>Settle</h3>
              <p>Losers reclaim their deposit, the winner reclaims their change, the auctioneer withdraws proceeds.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-7)' }}>
          <h2 style={{ marginBottom: 'var(--space-3)' }}>Ready to run a private auction?</h2>
          <p style={{ maxWidth: 480, margin: '0 auto var(--space-5)' }}>
            Connect a Lace wallet and join an auction by its contract address — including the live demo deployment.
          </p>
          <Link to="/app" className="btn btn-primary">
            Launch app
          </Link>
        </div>
      </section>
    </main>
  );
}
