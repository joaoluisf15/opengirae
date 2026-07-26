import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures } from "@girae/tests";
import { CardsDB } from "@girae/database/cards";
import { db } from "@girae/database/index";
import { subcategoryCompletionRewards, userCards } from "@girae/database/schemas/cards";
import { eq, and } from "drizzle-orm";
import CollectionCommand from "../../commands/cards/clc";
import CollectionImageCommand from "../../commands/cards/clcimg";

const mock = mockTelegram();

describe("/clc and /clcimg completion backfill", () => {
  const fx = new TestFixtures();
  let authorId: string;
  let userId: number;
  let categoryId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    authorId = `test-clc-backfill-${Bun.randomUUIDv7()}`;
    userId = (await fx.user({ displayName: "Test Clc Backfill", platform: 'telegram', platformId: authorId })).id;
    categoryId = (await fx.category({ name: "Test Clc Backfill Category" })).id;
    // registered after fx.user()'s cleanup, so it runs first (LIFO) - avoids an FK violation on delete.
    fx.onCleanup(async () => { await db.delete(subcategoryCompletionRewards).where(eq(subcategoryCompletionRewards.userId, userId)); });
  });

  afterAll(() => fx.cleanup());

  // raw insert bypasses addUserCard's auto-claim, simulating a pre-existing completion never claimed.
  async function completedSubcategory(name: string) {
    const subId = (await fx.subcategory({ categoryId, name })).id;
    const cardId = (await fx.card({ name: `${name} Card`, subcategoryId: subId })).id;
    await db.insert(userCards).values({ userId, cardId, count: 1 });
    fx.onCleanup(async () => { await db.delete(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))); });
    const subcategory = (await CardsDB.getSubcategory(subId))!;
    return { subId, cardId, subcategory };
  }

  test("/clc claims and DMs on the first view of an already-complete subcategory", async () => {
    const { subcategory } = await completedSubcategory("Test Clc Backfill Sub A");

    const ctx = fakeCtx({ name: 'clc', authorId, platform: 'telegram', args: [String(subcategory.id)] });
    await CollectionCommand.execute(ctx, { subcategory });

    const claim = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subcategory.id)));
    expect(claim).toHaveLength(1);

    const dm = mock.sentMessages.find((m: any) => m.chatId === authorId && m.text?.includes(subcategory.name));
    expect(dm?.text).toContain("🎉 Parabéns! Você completou a coleção");
  });

  test("/clc is idempotent - a second view doesn't double-claim or double-DM", async () => {
    const { subcategory } = await completedSubcategory("Test Clc Backfill Sub B");

    const ctx = fakeCtx({ name: 'clc', authorId, platform: 'telegram', args: [String(subcategory.id)] });
    await CollectionCommand.execute(ctx, { subcategory });
    await CollectionCommand.execute(ctx, { subcategory });

    const claims = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subcategory.id)));
    expect(claims).toHaveLength(1);
  });

  test("/clc on a still-incomplete subcategory doesn't claim", async () => {
    const subId = (await fx.subcategory({ categoryId, name: "Test Clc Backfill Incomplete Sub" })).id;
    await fx.card({ name: "Test Clc Backfill Incomplete Card", subcategoryId: subId }); // never owned
    const subcategory = (await CardsDB.getSubcategory(subId))!;

    const ctx = fakeCtx({ name: 'clc', authorId, platform: 'telegram', args: [String(subcategory.id)] });
    await CollectionCommand.execute(ctx, { subcategory });

    const claims = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subId)));
    expect(claims).toHaveLength(0);
  });

  test("/clcimg claims and DMs on the first view of an already-complete subcategory", async () => {
    const { subcategory } = await completedSubcategory("Test Clcimg Backfill Sub");

    const ctx = fakeCtx({ name: 'clcimg', authorId, platform: 'telegram', args: [String(subcategory.id)] });
    await CollectionImageCommand.execute(ctx, { subcategory });

    const claim = await db.select().from(subcategoryCompletionRewards)
      .where(and(eq(subcategoryCompletionRewards.userId, userId), eq(subcategoryCompletionRewards.subcategoryId, subcategory.id)));
    expect(claim).toHaveLength(1);
  });
});
