// NIGHT MARKET — rules engine tests.
// Practice: every engine feature/fix lands with a test here. Run: `bun test`.
import { test, expect, describe } from "bun:test";
import {
  newGame, takeCard, takeCamels, sellCards, exchangeCards, botPlay,
  buildDeck, goodsInHand, finishGame, nextRound, standings,
  GOODS, RARE, DECK_COUNTS, TOKEN_TEMPLATE, HAND_LIMIT, MARKET_SIZE,
  CAMEL_BONUS, PLAYER_COUNT, PLAYER_NAMES,
} from "../public/engine.js";

// A blank, fully-controlled state — no RNG — so behaviour is deterministic.
// Deck is stocked by default so refills don't accidentally trigger deck-exhaustion
// game-end; tests that want the end-game override `deck`/`tokens` explicitly.
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

describe("setup", () => {
  test("buildDeck has the exact card multiset", () => {
    const deck = buildDeck();
    expect(deck.length).toBe(Object.values(DECK_COUNTS).reduce((a, b) => a + b, 0)); // 92
    const counts = goodsInHand(deck);
    for (const [good, n] of Object.entries(DECK_COUNTS)) expect(counts[good]).toBe(n);
  });

  test("newGame deals 5 to each of 4 players and fills the market", () => {
    const s = newGame();
    expect(s.players).toHaveLength(PLAYER_COUNT);
    // Deal draws until 5 non-drone cards are in hand; any drones drawn are extra fleet.
    for (const p of s.players) expect(p.hand).toHaveLength(5);
    expect(s.market).toHaveLength(MARKET_SIZE);
    expect(s.turnIndex).toBe(0);
    expect(s.gameOver).toBe(false);
  });
});

describe("takeCard", () => {
  test("moves a market card to hand, refills market, advances turn", () => {
    const s = makeState({ market: ["cloth", "spice", "gold"], deck: ["leather", "leather", "silver"] });
    const r = takeCard(s, 0, 0);
    expect(r.ok).toBe(true);
    expect(s.players[0].hand).toEqual(["cloth"]);
    expect(s.market).toHaveLength(3);          // spliced one, refilled one
    expect(s.market).toContain("silver");      // refill came off the deck
    expect(s.turnIndex).toBe(1);
  });

  test("rejects taking a drone via takeCard", () => {
    const s = makeState({ market: ["camel"] });
    const r = takeCard(s, 0, 0);
    expect(r.ok).toBe(false);
    expect(s.turnIndex).toBe(0);               // turn not consumed on illegal move
  });

  test("rejects when hand is full", () => {
    const s = makeState({ market: ["cloth"], players: PLAYER_NAMES.map((name, i) => ({ id: i, name, isHuman: i === 0, hand: Array(HAND_LIMIT).fill("spice"), camels: 0, score: 0 })) });
    const r = takeCard(s, 0, 0);
    expect(r.ok).toBe(false);
  });
});

describe("takeCamels", () => {
  test("sweeps every drone into the fleet and refills", () => {
    const s = makeState({ market: ["camel", "cloth", "camel"] }); // stocked default deck
    const r = takeCamels(s, 0);
    expect(r.ok).toBe(true);
    expect(s.players[0].camels).toBe(2);
    expect(s.market.filter((c: string) => c === "camel")).toHaveLength(0);
    expect(s.market).toHaveLength(3);          // cloth + 2 refills
    expect(s.turnIndex).toBe(1);
  });

  test("rejects when no drones present", () => {
    const s = makeState({ market: ["cloth"] });
    expect(takeCamels(s, 0).ok).toBe(false);
  });
});

describe("sellCards", () => {
  test("commons: sells and banks the top token values", () => {
    const s = makeState();
    s.players[0].hand = ["cloth", "cloth"];
    s.tokens.cloth = [5, 5, 3];                 // top two are 5 + 5
    const r = sellCards(s, 0, "cloth", 2);
    expect(r.ok).toBe(true);
    expect(s.players[0].score).toBe(10);
    expect(s.tokens.cloth).toEqual([3]);
    expect(s.players[0].hand).toEqual([]);
  });

  test("rare goods cannot be sold as a single card", () => {
    const s = makeState();
    s.players[0].hand = ["gold"];
    const r = sellCards(s, 0, "gold", 1);
    expect(r.ok).toBe(false);
    expect(s.players[0].score).toBe(0);
  });

  test("selling 3+ awards a bonus token on top of the goods value", () => {
    const s = makeState();
    s.players[0].hand = ["spice", "spice", "spice"];
    s.tokens.spice = [5, 5, 3];
    s.bonus[3] = [2];                           // deterministic bonus
    const r = sellCards(s, 0, "spice", 3);
    expect(r.ok).toBe(true);
    expect(s.players[0].score).toBe(13 + 2);    // 5+5+3 goods + 2 bonus
  });

  test("cannot sell more than owned, and cannot sell from an empty pile", () => {
    const s = makeState();
    s.players[0].hand = ["cloth"];
    expect(sellCards(s, 0, "cloth", 2).ok).toBe(false);
    s.players[0].hand = ["cloth", "cloth"];
    s.tokens.cloth = [];
    expect(sellCards(s, 0, "cloth", 2).ok).toBe(false);
  });

  test("records lastSale for the price-wall animation", () => {
    const s = makeState();
    s.players[0].hand = ["cloth", "cloth"];
    s.tokens.cloth = [5, 5];
    sellCards(s, 0, "cloth", 2);
    expect(s.lastSale).toEqual({ playerIdx: 0, good: "cloth", values: [5, 5] });
  });
});

describe("exchangeCards", () => {
  test("swaps N hand cards for N market cards", () => {
    const s = makeState({ market: ["gold", "silver", "cloth"] });
    s.players[0].hand = ["leather", "leather"];
    const r = exchangeCards(s, 0, { handIdxs: [0, 1], camels: 0 }, [0, 1]);
    expect(r.ok).toBe(true);
    expect(s.players[0].hand.sort()).toEqual(["gold", "silver"]);
    expect(s.market).toContain("leather");
    expect(s.turnIndex).toBe(1);
  });

  test("rejects an exchange that would take a drone", () => {
    const s = makeState({ market: ["camel", "gold"] });
    s.players[0].hand = ["cloth", "cloth"];
    expect(exchangeCards(s, 0, { handIdxs: [0, 1], camels: 0 }, [0, 1]).ok).toBe(false);
  });

  test("rejects fewer than 2 in an exchange", () => {
    const s = makeState({ market: ["gold"] });
    s.players[0].hand = ["cloth"];
    expect(exchangeCards(s, 0, { handIdxs: [0], camels: 0 }, [0]).ok).toBe(false);
  });

  describe("drone-only give path", () => {
    test("gives N drones for N market goods: camels drop, hand gains taken cards, drones return to market, turn advances", () => {
      const s = makeState({ market: ["gold", "silver", "cloth"] });
      s.players[0].hand = ["leather"];
      s.players[0].camels = 3;
      const r = exchangeCards(s, 0, { handIdxs: [], camels: 2 }, [0, 1]);
      expect(r.ok).toBe(true);
      expect(s.players[0].camels).toBe(1);
      expect(s.players[0].hand.sort()).toEqual(["gold", "leather", "silver"]);
      // the two given drones go back into the market, the untaken "cloth" remains
      expect(s.market.filter((c) => c === "camel")).toHaveLength(2);
      expect(s.market).toContain("cloth");
      expect(s.turnIndex).toBe(1);
    });

    test("rejects when the player doesn't have enough drones, with no state mutation", () => {
      const s = makeState({ market: ["gold", "silver"] });
      s.players[0].hand = ["leather"];
      s.players[0].camels = 1; // only 1, trying to give 2
      const r = exchangeCards(s, 0, { handIdxs: [], camels: 2 }, [0, 1]);
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
      expect(s.players[0].camels).toBe(1);
      expect(s.market).toEqual(["gold", "silver"]);
      expect(s.players[0].hand).toEqual(["leather"]);
      expect(s.turnIndex).toBe(0);
    });

    test("rejects a drone-only exchange below the 2-minimum (1 drone for 1 card)", () => {
      const s = makeState({ market: ["gold"] });
      s.players[0].hand = [];
      s.players[0].camels = 1;
      const r = exchangeCards(s, 0, { handIdxs: [], camels: 1 }, [0]);
      expect(r.ok).toBe(false);
      expect(s.players[0].camels).toBe(1);
      expect(s.market).toEqual(["gold"]);
      expect(s.turnIndex).toBe(0);
    });

    test("rejects a drone-only exchange that would push the hand above HAND_LIMIT", () => {
      const s = makeState({ market: ["gold", "silver", "cloth"] });
      s.players[0].hand = Array(6).fill("leather"); // 6 + 3 taken = 9 > 7, drones don't shrink hand
      s.players[0].camels = 3;
      const r = exchangeCards(s, 0, { handIdxs: [], camels: 3 }, [0, 1, 2]);
      expect(r.ok).toBe(false);
      expect(s.players[0].camels).toBe(3);
      expect(s.players[0].hand).toHaveLength(6);
      expect(s.market).toEqual(["gold", "silver", "cloth"]);
      expect(s.turnIndex).toBe(0);
    });

    test("rejects taking a drone via a drone-only exchange", () => {
      const s = makeState({ market: ["camel", "gold"] });
      s.players[0].hand = [];
      s.players[0].camels = 2;
      const r = exchangeCards(s, 0, { handIdxs: [], camels: 2 }, [0, 1]);
      expect(r.ok).toBe(false);
      expect(s.players[0].camels).toBe(2);
      expect(s.market).toEqual(["camel", "gold"]);
      expect(s.turnIndex).toBe(0);
    });
  });
});

describe("game end", () => {
  test("three empty token piles ends the match", () => {
    const s = makeState({ market: ["cloth"], deck: ["gold"] });
    s.tokens.diamond = []; s.tokens.gold = []; s.tokens.silver = [];
    s.players[0].hand = ["cloth", "cloth"];
    s.tokens.cloth = [5, 5];
    sellCards(s, 0, "cloth", 2);                // triggers checkGameEnd
    expect(s.gameOver).toBe(true);
  });

  test("largest unique fleet earns the fixer-reputation bonus", () => {
    const s = makeState();
    s.players[0].camels = 4; s.players[1].camels = 2;
    finishGame(s);
    expect(s.players[0].score).toBe(CAMEL_BONUS);
  });

  test("tied largest fleet earns no bonus", () => {
    const s = makeState();
    s.players[0].camels = 3; s.players[1].camels = 3;
    finishGame(s);
    expect(s.players[0].score).toBe(0);
    expect(s.players[1].score).toBe(0);
  });
});

describe("bot AI", () => {
  test("bot only acts on its own turn", () => {
    const s = makeState({ turnIndex: 1 });
    const before = JSON.stringify(s);
    botPlay(s, 0);                              // not player 0's turn
    expect(JSON.stringify(s)).toBe(before);
  });

  test("bot takes a full legal turn and passes the baton", () => {
    const s = newGame();
    s.turnIndex = 1;
    botPlay(s, 1);
    expect(s.turnIndex).not.toBe(1);           // it did something and advanced
  });

  test("bot prefers the bonus sell when it holds three of a good", () => {
    const s = makeState({ turnIndex: 1 });
    s.players[1].hand = ["spice", "spice", "spice"];
    s.tokens.spice = [5, 5, 3];
    botPlay(s, 1);
    expect(s.players[1].hand).toEqual([]);     // sold all three
    expect(s.players[1].score).toBeGreaterThanOrEqual(13);
  });
});

describe("lastAction (ROC-235)", () => {
  test("takeCard records { kind: 'take', good }", () => {
    const s = makeState({ market: ["cloth", "spice"], deck: ["leather", "leather"] });
    takeCard(s, 0, 0);
    expect(s.players[0].lastAction).toEqual({ kind: "take", good: "cloth" });
  });

  test("takeCamels records { kind: 'drones', count }", () => {
    const s = makeState({ market: ["camel", "cloth", "camel"] });
    takeCamels(s, 0);
    expect(s.players[0].lastAction).toEqual({ kind: "drones", count: 2 });
  });

  test("sellCards records { kind: 'sell', good, count, gain } — plain sell (no bonus)", () => {
    const s = makeState();
    s.players[0].hand = ["cloth", "cloth"];
    s.tokens.cloth = [5, 5, 3];
    sellCards(s, 0, "cloth", 2);
    expect(s.players[0].lastAction).toEqual({ kind: "sell", good: "cloth", count: 2, gain: 10 });
    expect(s.players[0].score).toBe(s.players[0].lastAction.gain); // gain matches the exact score delta
  });

  test("sellCards records gain including the sell-3+ bonus token value", () => {
    const s = makeState();
    s.players[0].hand = ["spice", "spice", "spice"];
    s.tokens.spice = [5, 5, 3];
    s.bonus[3] = [2];
    const scoreBefore = s.players[0].score;
    sellCards(s, 0, "spice", 3);
    const gained = s.players[0].score - scoreBefore;
    expect(gained).toBe(15); // 5+5+3 goods + 2 bonus
    expect(s.players[0].lastAction).toEqual({ kind: "sell", good: "spice", count: 3, gain: 15 });
  });

  test("exchangeCards records { kind: 'exchange', count }", () => {
    const s = makeState({ market: ["gold", "silver", "cloth"] });
    s.players[0].hand = ["leather", "leather"];
    exchangeCards(s, 0, { handIdxs: [0, 1], camels: 0 }, [0, 1]);
    expect(s.players[0].lastAction).toEqual({ kind: "exchange", count: 2 });
  });

  test("newGame() starts every player's lastAction at null", () => {
    const s = newGame();
    for (const p of s.players) expect(p.lastAction).toBeNull();
  });

  test("nextRound resets every player's lastAction to null", () => {
    const s = newGame();
    // give players some lastAction state, then force the round to end
    s.players[0].lastAction = { kind: "take", good: "cloth" };
    s.players[1].lastAction = { kind: "drones", count: 1 };
    s.gameOver = true;
    const r = nextRound(s);
    expect(r.ok).toBe(true);
    for (const p of s.players) expect(p.lastAction).toBeNull();
  });

  test("a rejected action does not change lastAction (no partial write)", () => {
    const s = makeState({ market: ["camel"] });
    s.players[0].lastAction = { kind: "take", good: "leather" }; // sentinel from a prior turn
    const r1 = takeCard(s, 0, 0); // illegal: taking a drone via takeCard
    expect(r1.ok).toBe(false);
    expect(s.players[0].lastAction).toEqual({ kind: "take", good: "leather" });

    s.players[0].hand = ["cloth"];
    const r2 = sellCards(s, 0, "cloth", 2); // illegal: selling more than owned
    expect(r2.ok).toBe(false);
    expect(s.players[0].lastAction).toEqual({ kind: "take", good: "leather" });

    const r3 = exchangeCards(s, 0, { handIdxs: [0], camels: 0 }, [0]); // illegal: below 2-minimum
    expect(r3.ok).toBe(false);
    expect(s.players[0].lastAction).toEqual({ kind: "take", good: "leather" });
  });
});

describe("standings (ROC-236)", () => {
  function matchState(seals: number[], scores: number[]) {
    const s = makeState();
    s.match = { seals: seals.slice(), cumScore: [0, 0, 0, 0] };
    s.players.forEach((p: any, i: number) => (p.score = scores[i]));
    return s;
  }

  test("ranks by seals first, regardless of current-round score", () => {
    const s = matchState([1, 0, 0, 0], [0, 99, 0, 0]);
    const st = standings(s);
    expect(st[0].rank).toBe(1);
    expect(st[1].rank).toBe(2);
  });

  test("seals tie broken by current-round score", () => {
    const s = matchState([1, 1, 0, 0], [10, 20, 0, 0]);
    const st = standings(s);
    expect(st[1].rank).toBe(1); // player 1: same seals, higher score
    expect(st[0].rank).toBe(2);
  });

  test("ties share a rank; seats below get 1 + strictly-ahead count (ranks can skip)", () => {
    const s = matchState([0, 0, 0, 0], [10, 10, 5, 0]);
    const st = standings(s);
    expect(st[0].rank).toBe(1);
    expect(st[1].rank).toBe(1);
    expect(st[2].rank).toBe(3); // 2 players strictly ahead -> rank 3, skipping 2
    expect(st[3].rank).toBe(4);
  });

  test("fresh newGame(): all seals/scores 0 -> no leader for anyone", () => {
    const s = newGame();
    const st = standings(s);
    expect(st).toHaveLength(PLAYER_COUNT);
    for (const row of st) {
      expect(row.rank).toBe(1);
      expect(row.isLeader).toBe(false);
    }
  });

  test("a single clear top scorer is the sole leader", () => {
    const s = matchState([0, 0, 0, 0], [10, 5, 0, 0]);
    const st = standings(s);
    expect(st[0].isLeader).toBe(true);
    expect(st.filter((r) => r.isLeader)).toHaveLength(1);
  });

  test("genuine co-leaders (two of four tied strictly at the top) both get isLeader true", () => {
    const s = matchState([0, 0, 0, 0], [10, 10, 5, 0]);
    const st = standings(s);
    expect(st[0].isLeader).toBe(true);
    expect(st[1].isLeader).toBe(true);
    expect(st[2].isLeader).toBe(false);
    expect(st[3].isLeader).toBe(false);
  });

  test("works when state.match is absent — treats seals as 0, ranks by score alone", () => {
    const s = makeState();
    delete s.match;
    s.players[0].score = 20;
    s.players[1].score = 5;
    s.players[2].score = 5;
    s.players[3].score = 0;
    const st = standings(s);
    expect(st[0].rank).toBe(1);
    expect(st[0].isLeader).toBe(true);
    expect(st[1].rank).toBe(2);
    expect(st[2].rank).toBe(2);
    expect(st[3].rank).toBe(4);
  });
});
