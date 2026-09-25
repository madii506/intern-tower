// GET /api/tx?sig= — is this transaction confirmed yet?  POST /api/tx {raw} — relay a transaction the user's wallet already signed.
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (req.method === 'POST') {
    L.limit('send:' + L.ip(req), 20, 60000);
    const b = await L.body(req);
    const raw = String(b.raw || '');
    if (!/^[A-Za-z0-9+/=]{100,3000}$/.test(raw)) throw new L.Fail('bad_tx', 'That isn\'t a signed transaction.');
    const sig = await L.rpc('sendTransaction', [raw, { encoding: 'base64', skipPreflight: false, maxRetries: 3, preflightCommitment: 'confirmed' }]);
    return L.send(res, 200, { ok: true, sig });
  }
  const sig = String(L.query(req).sig || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) throw new L.Fail('bad_sig', 'Not a transaction signature.');
  L.limit('tx:' + L.ip(req), 120, 60000);
  const r = await L.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
  const s = r && r.value && r.value[0];
  const status = !s ? 'pending' : s.err ? 'failed' : (s.confirmationStatus === 'finalized' || s.confirmationStatus === 'confirmed') ? 'confirmed' : 'pending';
  L.send(res, 200, { ok: true, status, err: s && s.err ? JSON.stringify(s.err) : null });
});
