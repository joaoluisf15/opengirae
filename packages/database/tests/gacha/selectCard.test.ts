import { test, expect, describe } from "bun:test";
import { GachaLogic, type CardForDraw } from "../../gacha";

function card(overrides: Partial<CardForDraw> & { id: number }): CardForDraw {
  return {
    name: `Card ${overrides.id}`,
    rarityModifier: 100,
    rarityWeight: 100,
    rarityEmoji: '🃏',
    imageUrl: null,
    rank: 1,
    ...overrides,
  };
}

describe("GachaLogic.selectCard", () => {
  test("empty pool returns undefined", () => {
    expect(GachaLogic.selectCard([], 100)).toBeUndefined();
  });

  test("luckModifier: 100 matches today's unweighted-by-luck behavior (regression)", () => {
    const pool = [card({ id: 1, rank: 0 }), card({ id: 2, rank: 1 })];
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(GachaLogic.selectCard(pool, 100)!.id);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });

  test("luckModifier: 0 never selects a non-rank-0 card from a mixed pool", () => {
    const pool = [card({ id: 1, rank: 0 }), card({ id: 2, rank: 1 })];
    for (let i = 0; i < 200; i++) {
      expect(GachaLogic.selectCard(pool, 0)!.id).toBe(1);
    }
  });

  test("luckModifier: 0 with an all-non-rank-0 pool returns undefined (no deterministic fallback pick)", () => {
    const pool = [card({ id: 1, rank: 1 }), card({ id: 2, rank: 2 })];
    for (let i = 0; i < 50; i++) {
      expect(GachaLogic.selectCard(pool, 0)).toBeUndefined();
    }
  });

  test("a partial luckModifier statistically dampens (but doesn't eliminate) rank-1 selection", () => {
    const pool = [card({ id: 1, rank: 0 }), card({ id: 2, rank: 1 })];
    let nonCommonHits = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (GachaLogic.selectCard(pool, 20)!.id === 2) nonCommonHits++;
    }
    expect(nonCommonHits / trials).toBeLessThan(0.25);
    expect(nonCommonHits).toBeGreaterThan(0);
  });

  test("a higher-luckModifier statistically favors a higher rank more than a lower one", () => {
    const pool = [card({ id: 1, rank: 0, rarityWeight: 100 }), card({ id: 2, rank: 1, rarityWeight: 100 }), card({ id: 3, rank: 2, rarityWeight: 100 })];
    let rank1Hits = 0, rank2Hits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      const id = GachaLogic.selectCard(pool, 200)!.id;
      if (id === 2) rank1Hits++;
      if (id === 3) rank2Hits++;
    }
    expect(rank2Hits).toBeGreaterThan(rank1Hits);
  });

  test("luckModifier: 100 leaves relative odds between non-zero ranks unchanged from luckModifier-unaware weighting", () => {
    const poolAt100 = [card({ id: 1, rank: 1, rarityWeight: 100 }), card({ id: 2, rank: 2, rarityWeight: 10 })];
    let id1Hits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (GachaLogic.selectCard(poolAt100, 100)!.id === 1) id1Hits++;
    }
    expect(id1Hits / trials).toBeGreaterThan(0.85);
    expect(id1Hits / trials).toBeLessThan(0.95);
  });
});
