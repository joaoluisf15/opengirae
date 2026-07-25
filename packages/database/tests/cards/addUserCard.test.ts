import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userCards, subcategoryCompletionRewards } from "../../schemas/cards";
import { and, eq } from "drizzle-orm";
import { CardsDB } from "../../cards";

describe("CardsDB.addUserCard", () => {
  const fx = new TestFixtures();
  let userId: number;
  let cardId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test AddUserCard" })).id;
    cardId = (await fx.card({ name: "Test AddUserCard Card" })).id;
    fx.onCleanup(async () => { await db.delete(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))); });
  });

  afterAll(() => fx.cleanup());

  test("a fresh insert reports previousCount 0 and count 1", async () => {
    const row = await CardsDB.addUserCard(userId, cardId, 1);
    expect(row?.previousCount).toBe(0);
    expect(row?.count).toBe(1);
  });

  test("an existing row reports the pre-update count as previousCount", async () => {
    const row = await CardsDB.addUserCard(userId, cardId, 1);
    expect(row?.previousCount).toBe(1);
    expect(row?.count).toBe(2);
  });
});

describe("CardsDB.addUserCard completedSubcategories", () => {
  const fx = new TestFixtures();
  let userId: number;
  let categoryId: number;
  let subAId: number, subBId: number;
  let cardAId: number, sharedCardId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test AddUserCard Completion" })).id;
    categoryId = (await fx.category({ name: "Test AddUserCard Completion Category" })).id;
    subAId = (await fx.subcategory({ categoryId, name: "Test AddUserCard Completion Sub A" })).id;
    subBId = (await fx.subcategory({ categoryId, name: "Test AddUserCard Completion Sub B" })).id;

    cardAId = (await fx.card({ name: "Test AddUserCard Completion Card A", subcategoryId: subAId })).id;
    // tagged into both subA (main) and subB (secondary) - subB starts incomplete regardless
    sharedCardId = (await fx.card({ name: "Test AddUserCard Completion Shared Card", subcategoryId: subAId })).id;
    await CardsDB.addCardSubcategory(sharedCardId, subBId);
    await fx.card({ name: "Test AddUserCard Completion Card B Other", subcategoryId: subBId }); // keeps subB incomplete after only sharedCardId is owned

    fx.onCleanup(async () => {
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subAId)));
      await db.delete(userCards).where(eq(userCards.userId, userId));
    });
  });

  afterAll(() => fx.cleanup());

  test("granting a card that doesn't complete anything returns an empty array", async () => {
    const row = await CardsDB.addUserCard(userId, cardAId, 1);
    expect(row?.completedSubcategories).toEqual([]);
  });

  test("granting the last missing card completes only the subcategory that's actually fully owned", async () => {
    const row = await CardsDB.addUserCard(userId, sharedCardId, 1);
    expect(row?.completedSubcategories).toHaveLength(1);
    expect(row?.completedSubcategories?.[0]?.subcategoryId).toBe(subAId);
    expect(row?.completedSubcategories?.[0]?.subcategoryName).toBe("Test AddUserCard Completion Sub A");
    expect(row?.completedSubcategories?.[0]?.coinsAwarded).toBeGreaterThan(0);

    const claim = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subAId)));
    expect(claim).toHaveLength(1);
  });

  test("granting another copy of an already-claimed subcategory's card returns no new completions", async () => {
    const row = await CardsDB.addUserCard(userId, cardAId, 1);
    expect(row?.completedSubcategories).toEqual([]);
  });
});
