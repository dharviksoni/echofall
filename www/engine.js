// Echofall rules engine and machine opponent. No DOM access here.
(function () {
  const VAL = {p:100, n:300, b:320, r:500, q:900, k:20000};
  const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]], ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
  const WIN = 1e6;
  const QUIET_LIMIT = 80; // plies without a capture before a draw (40 moves each)

  function initial() {
    const b = Array(64).fill(null), back = 'rnbqkbnr';
    let id = 0;
    for (let c = 0; c < 8; c++) {
      b[c] = {t:back[c], c:'b', id:id++}; b[8+c] = {t:'p', c:'b', id:id++};
      b[48+c] = {t:'p', c:'w', id:id++}; b[56+c] = {t:back[c], c:'w', id:id++};
    }
    return {board:b, cracks:Array(64).fill(0), echo:-1, echoPiece:null, turn:'w', clock:0, ply:0, last:null, winner:null, reason:null};
  }
  const other = s => s === 'w' ? 'b' : 'w';
  const blocked = (st, s) => st.cracks[s] >= 3 || s === st.echo;

  function gen(st) {
    const side = st.turn, B = st.board, out = [];
    const add = (from, to, pt, cap, promo) => out.push({from, to, pt, cap, promo});
    for (let s = 0; s < 64; s++) {
      const p = B[s]; if (!p || p.c !== side) continue;
      const r = s >> 3, c = s & 7;
      if (p.t === 'p') {
        const d = side === 'w' ? -1 : 1, r1 = r + d;
        if (r1 < 0 || r1 > 7) continue;
        const promo = r1 === 0 || r1 === 7, t = r1 * 8 + c;
        if (!B[t] && !blocked(st, t)) {
          add(s, t, 'p', null, promo);
          if (r === (side === 'w' ? 6 : 1)) {
            const t2 = (r + 2 * d) * 8 + c;
            if (!B[t2] && !blocked(st, t2)) add(s, t2, 'p', null, false);
          }
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc; if (cc < 0 || cc > 7) continue;
          const tt = r1 * 8 + cc, q = B[tt];
          if (q && q.c !== side) add(s, tt, 'p', q.t, promo);
        }
      } else if (p.t === 'n' || p.t === 'k') {
        for (const [dr, dc] of (p.t === 'n' ? KN : KG)) {
          const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const t = rr * 8 + cc, q = B[t];
          if ((q && q.c === side) || blocked(st, t)) continue;
          add(s, t, p.t, q ? q.t : null, false);
        }
      } else {
        const dirs = p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const t = rr * 8 + cc;
            if (blocked(st, t)) break;
            const q = B[t];
            if (q) { if (q.c !== side) add(s, t, p.t, q.t, false); break; }
            add(s, t, p.t, null, false);
            rr += dr; cc += dc;
          }
        }
      }
    }
    return out;
  }

  function apply(st, m) {
    const B = st.board.slice(), K = st.cracks.slice();
    const p = B[m.from], cap = B[m.to];
    B[m.to] = m.promo ? {t:'q', c:p.c, id:p.id} : p;
    B[m.from] = null;
    K[m.from] = Math.min(3, K[m.from] + 1);
    const fell = K[m.from] === 3;
    const ns = {board:B, cracks:K, echo: fell ? -1 : m.from, echoPiece: fell ? null : {t:p.t, c:p.c},
      turn: other(st.turn), clock: cap ? 0 : st.clock + 1, ply: st.ply + 1,
      last:{from:m.from, to:m.to, fell, cap: cap ? {t:cap.t, c:cap.c, id:cap.id} : null, promo: !!m.promo},
      winner:null, reason:null};
    if (cap && cap.t === 'k') { ns.winner = st.turn; ns.reason = 'king'; }
    else if (ns.clock >= QUIET_LIMIT) { ns.winner = 'draw'; ns.reason = 'clock'; }
    return ns;
  }

  // Called after a real move: settles the stranded rule, which the search handles on its own.
  function settle(st) {
    if (!st.winner && gen(st).length === 0) { st.winner = other(st.turn); st.reason = 'stranded'; }
    return st;
  }

  function kingAttacked(st, side) {
    return gen({...st, turn:other(side), echo:-1}).some(m => m.cap === 'k');
  }

  // ---------- machine opponent ----------
  function evaluate(st) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = st.board[i]; if (!p) continue;
      const r = i >> 3, c = i & 7;
      const cent = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));
      let v = VAL[p.t];
      if (p.t === 'n' || p.t === 'b') v += cent * 8;
      else if (p.t === 'q') v += cent * 3;
      else if (p.t === 'p') v += (p.c === 'w' ? 6 - r : r - 1) * 9 + cent * 3;
      else if (p.t === 'k') {
        let room = 0;
        for (const [dr, dc] of KG) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && st.cracks[rr * 8 + cc] < 3) room++;
        }
        v += room * 7 - cent * 3;
      }
      if (p.t !== 'k' && st.cracks[i] === 2) v -= 6;
      s += p.c === st.turn ? v : -v;
    }
    return s;
  }
  const moveScore = m => (m.cap ? VAL[m.cap] * 10 - VAL[m.pt] / 10 : 0) + (m.promo ? 8000 : 0);
  const order = ms => ms.sort((a, b) => moveScore(b) - moveScore(a));

  function quiesce(st, alpha, beta, d) {
    if (st.winner) return st.winner === 'draw' ? 0 : -WIN;
    const stand = evaluate(st);
    if (d === 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const ms = order(gen(st).filter(m => m.cap || m.promo));
    for (const m of ms) {
      const v = -quiesce(apply(st, m), -beta, -alpha, d - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function negamax(st, depth, alpha, beta) {
    if (st.winner) return st.winner === 'draw' ? 0 : -(WIN + depth);
    if (depth === 0) return quiesce(st, alpha, beta, 4);
    const ms = gen(st);
    if (!ms.length) return -(WIN + depth);
    order(ms);
    let best = -Infinity;
    for (const m of ms) {
      const v = -negamax(apply(st, m), depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  // slack widens the pool of near-best moves so weaker levels make human-looking slips.
  function pickMove(st, depth, slack = 10) {
    const ms = order(gen(st));
    let best = -Infinity; const res = [];
    for (const m of ms) {
      const floor = best === -Infinity ? -Infinity : best - slack - 5;
      const v = -negamax(apply(st, m), depth - 1, -Infinity, -floor);
      res.push([v, m]);
      if (v > best) best = v;
    }
    const pool = res.filter(([v]) => v >= best - slack);
    return pool[Math.floor(Math.random() * pool.length)][1];
  }

  window.Echo = {initial, gen, apply, settle, kingAttacked, pickMove, other, VAL, QUIET_LIMIT};
})();
