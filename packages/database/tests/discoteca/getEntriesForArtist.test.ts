import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getEntriesForArtist / getArtistByCardId", () => {
  const fx = new TestFixtures();
  afterAll(() => fx.cleanup());

  test("returns both albums and singles for the artist, ordered, with rarity and owned info", async () => {
    const artistId = (await fx.discotecaArtist({ name: "Test Collection Artist" })).id;
    const rarityId = await anyRarityId();
    await fx.discotecaEntry({ name: "Test Collection Album", artistId, type: 'album', rarityId });
    await fx.discotecaEntry({ name: "Test Collection Single", artistId, type: 'single', rarityId });

    const rows = await DiscotecaDB.getEntriesForArtist(artistId, 0);
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.type).sort()).toEqual(['album', 'single']);
    expect(rows.every(r => r.ownedCount === 0)).toBe(true);
    expect(rows.every(r => !!r.rarityName)).toBe(true);
  });

  test("getArtistByCardId finds the artist linked to a given card, undefined otherwise", async () => {
    const artist = await fx.discotecaArtist({ name: "Test CardLookup Artist" });
    const noMatch = await DiscotecaDB.getArtistByCardId(-1);
    expect(noMatch).toBeUndefined();

    const cardId = (await fx.card({ name: `Test CardLookup Card ${Date.now()}` })).id;
    await DiscotecaDB.setArtistCard(artist.id, cardId);
    const found = await DiscotecaDB.getArtistByCardId(cardId);
    expect(found?.id).toBe(artist.id);
  });
});
