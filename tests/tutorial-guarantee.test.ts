// NMK-66 — tutorial board guarantees: canDo + ensureTutorialAction.
import { test, expect, describe } from "bun:test";
import { canDo, ensureTutorialAction, GOODS, RARE, HAND_LIMIT, MARKET_SIZE, PLAYER_NAMES, TOKEN_TEMPLATE } from "../public/engine.js";

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
const KINDS = ["take", "sell", "drones", "exchange"] as const;
const total = (s: any) => s.deck.length + s.market.length;

describe("canDo", () => {
  test("drones: needs a camel in the market", () => {
    expect(canDo(makeState({ market: ["cloth", "camel"] }), 0, "drones")).toBe(true);
    expect(canDo(makeState({ market: ["cloth", "gold"] }), 0, "drones")).toBe(false);
    expect(canDo(makeState({ market: [] }), 0, "drones")).toBe(false);
  });

  test("take: needs hand room and a non-camel market card", () => {
    expect(canDo(makeState({ market: ["cloth"] }), 0, "take")).toBe(true);
    expect(canDo(makeState({ market: ["camel", "camel"] }), 0, "take")).toBe(false);
    expect(canDo(makeState({ market: [] }), 0, "take")).toBe(false);
    const s = makeState({ market: ["cloth"] });
    s.players[0].hand = Array(HAND_LIMIT - 1).fill("spice");
    expect(canDo(s, 0, "take")).toBe(true);
    s.players[0].hand.push("spice");
    expect(canDo(s, 0, "take")).toBe(false);
  });

  test("sell: common needs 1, rare needs 2, and the pile must be non-empty", () => {
    const s = makeState();
    expect(canDo(s, 0, "sell")).toBe(false);
    s.players[0].hand = ["cloth"];
    expect(canDo(s, 0, "sell")).toBe(true);
    s.players[0].hand = ["gold"];
    expect(canDo(s, 0, "sell")).toBe(false);
    s.players[0].hand = ["gold", "gold"];
    expect(canDo(s, 0, "sell")).toBe(true);
    for (const r of RARE) {
      const t = makeState(); t.players[0].hand = [r, r];
      expect(canDo(t, 0, "sell")).toBe(true);
      t.players[0].hand = [r];
      expect(canDo(t, 0, "sell")).toBe(false);
    }
    s.tokens.gold = [];
    expect(canDo(s, 0, "sell")).toBe(false);
    s.players[0].hand = ["gold", "gold", "cloth"];
    expect(canDo(s, 0, "sell")).toBe(true); // cloth still sellable
    s.tokens.cloth = [];
    expect(canDo(s, 0, "sell")).toBe(false);
  });

  test("sell: camels in hand/seat do not count as a good", () => {
    const s = makeState(); s.players[0].camels = 5;
    expect(canDo(s, 0, "sell")).toBe(false);
  });

  test("exchange: needs >=2 goods in market, >=2 camels, and room for +2", () => {
    const s = makeState({ market: ["cloth", "spice", "camel"] });
    s.players[0].camels = 2;
    expect(canDo(s, 0, "exchange")).toBe(true);
    s.players[0].camels = 1;
    expect(canDo(s, 0, "exchange")).toBe(false);
    s.players[0].camels = 2;
    s.market = ["cloth", "camel", "camel"];
    expect(canDo(s, 0, "exchange")).toBe(false);
    s.market = ["cloth", "spice"];
    s.players[0].hand = Array(HAND_LIMIT - 2).fill("gold");
    expect(canDo(s, 0, "exchange")).toBe(true);
    s.players[0].hand.push("gold");
    expect(canDo(s, 0, "exchange")).toBe(false);
  });

  test("unknown kind or missing player -> false", () => {
    const s = makeState({ market: ["cloth", "spice", "camel"] });
    s.players[0].camels = 3; s.players[0].hand = ["cloth"];
    expect(canDo(s, 0, "dance")).toBe(false);
    expect(canDo(s, 0, undefined as any)).toBe(false);
    for (const k of KINDS) {
      expect(canDo(s, 9, k)).toBe(false);
      expect(canDo(s, -1, k)).toBe(false);
    }
  });

  test("canDo does not mutate state", () => {
    const s = makeState({ market: ["cloth", "spice", "camel"] });
    s.players[0].camels = 3; s.players[0].hand = ["cloth"];
    const before = JSON.stringify(s);
    for (const k of KINDS) canDo(s, 0, k);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("ensureTutorialAction — makes the action possible", () => {
  test("drones: zero camels -> at least 2 camels, market size constant", () => {
    const s = makeState({ market: ["cloth", "spice", "gold", "silver", "leather"] });
    expect(canDo(s, 0, "drones")).toBe(false);
    const n = s.market.length, t = total(s);
    expect(ensureTutorialAction(s, 0, "drones")).toBe(true);
    expect(canDo(s, 0, "drones")).toBe(true);
    expect(s.market.filter((c: string) => c === "camel").length).toBeGreaterThanOrEqual(2);
    expect(s.market).toHaveLength(n);
    // displaced goods return to the deck; only the new drones are conjured (<=2)
    expect(total(s) - t).toBeLessThanOrEqual(2);
    expect(total(s)).toBeGreaterThanOrEqual(t);
  });

  test("drones: market of a single goods card still yields a camel", () => {
    const s = makeState({ market: ["cloth"] });
    expect(ensureTutorialAction(s, 0, "drones")).toBe(true);
    expect(canDo(s, 0, "drones")).toBe(true);
    expect(s.market).toHaveLength(1);
  });

  test("drones: displaced goods go back to the deck", () => {
    const s = makeState({ market: ["gold", "silver", "cloth"], deck: [] });
    ensureTutorialAction(s, 0, "drones");
    const goodsAll = [...s.deck, ...s.market].filter((c: string) => c !== "camel").sort();
    expect(goodsAll).toEqual(["cloth", "gold", "silver"]);
  });

  test("take: market all camels -> a goods card appears, market size constant", () => {
    const s = makeState({ market: ["camel", "camel", "camel"] });
    expect(canDo(s, 0, "take")).toBe(false);
    expect(ensureTutorialAction(s, 0, "take")).toBe(true);
    expect(canDo(s, 0, "take")).toBe(true);
    expect(s.market).toHaveLength(3);
  });

  test("take: market all camels and deck has no goods still works (fallback)", () => {
    const s = makeState({ market: ["camel", "camel"], deck: ["camel", "camel"] });
    expect(ensureTutorialAction(s, 0, "take")).toBe(true);
    expect(canDo(s, 0, "take")).toBe(true);
    expect(s.market).toHaveLength(2);
  });

  test("sell: empty hand -> sellable set, hand within limit", () => {
    const s = makeState();
    expect(ensureTutorialAction(s, 0, "sell")).toBe(true);
    expect(canDo(s, 0, "sell")).toBe(true);
    expect(s.players[0].hand.length).toBeLessThanOrEqual(HAND_LIMIT);
  });

  test("sell: lone rare in hand is topped up", () => {
    const s = makeState(); s.players[0].hand = ["gold"];
    expect(ensureTutorialAction(s, 0, "sell")).toBe(true);
    expect(canDo(s, 0, "sell")).toBe(true);
  });

  test("sell: full hand of unsellable cards is converted without growing", () => {
    const s = makeState(); s.players[0].hand = ["gold", "silver", "diamond", "camel", "camel", "camel", "camel"];
    expect(canDo(s, 0, "sell")).toBe(false);
    expect(ensureTutorialAction(s, 0, "sell")).toBe(true);
    expect(canDo(s, 0, "sell")).toBe(true);
    expect(s.players[0].hand).toHaveLength(HAND_LIMIT);
  });

  test("sell: picks a good whose token pile is non-empty", () => {
    const s = makeState(); s.tokens.cloth = []; s.tokens.spice = [];
    expect(ensureTutorialAction(s, 0, "sell")).toBe(true);
    expect(canDo(s, 0, "sell")).toBe(true);
  });

  test("exchange: no camels, no goods in market -> both fixed", () => {
    const s = makeState({ market: ["camel", "camel", "camel", "camel"] });
    expect(canDo(s, 0, "exchange")).toBe(false);
    const n = s.market.length;
    expect(ensureTutorialAction(s, 0, "exchange")).toBe(true);
    expect(canDo(s, 0, "exchange")).toBe(true);
    expect(s.market).toHaveLength(n);
    expect(s.players[0].camels).toBeGreaterThanOrEqual(2);
  });

  test("exchange: only camels short -> raises camels, market untouched", () => {
    const s = makeState({ market: ["cloth", "spice", "gold"] });
    s.players[0].camels = 1;
    const m = [...s.market];
    expect(ensureTutorialAction(s, 0, "exchange")).toBe(true);
    expect(s.players[0].camels).toBe(2);
    expect(s.market).toEqual(m);
    expect(canDo(s, 0, "exchange")).toBe(true);
  });

  test("exchange: only market short (1 good + camels) -> adds a good", () => {
    const s = makeState({ market: ["cloth", "camel", "camel"] });
    s.players[0].camels = 3;
    expect(ensureTutorialAction(s, 0, "exchange")).toBe(true);
    expect(canDo(s, 0, "exchange")).toBe(true);
    expect(s.market).toHaveLength(3);
    expect(s.players[0].camels).toBe(3); // not reduced
  });
});

describe("ensureTutorialAction — no-op when already possible", () => {
  const ready = () => {
    const s = makeState({ market: ["cloth", "spice", "camel", "gold"] });
    s.players[0].hand = ["leather", "gold", "gold"];
    s.players[0].camels = 3;
    return s;
  };
  for (const k of KINDS) {
    test(`${k}: returns false, state untouched`, () => {
      const s = ready();
      expect(canDo(s, 0, k)).toBe(true);
      const before = JSON.stringify(s);
      expect(ensureTutorialAction(s, 0, k)).toBe(false);
      expect(canDo(s, 0, k)).toBe(true);
      expect(JSON.stringify(s)).toBe(before);
    });
  }
  test("is idempotent: second call after a fix returns false", () => {
    for (const k of KINDS) {
      const s = makeState({ market: ["camel", "camel"] });
      ensureTutorialAction(s, 0, k);
      expect(ensureTutorialAction(s, 0, k)).toBe(false);
    }
  });
  test("works for non-zero seats too and leaves other seats alone", () => {
    const s = makeState({ market: ["camel", "camel"] });
    s.players[2].hand = ["gold"];
    const other = JSON.stringify([s.players[0], s.players[1], s.players[3]]);
    ensureTutorialAction(s, 2, "sell");
    ensureTutorialAction(s, 2, "exchange");
    expect(canDo(s, 2, "sell")).toBe(true);
    expect(canDo(s, 2, "exchange")).toBe(true);
    expect(JSON.stringify([s.players[0], s.players[1], s.players[3]])).toBe(other);
  });
});

describe("ensureTutorialAction — seeded sweep", () => {
  function rng(seed: number) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  }
  test("150 random states: every kind becomes possible, invariants hold", () => {
    const r = rng(12345);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const cards = [...GOODS, "camel", "camel"];
    for (let iter = 0; iter < 150; iter++) {
      for (const kind of KINDS) {
        const msize = 2 + Math.floor(r() * (MARKET_SIZE - 1)); // realistic: market is always >=2 slots
        const market = Array.from({ length: msize }, () => pick(cards));
        const deck = Array.from({ length: Math.floor(r() * 20) }, () => pick(cards));
        // hand room for exchange (+2) and take (+1) is always available
        const hand = Array.from({ length: Math.floor(r() * (HAND_LIMIT - 2)) }, () => pick(GOODS));
        const s = makeState({ market, deck });
        s.players[0].hand = hand;
        s.players[0].camels = Math.floor(r() * 4);
        for (const g of GOODS) if (r() < 0.3 && g !== "cloth") s.tokens[g] = [];
        const marketN = s.market.length, tot = total(s);
        const wasPossible = canDo(s, 0, kind);
        const changed = ensureTutorialAction(s, 0, kind);
        const ctx = `iter=${iter} kind=${kind}`;
        expect(canDo(s, 0, kind), ctx).toBe(true);
        expect(changed, ctx).toBe(!wasPossible);
        expect(s.players[0].hand.length, ctx).toBeLessThanOrEqual(HAND_LIMIT);
        expect(s.market.length, ctx).toBe(marketN);
        if (kind !== "sell") { expect(total(s) - tot, ctx).toBeGreaterThanOrEqual(0); expect(total(s) - tot, ctx).toBeLessThanOrEqual(2); }
      }
    }
  });
});

describe("ensureTutorialAction — hand-room guards", () => {
  const cardsIn = (s: any) => s.deck.length + s.market.length + s.players[0].hand.length;

  test("take with a full hand: pops one card to the deck, take becomes possible", () => {
    const s = makeState({ market: ["cloth", "spice", "camel"] });
    s.players[0].hand = Array(HAND_LIMIT).fill("gold");
    expect(canDo(s, 0, "take")).toBe(false);
    const deckBefore = s.deck.length, tot = cardsIn(s);
    expect(ensureTutorialAction(s, 0, "take")).toBe(true);
    expect(s.players[0].hand.length).toBeLessThan(HAND_LIMIT);
    expect(canDo(s, 0, "take")).toBe(true);
    expect(s.deck.length).toBe(deckBefore + 1);
    expect(cardsIn(s)).toBe(tot);
    expect(s.market).toHaveLength(3);
  });

  for (const handLen of [HAND_LIMIT, HAND_LIMIT - 1]) {
    test(`exchange with hand ${handLen} and 0 camels: makes room for +2 and gives camels`, () => {
      const s = makeState({ market: ["cloth", "spice", "gold", "camel"] });
      s.players[0].hand = Array(handLen).fill("leather");
      s.players[0].camels = 0;
      expect(canDo(s, 0, "exchange")).toBe(false);
      const tot = cardsIn(s), deckBefore = s.deck.length;
      expect(ensureTutorialAction(s, 0, "exchange")).toBe(true);
      expect(s.players[0].hand.length + 2).toBeLessThanOrEqual(HAND_LIMIT);
      expect(s.players[0].camels).toBeGreaterThanOrEqual(2);
      expect(canDo(s, 0, "exchange")).toBe(true);
      // popped hand cards went back to the deck, not destroyed
      expect(s.deck.length - deckBefore).toBe(handLen - s.players[0].hand.length);
      expect(cardsIn(s)).toBe(tot);
    });
  }

  test("exchange with full hand AND all-camel market: room, goods and camels all provided", () => {
    const s = makeState({ market: ["camel", "camel", "camel"] });
    s.players[0].hand = Array(HAND_LIMIT).fill("silver");
    expect(ensureTutorialAction(s, 0, "exchange")).toBe(true);
    expect(canDo(s, 0, "exchange")).toBe(true);
    expect(s.players[0].hand.length).toBeLessThanOrEqual(HAND_LIMIT - 2);
    expect(s.market).toHaveLength(3);
  });

  test("take with full hand: no-op guard untouched when hand has room", () => {
    const s = makeState({ market: ["cloth"] });
    s.players[0].hand = Array(HAND_LIMIT - 1).fill("gold");
    const before = JSON.stringify(s);
    expect(ensureTutorialAction(s, 0, "take")).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
