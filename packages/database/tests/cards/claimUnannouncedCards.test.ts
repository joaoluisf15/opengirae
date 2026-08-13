import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.claimUnannouncedCards", () => {
  const fx = new TestFixtures();
  let categoryId: number;
  let subcategoryId: number;

  beforeAll(async () => {
    categoryId = (await fx.category({ name: `Test Claim Cards Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test Claim Cards Subcategory" })).id;
    // mark the subcategory itself as already-announced (scoped to just this fixture) before any card exists in
    // it, so the cards created below are exercised through claimUnannouncedCards's own path, not swept up by
    // claimUnannouncedSubcategories's auto-claim of a fresh collection's cards.
    await CardsDB.claimUnannouncedSubcategories(new Date(), [subcategoryId]);
  });

  afterAll(() => fx.cleanup());

  test("claims a new card added to an already-announced subcategory, grouped with rarity/subcategory/category emoji", async () => {
    const cardId = (await fx.card({ name: "Test Claim Card New", subcategoryId })).id;
    const cutoff = new Date();

    const firstRun = await CardsDB.claimUnannouncedCards(cutoff, [cardId]);
    expect(firstRun).toHaveLength(1);
    const row = firstRun[0]!;
    expect(row.id).toBe(cardId);
    expect(row.subcategoryId).toBe(subcategoryId);
    expect(row.rarityEmoji).toBeTruthy();
    expect(row.subcategoryEmoji).toBeTruthy();
    expect(row.subcategoryName).toBe("Test Claim Cards Subcategory");

    const secondRun = await CardsDB.claimUnannouncedCards(cutoff, [cardId]);
    expect(secondRun).toHaveLength(0);
  });

  test("a card younger than cutoff is not claimed", async () => {
    const cardId = (await fx.card({ name: "Test Claim Card Fresh", subcategoryId })).id;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const claimed = await CardsDB.claimUnannouncedCards(oneHourAgo, [cardId]);
    expect(claimed).toHaveLength(0);
  });
});
