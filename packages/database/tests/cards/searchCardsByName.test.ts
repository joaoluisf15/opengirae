import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.searchCardsByName", () => {
  const fx = new TestFixtures();
  let cardId: number;

  beforeAll(async () => {
    const categoryId = (await fx.category({ name: `Test Search Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test Search Sub ${Date.now()}` })).id;
    cardId = (await fx.card({ name: `Súllí Tëst ${Date.now()}`, subcategoryId })).id;
  });

  afterAll(() => fx.cleanup());

  test("matches when the query has no accents but the stored name does", async () => {
    const results = await CardsDB.searchCardsByName("Sulli Test");
    expect(results.some(r => r.id === cardId)).toBe(true);
  });

  test("matches when the query has accents the stored name doesn't", async () => {
    const plainCardId = (await fx.card({ name: `Ariana Grande ${Date.now()}` })).id;
    const results = await CardsDB.searchCardsByName("Áriâna Grandé");
    expect(results.some(r => r.id === plainCardId)).toBe(true);
  });
});
