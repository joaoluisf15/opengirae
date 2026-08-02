import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaArtists } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { CardsDB } from "../../cards";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getOrCreateArtist", () => {
  const fx = new TestFixtures();
  let musicCategoryId: number;
  let musicSubcategoryId: number;

  beforeAll(async () => {
    const existing = await CardsDB.getCategoryByName('Música');
    musicCategoryId = existing ? existing.id : (await fx.category({ name: 'Música', emoji: '🎸' })).id;
    musicSubcategoryId = (await fx.subcategory({ categoryId: musicCategoryId, name: `Test GetOrCreateArtist Sub ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  test("creates a new artist with an unambiguous card match, sets cardId", async () => {
    const cardName = `Test Artist Match ${Date.now()}`;
    const cardId = (await fx.card({ name: cardName, subcategoryId: musicSubcategoryId })).id;
    const appleMusicArtistId = `test-artist-${Date.now()}`;

    const artist = await DiscotecaDB.getOrCreateArtist(appleMusicArtistId, cardName);
    fx.onCleanup(async () => { await db.delete(discotecaArtists).where(eq(discotecaArtists.id, artist!.id)); });

    expect(artist?.cardId).toBe(cardId);
  });

  test("creates a new artist with no card match, leaves cardId null", async () => {
    const appleMusicArtistId = `test-artist-nomatch-${Date.now()}`;
    const artist = await DiscotecaDB.getOrCreateArtist(appleMusicArtistId, `Totally Unmatched Artist Name ${Date.now()}`);
    fx.onCleanup(async () => { await db.delete(discotecaArtists).where(eq(discotecaArtists.id, artist!.id)); });

    expect(artist?.cardId).toBeNull();
  });

  test("an ambiguous name (multiple cards match) leaves cardId null", async () => {
    const sharedName = `Test Ambiguous Artist ${Date.now()}`;
    await fx.card({ name: sharedName, subcategoryId: musicSubcategoryId });
    await fx.card({ name: sharedName, subcategoryId: musicSubcategoryId });

    const artist = await DiscotecaDB.getOrCreateArtist(`test-artist-ambiguous-${Date.now()}`, sharedName);
    fx.onCleanup(async () => { await db.delete(discotecaArtists).where(eq(discotecaArtists.id, artist!.id)); });

    expect(artist?.cardId).toBeNull();
  });

  test("a cache hit returns the existing row without re-attempting card matching", async () => {
    const appleMusicArtistId = `test-artist-cachehit-${Date.now()}`;
    const first = await DiscotecaDB.getOrCreateArtist(appleMusicArtistId, `First Name ${Date.now()}`);
    fx.onCleanup(async () => { await db.delete(discotecaArtists).where(eq(discotecaArtists.id, first!.id)); });

    const second = await DiscotecaDB.getOrCreateArtist(appleMusicArtistId, "A Completely Different Name");
    expect(second?.id).toBe(first?.id);
    expect(second?.name).toBe(first?.name);
  });
});
