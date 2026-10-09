// NIGHT MARKET — layout.js tests (pure contain-fit scale math, no DOM).
// Run: `bun test`.
import { test, expect, describe } from "bun:test";
import { fitScale, STAGE_W, STAGE_H, isTooSmall, MIN_W, MIN_H, screenMode } from "../public/layout.js";

describe("constants", () => {
  test("STAGE_W is 1600", () => {
    expect(STAGE_W).toBe(1600);
  });
  test("STAGE_H is 900", () => {
    expect(STAGE_H).toBe(900);
  });
});

describe("fitScale — contain-fit correctness", () => {
  // General property: for any valid vw/vh, the resulting scaled stage must fit
  // inside the viewport on both axes, and must touch (be exactly equal to) the
  // viewport on at least one axis (that's what makes it a *contain* fit, not an
  // arbitrary shrink).
  function assertContainFit(vw: number, vh: number, stageW = STAGE_W, stageH = STAGE_H) {
    const scale = fitScale(vw, vh, stageW, stageH);
    const scaledW = scale * stageW;
    const scaledH = scale * stageH;
    expect(scaledW).toBeLessThanOrEqual(vw + 1e-9);
    expect(scaledH).toBeLessThanOrEqual(vh + 1e-9);
    const touchesW = Math.abs(scaledW - vw) < 1e-6;
    const touchesH = Math.abs(scaledH - vh) < 1e-6;
    expect(touchesW || touchesH).toBe(true);
    return scale;
  }

  test("width-bound viewport (tall/narrow relative to stage)", () => {
    // 1000x900: width ratio 1000/1600=0.625, height ratio 900/900=1 -> width-bound
    assertContainFit(1000, 900);
  });

  test("height-bound viewport (short relative to stage)", () => {
    // 1600x600: width ratio 1, height ratio 600/900=0.667 -> height-bound
    assertContainFit(1600, 600);
  });

  test("exact-fit case: 1920x1080 -> scale 1.2 (both axes ratio equal)", () => {
    const scale = fitScale(1920, 1080);
    expect(scale).toBeCloseTo(1.2, 10);
    assertContainFit(1920, 1080);
  });

  test("ultrawide upscaling: 3440x1440 -> scale 1.6, height-bound", () => {
    const scale = fitScale(3440, 1440);
    expect(scale).toBeCloseTo(1.6, 10);
    // height is the binding constraint: 1440/900=1.6 < 3440/1600=2.15
    const scaledH = scale * STAGE_H;
    expect(scaledH).toBeCloseTo(1440, 6);
    assertContainFit(3440, 1440);
  });

  test("real bug case: 1512x982 -> scale 0.945, width-bound", () => {
    const scale = fitScale(1512, 982);
    expect(scale).toBeCloseTo(0.945, 6);
    const scaledW = scale * STAGE_W;
    expect(scaledW).toBeCloseTo(1512, 6);
    assertContainFit(1512, 982);
  });

  test("small viewport downscaling stays width-bound or height-bound correctly", () => {
    assertContainFit(800, 500);
    assertContainFit(375, 812); // mobile portrait
    assertContainFit(812, 375); // mobile landscape
  });

  test("square viewport", () => {
    assertContainFit(1000, 1000);
  });
});

describe("fitScale — custom stageW/stageH args", () => {
  test("custom square stage exact fit", () => {
    const scale = fitScale(500, 500, 1000, 1000);
    expect(scale).toBeCloseTo(0.5, 10);
  });

  test("custom stage width-bound", () => {
    // stage 400x200, viewport 400x1000 -> width ratio 1, height ratio 5 -> width-bound
    const scale = fitScale(400, 1000, 400, 200);
    expect(scale).toBeCloseTo(1, 10);
  });

  test("custom stage height-bound", () => {
    // stage 400x200, viewport 1000x200 -> width ratio 2.5, height ratio 1 -> height-bound
    const scale = fitScale(1000, 200, 400, 200);
    expect(scale).toBeCloseTo(1, 10);
  });

  test("default stageW/stageH used when omitted, matches explicit STAGE_W/STAGE_H", () => {
    const withDefaults = fitScale(1920, 1080);
    const withExplicit = fitScale(1920, 1080, STAGE_W, STAGE_H);
    expect(withDefaults).toBeCloseTo(withExplicit, 10);
  });
});

describe("fitScale — degenerate inputs return 0 guard", () => {
  test("vw = 0 returns 0", () => {
    expect(fitScale(0, 900)).toBe(0);
  });

  test("vh = 0 returns 0", () => {
    expect(fitScale(1600, 0)).toBe(0);
  });

  test("vw and vh both 0 returns 0", () => {
    expect(fitScale(0, 0)).toBe(0);
  });

  test("negative vw returns 0", () => {
    expect(fitScale(-1600, 900)).toBe(0);
  });

  test("negative vh returns 0", () => {
    expect(fitScale(1600, -900)).toBe(0);
  });

  test("both negative returns 0", () => {
    expect(fitScale(-1600, -900)).toBe(0);
  });

  test("NaN vw returns 0", () => {
    expect(fitScale(NaN, 900)).toBe(0);
  });

  test("NaN vh returns 0", () => {
    expect(fitScale(1600, NaN)).toBe(0);
  });

  test("both NaN returns 0", () => {
    expect(fitScale(NaN, NaN)).toBe(0);
  });

  test("Infinity vw with finite vh is height-bound, not treated as degenerate", () => {
    // vw > 0 is true for Infinity, so this should NOT hit the guard.
    const scale = fitScale(Infinity, 900);
    expect(scale).toBeCloseTo(1, 10); // 900/900 = 1, height-bound since vw/stageW = Infinity
  });

  test("undefined args coerce to NaN and return 0", () => {
    // @ts-expect-error deliberately passing bad input to test runtime guard
    expect(fitScale(undefined, 900)).toBe(0);
  });
});

describe("isTooSmall", () => {
  test("MIN_W is 1024", () => {
    expect(MIN_W).toBe(1024);
  });

  test("MIN_H is 640", () => {
    expect(MIN_H).toBe(640);
  });

  // --- Boundary behavior (default min: 1024x640) ---

  test("exactly at minimum (1024x640) -> NOT too small", () => {
    expect(isTooSmall(1024, 640)).toBe(false);
  });

  test("one below on width only (1023x640) -> too small", () => {
    expect(isTooSmall(1023, 640)).toBe(true);
  });

  test("one below on height only (1024x639) -> too small", () => {
    expect(isTooSmall(1024, 639)).toBe(true);
  });

  test("one above minimum on both axes (1025x641) -> NOT too small", () => {
    expect(isTooSmall(1025, 641)).toBe(false);
  });

  test("comfortably above minimum -> NOT too small", () => {
    expect(isTooSmall(1920, 1080)).toBe(false);
  });

  test("comfortably below minimum -> too small", () => {
    expect(isTooSmall(320, 480)).toBe(true);
  });

  test("width ok, height small -> too small", () => {
    expect(isTooSmall(1600, 500)).toBe(true);
  });

  test("width small, height ok -> too small", () => {
    expect(isTooSmall(800, 900)).toBe(true);
  });

  test("both axes below minimum -> too small", () => {
    expect(isTooSmall(800, 500)).toBe(true);
  });

  // --- Custom minW/minH args ---

  test("custom minW/minH: at custom minimum -> NOT too small", () => {
    expect(isTooSmall(500, 300, 500, 300)).toBe(false);
  });

  test("custom minW/minH: one below custom minW -> too small", () => {
    expect(isTooSmall(499, 300, 500, 300)).toBe(true);
  });

  test("custom minW/minH: one below custom minH -> too small", () => {
    expect(isTooSmall(500, 299, 500, 300)).toBe(true);
  });

  test("custom minW/minH: comfortably above custom minimum -> NOT too small", () => {
    expect(isTooSmall(2000, 2000, 500, 300)).toBe(false);
  });

  test("custom minW only, minH defaults: below custom minW but above default minH -> too small", () => {
    // minW=2000 (custom), minH defaults to 640; vw=1900 < 2000 -> too small regardless of vh
    expect(isTooSmall(1900, 900, 2000)).toBe(true);
  });

  // --- Degenerate inputs: non-positive/NaN on either axis -> true ---

  test("vw = 0 -> too small", () => {
    expect(isTooSmall(0, 900)).toBe(true);
  });

  test("vh = 0 -> too small", () => {
    expect(isTooSmall(1600, 0)).toBe(true);
  });

  test("both 0 -> too small", () => {
    expect(isTooSmall(0, 0)).toBe(true);
  });

  test("negative vw -> too small", () => {
    expect(isTooSmall(-1024, 640)).toBe(true);
  });

  test("negative vh -> too small", () => {
    expect(isTooSmall(1024, -640)).toBe(true);
  });

  test("both negative -> too small", () => {
    expect(isTooSmall(-1024, -640)).toBe(true);
  });

  test("NaN vw -> too small", () => {
    expect(isTooSmall(NaN, 640)).toBe(true);
  });

  test("NaN vh -> too small", () => {
    expect(isTooSmall(1024, NaN)).toBe(true);
  });

  test("both NaN -> too small", () => {
    expect(isTooSmall(NaN, NaN)).toBe(true);
  });

  test("undefined args coerce to NaN -> too small", () => {
    // @ts-expect-error deliberately passing bad input to test runtime guard
    expect(isTooSmall(undefined, 640)).toBe(true);
  });

  test("Infinity vw with finite vh above min -> NOT too small (Infinity > 0 and >= minW)", () => {
    expect(isTooSmall(Infinity, 900)).toBe(false);
  });

  test("very large negative-like edge: -0 is treated as too small (not > 0)", () => {
    expect(isTooSmall(-0, 640)).toBe(true);
  });
});

describe("screenMode — landscape-only gate (NMK-67)", () => {
  test.each([
    [1920, 1080], [1366, 768], [1024, 768], [1180, 820], [1194, 834], [844, 390], [200, 100],
  ])("landscape %ix%i -> ok", (w, h) => {
    expect(screenMode(w, h)).toBe("ok");
  });

  test("square viewport is ok", () => {
    expect(screenMode(800, 800)).toBe("ok");
  });

  test.each([
    [820, 1180], [834, 1194], [768, 1024], [390, 844],
  ])("portrait %ix%i -> rotate", (w, h) => {
    expect(screenMode(w, h)).toBe("rotate");
  });

  test("boundary: vw = vh-1 rotate, vw = vh ok, vw = vh+1 ok", () => {
    expect(screenMode(499, 500)).toBe("rotate");
    expect(screenMode(500, 500)).toBe("ok");
    expect(screenMode(501, 500)).toBe("ok");
  });

  test.each([
    [0, 100], [100, 0], [0, 0], [-100, 100], [100, -100],
    [NaN, 100], [100, NaN], [undefined, 100], [100, undefined],
  ])("degenerate %p x %p -> rotate", (w, h) => {
    expect(screenMode(w as any, h as any)).toBe("rotate");
  });

  test("Infinity width with finite height does not throw and is ok", () => {
    expect(() => screenMode(Infinity, 100)).not.toThrow();
    expect(screenMode(Infinity, 100)).toBe("ok");
  });
});
