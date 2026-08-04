import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userProfiles } from "../../schemas/users";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.setFavoriteAlbum / setFavoriteSingle", () => {
  const fx = new TestFixtures();
  let userId: number;
  let albumEntryId: number;
  let singleEntryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Favorite Discoteca User" })).id;
    albumEntryId = (await fx.discotecaEntry({ type: 'album' })).id;
    singleEntryId = (await fx.discotecaEntry({ type: 'single' })).id;
  });

  afterAll(() => fx.cleanup());

  test("setFavoriteAlbum sets favoriteDiscotecaAlbumId, leaves favoriteDiscotecaSingleId alone", async () => {
    await DiscotecaDB.setFavoriteAlbum(userId, albumEntryId);
    fx.onCleanup(async () => { await db.update(userProfiles).set({ favoriteDiscotecaAlbumId: null }).where(eq(userProfiles.userId, userId)); });

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(a => a[0]!);
    expect(profile.favoriteDiscotecaAlbumId).toBe(albumEntryId);
    expect(profile.favoriteDiscotecaSingleId).toBeNull();
  });

  test("setFavoriteSingle sets favoriteDiscotecaSingleId, independent of favoriteDiscotecaAlbumId", async () => {
    await DiscotecaDB.setFavoriteSingle(userId, singleEntryId);
    fx.onCleanup(async () => { await db.update(userProfiles).set({ favoriteDiscotecaSingleId: null }).where(eq(userProfiles.userId, userId)); });

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(a => a[0]!);
    expect(profile.favoriteDiscotecaSingleId).toBe(singleEntryId);
    expect(profile.favoriteDiscotecaAlbumId).toBe(albumEntryId);
  });
});
