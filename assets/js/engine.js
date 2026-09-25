// The intern's brain, in four agents. Pure functions: holdings + rules in, findings + proposals + report out.
// Analyst reads the bag · Risk checks every idea against your rules and the intern's rank · Trader sizes the swaps · Reporter writes it up.
(function (root) {
  const SOL = 'So11111111111111111111111111111111111111112';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const KINDS = ['stock', 'crypto', 'stable', 'meme'];
  const KIND_NAME = { stock: 'Stocks', crypto: 'Crypto', stable: 'Cash', meme: 'Memecoins' };

  const STYLES = {
    steady:   { label: 'Steady',   stock: 45, crypto: 25, stable: 30, meme: 0,  maxPos: 25, dayDrop: 8,  pick: ['SPYx', 'AAPLx', 'MSFTx'] },
    balanced: { label: 'Balanced', stock: 35, crypto: 45, stable: 15, meme: 5,  maxPos: 35, dayDrop: 12, pick: ['SPYx', 'NVDAx', 'GOOGLx'] },
    degen:    { label: 'Degen',    stock: 25, crypto: 45, stable: 5,  meme: 25, maxPos: 50, dayDrop: 20, pick: ['NVDAx', 'TSLAx', 'COINx'] },
  };

  const RANKS = [
    { id: 'intern',    name: 'Intern',    maxTrade: 5,  need: { trades: 0,  pnl: null }, unlock: 'Reads your whole bag, writes the daily report, proposes small trades.' },
    { id: 'analyst',   name: 'Analyst',   maxTrade: 10, need: { trades: 1,  pnl: null }, unlock: 'Bigger proposals and rebalancing back to your targets.' },
    { id: 'associate', name: 'Associate', maxTrade: 15, need: { trades: 3,  pnl: 0 },    unlock: 'Runs the stock sleeve: picks tokenized stocks for your style.' },
    { id: 'vp',        name: 'VP',        maxTrade: 25, need: { trades: 6,  pnl: 2 },    unlock: 'Multi-step plans across stocks, crypto and cash.' },
    { id: 'partner',   name: 'Partner',   maxTrade: 40, need: { trades: 10, pnl: 5 },    unlock: 'The full playbook. Still never trades without your approval.' },
  ];

  function rankFor(log, pnlPct) {
    const n = (log || []).length;
    let r = RANKS[0];
    for (const k of RANKS) {
      const okTrades = n >= k.need.trades;
      const okPnl = k.need.pnl == null || (pnlPct != null && pnlPct >= k.need.pnl);
      if (okTrades && okPnl) r = k;
    }
    const i = RANKS.indexOf(r), next = RANKS[i + 1] || null;
    let progress = 1;
    if (next) {
      const t = Math.min(1, n / Math.max(1, next.need.trades));
      const p = next.need.pnl == null ? 1 : (pnlPct == null ? 0 : Math.max(0, Math.min(1, (pnlPct + 5) / (next.need.pnl + 5))));
      progress = Math.min(t, p);
    }
    return { ...r, index: i, next, progress };
  }

  // P&L of trades the boss approved: what the bought tokens are worth now vs what was paid.
  function pnl(log, priceOf) {
    let paid = 0, now = 0, counted = 0;
    for (const t of log || []) {
      const p = priceOf(t.outMint);
      if (p == null || !t.inUsd) continue;
      paid += t.inUsd; now += t.outAmount * p; counted++;
    }
    return counted ? { paid, now, usd: now - paid, pct: paid ? (now - paid) / paid * 100 : 0, counted } : { paid: 0, now: 0, usd: 0, pct: null, counted: 0 };
  }

  const pct = (a, b) => b > 0 ? a / b * 100 : 0;
  const r2 = n => Math.round(n * 100) / 100;

  function targetsFrom(rules) {
    const s = STYLES[rules.style] || STYLES.balanced;
    const t = { stock: rules.stock ?? s.stock, crypto: rules.crypto ?? s.crypto, stable: rules.stable ?? s.stable, meme: rules.meme ?? s.meme };
    const sum = KINDS.reduce((a, k) => a + t[k], 0) || 1;
    for (const k of KINDS) t[k] = t[k] / sum * 100;
    return { ...t, maxPos: rules.maxPos ?? s.maxPos, dayDrop: rules.dayDrop ?? s.dayDrop, pick: s.pick };
  }

  // ---------- Analyst ----------
  function analyst(holdings, T) {
    const priced = holdings.filter(h => h.usd != null && h.usd > 0.01);
    const total = priced.reduce((a, h) => a + h.usd, 0);
    const by = {}; for (const k of KINDS) by[k] = 0;
    for (const h of priced) by[h.kind] = (by[h.kind] || 0) + h.usd;
    const alloc = {}; for (const k of KINDS) alloc[k] = { usd: by[k], pct: pct(by[k], total), target: T[k], drift: pct(by[k], total) - T[k] };
    const top = priced[0] || null;
    const topPct = top ? pct(top.usd, total) : 0;
    const hhi = priced.reduce((a, h) => a + Math.pow(h.usd / (total || 1), 2), 0);
    const findings = [];
    if (!total) findings.push({ level: 'info', title: 'The bag is empty', detail: 'Nothing priced in this wallet yet. Add some SOL and your intern gets to work.' });
    if (top && topPct > T.maxPos) findings.push({ level: 'warn', title: `${top.symbol} is ${topPct.toFixed(0)}% of the bag`, detail: `Your rule caps any single position at ${T.maxPos}%.` });
    if (alloc.meme.pct > T.meme + 0.5) findings.push({ level: T.meme === 0 ? 'bad' : 'warn', title: `Memecoins are ${alloc.meme.pct.toFixed(0)}% of the bag`, detail: T.meme === 0 ? 'Your style keeps memecoins at zero.' : `Your cap is ${T.meme.toFixed(0)}%.` });
    if (total && alloc.stable.pct < Math.max(2, T.stable - 10)) findings.push({ level: 'warn', title: 'Almost no cash on hand', detail: `Cash is ${alloc.stable.pct.toFixed(0)}% vs your ${T.stable.toFixed(0)}% target. A cash cushion lets your intern buy dips.` });
    if (total && alloc.stock.pct < T.stock - 10) findings.push({ level: 'info', title: `Stocks are ${alloc.stock.pct.toFixed(0)}% vs your ${T.stock.toFixed(0)}% target`, detail: 'Tokenized stocks on Solana let you hold names like NVDA or SPY next to your crypto.' });
    const droppers = priced.filter(h => h.change24h != null && h.change24h <= -T.dayDrop && h.usd / total > 0.03);
    for (const h of droppers.slice(0, 2)) findings.push({ level: 'warn', title: `${h.symbol} is down ${Math.abs(h.change24h).toFixed(1)}% today`, detail: `Past your ${T.dayDrop}% one-day alarm. Worth a look.` });
    const unpriced = holdings.filter(h => h.usd == null).length;
    if (unpriced) findings.push({ level: 'info', title: `${unpriced} token${unpriced > 1 ? 's' : ''} with no price`, detail: 'Left out of the maths. Usually dust or brand-new tokens.' });
    const diversification = total ? Math.round((1 - hhi) * 100) : 0;
    let score = 100;
    if (top && topPct > T.maxPos) score -= Math.min(30, (topPct - T.maxPos) * 0.8);
    score -= Math.min(30, KINDS.reduce((a, k) => a + Math.abs(alloc[k].drift), 0) * 0.25);
    if (alloc.meme.pct > T.meme) score -= Math.min(25, (alloc.meme.pct - T.meme) * 0.9);
    if (total && alloc.stable.pct < 2) score -= 6;
    score = total ? Math.max(0, Math.min(100, Math.round(score))) : 0;
    if (total && !findings.some(f => f.level !== 'info')) findings.unshift({ level: 'good', title: 'The bag matches your rules', detail: 'No position is too big, and every sleeve is near its target.' });
    return { total, alloc, top, topPct, diversification, score, findings, priced };
  }

  // ---------- Trader + Risk ----------
  function plan(A, T, rank, market) {
    const total = A.total; if (!total) return [];
    const cap = total * rank.maxTrade / 100;
    const bySym = s => (market || []).find(a => a.symbol === s && a.price);
    const usdc = (market || []).find(a => a.mint === USDC) || { mint: USDC, symbol: 'USDC', decimals: 6, price: 1 };
    const sol = (market || []).find(a => a.mint === SOL) || { mint: SOL, symbol: 'SOL', decimals: 9 };
    const stockPick = () => { for (const s of T.pick) { const a = bySym(s); if (a) return a; } return (market || []).find(a => a.kind === 'stock' && a.price) || null; };
    const dest = { stock: stockPick(), stable: usdc, crypto: sol };
    const out = [];
    const used = new Set();
    const pushTrade = (h, usd, to, why, agentNote) => {
      if (!h || !to || h.mint === to.mint || usd < 1) return;
      let clipped = false;
      if (usd > cap) { usd = cap; clipped = true; }
      let amount = usd / h.price;
      if (h.mint === SOL) { amount = Math.min(amount, Math.max(0, h.amount - 0.03)); usd = amount * h.price; }   // always leave SOL for fees
      amount = Math.min(amount, h.amount);
      if (usd < 1 || amount <= 0) return;
      out.push({ id: `${h.mint.slice(0, 6)}-${to.mint.slice(0, 6)}`, from: { mint: h.mint, symbol: h.symbol, decimals: h.decimals, amount, icon: h.icon }, to: { mint: to.mint, symbol: to.symbol, decimals: to.decimals, icon: to.icon }, usd: r2(usd), why, risk: clipped ? `Trimmed to ${rank.maxTrade}% of the bag: the most a ${rank.name} can move at once.` : `Within the ${rank.maxTrade}% a ${rank.name} can move.`, clipped });
      used.add(h.mint);
    };
    // 1. memecoins over the cap → cash
    if (A.alloc.meme.pct > T.meme + 1) {
      const m = A.priced.filter(h => h.kind === 'meme').sort((a, b) => b.usd - a.usd)[0];
      pushTrade(m, (A.alloc.meme.pct - T.meme) / 100 * total, dest.stable, `Memecoins are ${A.alloc.meme.pct.toFixed(0)}% of the bag; your cap is ${T.meme.toFixed(0)}%.`);
    }
    // 2. one position too big → the most underweight sleeve
    if (A.top && A.topPct > T.maxPos + 1 && !used.has(A.top.mint)) {
      const under = ['stock', 'stable', 'crypto'].filter(k => dest[k] && dest[k].mint !== A.top.mint).sort((a, b) => A.alloc[a].drift - A.alloc[b].drift)[0];
      pushTrade(A.top, (A.topPct - T.maxPos) / 100 * total, dest[under], `${A.top.symbol} is ${A.topPct.toFixed(0)}% of the bag; your max is ${T.maxPos}%. Moving the excess into ${KIND_NAME[under].toLowerCase()}.`);
    }
    // 3. rebalance the biggest drift
    const over = KINDS.filter(k => A.alloc[k].drift > 5).sort((a, b) => A.alloc[b].drift - A.alloc[a].drift)[0];
    const under = ['stock', 'stable', 'crypto'].filter(k => A.alloc[k].drift < -5 && dest[k]).sort((a, b) => A.alloc[a].drift - A.alloc[b].drift)[0];
    if (over && under && out.length < 3) {
      const src = A.priced.filter(h => h.kind === over && !used.has(h.mint) && h.mint !== dest[under].mint).sort((a, b) => b.usd - a.usd)[0];
      const usd = Math.min(A.alloc[over].drift, -A.alloc[under].drift) / 100 * total;
      pushTrade(src, usd, dest[under], `${KIND_NAME[over]} are ${A.alloc[over].drift.toFixed(0)} points over target and ${KIND_NAME[under].toLowerCase()} ${Math.abs(A.alloc[under].drift).toFixed(0)} under.`);
    }
    return out.slice(0, 3);
  }

  // ---------- Reporter (numbers-only version; the AI version writes from the same facts) ----------
  function report(name, A, props, rank) {
    if (!A.total) return `${name} here. The bag is empty, so there's nothing to manage yet. Send some SOL to this wallet and I'll write you a proper report.\nNext: waiting for the first deposit.`;
    const sleeves = ['stock', 'crypto', 'stable', 'meme'].filter(k => A.alloc[k].usd > 0).map(k => `${KIND_NAME[k].toLowerCase()} ${A.alloc[k].pct.toFixed(0)}%`).join(', ');
    const worry = A.findings.find(f => f.level === 'bad' || f.level === 'warn');
    let s = `${name} here. The bag is worth $${A.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}: ${sleeves}. `;
    s += worry ? `Biggest issue: ${worry.title.toLowerCase()}. ` : 'Everything sits inside your rules today. ';
    s += props.length ? `I've prepared ${props.length} trade${props.length > 1 ? 's' : ''} for you, each checked by Risk against your limits. Nothing moves until you approve it.` : 'No trades needed right now.';
    return s + `\nNext: ${props.length ? 'review my proposals below.' : `keep holding. I'll check again on your next visit.`}`;
  }

  function run(holdings, rules, rank, market, name) {
    const T = targetsFrom(rules || {});
    const A = analyst(holdings || [], T);
    const proposals = plan(A, T, rank, market);
    return { targets: T, ...A, proposals, report: report(name || 'Your intern', A, proposals, rank) };
  }

  const api = { STYLES, RANKS, KINDS, KIND_NAME, SOL, USDC, rankFor, pnl, targetsFrom, run };
  root.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
