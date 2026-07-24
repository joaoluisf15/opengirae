import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

// covers the three states /marksub's toggle branches on: no entry, secondary entry, main entry
describe("CardsDB.getCardSubcategoryEntry", () => {
  const fx = new TestFixtures();
  let cardId: number;
  let mainSubcategoryId: number;
  let secondarySubcategoryId: number;
  let unrelatedSubcategoryId: number;

  beforeAll(async () => {
    const categoryId = (await fx.category({ name: `Test Category ${Date.now()}` })).id;
    mainSubcategoryId = (await fx.subcategory({ categoryId, name: `Main Sub ${Date.now()}` })).id;
    secondarySubcategoryId = (await fx.subcategory({ categoryId, name: `Secondary Sub ${Date.now()}` })).id;
    unrelatedSubcategoryId = (await fx.subcategory({ categoryId, name: `Unrelated Sub ${Date.now()}` })).id;
    cardId = (await fx.card({ name: `Test Entry Marksub Card ${Date.now()}`, subcategoryId: mainSubcategoryId })).id;
    await CardsDB.addCardSubcategory(cardId, secondarySubcategoryId);
  });

  afterAll(() => fx.cleanup());

  test("returns undefined when the card has no entry for that subcategory", async () => {
    expect(await CardsDB.getCardSubcategoryEntry(cardId, unrelatedSubcategoryId)).toBeUndefined();
  });

  test("returns isMain: false for a secondary entry", async () => {
    const entry = await CardsDB.getCardSubcategoryEntry(cardId, secondarySubcategoryId);
    expect(entry?.isMain).toBe(false);
  });

  test("returns isMain: true for the main entry", async () => {
    const entry = await CardsDB.getCardSubcategoryEntry(cardId, mainSubcategoryId);
    expect(entry?.isMain).toBe(true);
  });
});
