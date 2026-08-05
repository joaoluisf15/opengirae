import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";
import { db } from "../../index";
import { discotecaArtistAppleIds } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";

describe("DiscotecaDB.mergeArtists", () => {
  const fx = new TestFixtures();
  afterAll(() => fx.cleanup());

  test("moves entries to the target, deletes the source, and future getOrCreateArtist calls for the source's apple id resolve to the target", async () => {
    const sourceAppleId = `test-merge-source-${Date.now()}`;
    const targetAppleId = `test-merge-target-${Date.now()}`;
    const source = await fx.discotecaArtist({ name: "Test Merge Artist", appleMusicArtistId: sourceAppleId });
    const target = await fx.discotecaArtist({ name: "Test Merge Artist", appleMusicArtistId: targetAppleId });
    const entry = await fx.discotecaEntry({ name: "Test Merge Entry", artistId: source.id, type: 'single', rarityId: await anyRarityId() });

    await DiscotecaDB.mergeArtists(source.id, target.id);

    const movedEntry = await DiscotecaDB.getEntry(entry.id);
    expect(movedEntry?.artistId).toBe(target.id);

    const sourceRow = await DiscotecaDB.getArtist(source.id);
    expect(sourceRow).toBeUndefined();

    const aliasRow = await db.select().from(discotecaArtistAppleIds).where(eq(discotecaArtistAppleIds.appleMusicArtistId, sourceAppleId)).then(r => r[0]);
    expect(aliasRow?.artistId).toBe(target.id);
    fx.onCleanup(async () => { await db.delete(discotecaArtistAppleIds).where(eq(discotecaArtistAppleIds.appleMusicArtistId, sourceAppleId)); });

    // simulate a later /addsingle for the same real artist that Apple Music still reports under the old (merged-away) id
    const resolved = await DiscotecaDB.getOrCreateArtist(sourceAppleId, "Test Merge Artist");
    expect(resolved?.id).toBe(target.id);
  });
});
