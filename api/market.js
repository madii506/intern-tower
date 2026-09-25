// GET /api/market — settings plus live prices for the majors and tokenized stocks (xStocks) the interns can trade.
const L = require('./_lib');
const BASE = [L.SOL, 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', L.USDC];
module.exports = L.wrap(async (req, res) => {
  const stocks = await L.stockList();
  const mints = [...BASE, ...stocks.map(s => s.mint)];
  const [px, meta] = await Promise.all([L.prices(mints), L.tokenMeta(BASE)]);
  const base = BASE.map(m => ({ mint: m, symbol: L.KNOWN[m].symbol === 'cbBTC' ? 'BTC' : L.KNOWN[m].symbol, name: L.KNOWN[m].name, icon: (meta[m] || {}).icon || null, decimals: L.KNOWN[m].decimals, kind: L.KNOWN[m].kind }));
  const assets = [...base, ...stocks].map(a => ({ ...a, price: px[a.mint] ? px[a.mint].usd : null, change24h: px[a.mint] ? px[a.mint].change24h : null }));
  const C = L.CFG;
  L.send(res, 200, { ok: true, cfg: { name: C.name, ticker: C.ticker, ca: C.ca, x: C.x, flagship: C.flagship }, assets, at: L.now() },
    'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
});
