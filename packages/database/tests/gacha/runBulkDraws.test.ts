import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { users } from "../../schemas/users";
import { userCards, cardDrawHistory, subcategoryCompletionRewards } from "../../schemas/cards";
import { eq, and } from "drizzle-orm";
import { GachaLogic } from "../../gacha";
import { CardsDB } from "../../cards";

describe("GachaLogic.runBulkDraws", () => {
  const fx = new TestFixtures();
  let userId: number;
  let categoryId: number;
  let favSubId: number, favSubBId: number, emptySubId: number, favCardId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Bulk Draw" })).id;
    categoryId = (await fx.category({ name: "Test Bulk Category", emoji: "🧪" })).id;

    favSubId = (await fx.subcategory({ categoryId, name: "Test Bulk Fav Sub" })).id;
    favSubBId = (await fx.subcategory({ categoryId, name: "Test Bulk Fav Sub B" })).id;
    const otherSubId = (await fx.subcategory({ categoryId, name: "Test Bulk Other Sub" })).id;
    emptySubId = (await fx.subcategory({ categoryId, name: "Test Bulk Empty Sub" })).id; // no cards linked - forces the empty-card-pool skip

    favCardId = (await fx.card({ name: "Test Bulk Fav Card", subcategoryId: favSubId })).id;
    await fx.card({ name: "Test Bulk Fav Card B", subcategoryId: favSubBId });
    await fx.card({ name: "Test Bulk Other Card", subcategoryId: otherSubId });

    fx.onCleanup(async () => {
      await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
      await db.delete(userCards).where(eq(userCards.userId, userId));
    });
  });

  afterAll(() => fx.cleanup());

  test("with a favorite subcategory rolled, always draws from it (isFromFavorite: true)", async () => {
    const before = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);

    const { draws: results } = await GachaLogic.runBulkDraws(userId, [categoryId, categoryId, categoryId, categoryId, categoryId], 100, 1, new Set([favSubId]));

    // subcategoriesOnDraw=3 out of {fav, other, empty} means the favorite is rolled most of the time
    // across 5 draws - assert it's rolled and honored at least once (probabilistically near-certain).
    expect(results.some(r => r.isFromFavorite && r.subcategoryId === favSubId)).toBe(true);
    // never draws from the non-favorite subcategory when a favorite was actually available in that draw's roll
    for (const r of results) {
      if (r.isFromFavorite) expect(r.subcategoryId).toBe(favSubId);
    }

    const after = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);
    expect(after - before).toBe(results.length);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("with two favorite subcategories rolled together, weighted-picks among just the favorites - never the non-favorite, and actually varies which favorite wins", async () => {
    const before = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);

    const drawCount = 30;
    const { draws: results } = await GachaLogic.runBulkDraws(
      userId,
      Array(drawCount).fill(categoryId),
      100,
      1,
      new Set([favSubId, favSubBId]),
    );

    // every draw must land on one of the two favorites, never the plain "other" subcategory.
    expect(results.every(r => r.isFromFavorite)).toBe(true);
    expect(results.every(r => r.subcategoryId === favSubId || r.subcategoryId === favSubBId)).toBe(true);

    // equal weights, 30 draws all on one side is (1/2)^30 - a flake here means the weighting is broken.
    const favSubHits = results.filter(r => r.subcategoryId === favSubId).length;
    const favSubBHits = results.filter(r => r.subcategoryId === favSubBId).length;
    expect(favSubHits).toBeGreaterThan(0);
    expect(favSubBHits).toBeGreaterThan(0);
    expect(favSubHits + favSubBHits).toBe(results.length);

    const after = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);
    expect(after - before).toBe(results.length);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("with no favorites passed, falls back to plain weighted pick (isFromFavorite: false)", async () => {
    const { draws: results } = await GachaLogic.runBulkDraws(userId, [categoryId, categoryId, categoryId], 100, 1);
    expect(results.every(r => r.isFromFavorite === false)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("a category with no subcategories is skipped, not counted against usedDraws", async () => {
    const before = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);

    const { draws: results } = await GachaLogic.runBulkDraws(userId, [999999], 100, 1); // nonexistent category id
    expect(results).toEqual([]);

    const after = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);
    expect(after).toBe(before);
  });

  test("repeatedly hitting a subcategory with no cards is skipped, not counted against usedDraws", async () => {
    // force every roll toward the empty subcategory by making it the only favorite target,
    // with subcategoriesOnDraw covering all 3 subs so it's always in the rolled set
    const before = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);

    const { draws: results } = await GachaLogic.runBulkDraws(userId, [categoryId], 100, 1, new Set([emptySubId]));
    // either it drew nothing (skipped) or, if the weighted pick happened not to land on emptySubId
    // this run, it drew normally - either way usedDraws only moves by results.length
    const after = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);
    expect(after - before).toBe(results.length);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("a card drawn multiple times in one batch accumulates into a single userCards row (batched upsert)", async () => {
    // only one favorite subcategory in play, and it's the sole candidate on every roll, so every
    // one of these draws lands on favCardId - this exercises the same-card-twice-in-one-INSERT path.
    const { draws: results, countsByCard } = await GachaLogic.runBulkDraws(userId, Array(10).fill(categoryId), 100, 1, new Set([favSubId]));
    expect(results.every(r => r.card.id === favCardId)).toBe(true);

    const row = await db.select({ count: userCards.count }).from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, favCardId))).then(r => r[0]);
    expect(row?.count).toBe(results.length);

    // completedSubcategories not asserted - favSubId may already be claimed by an earlier test.
    expect(countsByCard).toHaveLength(1);
    expect(countsByCard[0]).toMatchObject({ cardId: favCardId, previousCount: 0, newCount: results.length });

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("subcategoryName reflects the card's real main subcategory, not the one it was drawn from", async () => {
    const cardId = (await fx.card({ name: "Test Bulk Multi-Sub Card", subcategoryId: favSubBId })).id;
    await CardsDB.addCardSubcategory(cardId, favSubId);

    const { draws: results } = await GachaLogic.runBulkDraws(userId, Array(20).fill(categoryId), 100, 1, new Set([favSubId]));
    const drawnAsTag = results.find(r => r.card.id === cardId && r.subcategoryId === favSubId);
    expect(drawnAsTag).toBeDefined();
    expect(drawnAsTag!.subcategoryName).not.toBe("Test Bulk Fav Sub");
    expect(drawnAsTag!.subcategoryName).toBe("Test Bulk Fav Sub B");

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("handles a large batch (n=100) across multiple categories without per-draw queries blowing up", async () => {
    const before = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);

    const { draws: results } = await GachaLogic.runBulkDraws(userId, Array(100).fill(categoryId), 100, 1, new Set([favSubId, favSubBId]));
    expect(results.length).toBe(100);
    expect(results.every(r => r.subcategoryId === favSubId || r.subcategoryId === favSubBId)).toBe(true);

    const after = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId)).then(r => r[0]!.usedDraws);
    expect(after - before).toBe(100);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("attaches completedSubcategories to the crossing entry when a batch completes a subcategory", async () => {
    const soloSubId = (await fx.subcategory({ categoryId, name: "Test Bulk Solo Completion Sub" })).id;
    const soloCardId = (await fx.card({ name: "Test Bulk Solo Completion Card", subcategoryId: soloSubId })).id;

    try {
      // enough draws that soloSubId is virtually certain to be rolled and favorited at least once.
      const { countsByCard } = await GachaLogic.runBulkDraws(userId, Array(20).fill(categoryId), 100, 1, new Set([soloSubId]));
      const entry = countsByCard.find(c => c.cardId === soloCardId);
      expect(entry).toBeDefined();
      expect(entry?.completedSubcategories).toEqual([
        { subcategoryId: soloSubId, subcategoryName: "Test Bulk Solo Completion Sub", coinsAwarded: expect.any(Number) },
      ]);
    } finally {
      await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
      await db.delete(userCards).where(eq(userCards.userId, userId));
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, soloSubId)));
    }
  });

  test("a near-zero luckModifier statistically suppresses non-common draws end-to-end", async () => {
    const legendaryRarityId = (await fx.rarity({ name: `Test Bulk Legendary ${Date.now()}`, weight: 1 })).id;
    const legendarySubId = (await fx.subcategory({ categoryId, name: `Test Bulk Legendary Sub ${Date.now()}` })).id;
    await fx.card({ name: "Test Bulk Legendary Card", rarityId: legendaryRarityId, subcategoryId: legendarySubId });

    const { draws: results } = await GachaLogic.runBulkDraws(userId, Array(50).fill(categoryId), 0, 1);
    const legendaryDraws = results.filter(r => r.subcategoryId === legendarySubId);
    // proves luckModifier reached card selection, not just subcategory selection
    expect(legendaryDraws.length).toBe(0);

    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
  });

  test("two distinct drawn cards sharing a subcategory: the completion is only claimed/paid once, not once per card", async () => {
    const sharedSubId = (await fx.subcategory({ categoryId, name: `Test Bulk Shared Sub ${Date.now()}` })).id;
    const cardAId = (await fx.card({ name: "Test Bulk Shared Card A", subcategoryId: sharedSubId })).id;
    const cardBId = (await fx.card({ name: "Test Bulk Shared Card B", subcategoryId: sharedSubId })).id;

    try {
      // enough draws that both of the sub's only 2 cards are virtually certain to be rolled.
      const { countsByCard } = await GachaLogic.runBulkDraws(userId, Array(30).fill(categoryId), 100, 1, new Set([sharedSubId]));
      const entryA = countsByCard.find(c => c.cardId === cardAId);
      const entryB = countsByCard.find(c => c.cardId === cardBId);
      expect(entryA).toBeDefined();
      expect(entryB).toBeDefined();

      const rewardRows = await db.select().from(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, sharedSubId)));
      expect(rewardRows.length).toBe(1);

      const completions = [...(entryA?.completedSubcategories ?? []), ...(entryB?.completedSubcategories ?? [])];
      expect(completions.length).toBe(1);
      expect(completions[0]?.subcategoryId).toBe(sharedSubId);
    } finally {
      await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
      await db.delete(userCards).where(eq(userCards.userId, userId));
      await db.delete(subcategoryCompletionRewards).where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, sharedSubId)));
    }
  });

  test("a secondary subcategory is never rolled, even when it's the only subcategory with cards in the category", async () => {
    const soloCategoryId = (await fx.category({ name: `Test Bulk Secondary-Only Category ${Date.now()}` })).id;
    const secondarySubId = (await fx.subcategory({ categoryId: soloCategoryId, name: "Test Bulk Secondary Sub" })).id;
    await CardsDB.updateSubcategory(secondarySubId, { isSecondary: true });
    await fx.card({ name: "Test Bulk Secondary Card", subcategoryId: secondarySubId });

    // sole subcategory is secondary, so the filtered pool is empty - must skip the category like "no subcategories at all".
    const { draws: results } = await GachaLogic.runBulkDraws(userId, Array(20).fill(soloCategoryId), 100, 1);
    expect(results).toEqual([]);
  });
});
