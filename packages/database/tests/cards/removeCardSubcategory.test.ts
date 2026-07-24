import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { cardSubcategories } from "../../schemas/cards";
import { eq, and } from "drizzle-orm";
import { CardsDB } from "../../cards";

describe("CardsDB.removeCardSubcategory", () => {
  const fx = new TestFixtures();
  let cardId: number;
  let mainSubcategoryId: number;
  let secondarySubcategoryId: number;

  beforeAll(async () => {
    const categoryId = (await fx.category({ name: `Test Category ${Date.now()}` })).id;
    mainSubcategoryId = (await fx.subcategory({ categoryId, name: `Main Sub ${Date.now()}` })).id;
    secondarySubcategoryId = (await fx.subcategory({ categoryId, name: `Secondary Sub ${Date.now()}` })).id;
    cardId = (await fx.card({ name: `Test Remove Marksub Card ${Date.now()}`, subcategoryId: mainSubcategoryId })).id;
    await CardsDB.addCardSubcategory(cardId, secondarySubcategoryId);
  });

  afterAll(() => fx.cleanup());

  test("removes a secondary subcategory entry", async () => {
    await CardsDB.removeCardSubcategory(cardId, secondarySubcategoryId);

    const rows = await db.select().from(cardSubcategories)
      .where(and(eq(cardSubcategories.cardId, cardId), eq(cardSubcategories.subcategoryId, secondarySubcategoryId)));
    expect(rows.length).toBe(0);
  });

  test("never removes the main subcategory entry", async () => {
    await CardsDB.removeCardSubcategory(cardId, mainSubcategoryId);

    const rows = await db.select().from(cardSubcategories)
      .where(and(eq(cardSubcategories.cardId, cardId), eq(cardSubcategories.subcategoryId, mainSubcategoryId)));
    expect(rows.length).toBe(1);
    expect(rows[0]?.isMain).toBe(true);
  });
});
