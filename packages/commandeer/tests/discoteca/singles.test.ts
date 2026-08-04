import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { CommandArgumentType, type CommandArgumentSpec } from "@girae/common/commands";
import { resolveCommandArguments } from "../../services/commandArguments";
import { db } from "@girae/database/index";
import { discotecaEntries } from "@girae/database/schemas/discoteca";
import { inArray } from "drizzle-orm";
import SinglesCommand from "../../commands/discoteca/singles";

const { sentMessages } = mockTelegram();

describe("/singles", () => {
  const fx = new TestFixtures();
  let userPlatformId: string;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    userPlatformId = `test-singles-user-${Date.now()}`;
    await fx.user({ displayName: "Test Singles User", platform: 'telegram', platformId: userPlatformId });
  });

  afterAll(() => fx.cleanup());

  test("no argument: lists singles, not albums", async () => {
    // the dev DB accumulates entries across test runs, so the freshly-created single may land
    // past page 1 - only assert the type-scoping (no album ever leaks in), not page-1 presence.
    const artistId = (await fx.discotecaArtist()).id;
    const rarityId = await anyRarityId();
    const albumId = (await DiscotecaDB.createEntry({
      name: `Test Singles List Album ${Date.now()}`, artistId, appleMusicId: `test-singles-list-album-${Date.now()}`, type: 'album', rarityId,
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [albumId])); });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'singles', authorId: userPlatformId, args: [], platform: 'telegram' });
    await SinglesCommand.execute(ctx, { query: undefined });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('Singles da discoteca');
    expect(text).not.toContain(`<code>${albumId}</code>`);
  });

  test("with a name matching only an album: not found (type-scoped)", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const albumId = (await DiscotecaDB.createEntry({
      name: `Test Singles AlbumOnly ${Date.now()}`, artistId, appleMusicId: `test-singles-albumonly-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [albumId])); });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'singles', authorId: userPlatformId, args: ['Test Singles AlbumOnly'], platform: 'telegram' });
    const specs: CommandArgumentSpec[] = [{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'single', nullable: true }];
    const result = await resolveCommandArguments(specs, ctx, '/singles [busca]');
    expect(result).toBeNull();

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('Não encontrei um single');
  });

  test("with an argument matching a single: shows the entry detail view (reused from /disco)", async () => {
    const artistId = (await fx.discotecaArtist({ name: `Test Singles Detail Artist ${Date.now()}` })).id;
    const singleId = (await DiscotecaDB.createEntry({
      name: `Test Singles Detail Single ${Date.now()}`, artistId, appleMusicId: `test-singles-detail-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(inArray(discotecaEntries.id, [singleId])); });
    const entry = await DiscotecaDB.getEntryWithDetails(singleId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'singles', authorId: userPlatformId, args: [], platform: 'telegram' });
    await SinglesCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendMessage');
  });
});
