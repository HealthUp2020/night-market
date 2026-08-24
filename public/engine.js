// ---- NIGHT MARKET — pure rules engine (Jaipur-based, 4-player) ----
// No DOM, no rendering. Every function takes `state` explicitly so it is fully
// unit-testable under `bun test`. The renderer (game.js) imports from here.

export const GOODS = ["diamond", "gold", "silver", "cloth", "spice", "leather"];
export const GOODS_EN = {
  diamond: "AI Cores", gold: "Illegal Implants", silver: "Stolen Corporate Data",
  cloth: "Pharma Contraband", spice: "Cracked Software", leather: "Street Weaponry", camel: "Courier Drones",
};
export const RARE = new Set(["diamond", "gold", "silver"]);

export const DECK_COUNTS = { diamond: 10, gold: 10, silver: 10, cloth: 14, spice: 14, leather: 16, camel: 18 };
export const TOKEN_TEMPLATE = {
  diamond: [7, 7, 7, 5, 5, 5, 5],
  gold: [6, 6, 6, 5, 5, 5, 5],
  silver: [5, 5, 5, 5, 5, 5, 5],
  cloth: [5, 5, 3, 3, 3, 2, 2, 2, 1, 1],
  spice: [5, 5, 3, 3, 3, 2, 2, 2, 1, 1],
  leather: [4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1],
};
export const BONUS_TEMPLATE = { 3: [1, 1, 1, 2, 2, 2, 3, 3], 4: [4, 4, 4, 5, 5, 6, 6, 6], 5: [8, 8, 9, 9, 10, 10, 10] };
export const HAND_LIMIT = 7;
export const MARKET_SIZE = 7;
export const CAMEL_BONUS = 5;
export const PLAYER_COUNT = 4;
export const PLAYER_NAMES = ["OPERATOR", "VULT-3R", "NØMAD", "SPECTRE-9"];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function buildDeck() {
  let cards = [];
  for (const good of Object.keys(DECK_COUNTS)) for (let i = 0; i < DECK_COUNTS[good]; i++) cards.push(good);
  return shuffle(cards);
}
export const MATCH_ROUNDS = 3;   // best-of-3
export const SEALS_TO_WIN = 2;   // first operator to 2 round-wins takes the match

// (Re)deal one round in place: fresh deck / tokens / bonus, hands + market, scores reset to 0,
// starting seat = `startSeat`. Shared by newGame (round 1) and nextRound.
function setupRound(state, startSeat) {
  state.deck = buildDeck();
  state.market = [];
  for (const p of state.players) { p.hand = []; p.camels = 0; p.score = 0; p.lastAction = null; }
  state.tokens = JSON.parse(JSON.stringify(TOKEN_TEMPLATE));
  state.bonus = { 3: shuffle(BONUS_TEMPLATE[3]), 4: shuffle(BONUS_TEMPLATE[4]), 5: shuffle(BONUS_TEMPLATE[5]) };
  state.turnIndex = startSeat;
  state.round = 1;        // turn-cycle counter within the round
  state.gameOver = false; // per-round end flag
  delete state.lastSale;
  for (const p of state.players) dealGoodsHand(state, p.id);
  for (let i = 0; i < MARKET_SIZE; i++) state.market.push(state.deck.pop());
}

export function newGame() {
  const state = {
    deck: [], market: [],
    players: PLAYER_NAMES.map((name, i) => ({ id: i, name, isHuman: i === 0, hand: [], camels: 0, score: 0, lastAction: null })),
    tokens: {}, bonus: {},
    turnIndex: 0, round: 1, gameOver: false, log: [],
    // Best-of-3 match wrapper. `seals[i]` = rounds won by seat i; `cumScore` = tiebreak.
    match: {
      roundNo: 1, maxRounds: MATCH_ROUNDS,
      seals: Array(PLAYER_COUNT).fill(0),
      cumScore: Array(PLAYER_COUNT).fill(0),
      matchOver: false, matchWinner: null, matchWinners: [], lastRound: null,
    },
  };
  setupRound(state, 0);
  addLog(state, `match begins — round 1 of ${MATCH_ROUNDS}. Each operator holds 5 cards, market shows ${MARKET_SIZE}.`);
  return state;
}

// Start the next round of the match (in place). Only valid once the current round has ended
// and the match is not over. Rotates the starting seat to spread the first-mover advantage.
export function nextRound(state) {
  const m = state.match;
  if (!m || m.matchOver || !state.gameOver) return { ok: false, error: "No next round available." };
  const startSeat = m.roundNo % PLAYER_COUNT; // round 1 ended → seat 1 starts round 2, etc.
  setupRound(state, startSeat);
  m.roundNo += 1;
  addLog(state, `round ${m.roundNo} of ${m.maxRounds} begins — ${state.players[startSeat].name} starts.`);
  return { ok: true };
}

function topScorers(state) {
  const scores = state.players.map((p) => p.score);
  const max = Math.max(...scores);
  return scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
}
// Live match standings (ROC-236): rank every operator by seals, then current-round CR.
// Returns [{ id, rank, isLeader }] in seat order. `rank` shares on ties (1 + strictly-ahead
// count). `isLeader` marks rank-1 seats, but is suppressed while everyone is tied for first
// (e.g. the start of the match) so no false leader is shown before anyone pulls ahead.
export function standings(state) {
  const m = state.match;
  const rows = state.players.map((p, i) => ({ id: i, seals: m ? m.seals[i] : 0, score: p.score }));
  const ahead = (o, r) => o.seals > r.seals || (o.seals === r.seals && o.score > r.score);
  const ranks = rows.map((r) => ({ id: r.id, rank: 1 + rows.filter((o) => ahead(o, r)).length }));
  const firsts = ranks.filter((x) => x.rank === 1).length;
  return ranks.map((x) => ({ id: x.id, rank: x.rank, isLeader: x.rank === 1 && firsts < rows.length }));
}
export function dealGoodsHand(state, playerIdx) {
  const p = state.players[playerIdx];
  while (p.hand.length < 5 && state.deck.length > 0) { const card = state.deck.pop(); if (card === "camel") p.camels++; else p.hand.push(card); }
}
export function addLog(state, text) { state.log.push(text); }
export function goodsInHand(hand) { const c = {}; for (const g of hand) c[g] = (c[g] || 0) + 1; return c; }
export function refillMarket(state, count) { for (let i = 0; i < count && state.deck.length > 0; i++) state.market.push(state.deck.pop()); }
export const PILES_TO_END = 3; // a round ends once this many goods piles are empty (or the deck runs out)
export function emptyPileCount(state) { return GOODS.filter((g) => state.tokens[g].length === 0).length; }
export function checkGameEnd(state) {
  if (emptyPileCount(state) >= PILES_TO_END || state.deck.length === 0) finishGame(state);
}
export function finishGame(state) {
  state.gameOver = true; // ends the current ROUND
  addLog(state, `round over — ${state.deck.length === 0 ? "deck exhausted" : "3 token piles empty"}.`);
  const maxC = Math.max(...state.players.map((p) => p.camels));
  const leaders = state.players.filter((p) => p.camels === maxC);
  if (maxC > 0 && leaders.length === 1) { leaders[0].score += CAMEL_BONUS; addLog(state, `${leaders[0].name} holds the largest fleet (${maxC}) -> +${CAMEL_BONUS} cr (fixer reputation).`); }
  else addLog(state, `fleet tie — no fixer reputation bonus.`);
  const maxS = Math.max(...state.players.map((p) => p.score));
  const roundWinners = state.players.filter((p) => p.score === maxS);
  addLog(state, `final — ${state.players.map((p) => `${p.name}:${p.score}cr`).join("  ")}.`);
  addLog(state, roundWinners.length > 1 ? `round tie: ${roundWinners.map((p) => p.name).join(", ")}.` : `round winner: ${roundWinners[0].name}.`);

  // Best-of-3 bookkeeping (guarded so single-round callers / tests without a match still work).
  const m = state.match;
  if (!m) return;
  state.players.forEach((p, i) => { m.cumScore[i] += p.score; });
  const winnerSeats = topScorers(state);
  winnerSeats.forEach((i) => { m.seals[i]++; }); // a shared top-score shares the seal
  m.lastRound = { roundNo: m.roundNo, scores: state.players.map((p) => p.score), winners: winnerSeats };

  const topSeal = Math.max(...m.seals);
  if (topSeal >= SEALS_TO_WIN || m.roundNo >= m.maxRounds) {
    m.matchOver = true;
    let contenders = m.seals.map((s, i) => (s === topSeal ? i : -1)).filter((i) => i >= 0);
    if (contenders.length > 1) { // tiebreak on cumulative CR across the match
      const maxCum = Math.max(...contenders.map((i) => m.cumScore[i]));
      contenders = contenders.filter((i) => m.cumScore[i] === maxCum);
    }
    m.matchWinners = contenders;
    m.matchWinner = contenders.length === 1 ? contenders[0] : null;
    addLog(state, m.matchWinner != null
      ? `match over — winner: ${state.players[m.matchWinner].name} (${m.seals[m.matchWinner]} seals).`
      : `match over — draw: ${contenders.map((i) => state.players[i].name).join(", ")}.`);
  } else {
    addLog(state, `round ${m.roundNo} of ${m.maxRounds} done — seals: ${m.seals.join("/")}. ${m.maxRounds - m.roundNo} to go.`);
  }
}

export function takeCard(state, playerIdx, marketIdx) {
  const card = state.market[marketIdx];
  if (card === "camel") return { ok: false, error: "Drones are taken with a separate action." };
  const p = state.players[playerIdx];
  if (p.hand.length >= HAND_LIMIT) return { ok: false, error: `Hand is full (max ${HAND_LIMIT}).` };
  state.market.splice(marketIdx, 1); p.hand.push(card); refillMarket(state, 1);
  p.lastAction = { kind: "take", good: card };
  addLog(state, `${p.name} took 1× ${GOODS_EN[card]} from market.`);
  endTurn(state, playerIdx); return { ok: true };
}
export function takeCamels(state, playerIdx) {
  const idxs = state.market.map((c, i) => (c === "camel" ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return { ok: false, error: "No drones on the market." };
  const n = idxs.length, p = state.players[playerIdx];
  state.market = state.market.filter((c) => c !== "camel"); p.camels += n; refillMarket(state, n);
  p.lastAction = { kind: "drones", count: n };
  addLog(state, `${p.name} swept ${n} drone${n > 1 ? "s" : ""} into the fleet.`);
  endTurn(state, playerIdx); return { ok: true };
}
export function sellCards(state, playerIdx, good, count) {
  const p = state.players[playerIdx];
  const owned = p.hand.filter((c) => c === good).length;
  if (count < 1 || count > owned) return { ok: false, error: "You don't have that many of this good." };
  if (RARE.has(good) && count < 2) return { ok: false, error: `${GOODS_EN[good]} is rare — sell at least 2 at once.` };
  if (state.tokens[good].length === 0) return { ok: false, error: `The ${GOODS_EN[good]} pile is empty.` };
  let removed = 0;
  for (let i = p.hand.length - 1; i >= 0 && removed < count; i--) if (p.hand[i] === good) { p.hand.splice(i, 1); removed++; }
  const taken = state.tokens[good].splice(0, count);
  state.lastSale = { playerIdx, good, values: taken.slice() }; // for the price-wall spend animation
  const sum = taken.reduce((a, b) => a + b, 0); p.score += sum;
  let bonus = "", bonusVal = 0;
  if (count >= 3) { const key = count >= 5 ? 5 : count; const bp = state.bonus[key]; if (bp.length) { const b = bp.shift(); p.score += b; bonusVal = b; bonus = ` +${b}cr bonus`; } }
  p.lastAction = { kind: "sell", good, count, gain: sum + bonusVal };
  addLog(state, `${p.name} sold ${count}× ${GOODS_EN[good]} +${sum}cr${bonus}.`);
  endTurn(state, playerIdx); return { ok: true };
}
export function exchangeCards(state, playerIdx, giveSpec, marketIdxs) {
  const p = state.players[playerIdx];
  const totalGive = giveSpec.handIdxs.length + giveSpec.camels;
  if (totalGive < 2) return { ok: false, error: "An exchange needs at least 2 cards/drones." };
  if (totalGive !== marketIdxs.length) return { ok: false, error: "Give and take counts must be equal." };
  if (marketIdxs.some((i) => state.market[i] === "camel")) return { ok: false, error: "Can't take a drone via exchange." };
  if (giveSpec.camels > p.camels) return { ok: false, error: "You don't have that many drones to give." };
  const after = p.hand.length - giveSpec.handIdxs.length + marketIdxs.length;
  if (after > HAND_LIMIT) return { ok: false, error: `That leaves ${after} cards (max ${HAND_LIMIT}).` };
  const taken = marketIdxs.map((i) => state.market[i]);
  [...marketIdxs].sort((a, b) => b - a).forEach((i) => state.market.splice(i, 1));
  const given = [];
  [...giveSpec.handIdxs].sort((a, b) => b - a).forEach((i) => { given.push(p.hand[i]); p.hand.splice(i, 1); });
  p.camels -= giveSpec.camels;
  for (let i = 0; i < giveSpec.camels; i++) given.push("camel");
  state.market.push(...given); p.hand.push(...taken);
  p.lastAction = { kind: "exchange", count: taken.length };
  addLog(state, `${p.name} exchanged ${given.length} for ${taken.map((c) => GOODS_EN[c]).join(", ")}.`);
  endTurn(state, playerIdx); return { ok: true };
}
export function endTurn(state, playerIdx) {
  checkGameEnd(state);
  if (!state.gameOver) { state.turnIndex = (playerIdx + 1) % PLAYER_COUNT; if (state.turnIndex === 0) state.round++; }
}

// ---- Bot AI (heuristic) ----
export function botPlay(state, playerIdx) {
  if (state.gameOver || state.turnIndex !== playerIdx) return;
  const p = state.players[playerIdx], hand = p.hand, counts = goodsInHand(hand);
  let bonusSell = null, bigCommonSell = null, anySell = null;
  for (const good of GOODS) {
    const owned = counts[good] || 0, minCount = RARE.has(good) ? 2 : 1;
    if (owned < minCount) continue;
    const pile = state.tokens[good]; if (pile.length === 0) continue;
    const sc = Math.min(owned, pile.length), value = pile.slice(0, sc).reduce((a, b) => a + b, 0);
    const cand = { good, count: sc, value };
    if (!anySell || value > anySell.value) anySell = cand;
    if (sc >= 3 && (!bonusSell || value > bonusSell.value)) bonusSell = cand;
    if (!RARE.has(good) && sc >= 2 && value >= 8 && (!bigCommonSell || value > bigCommonSell.value)) bigCommonSell = cand;
  }
  const pressure = hand.length >= HAND_LIMIT - 1;
  const sell = bonusSell || bigCommonSell || (pressure ? anySell : null);
  if (sell) { sellCards(state, playerIdx, sell.good, sell.count); return; }
  const camels = state.market.filter((c) => c === "camel").length;
  if (camels >= 2) { takeCamels(state, playerIdx); return; }
  if (hand.length < HAND_LIMIT) {
    const nonCamel = state.market.map((c, i) => ({ c, i })).filter((x) => x.c !== "camel");
    if (nonCamel.length) {
      const score = (c) => { let s = RARE.has(c) ? 4 : 1; if (counts[c]) s += 2; const pile = state.tokens[c]; if (pile && pile.length) s += pile[0] / 10; return s; };
      nonCamel.sort((a, b) => score(b.c) - score(a.c)); takeCard(state, playerIdx, nonCamel[0].i); return;
    }
  }
  if (camels > 0) { takeCamels(state, playerIdx); return; }
  const mkt = state.market.map((c, i) => (c !== "camel" ? i : -1)).filter((i) => i >= 0);
  const give = Math.min(2, hand.length, mkt.length);
  if (give >= 2) {
    const idxs = hand.map((c, i) => ({ c, i })).sort((a, b) => (RARE.has(a.c) ? 1 : 0) - (RARE.has(b.c) ? 1 : 0)).slice(0, give).map((x) => x.i);
    exchangeCards(state, playerIdx, { handIdxs: idxs, camels: 0 }, mkt.slice(0, give)); return;
  }
  addLog(state, `${p.name} has no legal move — skips.`);
  state.turnIndex = (playerIdx + 1) % PLAYER_COUNT; if (state.turnIndex === 0) state.round++;
}
