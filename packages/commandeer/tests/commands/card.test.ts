import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { renderCardSearchResults } from "../../commands/cards/card";

describe("renderCardSearchResults", () => {
  const fx = new TestFixtures();
  const prefix = `Test Card Search ${Date.now()}`;

  beforeAll(async () => {
    const categoryId = (await fx.category({ name: `${prefix} Category` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `${prefix} Subcategory` })).id;
    for (let i = 0; i < 15; i++) await fx.card({ name: `${prefix} ${i}`, subcategoryId });
  });

  afterAll(() => fx.cleanup());

  test("paginates results 10 at a time and reports totalPages/hasNext correctly", async () => {
    const page0 = await renderCardSearchResults(prefix, 0);
    expect(page0.totalPages).toBe(2);
    expect(page0.hasNext).toBe(true);
    expect(page0.content).toContain("15");

    const page1 = await renderCardSearchResults(prefix, 1);
    expect(page1.hasNext).toBe(false);
  });

  test("a query with no matches reports zero results without throwing", async () => {
    const result = await renderCardSearchResults(`${prefix}-zzz-nomatch`, 0);
    expect(result.content).toContain("**0**");
    expect(result.totalPages).toBe(1);
  });
});
