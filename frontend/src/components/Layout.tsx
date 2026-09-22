import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useLaceWallet } from '../hooks/useLaceWallet';

export function Layout() {
  const { state: wallet, connect } = useLaceWallet();

  return (
    <div>
      <Navbar wallet={wallet} onConnect={connect} />
      <Outlet context={{ wallet, connect }} />
      <footer className="footer">
        <div className="container footer-inner">
          <span className="text-faint text-sm">Sealed-Bid Auction — built on Midnight</span>
          <div className="footer-links">
            <a href="https://github.com/Abidoyesimze/sealed-bid-auction" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://docs.midnight.network" target="_blank" rel="noreferrer">
              Midnight Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
