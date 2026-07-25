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

  test("common card in the pool is isCommon: true, a lower-weight rarity is false", async () => {
    const commonRarityId = (await fx.rarity({ name: `Test GCFD Common ${Date.now()}`, weight: 5000 })).id;
    const legendaryRarityId = (await fx.rarity({ name: `Test GCFD Legendary ${Date.now()}`, weight: 1 })).id;
    const categoryId = (await fx.category({ name: `Test GCFD Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test GCFD Sub ${Date.now()}` })).id;
    const c = (await fx.card({ name: "T", rarityId: commonRarityId, subcategoryId })).id;
    const l = (await fx.card({ name: "L", rarityId: legendaryRarityId, subcategoryId })).id;

    const pool = await GachaLogic.getCardsForDraw(subcategoryId);
    expect(pool.find(p => p.id === c)?.isCommon).toBe(true);
    expect(pool.find(p => p.id === l)?.isCommon).toBe(false);
  });
});
