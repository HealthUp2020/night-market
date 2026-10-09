// Interactive hands-on tutorial (NMK-57) — pure step model + advancement, DOM-free so it's
// unit-testable. The DOM wiring (non-blocking overlay, highlight, first-run prompt) lives in
// game.js. Loose gating: any valid player action advances one step.

// Each non-final step names the action it teaches (`kind`), so the renderer can guarantee the live
// board supports that action before prompting it and highlight the exact cards (NMK-66).
export const COACH_STEPS = [
  { kind: "take", target: ".market", title: "Take a card",
    body: "Click a good in the market, then press the action button to take it into your hand." },
  { kind: "sell", target: "#hand", title: "Sell for Gold",
    body: "Select matching goods in your hand and sell them to bank Gold — selling 3+ earns a bonus token." },
  { kind: "drones", target: ".market", title: "Sweep the drones",
    body: "Take the drones from the market. They don't clog your hand, and the largest fleet earns the +5 Gold Fixer bonus." },
  { kind: "exchange", target: ".market", title: "Exchange",
    body: "Pick 2+ market cards and pay the same number of drones from your fleet to grab them all in one move." },
  { kind: null, target: null, final: true, title: "You're set, Operator",
    body: "That's the game — bank the most Gold each round and seal two of three to win. The board's yours." },
];

// Given the current step index, the next index after a valid action — or "done" past the last.
export function coachAdvance(index) {
  return index + 1 >= COACH_STEPS.length ? "done" : index + 1;
}

export function coachStepAt(index) {
  return COACH_STEPS[index] || null;
}

// Does an engine action result count as a move that advances the tutorial? (loose gating)
export function isAdvancingAction(res) {
  return !!(res && res.ok);
}
