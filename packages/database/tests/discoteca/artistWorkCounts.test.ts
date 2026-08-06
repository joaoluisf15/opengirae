import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userDiscoteca } from "../../schemas/discoteca";
import { and, eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getArtistWorkCounts / getArtistsPage", () => {
  const fx = new TestFixtures();
  let userId: number;
  let artistId: number;
  let ownedEntryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test ArtistCounts User" })).id;
    artistId = (await fx.discotecaArtist()).id;
    ownedEntryId = (await fx.discotecaEntry({ artistId })).id;
    await fx.discotecaEntry({ artistId });
    await DiscotecaDB.addUserDiscoteca(userId, ownedEntryId);
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, ownedEntryId))); });
  });

  afterAll(() => fx.cleanup());

  test("getArtistWorkCounts counts owned vs total for the artist", async () => {
    const counts = await DiscotecaDB.getArtistWorkCounts(userId, artistId);
    expect(counts).toEqual({ owned: 1, total: 2 });
  });

  test("getArtistsPage includes the artist with correct counts, even for a user who owns nothing", async () => {
    const otherUserId = (await fx.user({ displayName: "Test ArtistCounts Other User" })).id;
    const { total } = await DiscotecaDB.getArtistsPage(otherUserId, 1, 0);
    const page = await DiscotecaDB.getArtistsPage(otherUserId, total, 0);
    const row = page.rows.find(r => r.id === artistId);
    expect(row?.totalWorks).toBe(2);
    expect(row?.ownedWorks).toBe(0);
  });
});
