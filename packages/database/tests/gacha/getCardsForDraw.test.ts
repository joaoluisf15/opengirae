import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { GachaLogic } from "../../gacha";

describe("GachaLogic.getCardsForDraw", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  test("empty subcategory returns an empty pool", async () => {
    const categoryId = (await fx.category({ name: `Test GCFD Empty Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test GCFD Empty Sub ${Date.now()}` })).id;
    const pool = await GachaLogic.getCardsForDraw(subcategoryId);
    expect(pool).toEqual([]);
  });

  test("the globally highest-weight rarity's cards get rank 0, a lower-weight rarity gets a higher rank", async () => {
    const commonRarityId = (await fx.rarity({ name: `Test GCFD Common ${Date.now()}`, weight: 999999 })).id;
    const legendaryRarityId = (await fx.rarity({ name: `Test GCFD Legendary ${Date.now()}`, weight: 1 })).id;
    const categoryId = (await fx.category({ name: `Test GCFD Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test GCFD Sub ${Date.now()}` })).id;
    const c = (await fx.card({ name: "T", rarityId: commonRarityId, subcategoryId })).id;
    const l = (await fx.card({ name: "L", rarityId: legendaryRarityId, subcategoryId })).id;

    const pool = await GachaLogic.getCardsForDraw(subcategoryId);
    expect(pool.find(p => p.id === c)?.rank).toBe(0);
    expect(pool.find(p => p.id === l)?.rank).toBeGreaterThan(0);
  });
});
