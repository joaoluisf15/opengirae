import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "@girae/database/discoteca";
import { CardsDB } from "@girae/database/cards";
import { EconomyDB } from "@girae/database/economy";
import { db } from "@girae/database/index";
import { discotecaEntries, userDiscoteca } from "@girae/database/schemas/discoteca";
import { userCards } from "@girae/database/schemas/cards";
import { and, eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DiscoCommand, { resolveEntryMedia } from "../../commands/discoteca/disco";

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
    const ownedName = `Test Disco Owned Artist ${Date.now()}`;
    const unownedName = `Test Disco Unowned Artist ${Date.now()}`;
    const artistOwnedId = (await fx.discotecaArtist({ name: ownedName })).id;
    const artistUnownedId = (await fx.discotecaArtist({ name: unownedName })).id;
    const ownedEntryId = (await fx.discotecaEntry({ artistId: artistOwnedId })).id;
    await fx.discotecaEntry({ artistId: artistUnownedId });
    await DiscotecaDB.addUserDiscoteca(userId, ownedEntryId);
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, ownedEntryId))); });

    // artists are ordered ascending by id, so fresh ones always land on the last page, not page 0
    const { totalPages } = await DiscoCommand.discoPage(String(userId), 0) ?? {};
    const lastPage = (totalPages ?? 1) - 1
    const page = await DiscoCommand.discoPage(String(userId), lastPage);

    expect(page?.content).toContain(`\`${artistOwnedId}\`. **${ownedName}** (1/1)`);
    expect(page?.content).toContain(`\`${artistUnownedId}\`. **${unownedName}** (0/1)`);
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

  test("with an argument matching a single with a cached preview (file ref): sends audio with performer/title and caches the file_id", async () => {
    const artistName = `Test Disco Single Artist ${Date.now()}`;
    const artistId = (await fx.discotecaArtist({ name: artistName })).id;
    const entryName = `Test Disco Single ${Date.now()}`;
    const dir = await mkdtemp(join(tmpdir(), 'disco-test-scratch-'));
    const prevScratch = process.env.SCRATCH_DIR;
    process.env.SCRATCH_DIR = dir;
    await Bun.write(join(dir, 'preview.m4a'), new Uint8Array([1, 2, 3]));

    const entryRow = await DiscotecaDB.createEntry({
      name: entryName, artistId, appleMusicId: `test-disco-single-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      previewUrl: "file://scratch/preview.m4a",
    });
    fx.onCleanup(async () => {
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id));
      process.env.SCRATCH_DIR = prevScratch;
      await rm(dir, { recursive: true, force: true });
    });

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: (await DiscotecaDB.getEntryWithDetails(entryRow!.id))! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendAudio');
    expect(last.performer).toBe(artistName);
    expect(last.title).toBe(entryName);

    // second view should now hit the cached file_id, not the scratch file
    const updated = await DiscotecaDB.getEntryWithDetails(entryRow!.id);
    expect(updated?.telegramFileId).toBeTruthy();

    await rm(join(dir, 'preview.m4a'));
    sentMessages.length = 0;
    await DiscoCommand.execute(ctx, { query: updated! });
    await new Promise(r => setTimeout(r, 1000));

    const secondSend = sentMessages[sentMessages.length - 1]!;
    expect(secondSend.method).toBe('sendAudio');
    expect(secondSend.audio).toBe(updated!.telegramFileId);
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

  test("with an argument matching an entry with multiple genres: combines them into one italicized line", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const entryId = (await fx.discotecaEntry({ artistId, type: 'album' })).id;
    const genreAId = (await fx.discotecaGenre({ name: `Alternativo ${Date.now()}` })).id;
    const genreBId = (await fx.discotecaGenre({ name: `Pop ${Date.now()}` })).id;
    const genreCId = (await fx.discotecaGenre({ name: `Rock ${Date.now()}` })).id;
    const subAId = (await fx.discotecaSubcategory({ genreId: genreAId, isAlbum: true })).id;
    const subBId = (await fx.discotecaSubcategory({ genreId: genreBId, isAlbum: true })).id;
    const subCId = (await fx.discotecaSubcategory({ genreId: genreCId, isAlbum: true })).id;
    await DiscotecaDB.setEntryGenres(entryId, [subAId, subBId, subCId]);
    const entry = await DiscotecaDB.getEntryWithDetails(entryId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toMatch(/Álbuns de Alternativo \d+, Pop \d+, e Rock \d+/);
  });

  test("with an argument matching an album with an animated cover: sends it as an animation, not a static photo", async () => {
    const artistId = (await fx.discotecaArtist({ name: `Test Disco Animated Artist ${Date.now()}` })).id;
    const albumId = (await DiscotecaDB.createEntry({
      name: `Test Disco Animated Album ${Date.now()}`, artistId, appleMusicId: `test-disco-animated-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/static-art.jpg",
      animatedArtworkUrl: "https://example.com/animated-art.mp4",
    }))!.id;
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumId)); });
    const entry = await DiscotecaDB.getEntryWithDetails(albumId);

    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'disco', authorId: userPlatformId, args: [], platform: 'telegram' });
    await DiscoCommand.execute(ctx, { query: entry! });
    await new Promise(r => setTimeout(r, 1000));

    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendAnimation');
    expect(last.animation).toBe('https://example.com/animated-art.mp4');
  });

  test("resolveEntryMedia: single with a preview, Telegram - sends audio", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const entryRow = await DiscotecaDB.createEntry({
      name: `Test Media Single ${Date.now()}`, artistId, appleMusicId: `test-media-single-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      previewUrl: "file://scratch/preview.m4a",
      artworkUrl: "https://example.com/track-art.jpg",
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id)); });
    const entry = (await DiscotecaDB.getEntryWithDetails(entryRow!.id))!;

    const media = await resolveEntryMedia('telegram', entry);
    expect(media.kind).toBe('audio');
    expect((media as any).audioUrl).toBe("file://scratch/preview.m4a");
  });

  test("resolveEntryMedia: single with a preview, Discord - falls back to its own artwork, never audio", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const entryRow = await DiscotecaDB.createEntry({
      name: `Test Media Discord Single ${Date.now()}`, artistId, appleMusicId: `test-media-discord-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      previewUrl: "file://scratch/preview.m4a",
      artworkUrl: "https://example.com/track-art.jpg",
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id)); });
    const entry = (await DiscotecaDB.getEntryWithDetails(entryRow!.id))!;

    const media = await resolveEntryMedia('discord', entry);
    expect(media.kind).toBe('photo');
    expect((media as any).photoUrl).toBe("https://example.com/track-art.jpg");
  });

  test("resolveEntryMedia: single linked to a catalogued album, no preview - uses the album's artwork, not its own", async () => {
    const artistId = (await fx.discotecaArtist({ name: `Test Media AlbumArt Artist ${Date.now()}` })).id;
    const albumRow = await DiscotecaDB.createEntry({
      name: `Test Media AlbumArt Album ${Date.now()}`, artistId, appleMusicId: `test-media-albumart-album-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/album-art.jpg",
      animatedArtworkUrl: "https://example.com/album-animated.mp4",
    });
    const singleRow = await DiscotecaDB.createEntry({
      name: `Test Media AlbumArt Single ${Date.now()}`, artistId, appleMusicId: `test-media-albumart-single-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/track-art.jpg",
      albumId: albumRow!.id,
    });
    fx.onCleanup(async () => {
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, singleRow!.id));
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumRow!.id));
    });
    const entry = (await DiscotecaDB.getEntryWithDetails(singleRow!.id))!;

    const media = await resolveEntryMedia('discord', entry);
    expect(media.kind).toBe('photo');
    expect((media as any).photoUrl).toBe("https://example.com/album-art.jpg");
  });

  test("resolveEntryMedia: album - static artwork on Discord, animated on Telegram", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const albumRow = await DiscotecaDB.createEntry({
      name: `Test Media Album ${Date.now()}`, artistId, appleMusicId: `test-media-album-${Date.now()}`, type: 'album',
      rarityId: await anyRarityId(),
      artworkUrl: "https://example.com/album-art.jpg",
      animatedArtworkUrl: "https://example.com/album-animated.mp4",
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, albumRow!.id)); });
    const entry = (await DiscotecaDB.getEntryWithDetails(albumRow!.id))!;

    const discordMedia = await resolveEntryMedia('discord', entry);
    expect((discordMedia as any).photoUrl).toBe("https://example.com/album-animated.mp4");
    const telegramMedia = await resolveEntryMedia('telegram', entry);
    expect((telegramMedia as any).photoUrl).toBe("https://example.com/album-animated.mp4");
  });
});
