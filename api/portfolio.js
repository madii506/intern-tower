// GET /api/portfolio?address= — every token in a Solana wallet, priced, classified (stock / crypto / stable / meme). Read-only.
const L = require('./_lib');
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
module.exports = L.wrap(async (req, res) => {
  const address = String(L.query(req).address || '').trim();
  if (!L.isAddr(address)) throw new L.Fail('bad_address', 'That isn\'t a Solana wallet address.');
  L.limit('pf:' + L.ip(req), 30, 60000);
  const opts = { encoding: 'jsonParsed', commitment: 'confirmed' };
  const [bal, a, b] = await Promise.all([
    L.rpc('getBalance', [address, { commitment: 'confirmed' }]),
    L.rpc('getTokenAccountsByOwner', [address, { programId: TOKEN }, opts]),
    L.rpc('getTokenAccountsByOwner', [address, { programId: T22 }, opts]).catch(() => ({ value: [] })),
  ]);
  const agg = new Map();
  agg.set(L.SOL, { mint: L.SOL, amount: ((bal && bal.value) || 0) / 1e9, decimals: 9 });
  for (const acc of [...((a && a.value) || []), ...((b && b.value) || [])]) {
    const info = acc && acc.account && acc.account.data && acc.account.data.parsed && acc.account.data.parsed.info;
    if (!info || !info.tokenAmount) continue;
    const ta = info.tokenAmount;
    if (ta.decimals === 0) continue; // NFTs and receipts, not holdings
    const amt = Number(ta.uiAmountString != null ? ta.uiAmountString : ta.uiAmount || 0);
    if (!(amt > 0)) continue;
    const cur = agg.get(info.mint) || { mint: info.mint, amount: 0, decimals: ta.decimals };
    cur.amount += amt; agg.set(info.mint, cur);
  }
  const list = [...agg.values()].filter(x => x.amount > 0).slice(0, 150);
  const mints = list.map(x => x.mint);
  const [meta, px] = await Promise.all([L.tokenMeta(mints), L.prices(mints)]);
  const holdings = list.map(x => {
    const m = meta[x.mint] || {};
    const p = px[x.mint] || (m.usdPrice != null ? { usd: m.usdPrice, change24h: m.change24h } : null);
    return {
      mint: x.mint, symbol: m.symbol || x.mint.slice(0, 4) + '…', name: m.name || 'Unknown token', icon: m.icon || null,
      decimals: x.decimals != null ? x.decimals : m.decimals, amount: x.amount,
      price: p ? p.usd : null, change24h: p ? p.change24h : null, usd: p ? x.amount * p.usd : null,
      kind: L.classify(x.mint, m), verified: !!(m.isVerified || (m.tags || []).includes('verified')),
    };
  }).sort((p, q) => (q.usd || 0) - (p.usd || 0));
  const total = holdings.reduce((s, h) => s + (h.usd || 0), 0);
  L.send(res, 200, { ok: true, address, total, holdings, unpriced: holdings.filter(h => h.usd == null).length, at: L.now() }, 'private, max-age=10');
});
