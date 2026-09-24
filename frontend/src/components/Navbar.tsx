import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LaceConnectionState } from '../hooks/useLaceWallet';

const truncate = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;

export function Navbar({ wallet, onConnect }: { wallet: LaceConnectionState; onConnect: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <NavLink to="/" className="brand" onClick={() => setMobileOpen(false)}>
          <img src="/favicon.svg" alt="" className="brand-mark" />
          <span className="brand-text-full">Sealed-Bid Auction</span>
        </NavLink>

        <nav className={`nav-links${mobileOpen ? ' nav-links-mobile-open' : ''}`}>
          <NavLink
            to="/"
            end
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Home
          </NavLink>
          <NavLink
            to="/app"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Launch App
          </NavLink>
          <NavLink
            to="/create"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Create
          </NavLink>
        </nav>

        <button
          className="nav-toggle"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>

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
