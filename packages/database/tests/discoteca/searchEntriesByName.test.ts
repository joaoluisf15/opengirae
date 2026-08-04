import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";
import { db } from "../../index";
import { discotecaEntries } from "../../schemas/discoteca";
import { inArray } from "drizzle-orm";

describe("DiscotecaDB.searchEntriesByName", () => {
  const fx = new TestFixtures();
  const suffix = Date.now();

  beforeAll(async () => {
    await fx.discotecaEntry({ name: `Café Amargo ${suffix}` });
    await fx.discotecaEntry({ name: `Unrelated Entry ${suffix}` });
  });

  afterAll(() => fx.cleanup());

  test("finds a match ignoring accents and case", async () => {
    const results = await DiscotecaDB.searchEntriesByName(`cafe amargo ${suffix}`);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe(`Café Amargo ${suffix}`);
  });

  test("returns no results for a query that matches nothing", async () => {
    const results = await DiscotecaDB.searchEntriesByName(`totally-nonexistent-${suffix}`);
    expect(results.length).toBe(0);
  });

  test("with a type filter, only matches entries of that type", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const sharedName = `Test SearchType Shared ${Date.now()}`;
    const rarityId = await anyRarityId();
    const albumId = (await DiscotecaDB.createEntry({
      name: sharedName, artistId, appleMusicId: `test-searchtype-album-${Date.now()}`, type: 'album', rarityId,
    }))!.id;
    const singleId = (await DiscotecaDB.createEntry({
      name: sharedName, artistId, appleMusicId: `test-searchtype-single-${Date.now()}`, type: 'single', rarityId,
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [albumId, singleId])); });

    const albumResults = await DiscotecaDB.searchEntriesByName(sharedName, 100, 'album');
    expect(albumResults.map(r => r.id)).toEqual([albumId]);

    const singleResults = await DiscotecaDB.searchEntriesByName(sharedName, 100, 'single');
    expect(singleResults.map(r => r.id)).toEqual([singleId]);
  });
});
