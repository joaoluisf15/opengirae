import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures } from "@girae/tests";
import { CardsDB } from "@girae/database/cards";
import { db } from "@girae/database/index";
import { userCards } from "@girae/database/schemas/cards";
import { users } from "@girae/database/schemas/users";
import { eq, and } from "drizzle-orm";
import FavCardCommand from "../../commands/vanity/favcard";

const mock = mockTelegram();

describe("/favcard", () => {
  const fx = new TestFixtures();
  let authorId: string;
  let userId: number;
  let cardId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    authorId = `test-favcard-${Bun.randomUUIDv7()}`;
    userId = (await fx.user({ displayName: "Test Favcard", platform: 'telegram', platformId: authorId })).id;
    const rarityId = (await fx.rarity({ name: "Test Favcard Rarity" })).id;
    cardId = (await fx.card({ name: "Test Favcard Card", rarityId })).id;
    await CardsDB.updateCard(cardId, { imageUrl: "https://example.com/default-favcard.png" });
    await fx.ownCard(userId, cardId, 1);
    // must clear before the card fixture's own cleanup deletes the card, or the FK on users.favoriteCardId blocks it.
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("uses the card's default image when there's no cativeiro customization", async () => {
    const ctx = fakeCtx({ name: 'favcard', authorId, platform: 'telegram', args: [String(cardId)] });
    await FavCardCommand.execute(ctx, { card: (await CardsDB.getCardWithDetails(cardId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.photo).toBe("https://example.com/default-favcard.png");
  });

  test("prefers the card's cativeiro custom media over its default image", async () => {
    await db.update(userCards).set({ customMediaUrl: "https://example.com/custom-favcard.png", customMediaType: "photo" })
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId)));

    const ctx = fakeCtx({ name: 'favcard', authorId, platform: 'telegram', args: [String(cardId)] });
    await FavCardCommand.execute(ctx, { card: (await CardsDB.getCardWithDetails(cardId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.photo).toBe("https://example.com/custom-favcard.png");
  });
});
