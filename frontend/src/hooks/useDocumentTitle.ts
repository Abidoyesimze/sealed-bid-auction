import { useEffect } from 'react';

const BASE_TITLE = 'Sealed-Bid Auction';

export function useDocumentTitle(pageTitle?: string) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} — ${BASE_TITLE}` : `${BASE_TITLE} — private bids, verifiable results, on Midnight`;
  }, [pageTitle]);
}
