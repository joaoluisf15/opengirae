import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.claimUnannouncedSubcategories", () => {
  const fx = new TestFixtures();
  let categoryId: number;

  beforeAll(async () => {
    categoryId = (await fx.category({ name: `Test Claim Subcat Category ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  // onlyIds scopes every claim below to just this test's own fixtures - the underlying UPDATE is otherwise table-wide.

  test("claims a subcategory older than cutoff along with its cards, but only once", async () => {
    const subcategoryId = (await fx.subcategory({ categoryId, name: "Test Claim Subcategory" })).id;
    const cardId = (await fx.card({ name: "Test Claim Card", subcategoryId })).id;
    const cutoff = new Date();

    const firstRun = await CardsDB.claimUnannouncedSubcategories(cutoff, [subcategoryId]);
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.id).toBe(subcategoryId);
    expect(firstRun[0]?.categoryEmoji).toBeTruthy();
    expect(firstRun[0]?.cards.map(c => c.id)).toEqual([cardId]);
    expect(firstRun[0]?.cards[0]?.rarityEmoji).toBeTruthy();

    const secondRun = await CardsDB.claimUnannouncedSubcategories(cutoff, [subcategoryId]);
    expect(secondRun).toHaveLength(0);
  });

  test("a subcategory's cards claimed this way are excluded from claimUnannouncedCards", async () => {
    const subcategoryId = (await fx.subcategory({ categoryId, name: "Test Claim Subcategory 2" })).id;
    const cardId = (await fx.card({ name: "Test Claim Card 2", subcategoryId })).id;
    const cutoff = new Date();

    await CardsDB.claimUnannouncedSubcategories(cutoff, [subcategoryId]);
    const cardRows = await CardsDB.claimUnannouncedCards(cutoff, [cardId]);
    expect(cardRows).toHaveLength(0);
  });

  test("a subcategory younger than cutoff is not claimed", async () => {
    const subcategoryId = (await fx.subcategory({ categoryId, name: "Test Claim Subcategory Fresh" })).id;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const claimed = await CardsDB.claimUnannouncedSubcategories(oneHourAgo, [subcategoryId]);
    expect(claimed).toHaveLength(0);
  });
});
