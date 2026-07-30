import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaAlbumTracks } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.cacheAlbumTracks / getAlbumTracks", () => {
  const fx = new TestFixtures();
  let entryId: number;

  beforeAll(async () => {
    entryId = (await fx.discotecaEntry({ type: 'album' })).id;
    fx.onCleanup(async () => { await db.delete(discotecaAlbumTracks).where(eq(discotecaAlbumTracks.entryId, entryId)); });
  });

  afterAll(() => fx.cleanup());

  test("caches tracks and returns them ordered by track number", async () => {
    await DiscotecaDB.cacheAlbumTracks(entryId, [
      { trackAppleMusicId: "t2", name: "Track Two", trackNumber: 2, durationInMillis: 200000 },
      { trackAppleMusicId: "t1", name: "Track One", trackNumber: 1, durationInMillis: 180000, isrc: "US1234567890" },
    ]);

    const tracks = await DiscotecaDB.getAlbumTracks(entryId);
    expect(tracks.map(t => t.trackNumber)).toEqual([1, 2]);
    expect(tracks[0]!.name).toBe("Track One");
    expect(tracks[0]!.isrc).toBe("US1234567890");
  });

  test("returns an empty array for an entry with no cached tracks", async () => {
    const otherEntryId = (await fx.discotecaEntry({ type: 'single' })).id;
    const tracks = await DiscotecaDB.getAlbumTracks(otherEntryId);
    expect(tracks).toEqual([]);
  });
});
