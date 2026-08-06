import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userCards } from "../../schemas/cards";
import { eq } from "drizzle-orm";
import { CardsDB } from "../../cards";

describe("CardsDB.getCardsInSubcategoryForUserFiltered / getSubcategoryStats", () => {
  const fx = new TestFixtures();
  let userId: number;
  let subcategoryId: number;
  let rareCardId: number;
  let rareRarityName: string;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Subcat Filtered" })).id;
    const categoryId = (await fx.category({ name: `Test Subcat Filtered Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test Subcat Filtered Subcategory" })).id;

    const ownedCardIds: number[] = [];
    for (let i = 0; i < 15; i++) ownedCardIds.push((await fx.card({ name: `Subcat Filtered Owned ${i}`, subcategoryId })).id);
    for (let i = 0; i < 3; i++) await fx.card({ name: `Subcat Filtered Missing ${i}`, subcategoryId });
    rareRarityName = `Test Subcat Filtered Rare ${Date.now()}`
    const rareRarityId = (await fx.rarity({ name: rareRarityName, weight: 25 })).id;
    rareCardId = (await fx.card({ name: "Subcat Filtered Rare Card", rarityId: rareRarityId, subcategoryId })).id;

    await db.insert(userCards).values(ownedCardIds.map(cardId => ({ userId, cardId, count: 1 })));
    fx.onCleanup(async () => { await db.delete(userCards).where(eq(userCards.userId, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("getSubcategoryStats reports total/owned regardless of filter, plus a count matching the active filter", async () => {
    const unfiltered = await CardsDB.getSubcategoryStats(subcategoryId, userId, {});
    expect(unfiltered.total).toBe(19); // 15 owned + 3 missing + 1 rare (unowned)
    expect(unfiltered.owned).toBe(15);
    expect(unfiltered.filteredTotal).toBe(19);

    const ownedOnly = await CardsDB.getSubcategoryStats(subcategoryId, userId, { ownedFilter: 'owned' });
    expect(ownedOnly.total).toBe(19);
    expect(ownedOnly.filteredTotal).toBe(15);

    const rareOnly = await CardsDB.getSubcategoryStats(subcategoryId, userId, { rarityName: rareRarityName });
    expect(rareOnly.total).toBe(19);
    expect(rareOnly.filteredTotal).toBe(1);
  });

  test("paginates the owned filter", async () => {
    const page1 = await CardsDB.getCardsInSubcategoryForUserFiltered(subcategoryId, userId, { ownedFilter: 'owned', limit: 10, offset: 0 });
    expect(page1).toHaveLength(10);

    const page2 = await CardsDB.getCardsInSubcategoryForUserFiltered(subcategoryId, userId, { ownedFilter: 'owned', limit: 10, offset: 10 });
    expect(page2).toHaveLength(5);
  });

  test("the missing filter returns only unowned cards", async () => {
    const rows = await CardsDB.getCardsInSubcategoryForUserFiltered(subcategoryId, userId, { ownedFilter: 'missing', limit: 10, offset: 0 });
    expect(rows).toHaveLength(4); // 3 plain missing + the rare unowned card
    expect(rows.every(r => r.ownedCount === 0)).toBe(true);
  });

  test("combining owned+rarity filters narrows correctly", async () => {
    const rows = await CardsDB.getCardsInSubcategoryForUserFiltered(subcategoryId, userId, { ownedFilter: 'missing', rarityName: rareRarityName, limit: 10, offset: 0 })
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(rareCardId);
  });
});
