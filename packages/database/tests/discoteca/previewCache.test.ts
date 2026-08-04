import { test, expect, describe, afterAll } from "bun:test";
import { db } from "../../index";
import { discotecaPreviewCache } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getPreviewCacheEntry / setPreviewCacheEntry", () => {
  const trackId = `test-track-${Date.now()}`;

  afterAll(async () => {
    await db.delete(discotecaPreviewCache).where(eq(discotecaPreviewCache.appleMusicTrackId, trackId));
  });

  test("returns undefined for a track that's never been cached", async () => {
    const entry = await DiscotecaDB.getPreviewCacheEntry(trackId);
    expect(entry).toBeUndefined();
  });

  test("caches a ref and returns it on a later lookup", async () => {
    await DiscotecaDB.setPreviewCacheEntry(trackId, "file://scratch/preview1.m4a");

    const entry = await DiscotecaDB.getPreviewCacheEntry(trackId);
    expect(entry?.mediaRef).toBe("file://scratch/preview1.m4a");
  });

  test("re-caching the same track id updates the ref in place, not a duplicate row", async () => {
    await DiscotecaDB.setPreviewCacheEntry(trackId, "file://scratch/preview2.m4a");

    const rows = await db.select().from(discotecaPreviewCache).where(eq(discotecaPreviewCache.appleMusicTrackId, trackId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.mediaRef).toBe("file://scratch/preview2.m4a");
  });
});
