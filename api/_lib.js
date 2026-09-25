// INTERN server library: http helpers, Solana RPC, Jupiter (tokens, prices, quotes, swaps), caches.
// Nothing here holds keys. Trades are built by Jupiter and signed in the user's own wallet.
const CFG = require('./_config');
const MOCK = () => globalThis.__INTERN_MOCK || null;
const now = () => Date.now();

function send(res, code, obj, cache = 'no-store') {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(obj));
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 200000) break; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
function query(req) { if (req.query) return req.query; return Object.fromEntries(new URL(req.url, 'http://x').searchParams); }
function ip(req) { const h = req.headers || {}; return String(h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || '0').trim(); }
class Fail extends Error { constructor(reason, msg, code = 400) { super(msg); this.reason = reason; this.code = code; } }
function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof Fail) return send(res, e.code, { ok: false, reason: e.reason, msg: e.message });
      console.error('[intern]', e && e.stack || e);
      return send(res, 500, { ok: false, reason: 'server', msg: 'Something broke on our side. Try again in a minute.' });
    }
  };
}
const hits = new Map();
function limit(key, max, ms) {
  if (MOCK() && MOCK().nolimit) return;
  const t = now(), arr = (hits.get(key) || []).filter(x => t - x < ms);
  if (arr.length >= max) throw new Fail('slow_down', 'Too many requests. Wait a few seconds.', 429);
  arr.push(t); hits.set(key, arr); if (hits.size > 5000) hits.clear();
}

/* base58 */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58len(s) {
  if (typeof s !== 'string' || !s || s.length > 64) return -1;
  let b = [0];
  for (const ch of s) { const v = B58.indexOf(ch); if (v < 0) return -1; let c = v; for (let i = 0; i < b.length; i++) { c += b[i] * 58; b[i] = c & 255; c >>= 8; } while (c) { b.push(c & 255); c >>= 8; } }
  for (const ch of s) { if (ch === '1') b.push(0); else break; }
  return b.length;
}
const isAddr = s => b58len(String(s || '').trim()) === 32;

/* fetch JSON with timeout (mockable) */
async function getJson(url, opt = {}, ms = 9000) {
  const m = MOCK(); if (m && m.fetch) return m.fetch(url, opt);
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok) { const e = new Error('http ' + r.status + ' ' + url.split('?')[0]); e.status = r.status; e.body = j || text.slice(0, 200); throw e; }
  return j;
}

/* Solana RPC with fallbacks */
const RPCS = () => [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
async function rpc(method, params = []) {
  const m = MOCK(); if (m && m.rpc) return m.rpc(method, params);
  let last;
  for (const u of RPCS()) {
    try {
      const j = await getJson(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, 10000);
      if (j && j.error) { last = new Error(j.error.message); continue; }
      return j.result;
    } catch (e) { last = e; }
  }
  throw new Fail('rpc_down', 'Solana is busy right now. Try again in a moment.', 502);
}

/* Jupiter: lite API first, then the main host */
const JUP = ['https://lite-api.jup.ag', 'https://api.jup.ag'];
async function jup(path, opt) {
  let last;
  for (const h of JUP) {
    try { return await getJson(h + path, opt, 12000); } catch (e) { last = e; if (e.status && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 404 && e.status !== 429) throw e; }
  }
  throw last || new Error('jupiter unreachable');
}

/* known assets */
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const KNOWN = {
  [SOL]: { symbol: 'SOL', name: 'Solana', decimals: 9, kind: 'crypto' },
  [USDC]: { symbol: 'USDC', name: 'USD Coin', decimals: 6, kind: 'stable' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', decimals: 6, kind: 'stable' },
  cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij: { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', decimals: 8, kind: 'crypto' },
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8, kind: 'crypto' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'ETH', name: 'Ether (Portal)', decimals: 8, kind: 'crypto' },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter', decimals: 6, kind: 'crypto' },
};
const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'PYUSD', 'USDG', 'USDS', 'USDE', 'FDUSD', 'DAI', 'USD1', 'USDH']);
function classify(mint, meta = {}) {
  if (KNOWN[mint] && KNOWN[mint].kind) return KNOWN[mint].kind;
  const sym = String(meta.symbol || '').toUpperCase(), name = String(meta.name || ''), tags = meta.tags || [];
  if (STABLE_SYMBOLS.has(sym)) return 'stable';
  if (mint.startsWith('Xs') || tags.includes('xstocks') || /xstock/i.test(name) || /\btokenized (stock|equity)\b/i.test(name)) return 'stock';
  if (meta.isVerified || tags.includes('verified') || tags.includes('strict') || tags.includes('lst')) return 'crypto';
  return 'meme';
}

/* token metadata (cached) */
const metaCache = new Map(); // mint -> {v, at}
async function tokenMeta(mints) {
  const out = {}, need = [];
  for (const m of mints) {
    const c = metaCache.get(m);
    if (c && now() - c.at < 6 * 3600e3) out[m] = c.v; else need.push(m);
  }
  for (let i = 0; i < need.length; i += 90) {
    const chunk = need.slice(i, i + 90);
    try {
      const arr = await jup('/tokens/v2/search?query=' + chunk.join(','));
      for (const t of arr || []) {
        const v = { symbol: t.symbol, name: t.name, icon: t.icon || null, decimals: t.decimals, tags: t.tags || [], isVerified: !!t.isVerified, usdPrice: t.usdPrice ?? null, change24h: t.stats24h && t.stats24h.priceChange != null ? t.stats24h.priceChange : null };
        metaCache.set(t.id, { v, at: now() }); out[t.id] = v;
      }
    } catch (e) { console.error('[meta]', e.message); }
  }
  for (const m of mints) if (!out[m] && KNOWN[m]) out[m] = { ...KNOWN[m], tags: [], icon: null };
  return out;
}

/* prices (cached 30s) */
const priceCache = new Map();
async function prices(mints) {
  const out = {}, need = [];
  for (const m of mints) { const c = priceCache.get(m); if (c && now() - c.at < 30e3) out[m] = c.v; else need.push(m); }
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    try {
      const j = await jup('/price/v3?ids=' + chunk.join(','));
      for (const m of chunk) {
        const p = j && j[m];
        if (p && p.usdPrice != null) { const v = { usd: Number(p.usdPrice), change24h: p.priceChange24h != null ? Number(p.priceChange24h) : null }; priceCache.set(m, { v, at: now() }); out[m] = v; }
      }
    } catch (e) { console.error('[price]', e.message); }
  }
  return out;
}

/* xStocks we show in the market strip — resolved by symbol, only mints that start with "Xs" */
const STOCKS = ['SPYx', 'NVDAx', 'AAPLx', 'TSLAx', 'METAx', 'GOOGLx', 'AMZNx', 'MSFTx', 'COINx', 'MSTRx'];
let stockCache = null;
async function stockList() {
  if (stockCache && now() - stockCache.at < 6 * 3600e3) return stockCache.v;
  const found = [];
  try {
    const arr = await jup('/tokens/v2/search?query=' + STOCKS.join(','));
    const bySym = {};
    for (const t of arr || []) {
      if (!String(t.id).startsWith('Xs')) continue;
      const s = t.symbol; if (!STOCKS.includes(s)) continue;
      if (!bySym[s] || (t.organicScore || 0) > (bySym[s].organicScore || 0)) bySym[s] = t;
    }
    for (const s of STOCKS) if (bySym[s]) {
      const t = bySym[s];
      found.push({ mint: t.id, symbol: s, name: t.name, icon: t.icon || null, decimals: t.decimals, kind: 'stock' });
      metaCache.set(t.id, { v: { symbol: s, name: t.name, icon: t.icon || null, decimals: t.decimals, tags: t.tags || [], isVerified: !!t.isVerified }, at: now() });
    }
  } catch (e) { console.error('[stocks]', e.message); }
  if (found.length) stockCache = { v: found, at: now() };
  return found;
}

module.exports = { CFG, send, body, query, ip, Fail, wrap, limit, isAddr, getJson, rpc, jup, SOL, USDC, KNOWN, classify, tokenMeta, prices, stockList, now };
