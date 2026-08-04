import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { db } from "../../index";
import { userDiscoteca, discotecaEntries } from "../../schemas/discoteca";
import { and, eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getEntryWithDetails / getGenreNamesForEntry / getUserDiscoteca", () => {
  const fx = new TestFixtures();
  let userId: number;
  let artistId: number;
  let artistName: string;
  let entryId: number;
  let genreId: number;
  let genreName: string;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test EntryDetails User" })).id;
    artistName = `Test Entry Details Artist ${Date.now()}`;
    artistId = (await fx.discotecaArtist({ name: artistName })).id;
    entryId = (await fx.discotecaEntry({ artistId, name: "Test Entry Details Entry" })).id;
    genreName = `Test Entry Details Genre ${Date.now()}`;
    genreId = (await fx.discotecaSubcategory({ name: genreName })).id;
    await DiscotecaDB.setEntryGenres(entryId, [genreId]);
  });

  afterAll(() => fx.cleanup());

  test("getEntryWithDetails joins artist name and rarity emoji", async () => {
    const detail = await DiscotecaDB.getEntryWithDetails(entryId);
    expect(detail?.artistId).toBe(artistId);
    expect(detail?.artistName).toBe(artistName);
    expect(detail?.rarityEmoji).toBeTruthy();
  });

  test("getGenreNamesForEntry returns the linked genre names", async () => {
    const names = await DiscotecaDB.getGenreNamesForEntry(entryId);
    expect(names).toEqual([genreName]);
  });

  test("getEntryWithDetails includes animatedArtworkUrl", async () => {
    const entryRow = await DiscotecaDB.createEntry({
      name: `Test AnimatedCover Entry ${Date.now()}`, artistId, appleMusicId: `test-animatedcover-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      animatedArtworkUrl: "https://cdn.example.com/apple-music/cover.mp4",
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id)); });

    const details = await DiscotecaDB.getEntryWithDetails(entryRow!.id);
    expect(details?.animatedArtworkUrl).toBe("https://cdn.example.com/apple-music/cover.mp4");
  });

  test("getUserDiscoteca returns undefined before any draw, the row after", async () => {
    expect(await DiscotecaDB.getUserDiscoteca(userId, entryId)).toBeUndefined();
    await DiscotecaDB.addUserDiscoteca(userId, entryId);
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, entryId))); });
    const row = await DiscotecaDB.getUserDiscoteca(userId, entryId);
    expect(row?.count).toBe(1);
  });
});
