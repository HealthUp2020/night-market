// NMK-61 — decideMove / suggestMove / applyMove / botPlay split.
import { test, expect, describe } from "bun:test";
import {
  decideMove, suggestMove, applyMove, botPlay,
  sellCards, takeCamels, takeCard, exchangeCards,
  TOKEN_TEMPLATE, PLAYER_NAMES, HAND_LIMIT,
} from "../public/engine.js";

function makeState(overrides: any = {}) {
  const s: any = {
    deck: Array(30).fill("leather"),
    market: [],
    players: PLAYER_NAMES.map((name, i) => ({ id: i, name, isHuman: i === 0, hand: [], camels: 0, score: 0, lastAction: null })),
    tokens: JSON.parse(JSON.stringify(TOKEN_TEMPLATE)),
    bonus: { 3: [1, 1, 1], 4: [4, 4, 4], 5: [8, 8, 9] },
    turnIndex: 0, round: 1, gameOver: false, log: [],
  };
  return { ...s, ...overrides };
}
const snap = (s: any) => JSON.stringify(s);

// One controlled state per descriptor kind.
const scenarios: Record<string, () => any> = {
  sell: () => makeState({ market: ["gold", "spice"], players: withHand(["cloth", "cloth", "cloth", "spice"]) }),
  take: () => makeState({ market: ["gold", "cloth", "camel"], players: withHand([]) }),
  drones: () => makeState({ market: ["camel", "camel", "cloth"], players: withHand(["spice"]) }),
  exchange: () => {
    const tokens = JSON.parse(JSON.stringify(TOKEN_TEMPLATE)); tokens.cloth = []; tokens.spice = [];
    return makeState({ tokens, market: ["gold", "silver"], players: withHand(["cloth", "cloth", "cloth", "cloth", "spice", "spice", "spice"]) });
  },
  skip: () => {
    const tokens = JSON.parse(JSON.stringify(TOKEN_TEMPLATE)); tokens.cloth = []; tokens.spice = [];
    return makeState({ tokens, market: ["gold"], players: withHand(["cloth", "cloth", "cloth", "cloth", "spice", "spice", "spice"]) });
  },
};
function withHand(hand: string[], camels = 0) {
  const s = makeState();
  s.players[0].hand = hand; s.players[0].camels = camels;
  return s.players;
}

describe("reachability", () => {
  for (const kind of Object.keys(scenarios)) {
    test(`decideMove yields ${kind}`, () => {
      expect(decideMove(scenarios[kind](), 0)!.kind).toBe(kind);
    });
  }
  test("sell descriptor picks the whole matching group", () => {
    expect(decideMove(scenarios.sell(), 0)).toEqual({ kind: "sell", good: "cloth", count: 3 });
  });
  test("take prefers the rare card", () => {
    expect(decideMove(scenarios.take(), 0)).toEqual({ kind: "take", idx: 0 });
  });
  test("null when not this seat's turn or game over", () => {
    const s = scenarios.take();
    expect(decideMove(s, 1)).toBeNull();
    expect(suggestMove(s, 2)).toBeNull();
    s.gameOver = true;
    expect(decideMove(s, 0)).toBeNull();
  });
});

describe("purity", () => {
  for (const kind of Object.keys(scenarios)) {
    test(`suggestMove/decideMove do not mutate (${kind})`, () => {
      const s = scenarios[kind]();
      const before = snap(s);
      const a = suggestMove(s, 0);
      const b = decideMove(s, 0);
      expect(snap(s)).toBe(before);
      expect(a).toEqual(b);
      // Repeatable
      expect(decideMove(s, 0)).toEqual(a);
    });
  }
});

describe("decideMove agrees with botPlay", () => {
  for (const kind of Object.keys(scenarios)) {
    test(`botPlay realises the ${kind} descriptor`, () => {
      const s = scenarios[kind]();
      const d: any = decideMove(s, 0);
      const s2 = structuredClone(s);
      botPlay(s2, 0);
      const p0 = s.players[0], q0 = s2.players[0];
      expect(s2.turnIndex).toBe(1);
      if (d.kind === "sell") {
        expect(q0.score).toBeGreaterThan(p0.score);
        expect(q0.hand.filter((c: string) => c === d.good).length).toBe(p0.hand.filter((c: string) => c === d.good).length - d.count);
      } else if (d.kind === "take") {
        expect(q0.hand).toEqual([...p0.hand, s.market[d.idx]]);
      } else if (d.kind === "drones") {
        expect(q0.camels).toBe(p0.camels + s.market.filter((c: string) => c === "camel").length);
        expect(s2.market).not.toContain("camel");
      } else if (d.kind === "exchange") {
        expect(q0.hand).toHaveLength(p0.hand.length);
        for (const i of d.marketIdxs) expect(q0.hand).toContain(s.market[i]);
      } else if (d.kind === "skip") {
        expect(q0.hand).toEqual(p0.hand);
        expect(s2.market).toEqual(s.market);
        expect(s2.log.length).toBe(s.log.length + 1);
      }
    });
  }
  test("botPlay is a no-op off-turn", () => {
    const s = scenarios.take(); const before = snap(s);
    botPlay(s, 2);
    expect(snap(s)).toBe(before);
  });
});

describe("applyMove routing", () => {
  const direct: Record<string, (s: any, d: any) => any> = {
    sell: (s, d) => sellCards(s, 0, d.good, d.count),
    take: (s, d) => takeCard(s, 0, d.idx),
    drones: (s) => takeCamels(s, 0),
    exchange: (s, d) => exchangeCards(s, 0, { handIdxs: d.handIdxs, camels: d.camels }, d.marketIdxs),
  };
  for (const kind of ["sell", "take", "drones", "exchange"]) {
    test(`applyMove(${kind}) equals the direct engine call`, () => {
      const base = scenarios[kind]();
      const d = decideMove(base, 0);
      const a = structuredClone(base), b = structuredClone(base);
      const ra = applyMove(a, 0, d), rb = direct[kind](b, d);
      expect(ra).toEqual(rb);
      expect(ra.ok).toBe(true);
      expect(snap(a)).toBe(snap(b));
    });
  }
  test("skip advances the turn, logs, returns ok", () => {
    const s = scenarios.skip();
    const r = applyMove(s, 0, { kind: "skip" });
    expect(r.ok).toBe(true);
    expect(s.turnIndex).toBe(1);
    expect(s.log.length).toBe(1);
  });
  test("skip by the last seat wraps and bumps round", () => {
    const s = makeState({ turnIndex: 3 });
    applyMove(s, 3, { kind: "skip" });
    expect(s.turnIndex).toBe(0);
    expect(s.round).toBe(2);
  });
  test("null move and unknown kind return ok:false without throwing or mutating", () => {
    const s = scenarios.take(); const before = snap(s);
    expect(applyMove(s, 0, null).ok).toBe(false);
    expect((applyMove(s, 0, undefined as any) as any).ok).toBe(false);
    expect(applyMove(s, 0, { kind: "bogus" } as any).ok).toBe(false);
    expect(snap(s)).toBe(before);
  });
  test("an illegal descriptor does not advance the turn", () => {
    const s = scenarios.take();
    expect(applyMove(s, 0, { kind: "take", idx: 2 }).ok).toBe(false); // camel
    expect(s.turnIndex).toBe(0);
  });
});

describe("descriptor legality", () => {
  test("take/exchange reference non-camel market slots; sell count within holdings; results are legal", () => {
    const goods = ["diamond", "gold", "silver", "cloth", "spice", "leather", "camel"];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = () => goods[Math.floor(rnd() * goods.length)];
    for (let n = 0; n < 300; n++) {
      const s = makeState();
      const hand = Array.from({ length: Math.floor(rnd() * (HAND_LIMIT + 1)) }, () => pick()).filter((c) => c !== "camel");
      s.players[0].hand = hand;
      s.players[0].camels = Math.floor(rnd() * 3);
      s.market = Array.from({ length: Math.floor(rnd() * 8) }, pick);
      for (const g of ["cloth", "spice", "leather", "silver"]) if (rnd() < 0.3) s.tokens[g] = s.tokens[g].slice(Math.floor(rnd() * 8));
      const d: any = decideMove(s, 0);
      expect(d).not.toBeNull();
      if (d.kind === "take") {
        expect(s.market[d.idx]).toBeDefined();
        expect(s.market[d.idx]).not.toBe("camel");
        expect(hand.length).toBeLessThan(HAND_LIMIT);
      } else if (d.kind === "exchange") {
        for (const i of d.marketIdxs) { expect(s.market[i]).toBeDefined(); expect(s.market[i]).not.toBe("camel"); }
        expect(d.handIdxs.length + d.camels).toBe(d.marketIdxs.length);
        expect(new Set(d.handIdxs).size).toBe(d.handIdxs.length);
        d.handIdxs.forEach((i: number) => expect(hand[i]).toBeDefined());
      } else if (d.kind === "sell") {
        expect(d.count).toBeLessThanOrEqual(hand.filter((c) => c === d.good).length);
        expect(d.count).toBeLessThanOrEqual(s.tokens[d.good].length);
      } else if (d.kind === "drones") {
        expect(s.market).toContain("camel");
      }
      // A non-skip descriptor must be accepted by the engine.
      const r = applyMove(structuredClone(s), 0, d);
      expect(r.ok).toBe(true);
    }
  });
});
