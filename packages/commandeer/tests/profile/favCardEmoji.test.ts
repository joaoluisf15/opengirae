import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures } from "@girae/tests";
import { CardsDB } from "@girae/database/cards";
import { UsersDB } from "@girae/database/users";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { eq } from "drizzle-orm";
import ProfileCommand from "../../commands/users/profile";

const mock = mockTelegram();

// Regression: buildProfileData's Ditto image already preferred the /emojicard custom emoji
// over the card's rarity emoji, but the caption text below the photo kept using the plain
// rarity emoji unconditionally - showing a mismatched (or, with no custom emoji, visually
// doubled) rarity emoji instead of the single substituted one the image already showed.
describe("/perfil favorite card caption emoji", () => {
  const fx = new TestFixtures();
  let authorId: string;
  let userId: number;
  let cardId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    authorId = `test-perfil-favemoji-${Bun.randomUUIDv7()}`;
    userId = (await fx.user({ displayName: "Test Perfil FavEmoji", platform: 'telegram', platformId: authorId })).id;
    const rarityId = (await fx.rarity({ name: "Test Perfil FavEmoji Rarity", emoji: '🥈', cativeiroThreshold: 1 })).id;
    cardId = (await fx.card({ name: "Test Perfil FavEmoji Card", rarityId })).id;
    await fx.ownCard(userId, cardId, 1);
    await UsersDB.setFavoriteCard(userId, cardId);
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("shows the rarity emoji when there's no custom /emojicard emoji", async () => {
    const ctx = fakeCtx({ name: 'perfil', authorId, platform: 'telegram' });
    await ProfileCommand.execute(ctx, {});

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.caption).toContain(`🥈 <code>${cardId}</code>. <strong>Test Perfil FavEmoji Card</strong>`);
  });

  test("substitutes the custom /emojicard emoji in place of the rarity emoji, not alongside it", async () => {
    await CardsDB.setUserCardCustomEmoji(userId, cardId, '💎');

    const ctx = fakeCtx({ name: 'perfil', authorId, platform: 'telegram' });
    await ProfileCommand.execute(ctx, {});

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.caption).toContain(`💎 <code>${cardId}</code>. <strong>Test Perfil FavEmoji Card</strong>`);
    expect(msg.caption).not.toContain(`🥈 <code>${cardId}</code>`);
  });
});
