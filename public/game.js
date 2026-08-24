// ---- NIGHT MARKET — stage renderer (HTML/CSS). Rules engine lives in engine.js ----
import { CARD_ART } from "./card-art.js"; // illustration SVGs extracted from ui-mockups/Assets/
import {
  GOODS, GOODS_EN, RARE, TOKEN_TEMPLATE, PLAYER_COUNT, SEALS_TO_WIN, HAND_LIMIT,
  PILES_TO_END, emptyPileCount, standings,
  newGame, nextRound, takeCard, takeCamels, sellCards, exchangeCards, botPlay,
} from "./engine.js";
import { fitScale, isTooSmall } from "./layout.js";
import { DIFFICULTY, DIFFICULTY_ORDER } from "./strategies.js";
import { SAVE_KEY, parseSave } from "./persistence.js";
import { AVATARS } from "./avatars.js";
import { startWalkthrough } from "./walkthrough.js";
import { mountOperatorPortrait } from "./portrait.js";
import operatorUrl from "./operator.jpg";
// Live opponent difficulty (ROC-208): easy=reckless, normal=heuristic, hard=1-ply lookahead.
let difficulty = "hard";

// Presentation-only constants (kept out of the engine on purpose).
const ACCENT_CLASS = { diamond: "a-cyan", gold: "a-gold", silver: "a-mag", cloth: "a-pur", spice: "a-grn", leather: "a-org", camel: "a-cyan" };
const TOK_CLASS = { diamond: "t-cyan", gold: "t-gold", silver: "t-mag", cloth: "t-pur", spice: "t-grn", leather: "t-org" };
const DRONE_SVG = '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="4" y1="5" x2="10" y2="11"/><line x1="22" y1="5" x2="16" y2="11"/><ellipse cx="13" cy="14" rx="6" ry="4"/><circle cx="13" cy="14" r="1.6" fill="currentColor" stroke="none"/></svg>';
const AV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// ---- State + selection ----
let state = newGame();
let selectedMarket = new Set();
let selectedHand = new Set();

// ---- HTML builders ----
function cardHTML(good, { selected, playable, zone, idx }) {
  const rare = RARE.has(good), drone = good === "camel";
  const pips = "<i></i>".repeat(rare ? 3 : 1);
  const nextVal = drone ? "—" : (state.tokens[good] && state.tokens[good].length ? state.tokens[good][0] : "—");
  const tier = rare ? "Rare" : drone ? "Fleet" : "Common";
  const cls = `card ${rare ? "rare " : ""}${ACCENT_CLASS[good]}${drone ? " is-drone" : ""}${selected ? " sel" : ""}${playable ? "" : " off"}`;
  return `<div class="${cls}" data-zone="${zone}" data-idx="${idx}">
    ${selected ? '<span class="selring">SELECTED ◇</span>' : ""}<span class="cc"></span>
    <div class="ch"><span class="cn">${GOODS_EN[good]}</span><span class="pip">${pips}</span></div>
    <div class="well">${CARD_ART[good] || ""}</div>
    <div class="ft"><span class="ty">${tier}</span><span class="vl">${nextVal}</span></div><span class="strip"></span>
  </div>`;
}

// Compact readout of a player's most recent move (ROC-235). Reads the engine's structured
// p.lastAction — the same event it logs — so the card and the system feed never disagree.
function actionLabel(p) {
  const a = p.lastAction;
  if (!a) return "waiting…";
  switch (a.kind) {
    case "take": return `TOOK ${GOODS_EN[a.good].toUpperCase()}`;
    case "drones": return `SWEPT ×${a.count} DRONE${a.count > 1 ? "S" : ""}`;
    case "sell": return `SOLD ×${a.count} · +${a.gain}`;
    case "exchange": return `SWAPPED ×${a.count}`;
    default: return "waiting…";
  }
}
function rankBadgeHTML(info) {
  if (!info) return "";
  return `<span class="rrank${info.isLeader ? " lead" : ""}">${info.isLeader ? "★" : "#" + info.rank}</span>`;
}
function rivalHTML(p, rankInfo) {
  const active = state.turnIndex === p.id && !state.gameOver;
  return `<div class="glass rival ${active ? "active" : ""}"><div class="sheen"></div>
    <div class="lock">${LOCK_SVG}</div>
    ${rankBadgeHTML(rankInfo)}
    <div class="av">${AVATARS[p.name] || AV_SVG}</div>
    <div class="rinfo">
      <div class="top"><span class="nm">${p.name}</span><span class="stt"><i></i><b>${active ? "EXEC" : "IDLE"}</b></span></div>
      <div class="rscore"><b>${p.score}</b><span class="u">Gold</span><span class="rmini"><span>HAND ${p.hand.length}</span><span>FLEET ${p.camels}</span></span></div>
      <div class="rlast${active ? " on" : ""}">${actionLabel(p)}</div>
    </div>
  </div>`;
}

// ============================================================
//  Animated left PRICE WALL (persistent DOM; spend animation ported
//  from ui-mockups/proto-price-wall.html). Built once, updated in place
//  so tokens can fly and counts can roll instead of blinking on re-render.
// ============================================================
const PRICE_CLASS = { diamond: "g-cyan", gold: "g-gold", silver: "g-mag", cloth: "g-pur", spice: "g-grn", leather: "g-org" };
const ACCENT_HEX = { diamond: "#00e5ff", gold: "#ffc94d", silver: "#ff2d96", cloth: "#8578ad", spice: "#6fa07d", leather: "#b97a4b" };
const EASE = "cubic-bezier(.2,.9,.25,1)";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TRACE = '<svg class="tr" viewBox="0 0 42 30" preserveAspectRatio="none"><g stroke="currentColor" fill="none" stroke-width="1" stroke-opacity=".38"><path d="M4 9H14V6M14 9H24"/><path d="M4 21H12V24M12 21H22"/><path d="M38 13H28V19"/></g><g fill="currentColor" fill-opacity=".5"><rect x="13" y="5" width="2" height="2"/><rect x="23" y="8" width="2" height="2"/><rect x="11" y="23" width="2" height="2"/></g></svg>';
const PW = {};          // good -> { row, chip, pile, gauge, valEl, cntEl, shown }
let crShown = 0;        // displayed operator CR

const chipInner = (v) => TRACE + "<b>" + v + "</b>";

function initPriceWall() {
  const host = document.getElementById("price-rows");
  host.innerHTML = "";
  GOODS.forEach((good, gi) => {
    const rare = RARE.has(good), count = state.tokens[good].length, top = count ? state.tokens[good][0] : "—";
    const row = document.createElement("div");
    row.className = `row ${PRICE_CLASS[good]}${rare ? " rare" : ""}`;
    row.innerHTML = `
      <div class="pile"><div class="sl" style="bottom:3px"></div><div class="sl" style="bottom:7px"></div><div class="chip">${chipInner(top)}</div></div>
      <div class="mid">
        <div class="r1"><span class="nm">${GOODS_EN[good]}</span><span class="val"><b>${top}</b><span>Gold</span></span></div>
        <div class="r2"><div class="bar"></div><span class="cnt"><span class="x">×</span><span class="n">${count}</span><span class="lab">left</span></span></div>
      </div>`;
    // Absolute stock bar (ROC-244): one cell per token, sized to this good's starting pile,
    // so a full pile reads full and equal counts look equal across goods.
    const bar = row.querySelector(".bar"), startMax = TOKEN_TEMPLATE[good].length;
    for (let i = 0; i < startMax; i++) bar.appendChild(document.createElement("i"));
    host.appendChild(row);
    PW[good] = { row, chip: row.querySelector(".chip"), pile: row.querySelector(".pile"),
      barEl: bar, valEl: row.querySelector(".val b"), cntEl: row.querySelector(".cnt .n"), shown: count };
    setRowState(good);
    // pile-up entrance
    if (!REDUCED) {
      const chip = PW[good].chip; chip.style.animationDelay = (gi * 36) + "ms"; chip.classList.add("in");
      chip.addEventListener("animationend", () => { chip.classList.remove("in"); chip.classList.add("settle"); }, { once: true });
    }
  });
  crShown = state.players[0].score;
  document.getElementById("op-score").textContent = crShown;
}

// set a row's chip/value/gauge/count/state instantly from current game state
// Stock readout (ROC-244/241): show exactly one cell per remaining token — no empty capacity
// cells — so the number of visible cells IS the token count. LOW (≤2) / SOLD OUT (0) via colour.
function scarcity(s, count) {
  [...s.barEl.children].forEach((cell, i) => {
    const on = i < count;
    cell.classList.toggle("lit", on);
    cell.style.display = on ? "" : "none";
  });
  s.row.classList.toggle("low", count > 0 && count <= 2);
  s.row.classList.toggle("empty", count === 0);
}
function setRowState(good) {
  const s = PW[good], count = state.tokens[good].length;
  const top = count ? state.tokens[good][0] : "—";
  const slv = Math.min(count - 1, 2);
  s.pile.querySelectorAll(".sl").forEach((x, i) => x.style.display = i < slv ? "block" : "none");
  s.chip.innerHTML = count ? chipInner(top) : "<b>—</b>";
  s.valEl.textContent = top;
  s.cntEl.textContent = count;
  scarcity(s, count);
  s.shown = count;
}

// roll ×N count down (used during a spend), then refresh the scarcity state
function rollRow(good) {
  const s = PW[good], count = state.tokens[good].length;
  s.valEl.textContent = count ? state.tokens[good][0] : "—";
  const from = +s.cntEl.textContent, t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / 240);
    s.cntEl.textContent = Math.round(from + (count - from) * k);
    if (k < 1) requestAnimationFrame(step);
  })(performance.now());
  scarcity(s, count);
}

function crCount(to, dur = 380) {
  const el = document.getElementById("op-score"), from = crShown, t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    crShown = Math.round(from + (to - from) * k); el.textContent = crShown;
    if (k < 1) requestAnimationFrame(step);
  })(performance.now());
}

function creditPop(v) {
  const r = document.getElementById("op-score").getBoundingClientRect();
  const c = document.createElement("div");
  c.className = "credit-pop"; c.textContent = "+" + v + " Gold";
  c.style.left = (r.right + 6) + "px"; c.style.top = (r.top - 4) + "px";
  document.getElementById("fx").appendChild(c);
  c.addEventListener("animationend", () => c.remove(), { once: true });
}

// Animate a sale on a pile. Readouts update IMMEDIATELY (robust — never gated on an
// animation that could stall); the lift / promote flash / token flight are pure flourish.
function playSpend(good, soldValues) {
  const s = PW[good], accent = ACCENT_HEX[good], rare = RARE.has(good);
  const chipR = s.chip.getBoundingClientRect();   // capture before content changes (position stable)
  setRowState(good);                              // value, slivers, gauge, count, states — instant + correct
  if (REDUCED) return;
  // lift-and-return + promote flash on the (new) top chip
  s.chip.animate([{ transform: "translateY(-9px) scale(1.05)" }, { transform: "translateY(0) scale(1)" }], { duration: 240, easing: EASE });
  if (state.tokens[good].length) { s.chip.classList.remove("promote"); void s.chip.offsetWidth; s.chip.classList.add("promote"); }
  if (!soldValues || !soldValues.length) return;   // bot sale — deplete only, no flight to my CR
  const fx = document.getElementById("fx");
  const sinkR = document.getElementById("op-score").getBoundingClientRect();
  soldValues.forEach((v, i) => {
    const fl = document.createElement("div"); fl.className = "flyer";
    fl.style.cssText += `left:${chipR.left}px;top:${chipR.top - 10}px;`
      + `background:linear-gradient(158deg,color-mix(in srgb,${accent} 26%,transparent),color-mix(in srgb,${accent} 10%,transparent)),var(--bg-inset);`
      + `box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 0 8px color-mix(in srgb,${accent} ${rare ? 28 : 16}%,transparent);`;
    fl.innerHTML = `<b style="position:absolute;inset:0;display:grid;place-items:center;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:13px;color:${accent}">${v}</b>`;
    fx.appendChild(fl);
    const gh = fl.cloneNode(true); gh.classList.add("ghost"); gh.style.left = fl.style.left; gh.style.top = fl.style.top;
    gh.addEventListener("animationend", () => gh.remove(), { once: true });
    const dx = sinkR.left - chipR.left, dy = sinkR.top - (chipR.top - 10);
    setTimeout(() => {
      fx.appendChild(gh);
      fl.animate([{ transform: "translate(0,0) scale(1.05)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0 }],
        { duration: 300, easing: EASE, fill: "forwards" }).finished.then(() => { fl.remove(); creditPop(v); });
    }, i * 55);
  });
}

// called every render: diff token counts, animate depletions in place
function updatePriceWall() {
  const sale = state.lastSale;
  GOODS.forEach((good) => {
    const s = PW[good]; if (!s) return;
    const now = state.tokens[good].length;
    if (now < s.shown) {
      const opSold = sale && sale.good === good && sale.playerIdx === 0;
      playSpend(good, opSold ? sale.values : null);
      s.shown = now;
    } else if (now !== s.shown) {
      setRowState(good);           // increase / reset
    }
  });
  const target = state.players[0].score;
  if (sale && sale.playerIdx === 0 && !REDUCED) crCount(target);
  else { crShown = target; document.getElementById("op-score").textContent = target; }
  state.lastSale = null;
}

function bonusHexHTML(n) {
  const pile = state.bonus[n], top = pile.length ? "+" + pile[0] : "—", labelTxt = n === 5 ? "×5+" : "×" + n;
  const tint = n === 3 ? "var(--rare-cyan)" : n === 5 ? "var(--rare-magenta)" : null;
  const hb = tint ? ` style="background:${tint}"` : "";
  const b = tint ? ` style="color:${tint}"` : "";
  const fl = n === 3 ? ' style="filter:drop-shadow(0 0 2px rgba(0,229,255,.2))"'
    : n === 5 ? ' style="filter:drop-shadow(0 0 2px rgba(255,45,150,.22))"' : "";
  return `<div class="bcol"><div class="hex"${fl}><div class="hb"${hb}></div><div class="hi"><b${b}>${labelTxt}</b></div></div><span class="k">${top}</span></div>`;
}

// ---- Render ----
function render() {
  const human = state.players[0];
  const playable = !state.gameOver && state.players[state.turnIndex].isHuman;

  document.getElementById("deck-count").textContent = state.deck.length;
  document.getElementById("round-sub").textContent = "RND " + String(state.round).padStart(2, "0");

  const banner = document.getElementById("turn-banner"), tb = document.getElementById("turn-text");
  if (state.gameOver) { tb.textContent = (state.match && state.match.matchOver) ? "Match // Over" : "Round // Complete"; banner.className = "banner state-over"; }
  else if (playable) { tb.textContent = "Operator // Your Move"; banner.className = "banner state-you"; }
  else { tb.textContent = `${state.players[state.turnIndex].name} // Executing`; banner.className = "banner state-bot"; }

  const stand = standings(state); // ROC-236 live standings, keyed by seat id
  // Suppress rank chips until someone pulls ahead — otherwise everyone reads "#1" at the start.
  const rankById = stand.some((s) => s.isLeader) ? Object.fromEntries(stand.map((s) => [s.id, s])) : {};
  document.getElementById("rivals").innerHTML = state.players.slice(1).map((p) => rivalHTML(p, rankById[p.id])).join("");

  document.getElementById("market-cards").innerHTML = state.market
    .map((c, i) => cardHTML(c, { selected: selectedMarket.has(i), playable, zone: "market", idx: i })).join("");

  updatePriceWall(); // persistent, animated left price wall (also drives #op-score)
  document.getElementById("price-bonus").innerHTML = [3, 4, 5].map(bonusHexHTML).join("");

  const lines = state.log.slice(-9);
  document.getElementById("log").innerHTML = `<div class="scan"></div>` +
    lines.map((l, i) => `<div class="ln${i === lines.length - 1 ? " you" : ""}"><span class="g">&gt;</span> ${l}</div>`).join("") +
    `<div class="cur"><span class="g">&gt;</span> <i></i></div>`;

  // #op-score is driven by updatePriceWall (count-up on your sales)
  document.getElementById("op-hand").textContent = human.hand.length;
  document.getElementById("op-fleet").textContent = human.camels;
  document.getElementById("op-deck").textContent = state.deck.length;
  const opRank = rankById[0]; // the Operator's own standing
  const opRankEl = document.getElementById("op-rank");
  opRankEl.textContent = opRank ? (opRank.isLeader ? "★" : "#" + opRank.rank) : "";
  opRankEl.classList.toggle("lead", !!(opRank && opRank.isLeader));

  const nH = human.hand.length;
  document.getElementById("hand").innerHTML = `<div class="lab2 cap mono">YOUR HAND // ${nH}</div>` +
    human.hand.map((good, i) => {
      const t = nH > 1 ? (i / (nH - 1)) * 2 - 1 : 0;
      const rot = (t * 12).toFixed(1), ty = (Math.abs(t) * 16).toFixed(0), sel = selectedHand.has(i);
      return `<div class="hc" style="transform:rotate(${rot}deg) translateY(${ty}px)${sel ? ";z-index:6" : ""}">${cardHTML(good, { selected: sel, playable, zone: "hand", idx: i })}</div>`;
    }).join("");

  document.getElementById("fleet-count").textContent = human.camels;
  document.getElementById("fleet-cluster").innerHTML = Array.from({ length: Math.min(human.camels, 12) },
    (_, i) => `<span class="drone" data-i="${i}">${DRONE_SVG}</span>`).join("");

  updateDock(human, playable);
  updateProgress();
  updateEndScreen();
}

// ---- Match/round progress HUD (ROC-210): round + seals + supply-collapse + deck ----
const SHORT = { OPERATOR: "OPR", "VULT-3R": "VLT", "NØMAD": "NMD", "SPECTRE-9": "SP9" };
function updateProgress() {
  const el = document.getElementById("progress");
  if (!el) return;
  const m = state.match;
  if (!m) { el.classList.remove("on"); return; }
  const empties = emptyPileCount(state);            // goods piles run dry → round ends at PILES_TO_END
  const warn = empties >= PILES_TO_END - 1;         // 2 of 3 → "round ending"
  const deckLow = state.deck.length <= 12;

  const ops = state.players.map((p, i) => {
    const on = Math.min(m.seals[i], SEALS_TO_WIN);
    const pips = `<span class="on">${"◆".repeat(on)}</span>${"◇".repeat(Math.max(0, SEALS_TO_WIN - on))}`;
    const active = state.turnIndex === i && !state.gameOver;
    return `<div class="pop${active ? " act" : ""}"><span class="nm">${SHORT[p.name] || p.name}</span><span class="pips">${pips}</span></div>`;
  }).join("");
  const segs = Array.from({ length: PILES_TO_END }, (_, i) => `<i class="${i < empties ? "on" : ""}"></i>`).join("");

  el.innerHTML =
    `<div class="pseg"><span class="cap">Round</span><span class="rn"><b>${m.roundNo}</b><span class="of">/${m.maxRounds}</span></span></div>`
    + `<div class="pseg"><span class="cap">Seals</span><div class="ops">${ops}</div></div>`
    + `<div class="pseg psupply${warn ? " warn" : ""}"><span class="cap">Supply</span><div class="bars">${segs}</div>`
    + `<span class="n">${empties}/${PILES_TO_END}</span>${warn ? `<span class="w">Round ending</span>` : ""}</div>`
    + `<div class="pseg${deckLow ? " warn" : ""}"><span class="cap">Deck</span><b class="dk">${state.deck.length}</b></div>`;
  el.classList.add("on");
}

// ---- End-of-round / match-over screen (best-of-3) ----
const sealDots = (n) => {
  const on = Math.min(n, SEALS_TO_WIN);
  return `<span class="on">${"◆".repeat(on)}</span>${"◆".repeat(Math.max(0, SEALS_TO_WIN - on))}`;
};
function updateEndScreen() {
  const el = document.getElementById("endscreen");
  if (!el) return;
  if (!state.gameOver) { el.classList.remove("on"); el.setAttribute("aria-hidden", "true"); return; }
  const m = state.match, matchOver = !!(m && m.matchOver);
  const winners = matchOver ? (m.matchWinners || []) : (m && m.lastRound ? m.lastRound.winners : []);
  const ringed = new Set(winners);

  let head, who, sub;
  if (matchOver) {
    head = "MATCH // OVER";
    who = m.matchWinner != null
      ? `<b>${state.players[m.matchWinner].name}</b> SECURES THE MARKET`
      : `DRAW — ${winners.map((i) => state.players[i].name).join(" · ")}`;
    sub = `${m.matchWinner != null ? m.seals[m.matchWinner] + " SEALS · " : ""}FIRST TO ${SEALS_TO_WIN} WINS`;
  } else {
    head = `ROUND ${m ? m.roundNo : 1} // COMPLETE`;
    who = winners.length === 1
      ? `<b>${state.players[winners[0]].name}</b> TAKES THE ROUND`
      : `ROUND TIED — ${winners.map((i) => state.players[i].name).join(" · ")}`;
    sub = m ? `SEALS ${m.seals.join(" / ")} · ${m.maxRounds - m.roundNo} ROUND${m.maxRounds - m.roundNo === 1 ? "" : "S"} TO GO` : "";
  }
  const buttons = matchOver
    ? `<div class="ebtns"><button class="ecta" data-action="new">NEW MATCH →</button><button class="ecta ghost" data-action="menu">MAIN MENU</button></div>`
    : `<button class="ecta" data-action="next">NEXT ROUND →</button>`;

  const cr = (i) => (matchOver && m ? m.cumScore[i] : state.players[i].score);
  const ops = state.players.map((p, i) => `
    <div class="eop${ringed.has(i) ? " win" : ""}">
      <div class="nm">${p.name}</div>
      <div class="dm">${sealDots(m ? m.seals[i] : 0)}</div>
      <div class="cr">${cr(i)} Gold</div>
    </div>`).join("");

  const rows = state.players.map((p, i) => ({ i, name: p.name, seals: m ? m.seals[i] : 0, score: cr(i) }));
  rows.sort((a, b) => (matchOver ? (b.seals - a.seals || b.score - a.score) : (b.score - a.score || b.seals - a.seals)));
  const table = rows.map((r, rank) => `
    <tr class="${ringed.has(r.i) ? "win" : ""}"><td>${rank + 1}</td><td>${r.name}</td><td>${r.seals}</td><td class="r">${r.score}</td></tr>`).join("");

  el.innerHTML = `
    <div class="ebox">
      <div class="kick">NIGHT MARKET // BEST OF ${m ? m.maxRounds : 3}</div>
      <div class="ewin">${head}</div>
      <div class="ewho">${who}</div>
      <div class="esub">${sub}</div>
      <div class="eseals">${ops}</div>
      <table class="etable"><tr><th>#</th><th>OPERATOR</th><th>SEALS</th><th class="r">${matchOver ? "TOTAL GOLD" : "ROUND GOLD"}</th></tr>${table}</table>
      ${buttons}
    </div>`;
  el.classList.add("on");
  el.setAttribute("aria-hidden", "false");
}

// Resolve the single "smart" primary action from the current selection (ROC-216/217/223).
// Count comes from the selection — no manual stepper. Returns {kind,label,enabled,hint,…}.
function currentAction(human) {
  const hand = [...selectedHand], mkt = [...selectedMarket];
  const handCards = hand.map((i) => human.hand[i]);

  // Sell: hand cards of one good (hand-only selection). Hand drives selling, market drives the rest.
  if (hand.length > 0) {
    if (mkt.length > 0) return { enabled: false, label: "Sell", hint: "Selling uses hand cards only — clear the market selection." };
    const good = handCards[0];
    if (!handCards.every((c) => c === good)) return { enabled: false, label: "Sell", hint: "Selected cards must be the same good." };
    if (RARE.has(good) && hand.length < 2) return { enabled: false, label: "Sell", hint: `${GOODS_EN[good]} is rare — sell 2+ at once.` };
    return { kind: "sell", enabled: true, label: `Sell ×${hand.length}`, good };
  }

  // Market-driven actions (ROC-223). The primary label reads straight from the market selection.
  const drones = mkt.filter((i) => state.market[i] === "camel").length;
  const goods = mkt.length - drones;

  // Any drone selected → Take Drones (sweeps every drone from the market, regardless of count).
  if (drones > 0) {
    if (goods > 0) return { enabled: false, label: "Take drones", hint: "Select drones on their own to take them." };
    return { kind: "drones", enabled: true, label: "Take drones" };
  }
  // Exactly one goods card → Take it.
  if (goods === 1) return { kind: "take", enabled: true, label: "Take 1 card", idx: mkt[0] };
  // Two or more goods cards → Exchange for drones (give that many drones from the fleet).
  if (goods > 1) {
    const need = goods;
    if (human.camels < need) return { enabled: false, label: "Exchange for drones", hint: `Need ${need} drones — you have ${human.camels}.` };
    const after = human.hand.length + need; // drones given don't change hand size
    if (after > HAND_LIMIT) return { enabled: false, label: "Exchange for drones", hint: `That leaves ${after} cards (max ${HAND_LIMIT}).` };
    return { kind: "exchange", enabled: true, label: "Exchange for drones", need };
  }
  return { enabled: false, label: "Select cards to act" };
}

function updateDock(human, playable) {
  const a = currentAction(human);
  const primary = document.getElementById("btn-primary");
  primary.textContent = a.label;
  primary.classList.toggle("off", !playable || !a.enabled);
  primary.classList.toggle("primary", playable && a.enabled);

  const anySel = selectedMarket.size + selectedHand.size > 0;
  document.getElementById("btn-clear").classList.toggle("off", !anySel);

  const hint = document.getElementById("dock-hint");
  hint.className = "hint";
  if (state.gameOver) hint.textContent = "Match over — reset to play again.";
  else if (!playable) hint.textContent = "Awaiting your turn…";
  else if (a.hint) hint.textContent = a.hint;
  else {
    const sel = selectedMarket.size + selectedHand.size;
    hint.textContent = sel ? `${sel} selected` : "Select cards to act.";
  }
}

function showError(msg) { const h = document.getElementById("dock-hint"); h.textContent = msg; h.className = "hint err"; }

// ---- Interaction ----
function onCardClick(e) {
  const el = e.target.closest(".card");
  if (!el || state.gameOver || !state.players[state.turnIndex].isHuman) return;
  const set = el.dataset.zone === "market" ? selectedMarket : selectedHand;
  const idx = Number(el.dataset.idx);
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  render();
}
document.getElementById("market-cards").addEventListener("click", onCardClick);
document.getElementById("hand").addEventListener("click", onCardClick);

function requirePlayerTurn() {
  if (state.gameOver) { showError("Match over — reset to play again."); return false; }
  if (!state.players[state.turnIndex].isHuman) { showError("Wait for your turn."); return false; }
  return true;
}
// Single smart primary action — take / sell / exchange, resolved from the selection.
document.getElementById("btn-primary").addEventListener("click", () => {
  if (!requirePlayerTurn()) return;
  const a = currentAction(state.players[0]);
  if (!a.enabled) { if (a.hint) showError(a.hint); return; }
  if (a.kind === "take") afterPlayerAction(takeCard(state, 0, a.idx));
  else if (a.kind === "sell") afterPlayerAction(sellCards(state, 0, a.good, selectedHand.size));
  else if (a.kind === "drones") afterPlayerAction(takeCamels(state, 0));
  else if (a.kind === "exchange") afterPlayerAction(exchangeCards(state, 0, { handIdxs: [], camels: a.need }, [...selectedMarket]));
});
document.getElementById("btn-clear").addEventListener("click", () => { selectedMarket = new Set(); selectedHand = new Set(); render(); });
document.getElementById("btn-reset").addEventListener("click", () => { state = newGame(); selectedMarket = new Set(); selectedHand = new Set(); initPriceWall(); render(); });

// End-screen buttons: continue to the next round, or start a fresh match.
document.getElementById("endscreen").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  selectedMarket = new Set(); selectedHand = new Set();
  const act = btn.dataset.action;
  if (act === "next") {
    if (nextRound(state).ok) { initPriceWall(); render(); saveGame(); stepBotsIfNeeded(state); }
  } else if (act === "menu") {
    showMenu();
  } else {
    state = newGame(); initPriceWall(); render(); // NEW MATCH
  }
});

function afterPlayerAction(res) {
  if (!res.ok) { showError(res.error); return; }
  selectedMarket = new Set(); selectedHand = new Set();
  render(); saveGame(); stepBotsIfNeeded(state);
}
const BOT_STEP_MS = 700; // delay between bot moves so the player can follow each rival's action
function stepBotsIfNeeded(gameRef) {
  if (gameRef.gameOver || gameRef.players[gameRef.turnIndex].isHuman) { render(); return; }
  setTimeout(() => {
    if (state !== gameRef) return; // dropped after "Reset match"
    const before = state.turnIndex;
    try { DIFFICULTY[difficulty](state, state.turnIndex); }
    catch (e) { console.error("bot step error — skipping turn", e); }
    // Safety: the turn must ALWAYS advance, so a bot bug can never freeze the game on "EXECUTING".
    if (!state.gameOver && state.turnIndex === before) state.turnIndex = (before + 1) % PLAYER_COUNT;
    render(); saveGame();
    stepBotsIfNeeded(state);
  }, BOT_STEP_MS);
}

// ---- Scale the fixed 1600x900 stage to fit the viewport (contain, never clipped) ----
let _stageEl = null, _tooSmallEl = null;
// Prefer CSS `zoom` (layout-level scale → renders at native device resolution, crisp on hi-DPI).
// Fall back to transform+translate on the rare engine without zoom support.
const _zoomOK = typeof CSS !== "undefined" && CSS.supports && CSS.supports("zoom", "1");
function fitStage() {
  _stageEl = _stageEl || document.getElementById("stage");
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const s = fitScale(vw, vh);
  if (_zoomOK) {
    _stageEl.style.zoom = s; // grid-centered by #stage-scaler; zoom changes used size so it fits
  } else {
    // Fallback: absolutely center then transform-scale (translate before scale centers on the box).
    _stageEl.style.position = "absolute";
    _stageEl.style.left = "50%";
    _stageEl.style.top = "50%";
    _stageEl.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  // Below the minimum viewport, show the "too small" fallback (ROC-202) over the stage.
  _tooSmallEl = _tooSmallEl || document.getElementById("toosmall");
  if (_tooSmallEl) {
    const small = isTooSmall(vw, vh);
    _tooSmallEl.classList.toggle("on", small);
    _tooSmallEl.setAttribute("aria-hidden", small ? "false" : "true");
    if (small) _tooSmallEl.querySelector(".ts-cur").textContent = `${vw} × ${vh}`;
  }
}
// Coalesce bursts of layout events into a single re-fit on the next frame, and re-measure
// AFTER the frame so fullscreen-exit / browser-chrome transitions settle to final dimensions
// (measuring synchronously in the event handler reads stale, mid-transition sizes).
let _fitQueued = false;
function scheduleFit() {
  fitStage(); // fit immediately (still works when rAF is throttled, e.g. a background tab)
  if (_fitQueued) return; // then coalesce one post-frame settle pass for fullscreen/chrome transitions
  _fitQueued = true;
  requestAnimationFrame(() => { _fitQueued = false; fitStage(); });
}
for (const ev of ["resize", "orientationchange", "load", "pageshow"]) window.addEventListener(ev, scheduleFit);
// fullscreenchange fires on document and bubbles there; cover the WebKit-prefixed variant too.
document.addEventListener("fullscreenchange", scheduleFit);
document.addEventListener("webkitfullscreenchange", scheduleFit);
document.addEventListener("visibilitychange", scheduleFit); // re-fit when a hidden tab returns
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleFit); // macOS chrome / pinch-zoom
  window.visualViewport.addEventListener("scroll", scheduleFit); // pinch-zoom pan
}
// ResizeObserver catches size changes that don't emit a resize event (exit-fullscreen, chrome).
// fitStage only mutates an out-of-flow transform, so it can't grow documentElement → no RO loop.
new ResizeObserver(scheduleFit).observe(document.documentElement);
fitStage();

/* ---- Background variant switcher (default / A-fog / B-neon / C-vault) ---- */
const BG_SRC = { a: "backgrounds/a.html", b: "backgrounds/b.html", c: "backgrounds/c.html" };
function applyBackground(bg) {
  bg = ["0", "a", "b", "c"].includes(bg) ? bg : "0";
  const env = document.querySelector(".env");
  ["a", "b", "c"].forEach(k => {
    const frame = document.getElementById("bg-" + k);
    if (!frame) return;
    const active = bg === k;
    if (active && !frame.src) frame.src = BG_SRC[k]; // lazy-load on first select
    frame.classList.toggle("on", active);
  });
  if (env) env.style.display = bg === "0" ? "" : "none"; // procedural env only for default
  document.querySelectorAll("#bg-switch button").forEach(b => b.classList.toggle("on", b.dataset.bg === bg));
  try { localStorage.setItem("nm-bg", bg); } catch {}
}
function initBackgroundSwitch() {
  const urlBg = new URLSearchParams(location.search).get("bg");
  let saved = null; try { saved = localStorage.getItem("nm-bg"); } catch {}
  applyBackground(urlBg || saved || "0");
  document.getElementById("bg-switch")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-bg]");
    if (btn) applyBackground(btn.dataset.bg);
  });
}

// ---- Difficulty selector (ROC-208) ----
function applyDifficulty(d) {
  difficulty = DIFFICULTY_ORDER.includes(d) ? d : "hard";
  document.querySelectorAll("#menu-diff button").forEach((b) => b.classList.toggle("on", b.dataset.diff === difficulty));
  try { localStorage.setItem("nm-diff", difficulty); } catch {}
}
function showMenu() {
  const el = document.getElementById("menu"); if (!el) return;
  el.classList.add("on"); el.setAttribute("aria-hidden", "false");
  refreshResumeButton(); // the menu may open after a match ends / mid-match — recheck resumability
}
function hideMenu() { const el = document.getElementById("menu"); if (el) { el.classList.remove("on"); el.setAttribute("aria-hidden", "true"); } }
function openHowto() { const el = document.getElementById("howto"); if (el) { el.classList.add("on"); el.setAttribute("aria-hidden", "false"); } }
function closeHowto() { const el = document.getElementById("howto"); if (el) { el.classList.remove("on"); el.setAttribute("aria-hidden", "true"); } }

// ---- Save / resume an in-progress match (ROC-196) ----
function saveGame() {
  if (state && state.match && state.match.matchOver === false) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
  } else { clearSave(); } // don't keep a finished/absent match around to resume
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
function loadSave() { try { return parseSave(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
function refreshResumeButton() {
  const btn = document.getElementById("menu-resume");
  if (btn) btn.style.display = loadSave() ? "" : "none";
}

// ---- Guided walkthrough (ROC-191): auto once for new players, replayable from How to Play ----
const ONBOARD_KEY = "nm-onboarded";
function onboarded() { try { return !!localStorage.getItem(ONBOARD_KEY); } catch { return false; } }
function setOnboarded() { try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {} }
const WT_STEPS = [
  { target: null, title: "Welcome to Night Market", body: "You're the OPERATOR, cornering contraband against three rival machines. Here's the board — take the quick tour, or skip anytime." },
  { target: ".market", title: "The Night Market", body: "Seven goods sit face-up here. On your turn you take one card, sweep the drones, or spend drones from your fleet to grab several cards at once." },
  { target: ".wall", title: "Market prices", body: "Prices fall as goods sell — the top token is the current Gold payout. Sell scarce goods first for the premium." },
  { target: "#hand", title: "Your hand", body: "Cards you've taken, up to 7. Collect matching goods, then sell a batch — selling 3 or more earns a bonus token." },
  { target: ".dock", title: "Your actions", body: "Select cards and this button reads your intent: Take, Sell, or Exchange. It greys out and tells you why when a move isn't legal." },
  { target: ".fleet", title: "Your drone fleet", body: "Drones don't clog your hand and pay for exchanges. Hold the largest fleet at round's end for a +5 Gold Fixer bonus." },
  { target: ".rivals", title: "The rival machines", body: "Three AI operators act between your turns. Watch what they hoard — and deny them the goods they need." },
  { target: "#progress", title: "Match progress", body: "Best of three rounds. Track rounds, seals, market supply and the deck here — first to 2 seals wins the match." },
  { target: "#util-help", title: "Need a refresher?", body: "Open this ? anytime to reread the rules or replay this walkthrough. That's the tour — good luck, Operator." },
];
function runWalkthrough() { startWalkthrough(WT_STEPS, () => setOnboarded()); }
function afterRender(fn) { requestAnimationFrame(() => requestAnimationFrame(fn)); }

function newMatch() {
  hideMenu();
  state = newGame();
  selectedMarket = new Set(); selectedHand = new Set();
  initPriceWall(); render(); saveGame();
}
function startMatch() {
  newMatch();
  if (!onboarded()) afterRender(runWalkthrough); // first-run guided tour
}
// Replay entry point (from the How to Play panel). Ensures a live board, then runs the tour.
function launchWalkthrough() {
  closeHowto();
  const menuOpen = document.getElementById("menu")?.classList.contains("on");
  const live = state && state.match && !state.match.matchOver && !menuOpen;
  if (live) runWalkthrough();
  else { newMatch(); afterRender(runWalkthrough); }
}
function resumeMatch() {
  const saved = loadSave();
  if (!saved) { startMatch(); return; }
  hideMenu();
  state = saved;
  selectedMarket = new Set(); selectedHand = new Set();
  initPriceWall(); render();
  stepBotsIfNeeded(state); // if we saved mid bot-chain, keep it going
}
function initMenu() {
  let saved = null; try { saved = localStorage.getItem("nm-diff"); } catch {}
  applyDifficulty(saved || "hard");
  document.getElementById("menu-diff")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-diff]");
    if (btn) applyDifficulty(btn.dataset.diff);
  });
  document.getElementById("menu-start")?.addEventListener("click", startMatch);
  document.getElementById("menu-resume")?.addEventListener("click", resumeMatch);
  document.getElementById("menu-howto")?.addEventListener("click", openHowto);
  document.getElementById("util-help")?.addEventListener("click", openHowto);
  document.getElementById("howto-close")?.addEventListener("click", closeHowto);
  document.getElementById("howto-ok")?.addEventListener("click", closeHowto);
  document.getElementById("howto-tour")?.addEventListener("click", launchWalkthrough);
  showMenu(); // boot into the title menu (refreshResumeButton runs inside showMenu)
}

window.game = { get state() { return state; }, get selectedMarket() { return selectedMarket; }, get selectedHand() { return selectedHand; }, get difficulty() { return difficulty; }, setDifficulty: applyDifficulty, botPlay, newGame, nextRound, render, applyBackground };
initPriceWall();
initBackgroundSwitch();
initMenu();
render();
const _opPortrait = document.getElementById("op-portrait"); // the Operator (players[0]) presence
if (_opPortrait) mountOperatorPortrait(_opPortrait, operatorUrl);
