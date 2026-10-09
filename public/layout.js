// ---- NIGHT MARKET — pure layout math (no DOM) ----
// Kept DOM-free so it's unit-testable under `bun test`. game.js imports these;
// fitStage() applies the result as a CSS transform.

export const STAGE_W = 1600;
export const STAGE_H = 900;

// Contain-fit scale: largest uniform scale that fits the STAGE_W×STAGE_H stage inside
// a vw×vh viewport without cropping either axis. Guards against zero/negative/NaN inputs.
export function fitScale(vw, vh, stageW = STAGE_W, stageH = STAGE_H) {
  if (!(vw > 0) || !(vh > 0)) return 0;
  return Math.min(vw / stageW, vh / stageH);
}

// Minimum viewport the desktop stage is usable at; below this we show the "too small"
// fallback instead of an unreadable squeeze (phones are handled later by the Mobile epic).
export const MIN_W = 1024;
export const MIN_H = 640;

// True when the viewport is below the minimum on either axis. Non-positive/NaN inputs
// count as too small (a 0-size viewport can't show the stage).
export function isTooSmall(vw, vh, minW = MIN_W, minH = MIN_H) {
  if (!(vw > 0) || !(vh > 0)) return true;
  return vw < minW || vh < minH;
}

// The game plays in LANDSCAPE only for now (a dedicated mobile/portrait layout is the Mobile
// epic, built later). Decide what a viewport should show: render the contain-scaled stage, or
// ask the player to rotate. Landscape renders at any size (it just scales down); portrait — and
// any non-positive/NaN input — shows the rotate hint instead of an unusable squeeze.
export function screenMode(vw, vh) {
  if (!(vw > 0) || !(vh > 0)) return "rotate";
  return vw >= vh ? "ok" : "rotate";
}
