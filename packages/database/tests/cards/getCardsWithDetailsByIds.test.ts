import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.getCardsWithDetailsByIds", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  test("returns joined details for every requested id, in no particular guaranteed order", async () => {
    const category = await fx.category();
    const subcategory = await fx.subcategory({ categoryId: category.id, name: `Test Subcat ${Bun.randomUUIDv7()}` });
    const nameA = `Test Card A ${Bun.randomUUIDv7()}`;
    const nameB = `Test Card B ${Bun.randomUUIDv7()}`;
    const cardA = await fx.card({ name: nameA, subcategoryId: subcategory.id });
    const cardB = await fx.card({ name: nameB, subcategoryId: subcategory.id });

    const rows = await CardsDB.getCardsWithDetailsByIds([cardA.id, cardB.id]);
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.name).sort()).toEqual([nameA, nameB].sort());
    expect(rows.every(r => r.subcategoryName === subcategory.name)).toBe(true);
  });

  test("empty input returns an empty array without querying", async () => {
    expect(await CardsDB.getCardsWithDetailsByIds([])).toEqual([]);
  });
});
