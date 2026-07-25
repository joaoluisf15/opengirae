import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { rarities, userCards, subcategoryCompletionRewards } from "../../schemas/cards";
import { users } from "../../schemas/users";
import { eq, and } from "drizzle-orm";
import { CardsDB } from "../../cards";
import { EconomyDB } from "../../economy";
import { CARD_DISCARD_REWARDS, SUBCATEGORY_COMPLETION_BONUS_MULTIPLIER } from "../../constants";

describe("CardsDB.claimSubcategoryCompletionReward", () => {
  const fx = new TestFixtures();
  let userId: number;
  let categoryId: number;
  let comumRarityId: number, raroRarityId: number;
  let subId: number;
  let cardComumId: number, cardComum2Id: number, cardRaroId: number;
  let emptySubId: number;

  beforeAll(async () => {
    const [comum] = await db.select().from(rarities).where(eq(rarities.name, "Comum")).limit(1);
    const [raro] = await db.select().from(rarities).where(eq(rarities.name, "Raro")).limit(1);
    comumRarityId = comum!.id;
    raroRarityId = raro!.id;

    userId = (await fx.user({ displayName: "Test Completion Reward" })).id;
    categoryId = (await fx.category({ name: "Test Completion Reward Category" })).id;
    subId = (await fx.subcategory({ categoryId, name: "Test Completion Reward Sub" })).id;
    emptySubId = (await fx.subcategory({ categoryId, name: "Test Completion Reward Empty Sub" })).id;

    cardComumId = (await fx.card({ name: "Test Completion Comum A", rarityId: comumRarityId, subcategoryId: subId })).id;
    cardComum2Id = (await fx.card({ name: "Test Completion Comum B", rarityId: comumRarityId, subcategoryId: subId })).id;
    cardRaroId = (await fx.card({ name: "Test Completion Raro", rarityId: raroRarityId, subcategoryId: subId })).id;

    fx.onCleanup(async () => {
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subId)));
    });
  });

  afterAll(() => fx.cleanup());

  // bypasses CardsDB.addUserCard's own completion-claim side effect, to test the claim in isolation.
  async function ownCardRaw(cardId: number, count: number) {
    await db.insert(userCards).values({ userId, cardId, count }).onConflictDoUpdate({ target: [userCards.userId, userCards.cardId], set: { count } });
    fx.onCleanup(async () => { await db.delete(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))); });
  }

  const expectedReward = () => Math.round((CARD_DISCARD_REWARDS.Comum! * 2 + CARD_DISCARD_REWARDS.Raro!) * SUBCATEGORY_COMPLETION_BONUS_MULTIPLIER);

  test("an incomplete subcategory can't be claimed", async () => {
    const result = await CardsDB.claimSubcategoryCompletionReward(userId, subId);
    expect(result).toEqual({ ok: false, reason: 'not_complete' });
  });

  test("an empty subcategory (no cards) can never be claimed", async () => {
    const result = await CardsDB.claimSubcategoryCompletionReward(userId, emptySubId);
    expect(result).toEqual({ ok: false, reason: 'not_complete' });
  });

  test("owning every card claims the reward, matches the formula, and credits coins", async () => {
    await ownCardRaw(cardComumId, 1);
    await ownCardRaw(cardComum2Id, 1);
    await ownCardRaw(cardRaroId, 1);

    const [before] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId));

    const result = await CardsDB.claimSubcategoryCompletionReward(userId, subId);
    expect(result).toEqual({ ok: true, coinsAwarded: expectedReward() });

    const [after] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId));
    expect(after!.coins - before!.coins).toBe(expectedReward());

    const [claim] = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subId)));
    expect(claim?.coinsAwarded).toBe(expectedReward());
  });

  test("claiming a second time is a no-op - no double credit", async () => {
    const [before] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId));

    const result = await CardsDB.claimSubcategoryCompletionReward(userId, subId);
    expect(result).toEqual({ ok: false, reason: 'not_complete' });

    const [after] = await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId));
    expect(after!.coins).toBe(before!.coins);
  });

  test("reward scales with incomeInflationRate", async () => {
    // fresh subcategory so this test doesn't collide with the already-claimed one above
    const rateSubId = (await fx.subcategory({ categoryId, name: "Test Completion Reward Rate Sub" })).id;
    const rateCardId = (await fx.card({ name: "Test Completion Reward Rate Card", rarityId: comumRarityId, subcategoryId: rateSubId })).id;
    await ownCardRaw(rateCardId, 1);

    const originalRate = await EconomyDB.getIncomeInflationRate();
    await EconomyDB.setIncomeInflationRate(2);
    try {
      const result = await CardsDB.claimSubcategoryCompletionReward(userId, rateSubId);
      expect(result).toEqual({ ok: true, coinsAwarded: Math.round(CARD_DISCARD_REWARDS.Comum! * SUBCATEGORY_COMPLETION_BONUS_MULTIPLIER * 2) });
    } finally {
      await EconomyDB.setIncomeInflationRate(originalRate);
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, rateSubId)));
    }
  });

  test("concurrent claims for the same (user, subcategory) only credit once", async () => {
    const raceSubId = (await fx.subcategory({ categoryId, name: "Test Completion Reward Race Sub" })).id;
    const raceCardId = (await fx.card({ name: "Test Completion Reward Race Card", rarityId: comumRarityId, subcategoryId: raceSubId })).id;
    await ownCardRaw(raceCardId, 1);

    try {
      const [first, second] = await Promise.all([
        CardsDB.claimSubcategoryCompletionReward(userId, raceSubId),
        CardsDB.claimSubcategoryCompletionReward(userId, raceSubId),
      ]);
      const oks = [first, second].filter(r => r.ok);
      expect(oks).toHaveLength(1);

      const claims = await db.select().from(subcategoryCompletionRewards)
        .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, raceSubId)));
      expect(claims).toHaveLength(1);
    } finally {
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, raceSubId)));
    }
  });

  test("a concurrent discard that lands first makes the claim fail atomically - not just checked separately", async () => {
    const toctouSubId = (await fx.subcategory({ categoryId, name: "Test Completion Reward TOCTOU Sub" })).id;
    const toctouCardId = (await fx.card({ name: "Test Completion Reward TOCTOU Card", rarityId: comumRarityId, subcategoryId: toctouSubId })).id;
    await ownCardRaw(toctouCardId, 1);

    // simulate a discard finishing right before the claim runs
    await db.update(userCards).set({ count: 0 }).where(and(eq(userCards.userId, userId), eq(userCards.cardId, toctouCardId)));

    const result = await CardsDB.claimSubcategoryCompletionReward(userId, toctouSubId);
    expect(result).toEqual({ ok: false, reason: 'not_complete' });

    const claims = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, toctouSubId)));
    expect(claims).toHaveLength(0);
  });
});
