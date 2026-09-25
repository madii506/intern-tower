// POST /api/memo — your intern writes its report. Uses Vercel AI Gateway when available, otherwise the numbers-only report.
const L = require('./_lib');
const MODELS = ['anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'];
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, n); }
module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') throw new L.Fail('method', 'POST only.', 405);
  L.limit('memo:' + L.ip(req), 20, 60000);
  const b = await L.body(req);
  const name = clean(b.name || 'Intern', 24), style = clean(b.style || 'balanced', 12), rules = clean(b.rules || '', 400), rank = clean(b.rank || 'Intern', 16);
  const facts = clean(JSON.stringify(b.facts || {}), 2500);
  const token = req.headers['x-vercel-oidc-token'] || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const m = globalThis.__INTERN_MOCK;
  if (!token && !(m && m.fetch)) return L.send(res, 200, { ok: false, reason: 'no_ai', msg: 'AI isn\'t switched on for this site yet.' });
  const chat = b.mode === 'chat';
  const history = chat ? (Array.isArray(b.messages) ? b.messages : []).slice(-8).map(x => ({ role: x.role === 'me' ? 'user' : 'assistant', content: clean(x.text, 600) })).filter(x => x.content) : null;
  const system = chat
    ? `You are ${name}, an AI ${rank.toLowerCase()} who manages your boss's Solana portfolio (crypto and tokenized stocks) in a ${style} style. You work in a tower with four rooms: Research, Risk, Trading and Reports, and you get promoted (Intern, Analyst, Associate, VP, Partner) by approved trades and results. Chat like a sharp, friendly junior employee: short answers (2-4 sentences), plain English, a little personality. Use ONLY the facts given about the portfolio; if something isn't in the facts, say you don't know. Never promise returns, never say anything is guaranteed, never give personal financial advice as certainty. You can suggest the boss press "Run my day" or open Trading to see proposals. Boss's rules: ${rules || '(none written)'}. Facts (JSON): ${facts}`
    : `You are ${name}, an AI ${rank.toLowerCase()} on a portfolio desk. You manage a Solana portfolio of crypto and tokenized stocks for your boss, in a ${style} style. Write your boss a short daily report: 3 to 5 sentences, plain English, confident but humble, a little personality. Use ONLY the facts given; never invent numbers, prices or news. Never promise returns and never say "guaranteed". If you propose trades, say they need the boss's approval. End with one short line that starts with "Next:".`;
  const user = `Boss's rules: ${rules || '(none written)'}\nFacts (JSON): ${facts}`;
  for (const model of MODELS) {
    try {
      const messages = chat ? [{ role: 'system', content: system }, ...(history.length ? history : [{ role: 'user', content: 'Hi' }])] : [{ role: 'system', content: system }, { role: 'user', content: user }];
      const j = await L.getJson('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ model, max_tokens: chat ? 220 : 260, temperature: 0.6, messages }) }, 20000);
      const note = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (note) return L.send(res, 200, { ok: true, note: String(note).trim().slice(0, 1200), model, source: 'ai' });
    } catch (e) { console.error('[memo]', model, e.status || '', e.message); }
  }
  L.send(res, 200, { ok: false, reason: 'ai_down', msg: 'The AI desk is offline right now.' });
});
