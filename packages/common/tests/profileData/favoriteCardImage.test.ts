import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { UsersDB } from "@girae/database/users";
import { CardsDB } from "@girae/database/cards";
import { db } from "@girae/database/index";
import { userCards, cards, cardSubcategories } from "@girae/database/schemas/cards";
import { users } from "@girae/database/schemas/users";
import { eq, and } from "drizzle-orm";
import { buildProfileData } from "../../profileData";

describe("buildProfileData favorite card image resolution", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  async function makeCardWithImage(name: string, imageUrl: string): Promise<number> {
    const rarityId = (await fx.rarity({ name: `Test Profile Fav Rarity ${name}` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId: (await fx.category()).id, name: `Test Profile Fav Sub ${name}` })).id;
    const row = await CardsDB.createCard(name, rarityId, imageUrl, subcategoryId);
    const id = row!.id;
    fx.onCleanup(async () => {
      await db.delete(cardSubcategories).where(eq(cardSubcategories.cardId, id));
      await db.delete(cards).where(eq(cards.id, id));
    });
    return id;
  }

  test("uses the card's default imageUrl when there's no cativeiro customization", async () => {
    const user = await fx.user({ displayName: "Test Profile Fav Card A", platform: 'telegram' });
    const cardId = await makeCardWithImage("Test Profile Fav Card A Card", "https://example.com/default.png");
    await fx.ownCard(user.id, cardId, 1);
    await UsersDB.setFavoriteCard(user.id, cardId);
    // must clear before the card fixture's cleanup runs, or the FK on users.favoriteCardId blocks the card delete.
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, user.id)); });

    const data = await buildProfileData('telegram', user.platformId, undefined);
    expect(data?.favoriteCardImageURL).toBe("https://example.com/default.png");
  });

  test("prefers the user's cativeiro custom media over the card's default image", async () => {
    const user = await fx.user({ displayName: "Test Profile Fav Card B", platform: 'telegram' });
    const cardId = await makeCardWithImage("Test Profile Fav Card B Card", "https://example.com/default-b.png");
    await fx.ownCard(user.id, cardId, 1);
    await UsersDB.setFavoriteCard(user.id, cardId);
    // must clear before the card fixture's cleanup runs, or the FK on users.favoriteCardId blocks the card delete.
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, user.id)); });

    await db.update(userCards).set({ customMediaUrl: "https://example.com/custom.png", customMediaType: "photo" })
      .where(and(eq(userCards.userId, user.id), eq(userCards.cardId, cardId)));

    const data = await buildProfileData('telegram', user.platformId, undefined);
    expect(data?.favoriteCardImageURL).toBe("https://example.com/custom.png");
  });

  test("omits favoriteCardEmoji when there's no custom /emojicard emoji - Ditto already draws the rarity badge itself, and a fallback here would duplicate it", async () => {
    const user = await fx.user({ displayName: "Test Profile Fav Card C", platform: 'telegram' });
    const rarityId = (await fx.rarity({ name: "Test Profile Fav Rarity C", emoji: '🥇' })).id;
    const cardId = (await fx.card({ name: "Test Profile Fav Card C Card", rarityId })).id;
    await fx.ownCard(user.id, cardId, 1);
    await UsersDB.setFavoriteCard(user.id, cardId);
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, user.id)); });

    const data = await buildProfileData('telegram', user.platformId, undefined);
    expect(data?.favoriteCardEmoji).toBeUndefined();
  });

  test("prefers the /emojicard custom emoji over the card's rarity emoji", async () => {
    const user = await fx.user({ displayName: "Test Profile Fav Card D", platform: 'telegram' });
    const rarityId = (await fx.rarity({ name: "Test Profile Fav Rarity D", emoji: '🥇', cativeiroThreshold: 1 })).id;
    const cardId = (await fx.card({ name: "Test Profile Fav Card D Card", rarityId })).id;
    await fx.ownCard(user.id, cardId, 1);
    await UsersDB.setFavoriteCard(user.id, cardId);
    fx.onCleanup(async () => { await db.update(users).set({ favoriteCardId: null }).where(eq(users.id, user.id)); });
    await CardsDB.setUserCardCustomEmoji(user.id, cardId, '💎');

    const data = await buildProfileData('telegram', user.platformId, undefined);
    expect(data?.favoriteCardEmoji).toBe('💎');
  });
});
