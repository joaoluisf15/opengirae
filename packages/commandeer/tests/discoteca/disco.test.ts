import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { CardsDB } from "@girae/database/cards";
import { EconomyDB } from "@girae/database/economy";
import { db } from "@girae/database/index";
import { discotecaEntries, userDiscoteca } from "@girae/database/schemas/discoteca";
import { userCards } from "@girae/database/schemas/cards";
import { and, eq } from "drizzle-orm";
import DiscoCommand from "../../commands/discoteca/disco";

const { sentMessages } = mockTelegram();

describe("/disco", () => {
  const fx = new TestFixtures();
  let userPlatformId: string;
  let userId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    userPlatformId = `test-disco-user-${Date.now()}`;
    userId = (await fx.user({ displayName: "Test Disco User", platform: 'telegram', platformId: userPlatformId })).id;
  });

  afterAll(() => fx.cleanup());

  test("no argument, nothing owned yet: empty-state message", async () => {
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: undefined });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.text ?? last.caption).toContain('Você ainda não girou nada da discoteca');
  });

  test("no argument, something owned: lists artists including a 0-owned one", async () => {
    const artistOwnedId = (await fx.discotecaArtist({ name: `Test Disco Owned Artist ${Date.now()}` })).id;
    const artistUnownedId = (await fx.discotecaArtist({ name: `Test Disco Unowned Artist ${Date.now()}` })).id;
    const ownedEntryId = (await fx.discotecaEntry({ artistId: artistOwnedId })).id;
    await fx.discotecaEntry({ artistId: artistUnownedId });
    await DiscotecaDB.addUserDiscoteca(userId, ownedEntryId);
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, ownedEntryId))); });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: undefined });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('(1/1)');
    expect(text).toContain('(0/1)');
  });

  test("with an argument matching an album: shows its linked singles and sends a photo", async () => {
    const artistId = (await fx.discotecaArtist({ name: `Test Disco Album Artist ${Date.now()}` })).id;
    const albumRow = await DiscotecaDB.createEntry({
      name: `Test Disco Album ${Date.now()}`, artistId, appleMusicId: `test-disco-album-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/art.jpg",
      appleMusicUrl: "https://music.apple.com/us/album/test",
    });
    const albumId = albumRow!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumId)); });

    const singleName = `Test Disco Linked Single ${Date.now()}`;
    const singleRow = await DiscotecaDB.createEntry({
      name: singleName, artistId, appleMusicId: `test-disco-linked-single-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      albumId,
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, singleRow!.id)); });

    const entry = await DiscotecaDB.getEntryWithDetails(albumId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendPhoto');
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain(singleName);
    expect(text).toContain('💽');
    expect(last.replyMarkup?.inline_keyboard?.[0]?.[0]?.url).toBe("https://music.apple.com/us/album/test");
  });

  test("with an argument matching an entry whose artist has a linked card: shows the card's category emoji, id and owned count", async () => {
    const musicCategoryId = (await CardsDB.getCategoryByName('Música') ?? await CardsDB.createCategory('Música', '🎸'))!.id;
    const subcategoryId = (await fx.subcategory({ categoryId: musicCategoryId, name: `Test Disco Sub ${Date.now()}` })).id;
    const cardId = (await fx.card({ name: `Test Disco Card ${Date.now()}`, subcategoryId })).id;
    fx.onCleanup(async () => { await db.delete(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))); });

    const artistId = (await fx.discotecaArtist({ name: `Test Disco Carded Artist ${Date.now()}` })).id;
    await DiscotecaDB.setArtistCard(artistId, cardId);
    await CardsDB.addUserCard(userId, cardId, await EconomyDB.getIncomeInflationRate());

    const entryId = (await fx.discotecaEntry({ artistId, type: 'single' })).id;
    const entry = await DiscotecaDB.getEntryWithDetails(entryId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain(`<code>${cardId}</code>`);
    expect(text).toContain('x1');
  });

  test("with an argument matching an entry whose artist has a linked card the viewer doesn't own: no owned-count shown", async () => {
    const musicCategoryId = (await CardsDB.getCategoryByName('Música') ?? await CardsDB.createCategory('Música', '🎸'))!.id;
    const subcategoryId = (await fx.subcategory({ categoryId: musicCategoryId, name: `Test Disco Unowned Card Sub ${Date.now()}` })).id;
    const cardId = (await fx.card({ name: `Test Disco Unowned Card ${Date.now()}`, subcategoryId })).id;

    const artistId = (await fx.discotecaArtist({ name: `Test Disco Uncarded Artist ${Date.now()}` })).id;
    await DiscotecaDB.setArtistCard(artistId, cardId);

    const entryId = (await fx.discotecaEntry({ artistId, type: 'album' })).id;
    const entry = await DiscotecaDB.getEntryWithDetails(entryId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain(`<code>${cardId}</code>`);
    expect(text).not.toContain('x0');
  });

  test("with an argument matching a single with a cached preview: sends audio with performer/title", async () => {
    const artistName = `Test Disco Single Artist ${Date.now()}`;
    const artistId = (await fx.discotecaArtist({ name: artistName })).id;
    const entryName = `Test Disco Single ${Date.now()}`;
    const entryRow = await DiscotecaDB.createEntry({
      name: entryName, artistId, appleMusicId: `test-disco-single-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      previewUrl: "https://cdn.example.com/preview.m4a",
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id)); });
    const entry = await DiscotecaDB.getEntryWithDetails(entryRow!.id);

    // the answerer fetches the preview's actual bytes before uploading to Telegram (see telegram.ts's sendAudio case)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array([0]))) as unknown as typeof fetch;

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));
    globalThis.fetch = originalFetch;

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendAudio');
    expect(last.performer).toBe(artistName);
    expect(last.title).toBe(entryName);
  });

  test("with an argument matching a single with no cached preview: falls back to text, no audio call", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const entryId = (await fx.discotecaEntry({ artistId, type: 'single' })).id;
    const entry = await DiscotecaDB.getEntryWithDetails(entryId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendMessage');
  });
});
