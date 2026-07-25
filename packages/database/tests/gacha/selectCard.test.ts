import { test, expect, describe } from "bun:test";
import { GachaLogic, type CardForDraw } from "../../gacha";

function card(overrides: Partial<CardForDraw> & { id: number }): CardForDraw {
  return {
    name: `Card ${overrides.id}`,
    rarityModifier: 100,
    rarityWeight: 100,
    rarityEmoji: '🃏',
    imageUrl: null,
    isCommon: false,
    ...overrides,
  };
}

describe("GachaLogic.selectCard", () => {
  test("empty pool returns undefined", () => {
    expect(GachaLogic.selectCard([], 100)).toBeUndefined();
  });

  test("luckModifier: 100 matches today's unweighted-by-luck behavior (regression)", () => {
    const pool = [card({ id: 1, isCommon: true }), card({ id: 2, isCommon: false })];
    // equal weights, so either id should appear across enough draws (statistical, not one draw)
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(GachaLogic.selectCard(pool, 100)!.id);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });

  test("luckModifier: 0 never selects a non-common card from a mixed pool", () => {
    const pool = [card({ id: 1, isCommon: true }), card({ id: 2, isCommon: false })];
    for (let i = 0; i < 200; i++) {
      expect(GachaLogic.selectCard(pool, 0)!.id).toBe(1);
    }
  });

  test("luckModifier: 0 with an all-non-common pool returns undefined (no deterministic fallback pick)", () => {
    const pool = [card({ id: 1, isCommon: false }), card({ id: 2, isCommon: false })];
    for (let i = 0; i < 50; i++) {
      expect(GachaLogic.selectCard(pool, 0)).toBeUndefined();
    }
  });

  test("a partial luckModifier statistically dampens (but doesn't eliminate) non-common selection", () => {
    const pool = [card({ id: 1, isCommon: true }), card({ id: 2, isCommon: false })];
    let nonCommonHits = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (GachaLogic.selectCard(pool, 20)!.id === 2) nonCommonHits++;
    }
    // equal weights at luckModifier 100 would be ~50%; at 20 it should be well below that.
    expect(nonCommonHits / trials).toBeLessThan(0.25);
    expect(nonCommonHits).toBeGreaterThan(0);
  });
});
