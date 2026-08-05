import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures, fakeCtx, mockTelegram } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { userCards } from "@girae/database/schemas/cards";
import { eq } from "drizzle-orm";
import CardsListCommand from "../../commands/cards/cts";

// answerer's `worker` is a process-wide singleton - mock unconditionally so this file can't
// win the race and leave others talking to real Telegram.
mockTelegram();

describe("/cts favorite card media", () => {
  const fx = new TestFixtures();
  const platformId = `test-cts-favorite-${Date.now()}`;
  let userId: number;
  let cardId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");

    userId = (await fx.user({ displayName: "Test Cts Favorite", platformId })).id;
    cardId = (await fx.card({ name: "Test Cts Favorite Card" })).id;
    await db.insert(userCards).values({ userId, cardId, count: 1, customMediaUrl: 'https://example.com/custom.mp4', customMediaType: 'video' });
    await db.update(users).set({ favoriteCardId: cardId }).where(eq(users.id, userId));
    fx.onCleanup(async () => {
      await db.delete(userCards).where(eq(userCards.userId, userId));
      await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, userId));
    });
  });

  afterAll(() => fx.cleanup());

  test("execute() doesn't throw for a user with a customized favorite card", async () => {
    const ctx = fakeCtx({ name: 'cts', authorId: platformId });
    await expect(CardsListCommand.execute(ctx)).resolves.toBeUndefined();
  });
});
