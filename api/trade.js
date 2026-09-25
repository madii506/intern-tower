// POST /api/trade {op:'quote'|'swap'} — Jupiter quotes and unsigned swap transactions. The user's wallet signs; we never can.
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') throw new L.Fail('method', 'POST only.', 405);
  L.limit('trade:' + L.ip(req), 40, 60000);
  const b = await L.body(req);
  if (b.op === 'quote') {
    const { inputMint, outputMint } = b;
    const amount = String(b.amount || '');
    const slip = Math.max(10, Math.min(300, parseInt(b.slippageBps, 10) || 50));
    if (!L.isAddr(inputMint) || !L.isAddr(outputMint) || inputMint === outputMint) throw new L.Fail('bad_pair', 'Pick two different tokens.');
    if (!/^[1-9][0-9]{0,24}$/.test(amount)) throw new L.Fail('bad_amount', 'That amount is too small to trade.');
    const q = await L.jup(`/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slip}&restrictIntermediateTokens=true`)
      .catch(e => { throw new L.Fail('no_route', e.body && e.body.error ? String(e.body.error) : 'No route for this trade right now.', 502); });
    if (!q || !q.outAmount) throw new L.Fail('no_route', 'No route for this trade right now.', 502);
    return L.send(res, 200, { ok: true, quote: q, summary: { inAmount: q.inAmount, outAmount: q.outAmount, otherAmountThreshold: q.otherAmountThreshold, priceImpactPct: Number(q.priceImpactPct || 0), slippageBps: q.slippageBps, route: (q.routePlan || []).map(r => r.swapInfo && r.swapInfo.label).filter(Boolean) } });
  }
  if (b.op === 'swap') {
    if (!b.quote || !b.quote.inputMint) throw new L.Fail('bad_quote', 'Get a fresh quote first.');
    if (!L.isAddr(b.user)) throw new L.Fail('bad_user', 'Connect your wallet first.');
    const s = await L.jup('/swap/v1/swap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteResponse: b.quote, userPublicKey: b.user, dynamicComputeUnitLimit: true, dynamicSlippage: false, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 400000, priorityLevel: 'high' } } }) })
      .catch(e => { throw new L.Fail('swap_build', 'Jupiter couldn\'t build this swap. Get a fresh quote and try again.', 502); });
    if (!s || !s.swapTransaction) throw new L.Fail('swap_build', 'Jupiter couldn\'t build this swap.', 502);
    return L.send(res, 200, { ok: true, tx: s.swapTransaction, lastValidBlockHeight: s.lastValidBlockHeight || null });
  }
  throw new L.Fail('bad_op', 'Unknown trade action.');
});
