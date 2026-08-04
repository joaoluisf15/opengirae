import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { CommandArgumentType, type CommandArgumentSpec } from "@girae/common/commands";
import { resolveCommandArguments } from "../../services/commandArguments";
import { db } from "@girae/database/index";
import { discotecaEntries } from "@girae/database/schemas/discoteca";
import { inArray } from "drizzle-orm";
import AlbunsCommand from "../../commands/discoteca/albuns";

const { sentMessages } = mockTelegram();

describe("/albuns", () => {
  const fx = new TestFixtures();
  let userPlatformId: string;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    userPlatformId = `test-albuns-user-${Date.now()}`;
    await fx.user({ displayName: "Test Albuns User", platform: 'telegram', platformId: userPlatformId });
  });

  afterAll(() => fx.cleanup());

  test("no argument: lists albums, not singles", async () => {
    // the dev DB accumulates entries across test runs, so the freshly-created album may land
    // past page 1 - only assert the type-scoping (no single ever leaks in), not page-1 presence.
    const artistId = (await fx.discotecaArtist()).id;
    const rarityId = await anyRarityId();
    const singleId = (await DiscotecaDB.createEntry({
      name: `Test Albuns List Single ${Date.now()}`, artistId, appleMusicId: `test-albuns-list-single-${Date.now()}`, type: 'single', rarityId,
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [singleId])); });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'albuns', authorId: userPlatformId, args: [], platform: 'telegram' });
    await AlbunsCommand.execute(ctx, { query: undefined });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('Álbuns da discoteca');
    expect(text).not.toContain(`<code>${singleId}</code>`);
  });

  test("with a name matching only a single: not found (type-scoped)", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const singleId = (await DiscotecaDB.createEntry({
      name: `Test Albuns SingleOnly ${Date.now()}`, artistId, appleMusicId: `test-albuns-singleonly-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [singleId])); });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'albuns', authorId: userPlatformId, args: ['Test Albuns SingleOnly'], platform: 'telegram' });
    const specs: CommandArgumentSpec[] = [{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'album', nullable: true }];
    const result = await resolveCommandArguments(specs, ctx, '/albuns [busca]');
    expect(result).toBeNull();

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('Não encontrei um álbum');
  });

  test("with an argument matching an album: shows the entry detail view (reused from /disco)", async () => {
    const artistId = (await fx.discotecaArtist({ name: `Test Albuns Detail Artist ${Date.now()}` })).id;
    const albumId = (await DiscotecaDB.createEntry({
      name: `Test Albuns Detail Album ${Date.now()}`, artistId, appleMusicId: `test-albuns-detail-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/art.jpg",
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [albumId])); });
    const entry = await DiscotecaDB.getEntryWithDetails(albumId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'albuns', authorId: userPlatformId, args: [], platform: 'telegram' });
    await AlbunsCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendPhoto');
  });
});
