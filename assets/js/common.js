// Shared helpers for every INTERN page.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(path, data) {
    const opt = data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' };
    let r, j;
    try { r = await fetch('/api/' + path, opt); } catch { return { ok: false, reason: 'offline', msg: 'You look offline. Check your connection.' }; }
    try { j = await r.json(); } catch { j = { ok: false, reason: 'server', msg: 'Something broke on our side. Try again in a minute.' }; }
    if (!r.ok && j.ok !== false) j.ok = false;
    return j;
  }
  const fmt = {
    usd: (n, d) => n == null || isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(n) < 1 ? 4 : 2), maximumFractionDigits: d ?? (Math.abs(n) < 1 ? 4 : 2) }),
    usd0: n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'),
    amt: n => n == null ? '—' : n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : n.toPrecision(3),
    pct: (n, d = 1) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%',
    short: a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '',
    ago: t => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; },
  };
  function toast(t, ms = 2800) { let e = $('.toast'); if (!e) { e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); document.body.appendChild(e); } e.textContent = t; e.classList.add('on'); clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('on'), ms); }
  async function copy(t, label = 'Copied') { try { await navigator.clipboard.writeText(t); toast(label); } catch { toast('Copy failed. Select and copy it by hand.'); } }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('intern.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('intern.' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('intern.' + k); } catch {} },
  };
  let marketP = null;
  const market = (fresh) => (!fresh && marketP) || (marketP = api('market'));
  const icon = (a, cls = '') => a && a.icon ? `<img class="${cls}" src="${esc(a.icon)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph ${cls}',textContent:'${esc((a.symbol || '?').slice(0, 2))}'}))">` : `<span class="ph ${cls}">${esc(((a && a.symbol) || '?').slice(0, 2))}</span>`;
  function tickerChips(assets) {
    return assets.filter(a => a.price != null && a.symbol !== 'USDC').map(a => `<span class="chip">${icon(a)}${esc(a.symbol)} ${fmt.usd(a.price, a.price < 1 ? 4 : 2)} <span class="${(a.change24h || 0) >= 0 ? 'up' : 'dn'}">${fmt.pct(a.change24h)}</span></span>`).join('');
  }
  const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || '').trim());
  window.I = { $, $$, esc, api, fmt, toast, copy, store, market, icon, tickerChips, isAddr };
})();
