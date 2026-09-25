// The tower app: your intern, your wallet, the four rooms, the chat, the ladder.
(function () {
  const { $, $$, esc, api, fmt, toast, copy, store, market, icon, tickerChips, isAddr } = I;
  const E = Engine;
  const S = { me: store.get('me', null), wallet: null, assets: [], pf: null, A: null, rank: E.RANKS[0], pnl: null, chat: store.get('chat', []), busy: false, memo: null };
  const save = () => store.set('me', S.me);
  const ICONS = {
    research: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
    risk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/></svg>',
    trading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l5-5 4 3 7-8"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/></svg>',
    desk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V6M6 12l6-6 6 6"/></svg>',
    reception: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    talk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  };

  /* ---------- status + card ---------- */
  function status(t, busy) { $('#mStatus').textContent = t; $('#mDot').classList.toggle('busy', !!busy); }
  function priceOf(mint) { const h = S.pf && S.pf.holdings.find(x => x.mint === mint); if (h && h.price != null) return h.price; const a = S.assets.find(x => x.mint === mint); return a ? a.price : null; }
  function refreshRank(announce) {
    const log = (S.me && S.me.log) || [];
    S.pnl = E.pnl(log, priceOf);
    const prev = S.rank ? S.rank.index : 0;
    S.rank = E.rankFor(log, S.pnl.pct);
    World.setRank(S.rank.index);
    $('#mRank').textContent = S.rank.name.toUpperCase();
    $('#mXp').style.width = Math.round(S.rank.progress * 100) + '%';
    $('#mNext').textContent = S.rank.next ? 'Next: ' + S.rank.next.name : 'Top floor';
    $('#mPnl').textContent = S.pnl.pct == null ? '—' : fmt.pct(S.pnl.pct);
    $('#mPnl').className = S.pnl.pct == null ? '' : S.pnl.pct >= 0 ? 'up' : 'dn';
    if (announce && S.rank.index > prev) promoted();
  }
  async function promoted() {
    World.confetti(); World.say(`I got promoted to ${S.rank.name}!`, 4200);
    toast(`${S.me.name} was promoted to ${S.rank.name}.`);
    await World.sleep(1600); await World.goDesk(S.rank.index); World.say('New desk. Nice view.', 2400);
  }
  function card() {
    $('#mName').textContent = S.me ? S.me.name : 'No intern yet';
    $('#mBag').textContent = S.pf ? fmt.usd0(S.pf.total) : '—';
    const w = $('#walletBtn');
    if (S.me && S.me.address) { w.innerHTML = `<span class="wallet-dot${S.wallet ? '' : ' watch'}"></span>${esc(fmt.short(S.me.address))}`; w.title = S.wallet ? 'Wallet connected' : 'Watching this wallet (read-only)'; }
    else w.textContent = 'Give it a wallet';
  }

  /* ---------- wallets ---------- */
  const PROVIDERS = () => [
    { id: 'phantom', name: 'Phantom', get: () => (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom && window.solana) },
    { id: 'backpack', name: 'Backpack', get: () => window.backpack && (window.backpack.solana || window.backpack) },
    { id: 'solflare', name: 'Solflare', get: () => window.solflare && window.solflare.isSolflare && window.solflare },
  ].map(p => ({ ...p, p: p.get() })).filter(p => p.p);
  async function connect(pid) {
    const pr = PROVIDERS().find(p => p.id === pid); if (!pr) return toast('That wallet isn\'t installed in this browser.');
    try {
      const r = await pr.p.connect();
      const pk = ((r && r.publicKey) || pr.p.publicKey).toString();
      S.wallet = pr.p; S.me.address = pk; S.me.mode = 'wallet'; S.me.walletId = pid; save(); card();
      toast(`Connected ${pr.name}.`); World.say('Got the bag. Reading it now.', 2400);
      await loadBag(); return true;
    } catch (e) { toast('The wallet didn\'t connect.'); return false; }
  }
  async function reconnect() {
    if (!S.me || S.me.mode !== 'wallet' || !S.me.walletId) return;
    const pr = PROVIDERS().find(p => p.id === S.me.walletId); if (!pr) return;
    try { const r = await pr.p.connect({ onlyIfTrusted: true }); const pk = ((r && r.publicKey) || pr.p.publicKey || '').toString(); if (pk === S.me.address) { S.wallet = pr.p; card(); } } catch {}
  }

  /* ---------- data ---------- */
  async function loadBag(quiet) {
    if (!S.me || !S.me.address) { S.pf = null; S.A = null; card(); return null; }
    status('Reading the bag…', true);
    const j = await api('portfolio?address=' + encodeURIComponent(S.me.address));
    if (!j.ok) { status(j.msg || 'Couldn\'t read the wallet.'); if (!quiet) toast(j.msg || 'Couldn\'t read the wallet.'); return null; }
    S.pf = j; analyze(); card(); status(`Bag read · ${j.holdings.length} token${j.holdings.length === 1 ? '' : 's'}`);
    return j;
  }
  function analyze() {
    if (!S.pf || !S.me) return;
    refreshRank(false);
    S.A = E.run(S.pf.holdings, { style: S.me.style, ...(S.me.targets || {}) }, S.rank, S.assets, S.me.name);
    refreshRank(true);
    if (drawerRoom && drawerRoom !== 'talk' && drawerRoom !== 'reception') render(drawerRoom);
  }
  function facts() {
    const A = S.A;
    if (!A) return { bag: 'no wallet yet' };
    return {
      bagUsd: Math.round(A.total * 100) / 100,
      sleeves: Object.fromEntries(E.KINDS.map(k => [k, { pct: Math.round(A.alloc[k].pct), target: Math.round(A.alloc[k].target) }])),
      top: A.priced.slice(0, 6).map(h => ({ sym: h.symbol, kind: h.kind, usd: Math.round(h.usd), pct: Math.round(h.usd / A.total * 100), change24h: h.change24h == null ? null : Math.round(h.change24h * 10) / 10 })),
      score: A.score, findings: A.findings.map(f => f.title),
      proposals: A.proposals.map(p => ({ sell: p.from.symbol, buy: p.to.symbol, usd: p.usd, why: p.why })),
      rank: S.rank.name, approvedTrades: (S.me.log || []).length, resultsPct: S.pnl && S.pnl.pct != null ? Math.round(S.pnl.pct * 10) / 10 : null,
    };
  }

  /* ---------- drawer ---------- */
  let drawerRoom = null;
  const TITLES = {
    research: ['Research', 'Everything in the bag, priced live'], risk: ['Risk', 'Your rules, checked in code'], trading: ['Trading', 'Proposals you approve in your wallet'],
    reports: ['Reports', 'Your intern\'s note to you'], desk: ['The ladder', 'Promotions come from results'], reception: ['Reception', 'Hire, rules and wallet'], talk: ['Talk', 'Ask your intern anything about the bag'],
  };
  function open(room) {
    drawerRoom = room;
    $$('.dock button[data-room]').forEach(b => b.setAttribute('aria-pressed', b.dataset.room === room));
    $('#dIco').innerHTML = ICONS[room]; $('#dTitle').textContent = TITLES[room][0]; $('#dSub').textContent = TITLES[room][1];
    $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    render(room);
  }
  function close() { drawerRoom = null; $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $$('.dock button[data-room]').forEach(b => b.setAttribute('aria-pressed', 'false')); }
  $('#dClose').onclick = close;
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  const body = h => { $('#dBody').innerHTML = h; };
  const foot = h => { const f = $('#dFoot'); f.classList.toggle('hide', !h); f.innerHTML = h || ''; };
  const needWallet = () => `<div class="msg info">Your intern needs a bag first. Open <b>Settings</b> to connect a wallet or paste an address.</div><button class="btn red" data-go="reception">Give it a wallet</button>`;

  function render(room) {
    foot('');
    if (room === 'reception') return renderReception();
    if (room === 'talk') return renderTalk();
    if (room === 'desk') return renderDesk();
    if (!S.me || !S.me.address) return body(needWallet());
    if (!S.A) return body('<div class="msg info"><span class="spin"></span> Reading the bag…</div>');
    if (room === 'research') return renderBag();
    if (room === 'risk') return renderRisk();
    if (room === 'trading') return renderTrades();
    if (room === 'reports') return renderReport();
  }

  function renderBag() {
    const A = S.A, pf = S.pf;
    const bar = E.KINDS.map(k => A.alloc[k].pct > 0 ? `<i class="k-${k}" style="width:${A.alloc[k].pct}%"></i>` : '').join('');
    body(`<div class="sec"><div class="sub">Total bag</div><div class="big">${fmt.usd(A.total, 2)}</div>
      <div class="alloc">${bar || '<i style="width:100%;background:#2a2d34"></i>'}</div>
      <div class="legend">${E.KINDS.map(k => `<div><i class="k-${k}"></i>${E.KIND_NAME[k]}<b>${A.alloc[k].pct.toFixed(0)}%</b><small>/ ${A.alloc[k].target.toFixed(0)}%</small></div>`).join('')}</div></div>
      <div class="sec"><h3>Holdings · ${pf.holdings.length}</h3>${pf.holdings.map(h => `<div class="hold">${icon(h)}<div><div class="t"><b>${esc(h.symbol)}</b><span class="tag ${h.kind}">${h.kind}</span></div><div class="n">${fmt.amt(h.amount)} · ${h.price != null ? fmt.usd(h.price, h.price < 1 ? 5 : 2) : 'no price'}</div></div><div class="v">${h.usd != null ? fmt.usd(h.usd, 2) : '—'}<small class="${(h.change24h || 0) >= 0 ? 'up' : 'dn'}">${h.change24h != null ? fmt.pct(h.change24h) : ''}</small></div></div>`).join('') || '<div class="msg info">No tokens in this wallet yet.</div>'}</div>
      <div class="sub">Read ${fmt.ago(pf.at)} from Solana mainnet · prices by Jupiter</div>`);
    foot('<button class="btn" data-act="refresh">Refresh</button><button class="btn red" data-go="risk">Send to Risk →</button>');
  }
  function renderRisk() {
    const A = S.A, T = A.targets;
    const row = k => { const a = A.alloc[k]; return `<div class="rule-row"><span>${E.KIND_NAME[k]}</span><div class="track"><i class="k-${k}" style="width:${Math.min(100, a.pct)}%"></i><u style="left:${Math.min(99, a.target)}%"></u></div><b>${a.pct.toFixed(0)}% <small class="sub">/ ${a.target.toFixed(0)}</small></b></div>`; };
    body(`<div class="sec score"><div class="ring" style="--v:${A.score}"><b>${A.score}</b></div><div><b style="font-size:17px">Rule score</b><div class="sub">100 means the bag matches every rule. White marks are your targets.</div></div></div>
      <div class="sec card">${E.KINDS.map(row).join('')}
      <div class="kv" style="margin-top:12px"><span>Max single position</span><b>${T.maxPos}%${A.top ? ` · now ${esc(A.top.symbol)} ${A.topPct.toFixed(0)}%` : ''}</b><span>One-day drop alarm</span><b>${T.dayDrop}%</b><span>${esc(S.rank.name)} can move at once</span><b>${S.rank.maxTrade}% of the bag</b></div></div>
      <div class="sec"><h3>Findings</h3>${A.findings.map(f => `<div class="find"><span class="lv ${f.level}">${f.level === 'good' ? '✓' : f.level === 'info' ? 'i' : '!'}</span><div><b>${esc(f.title)}</b><span>${esc(f.detail)}</span></div></div>`).join('')}</div>`);
    foot('<button class="btn" data-go="reception">Edit rules</button><button class="btn red" data-go="trading">To Trading →</button>');
  }
  function renderTrades() {
    const P = S.A.proposals;
    const conn = !!S.wallet;
    body(`${conn ? '' : '<div class="msg info">You\'re watching this wallet read-only. Connect it in <b>Settings</b> to approve trades.</div>'}
      ${P.length ? P.map((p, i) => `<div class="prop" id="p${i}"><div class="pair">${icon(p.from)}<span>${esc(p.from.symbol)}</span><span class="arrow">→</span>${icon(p.to)}<span>${esc(p.to.symbol)}</span></div>
        <div class="amt">Sell <b>${fmt.amt(p.from.amount)} ${esc(p.from.symbol)}</b> · about <b>${fmt.usd(p.usd, 2)}</b></div>
        <p class="why">${esc(p.why)}</p><div class="risk${p.clipped ? ' clip' : ''}">Risk: ${esc(p.risk)}</div>
        <div class="q"></div><div class="acts"><button class="btn sm" data-quote="${i}">Get live quote</button><button class="btn sm red" data-approve="${i}" ${conn ? '' : 'disabled'}>Approve in wallet</button></div></div>`).join('')
        : '<div class="msg ok">No trades needed. The bag already fits your rules.</div>'}
      <div class="sub" style="margin-top:6px">Quotes and routes come live from Jupiter. Your wallet shows the exact transaction before anything is signed.</div>`);
  }
  function renderReport() {
    const A = S.A, m = S.memo;
    const d = new Date();
    body(`<div class="report"><div class="hd"><span>INTERN TOWER · REPORTS</span><span>${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span></div>${esc(m && m.note ? m.note : A.report)}<div class="by">— ${esc(S.me.name).toUpperCase()}, ${esc(S.rank.name).toUpperCase()} · ${m && m.source === 'ai' ? 'WRITTEN BY AI' : 'WRITTEN FROM THE NUMBERS'}</div></div>`);
    foot('<button class="btn" data-act="memo">Write a fresh one</button><button class="btn red" data-go="trading">See trades →</button>');
  }
  function renderDesk() {
    const log = (S.me && S.me.log) || [];
    body(`<div class="sec card kv"><span>Rank</span><b>${esc(S.rank.name)}</b><span>Approved trades</span><b>${log.length}</b><span>Results on those trades</span><b class="${S.pnl && S.pnl.pct != null ? (S.pnl.pct >= 0 ? 'up' : 'dn') : ''}">${S.pnl && S.pnl.pct != null ? fmt.pct(S.pnl.pct) + ' · ' + fmt.usd(S.pnl.usd, 2) : '—'}</b><span>Hired</span><b>${S.me && S.me.hiredAt ? fmt.ago(S.me.hiredAt) : '—'}</b></div>
      <div class="sec"><h3>The ladder</h3><div class="ladder">${E.RANKS.map((r, i) => `<div class="step ${i < S.rank.index ? 'done' : i === S.rank.index ? 'cur' : ''}"><span class="n">${i + 1}</span><div><b>${r.name} · moves ${r.maxTrade}%</b><span>${esc(r.unlock)}</span><span>${i === 0 ? 'Day one.' : `Needs ${r.need.trades} approved trade${r.need.trades > 1 ? 's' : ''}${r.need.pnl != null ? `, results ${r.need.pnl >= 0 ? '+' : ''}${r.need.pnl}% or better` : ''}.`}</span></div><span class="st">${i < S.rank.index ? 'DONE' : i === S.rank.index ? 'NOW' : 'LOCKED'}</span></div>`).join('')}</div></div>
      <div class="sec log"><h3>Trade log</h3>${log.length ? log.slice().reverse().map(t => `<div class="hold"><span class="ph">✓</span><div><b>${esc(t.inSym)} → ${esc(t.outSym)}</b><div class="n">${fmt.amt(t.inAmount)} ${esc(t.inSym)} · ${fmt.ago(t.t)}</div></div><div class="v">${fmt.usd(t.inUsd, 2)}<small><a href="https://solscan.io/tx/${esc(t.sig)}" target="_blank" rel="noopener">Solscan ↗</a></small></div></div>`).join('') : '<div class="msg info">No approved trades yet. The first one gets your intern promoted to Analyst.</div>'}</div>`);
  }
  function renderReception() {
    const me = S.me || { name: (store.get('draft', {}).name) || '', style: (store.get('draft', {}).style) || 'balanced', rules: '' };
    const t = E.targetsFrom({ style: me.style, ...(me.targets || {}) });
    const prov = PROVIDERS();
    body(`${S.me ? '' : '<div class="msg info">Welcome to the tower. Fill in the form and your intern walks in.</div>'}
      <label class="l" for="fName">Name</label><input class="in" id="fName" maxlength="18" value="${esc(me.name)}" placeholder="Name your intern">
      <label class="l">Style</label><div class="styles">${Object.entries(E.STYLES).map(([k, s]) => `<button data-style="${k}" aria-pressed="${me.style === k}"><b>${s.label}</b><span>${s.stock}% stocks · ${s.crypto}% crypto · ${s.stable}% cash · ${s.meme}% memes</span></button>`).join('')}</div>
      <label class="l" for="fRules">Rules, in plain English</label><textarea class="in" id="fRules" maxlength="400" placeholder="e.g. Keep 40% in stocks. Never more than 10% in memecoins. Tell me when anything drops 10% in a day.">${esc(me.rules || '')}</textarea>
      <div class="sub" style="margin-top:6px">Your intern reads these when it writes and chats. Hard limits (targets, caps, rank) are enforced in code.</div>
      <label class="l">Wallet</label>
      <div class="walls">${prov.length ? prov.map(p => `<button data-connect="${p.id}">${p.name}<small>${S.wallet && S.me && S.me.walletId === p.id ? 'connected' : 'connect'}</small></button>`).join('') : '<div class="msg info">No wallet extension found in this browser. Paste an address to watch it, or install Phantom, Backpack or Solflare.</div>'}</div>
      <div class="or">or watch any address</div>
      <div class="inrow"><input class="in" id="fAddr" placeholder="Paste a Solana address" value="${S.me && S.me.address && !S.wallet ? esc(S.me.address) : ''}" autocomplete="off" spellcheck="false"><button class="btn" data-act="watch">Watch</button></div>
      ${S.me ? `<div class="sub" style="margin-top:20px">Hired ${fmt.ago(S.me.hiredAt)}. <a href="#" data-act="fire">Fire and start over</a></div>` : ''}`);
    foot(`<button class="btn red" data-act="hire" style="flex:1">${S.me ? 'Save changes' : 'Hire my intern'}</button>`);
    $$('[data-style]').forEach(b => b.onclick = () => { $$('[data-style]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  }
  function readForm() {
    const name = ($('#fName').value.trim() || 'Intern #' + Math.floor(Math.random() * 900 + 100)).slice(0, 18);
    const st = ($$('[data-style]').find(b => b.getAttribute('aria-pressed') === 'true') || {}).dataset;
    return { name, style: (st && st.style) || 'balanced', rules: $('#fRules').value.trim().slice(0, 400) };
  }

  /* ---------- chat ---------- */
  function renderTalk() {
    const msgs = S.chat.slice(-30);
    body(`<div class="chat" id="chat">${msgs.length ? '' : `<div class="bub them">Hey boss, ${esc(S.me ? S.me.name : 'your intern')} here. Ask me about your bag, my trade ideas, your rules or my next promotion.</div>`}${msgs.map(m => `<div class="bub ${m.role === 'me' ? 'me' : 'them'}">${esc(m.text)}${m.src ? `<span class="src">${m.src === 'ai' ? 'AI' : 'FROM THE NUMBERS'}</span>` : ''}</div>`).join('')}</div>
      <div class="sugs" id="sugs">${["How's my bag?", 'What would you trade?', 'Any risks?', 'When do you get promoted?'].map(s => `<button data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>`);
    foot('<form class="inrow" id="askf"><input class="in" id="ask" maxlength="400" placeholder="Message your intern…" autocomplete="off"><button class="btn red">Send</button></form>');
    $('#askf').onsubmit = e => { e.preventDefault(); ask($('#ask').value); };
    const b = $('#dBody'); b.scrollTop = b.scrollHeight;
  }
  function localAnswer(q) {
    const A = S.A; q = q.toLowerCase();
    if (!A) return 'I don\'t have a bag yet, boss. Give me a wallet in Settings and I\'ll get to work.';
    if (/promot|rank|ladder|raise/.test(q)) return S.rank.next ? `I'm ${S.rank.name} right now. ${S.rank.next.name} needs ${S.rank.next.need.trades} approved trade${S.rank.next.need.trades > 1 ? 's' : ''}${S.rank.next.need.pnl != null ? ` with results of ${S.rank.next.need.pnl}% or better` : ''}. You've approved ${(S.me.log || []).length}.` : `I'm a Partner. Top floor. Thanks for believing in me, boss.`;
    if (/trade|buy|sell|swap|propos|move/.test(q)) return A.proposals.length ? A.proposals.map(p => `Sell about ${fmt.usd(p.usd, 2)} of ${p.from.symbol} for ${p.to.symbol}: ${p.why}`).join('\n') + '\nOpen Trading to get live quotes. Nothing moves until you approve it.' : 'No trades needed right now. The bag fits your rules.';
    if (/risk|rule|danger|safe|worr/.test(q)) { const f = A.findings.filter(x => x.level !== 'info'); return f.length ? f.map(x => `${x.title}. ${x.detail}`).join('\n') : 'Nothing breaks your rules today. Rule score ' + A.score + '/100.'; }
    if (/stock|nvda|spy|aapl|tsla/.test(q)) return `Stocks are ${A.alloc.stock.pct.toFixed(0)}% of the bag vs your ${A.alloc.stock.target.toFixed(0)}% target. I use tokenized stocks on Solana, like SPYx and NVDAx, so they sit right next to your crypto.`;
    return `The bag is ${fmt.usd(A.total, 2)}: ${E.KINDS.filter(k => A.alloc[k].usd > 0).map(k => `${E.KIND_NAME[k].toLowerCase()} ${A.alloc[k].pct.toFixed(0)}%`).join(', ')}. Rule score ${A.score}/100.${A.top ? ` Biggest position is ${A.top.symbol} at ${A.topPct.toFixed(0)}%.` : ''}`;
  }
  async function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    S.chat.push({ role: 'me', text: q }); renderTalk();
    const c = $('#chat'); const ty = document.createElement('div'); ty.className = 'bub them typing'; ty.innerHTML = '<span class="spin"></span>'; c.appendChild(ty); $('#dBody').scrollTop = 1e9;
    World.say('Hmm, let me think…', 0, true);
    const j = await api('memo', { mode: 'chat', name: S.me ? S.me.name : 'Intern', style: S.me ? S.me.style : 'balanced', rank: S.rank.name, rules: S.me ? S.me.rules : '', facts: facts(), messages: S.chat.slice(-8) });
    const text = j.ok ? j.note : localAnswer(q);
    S.chat.push({ role: 'them', text, src: j.ok ? 'ai' : 'rules' }); S.chat = S.chat.slice(-40); store.set('chat', S.chat);
    World.say(text.split(/[.\n!?]/)[0].slice(0, 46) + '…', 3200);
    if (drawerRoom === 'talk') renderTalk();
  }

  /* ---------- trades ---------- */
  const quotes = {};
  async function getQuote(i) {
    const p = S.A.proposals[i]; const box = $(`#p${i} .q`); if (!box) return null;
    box.innerHTML = '<div class="quote"><span><span class="spin"></span> Asking Jupiter…</span></div>';
    const raw = BigInt(Math.floor(p.from.amount * Math.pow(10, p.from.decimals))).toString();
    const j = await api('trade', { op: 'quote', inputMint: p.from.mint, outputMint: p.to.mint, amount: raw, slippageBps: 50 });
    if (!j.ok) { box.innerHTML = `<div class="msg bad">${esc(j.msg)}</div>`; return null; }
    quotes[i] = j.quote;
    const out = Number(j.summary.outAmount) / Math.pow(10, p.to.decimals ?? 6);
    const min = Number(j.summary.otherAmountThreshold) / Math.pow(10, p.to.decimals ?? 6);
    box.innerHTML = `<div class="quote"><span>You get</span><b>${fmt.amt(out)} ${esc(p.to.symbol)}</b><span>At least</span><b>${fmt.amt(min)} ${esc(p.to.symbol)}</b><span>Price impact</span><b>${(j.summary.priceImpactPct * 100).toFixed(2)}%</b><span>Route</span><b>${esc(j.summary.route.join(' → ') || 'Jupiter')}</b></div>`;
    return { q: j.quote, out };
  }
  async function loadWeb3() {
    if (window.solanaWeb3) return window.solanaWeb3;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/vendor/web3.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.solanaWeb3;
  }
  async function approve(i, btn) {
    const p = S.A.proposals[i];
    if (!S.wallet) return toast('Connect this wallet in Settings first.');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Preparing…';
    try {
      const qq = quotes[i] ? { q: quotes[i] } : await getQuote(i);
      if (!qq) throw new Error('No quote.');
      const got = await getQuote(i) || qq; // always refresh right before signing
      const s = await api('trade', { op: 'swap', quote: got.q, user: S.me.address });
      if (!s.ok) throw new Error(s.msg);
      const W3 = await loadWeb3();
      const tx = W3.VersionedTransaction.deserialize(Uint8Array.from(atob(s.tx), c => c.charCodeAt(0)));
      btn.innerHTML = '<span class="spin"></span> Approve in your wallet…';
      World.say('Waiting for your signature, boss.', 0, true);
      let sig;
      if (S.wallet.signAndSendTransaction) { const r = await S.wallet.signAndSendTransaction(tx); sig = typeof r === 'string' ? r : (r.signature || r.txid); }
      if (!sig && S.wallet.signTransaction) { const signed = await S.wallet.signTransaction(tx); const raw = btoa(String.fromCharCode(...signed.serialize())); const r = await api('tx', { raw }); if (!r.ok) throw new Error(r.msg); sig = r.sig; }
      if (!sig) throw new Error('The wallet didn\'t return a signature.');
      btn.innerHTML = '<span class="spin"></span> Confirming…'; World.say('Sent! Waiting for Solana…', 0, true);
      let st = 'pending';
      for (let k = 0; k < 40 && st === 'pending'; k++) { await World.sleep(1500); const r = await api('tx?sig=' + encodeURIComponent(sig)); if (r.ok) st = r.status; }
      if (st !== 'confirmed') throw new Error(st === 'failed' ? 'The trade failed on-chain. Nothing was swapped.' : 'Not confirmed yet. Check the wallet in a minute.');
      const outAmount = Number(got.q.outAmount) / Math.pow(10, p.to.decimals ?? 6);
      S.me.log = S.me.log || [];
      S.me.log.push({ t: Date.now(), inMint: p.from.mint, inSym: p.from.symbol, inAmount: Number(got.q.inAmount) / Math.pow(10, p.from.decimals), inUsd: p.usd, outMint: p.to.mint, outSym: p.to.symbol, outAmount, sig });
      save(); toast('Trade confirmed.'); World.say('Done! Receipt filed.', 2600);
      $(`#p${i}`).classList.add('done'); btn.textContent = 'Done ✓';
      await loadBag(true);
    } catch (e) {
      toast(e && e.message ? e.message : 'Trade cancelled.', 4200); World.say('No worries, boss. Nothing moved.', 2400);
      btn.disabled = false; btn.textContent = 'Approve in wallet';
    }
  }

  /* ---------- memo ---------- */
  async function writeMemo() {
    if (!S.A) return;
    World.print(true); status('Writing your report…', true);
    const j = await api('memo', { name: S.me.name, style: S.me.style, rank: S.rank.name, rules: S.me.rules, facts: facts() });
    S.memo = j.ok ? { note: j.note, source: 'ai' } : { note: S.A.report, source: 'rules' };
    World.print(false); status('Report printed');
    if (drawerRoom === 'reports') renderReport();
  }

  /* ---------- room clicks ---------- */
  const WALK_SAY = { research: 'Heading to Research.', risk: 'Checking with Risk.', trading: 'To the trading desk.', reports: 'Off to Reports.', reception: 'Back to reception.', desk: 'To my desk.' };
  async function goto(room) {
    if (room === 'talk') { open('talk'); World.say('Yes, boss?', 1800); return; }
    open(room);
    if (!S.me && room !== 'reception') return;
    if (S.busy) return;
    World.say(WALK_SAY[room] || '', 1600);
    if (room === 'desk') { await World.goDesk(S.rank.index); return; }
    if (room === 'reception') { await World.goRoom('reception'); return; }
    await World.goRoom(room);
    if (room === 'reports' && S.A && !S.memo) writeMemo();
  }

  async function runDay() {
    if (!S.me) return goto('reception');
    if (!S.me.address) { open('reception'); return toast('Give your intern a wallet first.'); }
    if (S.busy) return;
    S.busy = true; const g = $('#goBtn'); g.disabled = true;
    try {
      close();
      World.say('Starting my day!', 1400); status('Walking to Research…', true);
      await World.goRoom('research'); World.say('Reading your bag…', 0, true);
      const pf = await loadBag(true); if (!pf) throw new Error('bag');
      World.say(`${pf.holdings.length} tokens · ${fmt.usd0(pf.total)}`, 2200); await World.sleep(1900);
      status('Walking to Risk…', true); await World.goRoom('risk'); World.say('Checking your rules…', 0, true); await World.sleep(1200);
      const bad = S.A.findings.filter(f => f.level === 'warn' || f.level === 'bad').length;
      World.say(bad ? `${bad} thing${bad > 1 ? 's' : ''} to fix. Score ${S.A.score}.` : `All rules OK. Score ${S.A.score}.`, 2200); await World.sleep(1900);
      status('Walking to Trading…', true); await World.goRoom('trading'); World.say('Drafting trades…', 0, true); await World.sleep(1100);
      const n = S.A.proposals.length; World.say(n ? `${n} trade${n > 1 ? 's' : ''} for your approval.` : 'No trades needed today.', 2200); await World.sleep(1900);
      status('Walking to Reports…', true); await World.goRoom('reports'); World.say('Writing your report…', 0, true);
      await writeMemo(); World.say('Report\'s ready, boss!', 2400);
      open('reports'); status('Day done · report printed');
      await World.goDesk(S.rank.index);
    } catch (e) { status('Couldn\'t finish the day. Try again.'); World.say('Something went wrong. Try again?', 2400); }
    S.busy = false; g.disabled = false;
  }

  /* ---------- events ---------- */
  $('#goBtn').onclick = runDay;
  $$('.dock button[data-room]').forEach(b => b.onclick = () => (drawerRoom === b.dataset.room ? close() : goto(b.dataset.room)));
  $('#walletBtn').onclick = () => goto('reception');
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-act],[data-connect],[data-quote],[data-approve],[data-ask]'); if (!t) return;
    if (t.dataset.go) { e.preventDefault(); return goto(t.dataset.go); }
    if (t.dataset.ask) return ask(t.dataset.ask);
    if (t.dataset.quote) return getQuote(+t.dataset.quote);
    if (t.dataset.approve) return approve(+t.dataset.approve, t);
    if (t.dataset.connect) { if (!S.me) { const f = readForm(); await hire(f, null); } return connect(t.dataset.connect).then(ok => ok && drawerRoom === 'reception' && renderReception()); }
    const a = t.dataset.act;
    if (a === 'refresh') { await loadBag(); return; }
    if (a === 'memo') { await World.goRoom('reports'); return writeMemo(); }
    if (a === 'watch') {
      const v = $('#fAddr').value.trim();
      if (!isAddr(v)) return toast('That isn\'t a Solana address.');
      if (!S.me) { await hire(readForm(), v); return; }
      S.me.address = v; S.me.mode = 'watch'; S.wallet = null; save(); card(); toast('Watching that wallet.'); await loadBag(); return renderReception();
    }
    if (a === 'hire') {
      const f = readForm();
      if (!S.me) { const v = $('#fAddr').value.trim(); return hire(f, isAddr(v) ? v : null); }
      Object.assign(S.me, f); save(); card(); analyze(); toast('Saved.'); World.say('Noted, boss.', 1800); return;
    }
    if (a === 'fire') { e.preventDefault(); if (!confirmFire()) return; store.del('me'); store.del('chat'); location.reload(); }
  });
  function confirmFire() { return window.confirm ? window.confirm('Fire your intern? Its name, rules and trade log will be cleared from this browser.') : true; }

  async function hire(f, address) {
    S.me = { ...f, address: address || null, mode: address ? 'watch' : null, hiredAt: Date.now(), log: [] };
    save(); card(); close(); refreshRank(false);
    status('Walking in…', true);
    await World.enterFromStreet(World.M.rooms.reception.spot);
    World.say(`Hi boss! I'm ${S.me.name}.`, 2600); await World.sleep(2400);
    if (address) { await loadBag(true); World.say('I\'ve got your bag. Press Run my day!', 3200); }
    else { World.say('Give me a wallet in Settings.', 3200); open('reception'); }
    status(address ? 'Ready for work' : 'Waiting for a wallet');
  }

  /* ---------- boot ---------- */
  World.init({ onPick: goto });
  market().then(m => {
    S.assets = (m && m.assets) || [];
    const chips = tickerChips(S.assets); $('#run').innerHTML = chips + chips;
    const sol = S.assets.find(a => a.symbol === 'SOL'), spy = S.assets.find(a => a.symbol === 'SPYx');
    World.setBoard(sol ? `SOL ${fmt.usd(sol.price, 2)}` : 'INTERN TOWER');
    World.setTape(S.assets.filter(a => a.price != null && a.symbol !== 'USDC').map(a => `${a.symbol} ${fmt.pct(a.change24h)}`).join('   ') || 'MARKET DATA OFFLINE');
    if (S.pf) analyze();
    setInterval(async () => { const m2 = await market(true); if (m2 && m2.ok) { S.assets = m2.assets; const c2 = tickerChips(S.assets); $('#run').innerHTML = c2 + c2; } }, 60000);
  });
  card(); refreshRank(false);
  if (S.me) {
    const d = World.deskOf(S.rank.index); World.place(d.floor, d.x); World.me.setPose('back');
    status('At the desk'); setTimeout(() => World.say(`Welcome back, boss.`, 2200), 500);
    reconnect().then(() => loadBag(true));
  } else {
    World.place('lobby', -20);
    setTimeout(() => open('reception'), 400);
  }
})();
