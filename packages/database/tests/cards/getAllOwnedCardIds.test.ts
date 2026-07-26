import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { CardsDB } from "../../cards";

describe("CardsDB.getAllOwnedCardIds", () => {
  const fx = new TestFixtures();
  let userId: number;
  let cardAId: number, cardBId: number, cardCId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test GAOCI User" })).id;
    const categoryId = (await fx.category({ name: `Test GAOCI Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test GAOCI Sub ${Date.now()}` })).id;
    cardAId = (await fx.card({ name: `Test GAOCI Card A ${Date.now()}`, subcategoryId })).id;
    cardBId = (await fx.card({ name: `Test GAOCI Card B ${Date.now()}`, subcategoryId })).id;
    cardCId = (await fx.card({ name: `Test GAOCI Card C ${Date.now()}`, subcategoryId })).id;

    await fx.ownCard(userId, cardAId, 3);
    await fx.ownCard(userId, cardBId, 1);
  });

  afterAll(() => fx.cleanup());

  test("returns every card the user owns with count > 0, and only those", async () => {
    const owned = await CardsDB.getAllOwnedCardIds(userId);
    const byId = new Map(owned.map(o => [o.cardId, o.count]));
    expect(byId.get(cardAId)).toBe(3);
    expect(byId.get(cardBId)).toBe(1);
    expect(byId.has(cardCId)).toBe(false);
  });

  test("a user who owns nothing gets an empty array", async () => {
    const emptyUserId = (await fx.user({ displayName: "Test GAOCI Empty User" })).id;
    expect(await CardsDB.getAllOwnedCardIds(emptyUserId)).toEqual([]);
  });
});
