import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, mockAppleMusic } from "@girae/tests";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { CardsDB } from "@girae/database/cards";
import { DiscotecaDB } from "@girae/database/discoteca";
import { db } from "@girae/database/index";
import { discotecaEntries, discotecaPreviewCache } from "@girae/database/schemas/discoteca";
import { auditLogs } from "@girae/database/schemas/audit";
import { eq } from "drizzle-orm";

mockTelegram();
const appleMusicState = mockAppleMusic();

import AddSingleCommand from "../../commands/discoteca/addsingle";

const testSongAppleMusicId = `test-song-${Date.now()}`;
const testParentAlbumAppleMusicId = `test-parent-album-${Date.now()}`;
const cachedPreviewUrl = "https://cdn.example.com/tagged-preview.m4a";

describe("/addsingle", () => {
  const fx = new TestFixtures();
  let staffPlatformId: string;
  let staffId: number;
  let rarityId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    staffPlatformId = `test-addsingle-staff-${Date.now()}`;
    staffId = (await fx.user({ displayName: "Test Addsingle Staff", platform: 'telegram', platformId: staffPlatformId })).id;
    fx.onCleanup(async () => { await db.delete(auditLogs).where(eq(auditLogs.actorUserId, staffId)); });
    rarityId = (await CardsDB.getRarities())[0]!.id;

    appleMusicState.shouldThrow = false;
    appleMusicState.searchResult = {
      results: { songs: { data: [{ id: testSongAppleMusicId, attributes: { name: "Test Song", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.songResult = {
      data: [{
        id: testSongAppleMusicId,
        attributes: {
          name: "Test Song", artistName: "Test Artist", albumName: "Test Parent Album",
          artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01",
          genreNames: ["Pop"], previews: [{ url: "https://example.com/preview.m4a" }],
        },
        relationships: {
          albums: { data: [{ id: testParentAlbumAppleMusicId, type: "albums" }] },
          artists: { data: [{ id: "test-artist-apple-id-single", attributes: { name: "Test Artist" } }] },
        },
      }],
    };

    // a cache hit short-circuits before fetch/ffmpeg - avoids mocking preview.ts itself
    await DiscotecaDB.setPreviewCacheEntry(testSongAppleMusicId, cachedPreviewUrl);
    fx.onCleanup(async () => { await db.delete(discotecaPreviewCache).where(eq(discotecaPreviewCache.appleMusicTrackId, testSongAppleMusicId)); });
  });

  afterAll(() => fx.cleanup());

  test("links to an existing parent album entry via albumId, saves the cached preview URL", async () => {
    const artistId = (await fx.discotecaArtist({ name: "Test Artist" })).id;
    const parentAlbum = await DiscotecaDB.createEntry({
      name: "Test Parent Album", artistId, appleMusicId: testParentAlbumAppleMusicId, type: 'album', rarityId,
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, parentAlbum!.id)); });

    const workflowID = `test-addsingle-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addsingle', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddSingleCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entry = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, testSongAppleMusicId)).then(r => r[0]);
    expect(entry?.type).toBe('single');
    expect(entry?.albumId).toBe(parentAlbum!.id);
    expect(entry?.albumAppleMusicId).toBe(testParentAlbumAppleMusicId);
    expect(entry?.previewUrl).toBe(cachedPreviewUrl);
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)); });
  }, 15000);
});
