import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { CardsDB } from "../../cards";
import { db } from "../../index";
import { userCards, wishlist, cardDrawHistory, cardCustomizationSubmissions, cardSubcategories, hipotecaHoldings, hipotecaSessions, trades } from "../../schemas/cards";
import { users } from "../../schemas/users";
import { eq } from "drizzle-orm";

describe("CardsDB.mergeCards", () => {
  const fx = new TestFixtures();
  afterAll(() => fx.cleanup());

  test("merges every table referencing cards.id and deletes the source card", async () => {
    const rarityId = await anyRarityId();
    const categoryId = (await fx.category({ name: `Test Merge Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test Merge History Sub ${Date.now()}` })).id;
    const source = await fx.card({ name: "Test Merge Source Card", rarityId, subcategoryId });
    const target = await fx.card({ name: "Test Merge Target Card", rarityId, subcategoryId });

    const ownsBoth = (await fx.user({ displayName: "Test Merge Owns Both" })).id;
    const ownsSourceOnly = (await fx.user({ displayName: "Test Merge Owns Source" })).id;
    const favoritesSource = (await fx.user({ displayName: "Test Merge Favorites Source" })).id;

    // each row is inserted and its cleanup registered together, so a throw anywhere below
    // (e.g. mergeCards not yet implemented) still leaves everything reachable for teardown -
    // registering all cleanups at the end would silently skip them on an early throw.
    await db.insert(userCards).values([
      { userId: ownsBoth, cardId: source.id, count: 2 },
      { userId: ownsBoth, cardId: target.id, count: 3 },
      { userId: ownsSourceOnly, cardId: source.id, count: 5 },
    ]);
    fx.onCleanup(async () => {
      await db.delete(userCards).where(eq(userCards.cardId, target.id));
      await db.delete(userCards).where(eq(userCards.cardId, source.id));
    });

    await db.insert(wishlist).values({ userId: ownsSourceOnly, cardId: source.id, position: 0 });
    fx.onCleanup(async () => {
      await db.delete(wishlist).where(eq(wishlist.cardId, target.id));
      await db.delete(wishlist).where(eq(wishlist.cardId, source.id));
    });

    const [historyRow] = await db.insert(cardDrawHistory).values({
      userId: ownsSourceOnly, cardId: source.id, categoryId, subcategoryId,
    }).returning();
    fx.onCleanup(async () => { await db.delete(cardDrawHistory).where(eq(cardDrawHistory.id, historyRow!.id)); });

    const [submissionRow] = await db.insert(cardCustomizationSubmissions).values({
      userId: ownsSourceOnly, cardId: source.id, mediaUrl: 'https://example.com/x.jpg', mediaType: 'photo',
      submitterPlatform: 'telegram', submitterPlatformId: 'x', submitterName: 'x', submitterChatId: 'x',
    }).returning();
    fx.onCleanup(async () => { await db.delete(cardCustomizationSubmissions).where(eq(cardCustomizationSubmissions.id, submissionRow!.id)); });

    const [tradeRow] = await db.insert(trades).values({
      user1Id: ownsBoth, user2Id: ownsSourceOnly, cardsUser1: [source.id, target.id], cardsUser2: [source.id],
    }).returning();
    fx.onCleanup(async () => { await db.delete(trades).where(eq(trades.id, tradeRow!.id)); });

    await db.update(users).set({ favoriteCardId: source.id }).where(eq(users.id, favoritesSource));
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, favoritesSource)); });

    const [hipotecaSession] = await db.insert(hipotecaSessions).values({ userId: ownsBoth, staffId: ownsSourceOnly, savedLuckModifier: 100 }).returning();
    await db.insert(hipotecaHoldings).values([
      { sessionId: hipotecaSession!.id, cardId: source.id, count: 2, tradable: false },
      { sessionId: hipotecaSession!.id, cardId: target.id, count: 1, tradable: false },
    ]);
    fx.onCleanup(async () => {
      await db.delete(hipotecaHoldings).where(eq(hipotecaHoldings.sessionId, hipotecaSession!.id));
      await db.delete(hipotecaSessions).where(eq(hipotecaSessions.id, hipotecaSession!.id));
    });

    await CardsDB.mergeCards(source.id, target.id);

    const mergedRow = await db.select().from(userCards).where(eq(userCards.userId, ownsBoth));
    expect(mergedRow.find(r => r.cardId === target.id)?.count).toBe(5); // 2 (source) + 3 (target)
    expect(mergedRow.find(r => r.cardId === source.id)).toBeUndefined();

    const sourceOnlyRow = await db.select().from(userCards).where(eq(userCards.userId, ownsSourceOnly));
    expect(sourceOnlyRow.find(r => r.cardId === target.id)?.count).toBe(5);

    const wishlistRow = await db.select().from(wishlist).where(eq(wishlist.userId, ownsSourceOnly));
    expect(wishlistRow[0]?.cardId).toBe(target.id);

    const historyAfter = await db.select().from(cardDrawHistory).where(eq(cardDrawHistory.id, historyRow!.id));
    expect(historyAfter[0]?.cardId).toBe(target.id);

    const submissionAfter = await db.select().from(cardCustomizationSubmissions).where(eq(cardCustomizationSubmissions.id, submissionRow!.id));
    expect(submissionAfter[0]?.cardId).toBe(target.id);

    const tradeAfter = await db.select().from(trades).where(eq(trades.id, tradeRow!.id));
    expect(tradeAfter[0]?.cardsUser1).toEqual([target.id, target.id]);
    expect(tradeAfter[0]?.cardsUser2).toEqual([target.id]);

    const favoriteAfter = await db.select({ favoriteCardId: users.favoriteCardId }).from(users).where(eq(users.id, favoritesSource));
    expect(favoriteAfter[0]?.favoriteCardId).toBe(target.id);

    const holdingsAfter = await db.select().from(hipotecaHoldings).where(eq(hipotecaHoldings.sessionId, hipotecaSession!.id));
    expect(holdingsAfter.find(h => h.cardId === source.id)).toBeUndefined();
    expect(holdingsAfter.find(h => h.cardId === target.id)?.count).toBe(3); // 2 (source) + 1 (target)

    const sourceSubcats = await db.select().from(cardSubcategories).where(eq(cardSubcategories.cardId, source.id));
    expect(sourceSubcats).toHaveLength(0);

    const sourceCard = await CardsDB.getCardWithDetails(source.id);
    expect(sourceCard).toBeUndefined();
  });
});
