import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.getSubcategoryIdsForCard", () => {
  const fx = new TestFixtures();
  let categoryId: number;
  let mainSubId: number, secondarySubId: number;
  let taggedCardId: number, untaggedCardId: number;

  beforeAll(async () => {
    categoryId = (await fx.category({ name: "Test SubIdsForCard Category" })).id;
    mainSubId = (await fx.subcategory({ categoryId, name: "Test SubIdsForCard Main" })).id;
    secondarySubId = (await fx.subcategory({ categoryId, name: "Test SubIdsForCard Secondary" })).id;

    taggedCardId = (await fx.card({ name: "Test SubIdsForCard Tagged Card", subcategoryId: mainSubId })).id;
    await CardsDB.addCardSubcategory(taggedCardId, secondarySubId);

    untaggedCardId = (await fx.card({ name: "Test SubIdsForCard Untagged Card" })).id;
  });

  afterAll(() => fx.cleanup());

  test("returns both the main and secondary subcategories a card is tagged into", async () => {
    const ids = await CardsDB.getSubcategoryIdsForCard(taggedCardId);
    expect(ids.sort()).toEqual([mainSubId, secondarySubId].sort());
  });

  test("returns an empty array for a card with no subcategory tags", async () => {
    const ids = await CardsDB.getSubcategoryIdsForCard(untaggedCardId);
    expect(ids).toEqual([]);
  });
});
