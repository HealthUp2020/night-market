import { test, expect, describe } from "bun:test";
import { COACH_STEPS, coachAdvance, coachStepAt, isAdvancingAction } from "../public/coach.js";

const last = COACH_STEPS.length - 1;

describe("COACH_STEPS", () => {
  test("is non-empty", () => {
    expect(COACH_STEPS.length).toBeGreaterThan(0);
  });

  test("every step has a non-empty title and body", () => {
    for (const s of COACH_STEPS) {
      expect(typeof s.title).toBe("string");
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(typeof s.body).toBe("string");
      expect(s.body.trim().length).toBeGreaterThan(0);
    }
  });

  test("exactly the last step is final, with a null target", () => {
    const finals = COACH_STEPS.filter((s: any) => s.final);
    expect(finals.length).toBe(1);
    expect(COACH_STEPS[last].final).toBe(true);
    expect(COACH_STEPS[last].target).toBeNull();
  });

  test("non-final steps have a truthy target", () => {
    COACH_STEPS.slice(0, last).forEach((s: any) => {
      expect(s.final).toBeFalsy();
      expect(s.target).toBeTruthy();
    });
  });
});

describe("coachAdvance", () => {
  test("increments through the middle indices", () => {
    for (let i = 0; i < last; i++) expect(coachAdvance(i)).toBe(i + 1);
  });

  test("returns 'done' only when moving past the final step", () => {
    expect(coachAdvance(last)).toBe("done");
    for (let i = 0; i < last; i++) expect(coachAdvance(i)).not.toBe("done");
  });

  test("walking from 0 reaches done in exactly length steps", () => {
    let i: number | string = 0;
    let n = 0;
    while (i !== "done") {
      i = coachAdvance(i as number);
      n++;
    }
    expect(n).toBe(COACH_STEPS.length);
  });
});

describe("coachStepAt", () => {
  test("returns the matching step for valid indices", () => {
    COACH_STEPS.forEach((s: any, i: number) => expect(coachStepAt(i)).toBe(s));
  });

  test("returns null for negative and past-the-end indices", () => {
    expect(coachStepAt(-1)).toBeNull();
    expect(coachStepAt(COACH_STEPS.length)).toBeNull();
    expect(coachStepAt(999)).toBeNull();
  });
});

describe("isAdvancingAction", () => {
  test("true for { ok: true }", () => {
    expect(isAdvancingAction({ ok: true })).toBe(true);
  });

  test("false for { ok: false }, null, undefined, and {}", () => {
    expect(isAdvancingAction({ ok: false })).toBe(false);
    expect(isAdvancingAction(null)).toBe(false);
    expect(isAdvancingAction(undefined)).toBe(false);
    expect(isAdvancingAction({})).toBe(false);
  });
});
