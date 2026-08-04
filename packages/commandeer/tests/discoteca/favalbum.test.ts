import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { db } from "@girae/database/index";
import { discotecaEntries, userDiscoteca } from "@girae/database/schemas/discoteca";
import { userProfiles } from "@girae/database/schemas/users";
import { eq } from "drizzle-orm";
import FavAlbumCommand from "../../commands/discoteca/favalbum";

const mock = mockTelegram();

describe("/favalbum", () => {
  const fx = new TestFixtures();
  let authorId: string;
  let userId: number;
  let albumId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    authorId = `test-favalbum-${Bun.randomUUIDv7()}`;
    userId = (await fx.user({ displayName: "Test Favalbum", platform: 'telegram', platformId: authorId })).id;
    const artistId = (await fx.discotecaArtist()).id;
    const row = await DiscotecaDB.createEntry({
      name: "Test Favalbum Album", artistId, appleMusicId: `test-favalbum-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/favalbum-art.jpg",
    });
    albumId = row!.id;
    fx.onCleanup(async () => {
      await db.update(userProfiles).set({ favoriteDiscotecaAlbumId: null }).where(eq(userProfiles.userId, userId));
      await db.delete(userDiscoteca).where(eq(userDiscoteca.entryId, albumId));
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumId));
    });
  });

  afterAll(() => fx.cleanup());

  test("refuses when the user doesn't own the album", async () => {
    const ctx = fakeCtx({ name: 'favalbum', authorId, platform: 'telegram', args: [String(albumId)] });
    await FavAlbumCommand.execute(ctx, { album: (await DiscotecaDB.getEntryWithDetails(albumId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.text).toContain("ainda não tem esse álbum");

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(r => r[0]);
    expect(profile?.favoriteDiscotecaAlbumId).toBeNull();
  });

  test("sets the favorite once the user owns it", async () => {
    await DiscotecaDB.addUserDiscoteca(userId, albumId);

    const ctx = fakeCtx({ name: 'favalbum', authorId, platform: 'telegram', args: [String(albumId)] });
    await FavAlbumCommand.execute(ctx, { album: (await DiscotecaDB.getEntryWithDetails(albumId))! });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.photo).toBe("https://example.com/favalbum-art.jpg");

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(r => r[0]);
    expect(profile?.favoriteDiscotecaAlbumId).toBe(albumId);
  });
});
