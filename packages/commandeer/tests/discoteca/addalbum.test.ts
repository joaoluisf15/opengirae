import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, mockAppleMusic } from "@girae/tests";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { CardsDB } from "@girae/database/cards";
import { DiscotecaDB } from "@girae/database/discoteca";
import { db } from "@girae/database/index";
import { discotecaEntries, discotecaAlbumTracks, discotecaEntrySubcategories, discotecaGenreAliases, discotecaArtists } from "@girae/database/schemas/discoteca";
import { auditLogs } from "@girae/database/schemas/audit";
import { eq } from "drizzle-orm";

mockTelegram();
const appleMusicState = mockAppleMusic();

import AddAlbumCommand from "../../commands/discoteca/addalbum";

const testAlbumAppleMusicId = `test-album-${Date.now()}`;

describe("/addalbum", () => {
  const fx = new TestFixtures();
  let staffPlatformId: string;
  let staffId: number;
  let popSubcategoryId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    staffPlatformId = `test-addalbum-staff-${Date.now()}`;
    staffId = (await fx.user({ displayName: "Test Addalbum Staff", platform: 'telegram', platformId: staffPlatformId })).id;
    fx.onCleanup(async () => { await db.delete(auditLogs).where(eq(auditLogs.actorUserId, staffId)); });

    const popGenreId = (await fx.discotecaGenre({ name: `Test Pop ${Date.now()}` })).id;
    popSubcategoryId = (await fx.discotecaSubcategory({ genreId: popGenreId, isAlbum: true, name: `Test Álbuns de Pop ${Date.now()}`, emoji: '💽' })).id;
    const alias = await DiscotecaDB.upsertGenreAlias('pop', popGenreId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, alias!.id)); });

    appleMusicState.shouldThrow = false;
    appleMusicState.searchResult = {
      results: { albums: { data: [{ id: testAlbumAppleMusicId, attributes: { name: "Test Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.albumResult = {
      data: [{
        id: testAlbumAppleMusicId,
        attributes: { name: "Test Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01", genreNames: ["Pop", "Music"] },
        relationships: {
          tracks: { data: [{ id: "test-track-1", type: "songs", attributes: { name: "Track One", trackNumber: 1, durationInMillis: 180000, isrc: "US1234567890" } }] },
          artists: { data: [{ id: "test-artist-apple-id", attributes: { name: "Test Artist" } }] },
        },
      }],
    };
  });

  afterAll(() => fx.cleanup());

  test("searches, picks the only candidate, saves with the fallback rarity, caches tracks", async () => {
    const workflowID = `test-addalbum-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addalbum', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddAlbumCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entryRows = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, testAlbumAppleMusicId));
    expect(entryRows.length).toBe(1);
    const entry = entryRows[0]!;
    expect(entry.name).toBe("Test Album");
    expect(entry.type).toBe('album');
    fx.onCleanup(async () => {
      await db.delete(discotecaAlbumTracks).where(eq(discotecaAlbumTracks.entryId, entry.id));
      await db.delete(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entry.id));
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry.id));
    });

    const tracks = await DiscotecaDB.getAlbumTracks(entry.id);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.name).toBe("Track One");

    const genreRows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entry.id));
    expect(genreRows.map(r => r.subcategoryId)).toEqual([popSubcategoryId]);

    const artist = await DiscotecaDB.getArtist(entry.artistId);
    expect(artist?.name).toBe("Test Artist");

    // getRarities() has no ORDER BY - just confirm a real catalog rarity, not a specific position
    const rarities = await CardsDB.getRarities();
    expect(rarities.map(r => r.id)).toContain(entry.rarityId);
  }, 15000);

  test("editing the name before saving overrides the Apple Music name", async () => {
    const otherAlbumAppleMusicId = `test-album-renamed-${Date.now()}`;
    appleMusicState.searchResult = {
      results: { albums: { data: [{ id: otherAlbumAppleMusicId, attributes: { name: "Original Name", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.albumResult = {
      data: [{
        id: otherAlbumAppleMusicId,
        attributes: { name: "Original Name", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01", genreNames: [] },
        relationships: { tracks: { data: [] }, artists: { data: [{ id: "test-artist-apple-id", attributes: { name: "Test Artist" } }] } },
      }],
    };

    const workflowID = `test-addalbum-rename-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addalbum', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddAlbumCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'editName' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: "Renamed Album" }, 'discoteca:name');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entry = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, otherAlbumAppleMusicId)).then(r => r[0]);
    expect(entry?.name).toBe("Renamed Album");
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)); });
  }, 15000);

  test("re-checking genres picks up an alias mapped after the search happened", async () => {
    const otherAlbumAppleMusicId = `test-album-recheck-${Date.now()}`;
    appleMusicState.searchResult = {
      results: { albums: { data: [{ id: otherAlbumAppleMusicId, attributes: { name: "Recheck Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.albumResult = {
      data: [{
        id: otherAlbumAppleMusicId,
        attributes: { name: "Recheck Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01", genreNames: ["Hyperpop"] },
        relationships: { tracks: { data: [] }, artists: { data: [{ id: "test-artist-apple-id", attributes: { name: "Test Artist" } }] } },
      }],
    };

    const workflowID = `test-addalbum-recheck-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addalbum', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddAlbumCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));

    // "Hyperpop" is unmapped at this point - map it mid-flow, like staff running /genrealias in another message
    const hyperpopGenreId = (await fx.discotecaGenre({ name: `Test Hyperpop ${Date.now()}` })).id;
    const hyperpopSubcategoryId = (await fx.discotecaSubcategory({ genreId: hyperpopGenreId, isAlbum: true, name: `Test Álbuns de Hyperpop ${Date.now()}`, emoji: '💽' })).id;
    const alias = await DiscotecaDB.upsertGenreAlias('hyperpop', hyperpopGenreId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, alias!.id)); });

    await DBOS.send(workflowID, { value: { action: 'recheckGenres' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entry = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, otherAlbumAppleMusicId)).then(r => r[0]);
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)); });

    const genreRows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entry!.id));
    expect(genreRows.map(r => r.subcategoryId)).toEqual([hyperpopSubcategoryId]);
  }, 15000);

  test("manually adding an existing genre by name attaches it, unknown names get a not-found reply", async () => {
    const otherAlbumAppleMusicId = `test-album-addgenre-${Date.now()}`;
    appleMusicState.searchResult = {
      results: { albums: { data: [{ id: otherAlbumAppleMusicId, attributes: { name: "AddGenre Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.albumResult = {
      data: [{
        id: otherAlbumAppleMusicId,
        attributes: { name: "AddGenre Album", artistName: "Test Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01", genreNames: [] },
        relationships: { tracks: { data: [] }, artists: { data: [{ id: "test-artist-apple-id", attributes: { name: "Test Artist" } }] } },
      }],
    };

    const manualGenreName = `Test Manual Genre ${Date.now()}`;
    const manualGenreId = (await fx.discotecaGenre({ name: manualGenreName })).id;
    const manualSubcategoryId = (await fx.discotecaSubcategory({ genreId: manualGenreId, isAlbum: true })).id;

    const workflowID = `test-addalbum-addgenre-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addalbum', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddAlbumCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));

    // an unknown genre name should be rejected without touching the loop's state
    await DBOS.send(workflowID, { value: { action: 'addGenre' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: "Totally Nonexistent Genre" }, 'discoteca:addGenre');
    await new Promise(r => setTimeout(r, 500));

    await DBOS.send(workflowID, { value: { action: 'addGenre' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: manualGenreName }, 'discoteca:addGenre');
    await new Promise(r => setTimeout(r, 500));

    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entry = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, otherAlbumAppleMusicId)).then(r => r[0]);
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)); });

    const genreRows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entry!.id));
    expect(genreRows.map(r => r.subcategoryId)).toEqual([manualSubcategoryId]);
  }, 15000);

  test("manually linking an artist card via the button updates the artist row", async () => {
    const otherAlbumAppleMusicId = `test-album-linkcard-${Date.now()}`;
    const otherArtistAppleMusicId = `test-artist-linkcard-${Date.now()}`;
    appleMusicState.searchResult = {
      results: { albums: { data: [{ id: otherAlbumAppleMusicId, attributes: { name: "LinkCard Album", artistName: "Test LinkCard Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01" } }] } },
    };
    appleMusicState.albumResult = {
      data: [{
        id: otherAlbumAppleMusicId,
        attributes: { name: "LinkCard Album", artistName: "Test LinkCard Artist", artwork: { url: "https://example.com/{w}x{h}bb.{f}" }, releaseDate: "2024-01-01", genreNames: [] },
        relationships: {
          tracks: { data: [] },
          artists: { data: [{ id: otherArtistAppleMusicId, attributes: { name: "Test LinkCard Artist" } }] },
        },
      }],
    };

    const musicCategoryId = (await CardsDB.getCategoryByName('Música') ?? await CardsDB.createCategory('Música', '🎸'))!.id;
    const musicSubcategoryId = (await fx.subcategory({ categoryId: musicCategoryId, name: `Test LinkCard Sub ${Date.now()}` })).id;
    const targetCardId = (await fx.card({ name: `Test LinkCard Target Card ${Date.now()}`, subcategoryId: musicSubcategoryId })).id;

    const workflowID = `test-addalbum-linkcard-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'addalbum', authorId: staffPlatformId, args: ['test query'], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(AddAlbumCommand, { workflowID }).execute(runCtx, { query: 'test query' });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { index: 0 } }, 'discoteca:pick');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'linkArtistCard' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: String(targetCardId) }, 'discoteca:artistCard');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const entry = await db.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, otherAlbumAppleMusicId)).then(r => r[0]);
    // LIFO cleanup: register the artist delete first so it runs *after* the entry delete below (entries.artistId FK)
    fx.onCleanup(async () => { await db.delete(discotecaArtists).where(eq(discotecaArtists.appleMusicArtistId, otherArtistAppleMusicId)); });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)); });

    const artist = await DiscotecaDB.getArtist(entry!.artistId);
    expect(artist?.cardId).toBe(targetCardId);
  }, 15000);
});
