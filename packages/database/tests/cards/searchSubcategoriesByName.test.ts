import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.searchSubcategoriesByName", () => {
  const fx = new TestFixtures();
  let subcategoryId: number;

  beforeAll(async () => {
    const categoryId = (await fx.category({ name: `Test Search Sub Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: `Solistas de K-Pôp ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  test("matches when the query has no accents but the stored name does", async () => {
    const results = await CardsDB.searchSubcategoriesByName("Solistas de K-Pop");
    expect(results.some(r => r.id === subcategoryId)).toBe(true);
  });
});
