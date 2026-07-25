import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { users } from "../../schemas/users";
import { userCards, hipotecaSessions, hipotecaHoldings, rarities } from "../../schemas/cards";
import { eq } from "drizzle-orm";
import { CardsDB } from "../../cards";

describe("CardsDB hipoteca methods", () => {
  const fx = new TestFixtures();
  let userId: number, staffId: number;
  let legendaryRarityId: number, commonRarityId: number;
  let legendaryCardAId: number, legendaryCardBId: number, commonCardId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Hipoteca Target" })).id;
    staffId = (await fx.user({ displayName: "Test Hipoteca Staff" })).id;

    // "Lendário" is real catalog data already seeded in the shared dev DB, not something
    // this test creates - reuse it (and never register it for cleanup deletion).
    legendaryRarityId = await db.select({ id: rarities.id }).from(rarities).where(eq(rarities.name, "Lendário")).then(r => r[0]!.id);
    commonRarityId = (await fx.rarity({ name: `Test Hipoteca Common ${Date.now()}`, weight: 1000 })).id;

    const categoryId = (await fx.category({ name: `Test Hipoteca Category ${Date.now()}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `Test Hipoteca Sub ${Date.now()}` })).id;

    legendaryCardAId = (await fx.card({ name: "Test Hipoteca Legendary A", rarityId: legendaryRarityId, subcategoryId })).id;
    legendaryCardBId = (await fx.card({ name: "Test Hipoteca Legendary B", rarityId: legendaryRarityId, subcategoryId })).id;
    commonCardId = (await fx.card({ name: "Test Hipoteca Common", rarityId: commonRarityId, subcategoryId })).id;

    await fx.ownCard(userId, legendaryCardAId, 3);
    await fx.ownCard(userId, legendaryCardBId, 1);
    await fx.ownCard(userId, commonCardId, 5);
    await UsersDB_setLuckModifier(userId, 100);
  });

  afterAll(() => fx.cleanup());

  // fixtures.ts has no luckModifier setter - raw update, test-only, prod never needs this
  async function UsersDB_setLuckModifier(id: number, value: number) {
    await db.update(users).set({ luckModifier: value }).where(eq(users.id, id));
  }

  test("getUserCardsByRarityName returns only the matching rarity's owned cards", async () => {
    const owned = await CardsDB.getUserCardsByRarityName(userId, "Lendário");
    expect(owned.map(c => c.cardId).sort()).toEqual([legendaryCardAId, legendaryCardBId].sort());
    expect(owned.find(c => c.cardId === legendaryCardAId)?.count).toBe(3);
  });

  test("getActiveHipotecaSession returns undefined when there's no hold", async () => {
    expect(await CardsDB.getActiveHipotecaSession(userId)).toBeUndefined();
  });

  test("applyHipoteca moves every Lendário row out of user_cards, saves+zeroes luckModifier, leaves Comum alone", async () => {
    const result = await CardsDB.applyHipoteca(userId, staffId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cards.map(c => c.cardId).sort()).toEqual([legendaryCardAId, legendaryCardBId].sort());

    const legendaryRowA = await db.select().from(userCards).where(eq(userCards.cardId, legendaryCardAId)).then(r => r[0]);
    expect(legendaryRowA).toBeUndefined();

    const commonRow = await db.select().from(userCards).where(eq(userCards.cardId, commonCardId)).then(r => r[0]);
    expect(commonRow?.count).toBe(5);

    const user = await db.select({ luckModifier: users.luckModifier }).from(users).where(eq(users.id, userId)).then(r => r[0]);
    expect(user?.luckModifier).toBe(0);

    const session = await CardsDB.getActiveHipotecaSession(userId);
    expect(session?.savedLuckModifier).toBe(100);
    expect(session?.holdings.length).toBe(2);
  });

  test("applyHipoteca refuses a second hold while one is already active", async () => {
    const result = await CardsDB.applyHipoteca(userId, staffId);
    expect(result).toEqual({ ok: false, reason: 'already_active' });
  });

  test("liftHipoteca restores rows, restores luckModifier, and deletes the session", async () => {
    const session = await CardsDB.getActiveHipotecaSession(userId);
    const result = await CardsDB.liftHipoteca(session!.id);
    expect(result?.cards.map(c => c.cardId).sort()).toEqual([legendaryCardAId, legendaryCardBId].sort());

    const restoredA = await db.select().from(userCards).where(eq(userCards.cardId, legendaryCardAId)).then(r => r[0]);
    expect(restoredA?.count).toBe(3);

    const user = await db.select({ luckModifier: users.luckModifier }).from(users).where(eq(users.id, userId)).then(r => r[0]);
    expect(user?.luckModifier).toBe(100);

    expect(await CardsDB.getActiveHipotecaSession(userId)).toBeUndefined();
    const orphanedHoldings = await db.select().from(hipotecaHoldings).where(eq(hipotecaHoldings.sessionId, session!.id));
    expect(orphanedHoldings.length).toBe(0); // cascade delete
  });

  test("liftHipoteca merges into an existing count if the user re-acquired a held card during the hold", async () => {
    await CardsDB.applyHipoteca(userId, staffId);
    const session = await CardsDB.getActiveHipotecaSession(userId);

    // simulates the user re-acquiring the held card another way (e.g. a staff gift) mid-hold
    await fx.ownCard(userId, legendaryCardAId, 1);

    await CardsDB.liftHipoteca(session!.id);
    const restoredA = await db.select().from(userCards).where(eq(userCards.cardId, legendaryCardAId)).then(r => r[0]);
    expect(restoredA?.count).toBe(3 + 1); // held 3 + the 1 re-acquired during the hold
  });

  test("applyHipoteca on a user with no legendary cards returns nothing_to_hold", async () => {
    const emptyUserId = (await fx.user({ displayName: "Test Hipoteca Empty" })).id;
    const result = await CardsDB.applyHipoteca(emptyUserId, staffId);
    expect(result).toEqual({ ok: false, reason: 'nothing_to_hold' });
  });
});
