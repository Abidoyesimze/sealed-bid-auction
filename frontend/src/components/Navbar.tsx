import { NavLink } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';

const truncate = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;

export function Navbar({ wallet, onConnect }: { wallet: LaceConnectionState; onConnect: () => void }) {
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <NavLink to="/" className="brand">
          <span className="brand-mark">🌙</span>
          <span className="brand-text-full">Sealed-Bid Auction</span>
        </NavLink>

        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/app" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Launch App
          </NavLink>
        </nav>

        {wallet.status === 'connected' ? (
          <span className="wallet-pill">
            <span className="wallet-pill-dot" />
            <span className="mono">{truncate(wallet.address)}</span>
          </span>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onConnect}
            disabled={wallet.status === 'connecting'}
          >
            {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  );
}
