import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { db } from "@girae/database/index";
import { discotecaEntries, userDiscoteca } from "@girae/database/schemas/discoteca";
import { userProfiles } from "@girae/database/schemas/users";
import { eq } from "drizzle-orm";
import FavSingleCommand from "../../commands/discoteca/favsingle";

const mock = mockTelegram();

describe("/favsingle", () => {
  const fx = new TestFixtures();
  let authorId: string;
  let userId: number;
  let singleId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    authorId = `test-favsingle-${Bun.randomUUIDv7()}`;
    userId = (await fx.user({ displayName: "Test Favsingle", platform: 'telegram', platformId: authorId })).id;
    const artistId = (await fx.discotecaArtist()).id;
    const row = await DiscotecaDB.createEntry({
      name: "Test Favsingle Single", artistId, appleMusicId: `test-favsingle-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/favsingle-art.jpg",
    });
    singleId = row!.id;
    fx.onCleanup(async () => {
      await db.update(userProfiles).set({ favoriteDiscotecaSingleId: null }).where(eq(userProfiles.userId, userId));
      await db.delete(userDiscoteca).where(eq(userDiscoteca.entryId, singleId));
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, singleId));
    });
  });

  afterAll(() => fx.cleanup());

  test("refuses when the user doesn't own the single", async () => {
    const ctx = fakeCtx({ name: 'favsingle', authorId, platform: 'telegram', args: [String(singleId)] });
    await FavSingleCommand.execute(ctx, { single: (await DiscotecaDB.getEntryWithDetails(singleId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.text).toContain("ainda não tem esse single");

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(r => r[0]);
    expect(profile?.favoriteDiscotecaSingleId).toBeNull();
  });

  test("sets the favorite once the user owns it", async () => {
    await DiscotecaDB.addUserDiscoteca(userId, singleId);

    const ctx = fakeCtx({ name: 'favsingle', authorId, platform: 'telegram', args: [String(singleId)] });
    await FavSingleCommand.execute(ctx, { single: (await DiscotecaDB.getEntryWithDetails(singleId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.photo).toBe("https://example.com/favsingle-art.jpg");

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(r => r[0]);
    expect(profile?.favoriteDiscotecaSingleId).toBe(singleId);
  });
});
