// The tower: a side-view pixel world. Draws overlays, agents, the elevator, and moves your intern around.
(function () {
  const M = window.WORLD_MAP;
  const FL = M.floors;
  const ORDER = ['lobby', 'work', 'analyst', 'associate', 'vp', 'partner'];
  const RANK_FLOORS = ['analyst', 'associate', 'vp', 'partner'];
  const LABEL = { partner: 'PARTNER', vp: 'VP', associate: 'ASSOCIATE', analyst: 'ANALYST', work: 'WORK FLOOR', lobby: 'LOBBY' };
  const SPR = { front: '/assets/img/w-front.png', walk: '/assets/img/w-walk.png', back: '/assets/img/w-back.png' };
  const SPEED = 46; // native px per second
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let world, stage, wrap, scale = 1, car, carFloor = 'lobby', paper, me, onPick = () => {}, busyMove = Promise.resolve();

  function el(tag, cls, css, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); if (html != null) e.innerHTML = html; world.appendChild(e); return e; }

  function makeAgent(opts) {
    const a = { x: opts.x, floor: opts.floor, pose: opts.pose || 'front', npc: !!opts.npc };
    a.el = el('div', 'agent' + (a.npc ? ' npc' : ' me'), { left: a.x + 'px', top: (FL[a.floor].feet - 25) + 'px', height: '26px' });
    a.img = document.createElement('img'); a.img.alt = ''; a.el.appendChild(a.img);
    const sh = document.createElement('i'); sh.className = 'shadow'; a.el.appendChild(sh);
    a.setPose = p => { a.pose = p; a.img.src = SPR[p]; };
    a.setPose(a.pose);
    a.place = (floor, x) => { a.floor = floor; a.x = x; a.el.style.transitionDuration = '0s'; a.el.style.left = x + 'px'; a.el.style.top = (FL[floor].feet - 25) + 'px'; };
    a.walk = x => new Promise(res => {
      const dist = Math.abs(x - a.x);
      if (dist < 0.5) { res(); return; }
      const dir = x > a.x ? 1 : -1;
      a.setPose('walk'); a.el.classList.toggle('flip', dir < 0); a.el.classList.add('walking');
      const dur = dist / SPEED;
      a.el.style.transitionDuration = dur + 's';
      requestAnimationFrame(() => { a.el.style.left = x + 'px'; });
      a.x = x;
      setTimeout(() => { a.el.classList.remove('walking'); res(); }, dur * 1000 + 30);
      if (!a.npc) follow(x, dur);
    });
    return a;
  }

  // mobile: keep the intern in view when the world scrolls sideways
  function follow(x, dur) {
    if (!wrap.classList.contains('scroll')) return;
    const target = Math.max(0, x * scale - wrap.clientWidth / 2);
    wrap.scrollTo({ left: target, behavior: 'smooth' });
  }

  function moveCar(floor, ms) {
    const from = ORDER.indexOf(carFloor), to = ORDER.indexOf(floor);
    const d = Math.abs(from - to);
    car.style.transitionDuration = (ms != null ? ms : 0.5 + d * 0.45) + 's';
    car.style.top = (FL[floor].feet - 22) + 'px';
    carFloor = floor;
    return sleep((ms != null ? ms : 0.5 + d * 0.45) * 1000 + 60);
  }

  async function goFloor(a, floor) {
    if (a.floor === floor) return;
    await a.walk(M.elevator.door);
    if (carFloor !== a.floor) await moveCar(a.floor);
    a.el.style.opacity = '0';
    await sleep(160);
    await moveCar(floor);
    a.place(floor, M.elevator.door);
    a.el.style.opacity = '1';
    await sleep(120);
  }

  // public: walk anywhere (queued so two clicks don't fight)
  function walkTo(floor, x) {
    busyMove = busyMove.then(async () => { await goFloor(me, floor); await me.walk(x); me.setPose('front'); }).catch(() => {});
    return busyMove;
  }

  let bubbleEl = null, bubbleT = 0;
  function say(text, ms = 2600, think = false) {
    if (bubbleEl) bubbleEl.remove();
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble' + (think ? ' think' : '');
    bubbleEl.style.left = '50%'; bubbleEl.style.top = '-3px';
    bubbleEl.textContent = text;
    me.el.appendChild(bubbleEl);
    clearTimeout(bubbleT);
    if (ms) bubbleT = setTimeout(() => { if (bubbleEl) { bubbleEl.remove(); bubbleEl = null; } }, ms);
  }

  function signs() {
    el('div', 'neon', null, 'INTERN');
    const R = M.rooms;
    for (const id of ['research', 'risk', 'trading', 'reports']) el('div', 'sign', { left: (R[id].x0 + 3) + 'px', top: (FL.work.top + 1) + 'px' }, id.toUpperCase());
    el('div', 'sign red', { left: '114px', top: (FL.lobby.top + 2) + 'px' }, 'RECEPTION · HIRE');
    for (const f of ORDER) {
      const p = el('div', 'plaque', { top: (FL[f].top + 1) + 'px' }, `<i></i>${LABEL[f]}`);
      p.dataset.floor = f;
    }
    // lock veils for rank floors
    for (const f of RANK_FLOORS) el('div', 'lockveil', { top: FL[f].top + 'px', height: (FL[f].feet - FL[f].top + 1) + 'px' }).dataset.floor = f;
    const b = M.board;
    el('div', 'board', { left: (b[0] + 1) + 'px', top: (b[1] + 1) + 'px', width: (b[2] - b[0] - 1) + 'px', height: (b[3] - b[1] - 1) + 'px' }, '<span id="boardtxt">INTERN TOWER</span>');
    el('div', 'tape', null, '<span id="tapetxt">MARKET OPENING…</span>');
  }

  function hotspots() {
    const R = M.rooms;
    const add = (id, x0, y0, x1, y1, tip) => { const h = el('button', 'hot', { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' }, `<span class="tip">${tip}</span>`); h.setAttribute('aria-label', tip); h.onclick = () => onPick(id); return h; };
    add('research', R.research.x0, FL.work.top, R.research.x1, FL.work.feet, 'Research · your bag');
    add('risk', R.risk.x0, FL.work.top, R.risk.x1, FL.work.feet, 'Risk · your rules');
    add('trading', R.trading.x0, FL.work.top, R.trading.x1, FL.work.feet, 'Trading · proposals');
    add('reports', R.reports.x0, FL.work.top, R.reports.x1, FL.work.feet, 'Reports · daily note');
    add('reception', 96, FL.lobby.top, 176, FL.lobby.feet, 'Reception · hire & settings');
    for (const f of RANK_FLOORS) add('desk', 38, FL[f].top, 330, FL[f].feet, LABEL[f].charAt(0) + LABEL[f].slice(1).toLowerCase() + ' floor · the ladder');
    add('desk', M.elevator.x0, 20, M.elevator.x1, FL.lobby.feet, 'Elevator · the ladder');
  }

  function npcs() {
    // other interns at their desks on every rank floor, backs to us
    const seats = { partner: [0, 2], vp: [0, 2, 3], associate: [0, 2, 3], analyst: [0, 2, 3] };
    for (const f of RANK_FLOORS) for (const i of seats[f]) { const a = makeAgent({ floor: f, x: FL[f].desks[i], pose: 'back', npc: true }); a.el.style.zIndex = 2; }
    // two interns doing laps on the work floor
    const lap = async (a, xs) => { await sleep(Math.random() * 3000); for (;;) { for (const x of xs) { await a.walk(x); a.setPose('back'); await sleep(1800 + Math.random() * 2600); } } };
    const n1 = makeAgent({ floor: 'work', x: 180, npc: true }); lap(n1, [80, 212, 150]);
    const n2 = makeAgent({ floor: 'lobby', x: 250, npc: true }); lap(n2, [262, 300, 240]);
  }

  function setRank(index) {
    // index 0 = intern (desk on the work floor), 1 = analyst floor … 4 = partner floor
    world.querySelectorAll('.lockveil').forEach(v => { const fi = RANK_FLOORS.indexOf(v.dataset.floor) + 1; v.classList.toggle('open', fi <= index); });
    world.querySelectorAll('.plaque').forEach(p => {
      const f = p.dataset.floor, fi = RANK_FLOORS.indexOf(f) + 1;
      p.classList.toggle('on', fi === 0 || fi <= index);
      p.classList.toggle('here', (index === 0 && f === 'work') || (fi > 0 && fi === index));
      p.innerHTML = `<i></i>${LABEL[f]}${fi > index ? ' · LOCKED' : ''}`;
    });
  }
  function deskOf(index) { return index === 0 ? { floor: 'work', x: 96 } : { floor: RANK_FLOORS[index - 1], x: FL[RANK_FLOORS[index - 1]].myDesk }; }

  async function enterFromStreet(toX) {
    me.floor = 'lobby'; me.x = -12; me.el.style.transitionDuration = '0s'; me.el.style.left = '-12px'; me.el.style.top = (M.street - 25) + 'px';
    await sleep(60); await me.walk(M.door);
    me.el.style.opacity = '0'; await sleep(200);
    me.place('lobby', M.door); me.el.style.opacity = '1';
    await me.walk(toX); me.setPose('front');
  }

  function print(on) { paper.style.height = on ? '9px' : '0px'; }
  function confetti() {
    const cols = ['#ff2b31', '#fff', '#3ddc84', '#ffb547'];
    for (let i = 0; i < 40; i++) {
      const c = el('i', 'confetti', { left: me.x + 'px', top: (FL[me.floor].feet - 26) + 'px', background: cols[i % 4] });
      c.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px'); c.style.setProperty('--dy', (Math.random() * 30 + 6) + 'px');
      c.style.animationDelay = (Math.random() * .3) + 's';
      setTimeout(() => c.remove(), 2000);
    }
  }

  function fit() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    let s = Math.min(W / 400, H / 225), scroll = false;
    if (W < 760 && s * 400 < 900) { s = Math.max(s, Math.min(H / 225, 2.6)); scroll = s * 400 > W; }
    scale = s;
    stage.style.width = (400 * s) + 'px'; stage.style.height = (225 * s) + 'px';
    world.style.transform = `scale(${s})`;
    wrap.classList.toggle('scroll', scroll);
    if (scroll && me) wrap.scrollLeft = Math.max(0, me.x * s - W / 2);
  }

  window.World = {
    init(opts) {
      wrap = document.querySelector('.stage-wrap'); stage = document.querySelector('.stage'); world = document.querySelector('.world');
      onPick = opts.onPick || onPick;
      const bg = document.createElement('img'); bg.className = 'bgimg'; bg.src = '/assets/img/world.png'; bg.alt = 'The INTERN tower'; world.appendChild(bg);
      signs(); hotspots();
      car = el('div', 'car', { top: (FL.lobby.feet - 22) + 'px' });
      paper = el('div', 'paper');
      npcs();
      me = makeAgent({ floor: 'lobby', x: -20 });
      fit(); addEventListener('resize', fit);
      return this;
    },
    get me() { return me; }, FL, M, ORDER, RANK_FLOORS, LABEL,
    walkTo, say, setRank, deskOf, enterFromStreet, print, confetti, sleep, fit,
    goRoom(id) { const r = M.rooms[id]; return walkTo(r.floor, r.spot); },
    goDesk(index) { const d = deskOf(index); return walkTo(d.floor, d.x).then(() => me.setPose('back')); },
    place(floor, x) { me.place(floor, x); if (car) { car.style.transitionDuration = '0s'; car.style.top = (FL[floor].feet - 22) + 'px'; carFloor = floor; } },
    setBoard(t) { const e = document.getElementById('boardtxt'); if (e) e.textContent = t; },
    setTape(t) { const e = document.getElementById('tapetxt'); if (e) e.textContent = t; },
  };
})();
