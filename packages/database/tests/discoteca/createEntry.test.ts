import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { db } from "../../index";
import { discotecaEntries } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.createEntry / getEntry", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  test("creates an entry and reads it back with getEntry", async () => {
    const rarityId = await anyRarityId();
    const artistId = (await fx.discotecaArtist()).id;
    const appleMusicId = `test-apple-music-${Date.now()}`;
    const created = await DiscotecaDB.createEntry({
      name: "Test Album",
      artistId,
      appleMusicId,
      type: 'album',
      rarityId,
      artworkUrl: "https://example.com/art.jpg",
    });
    const id = created!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, id)); });

    expect(created?.appleMusicId).toBe(appleMusicId);
    expect(created?.type).toBe('album');
    expect(created?.rarityModifier).toBe(100);

    const fetched = await DiscotecaDB.getEntry(id);
    expect(fetched?.name).toBe("Test Album");
  });

  test("a single can link to its parent album via albumId, and losing the album sets it null", async () => {
    const rarityId = await anyRarityId();
    const artistId = (await fx.discotecaArtist()).id;
    const albumAppleMusicId = `test-apple-music-album-${Date.now()}`;
    const album = await DiscotecaDB.createEntry({
      name: "Test Parent Album",
      artistId,
      appleMusicId: albumAppleMusicId,
      type: 'album',
      rarityId,
    });
    const albumId = album!.id;

    const single = await DiscotecaDB.createEntry({
      name: "Test Single",
      artistId,
      appleMusicId: `test-apple-music-single-${Date.now()}`,
      type: 'single',
      rarityId,
      albumAppleMusicId,
      albumId,
    });
    const singleId = single!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, singleId)); });

    const fetchedSingle = await DiscotecaDB.getEntry(singleId);
    expect(fetchedSingle?.albumId).toBe(albumId);
    expect(fetchedSingle?.albumAppleMusicId).toBe(albumAppleMusicId);

    // deleting the album should set null on the single's albumId, not fail/cascade-delete the single
    await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumId));

    const afterAlbumDeleted = await DiscotecaDB.getEntry(singleId);
    expect(afterAlbumDeleted?.albumId).toBeNull();
    expect(afterAlbumDeleted?.albumAppleMusicId).toBe(albumAppleMusicId);
  });
});
