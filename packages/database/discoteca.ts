import { maybeTransaction } from "./decorators";
import {
  discotecaGenres,
  discotecaGenreAliases,
  discotecaSubcategories,
  discotecaEntries,
  discotecaEntrySubcategories,
  discotecaAlbumTracks,
  discotecaPreviewCache,
  discotecaArtists,
  userDiscoteca,
} from "./schemas/discoteca";
import { userProfiles } from "./schemas/users";
import { cards, categories, subcategories, cardSubcategories, rarities } from "./schemas/cards";
import { eq, and, sql, gt } from "drizzle-orm";

export interface CreateDiscotecaEntryData {
  name: string;
  artistId: number;
  appleMusicId: string;
  type: 'single' | 'album';
  rarityId: number;
  artworkUrl?: string;
  releaseDate?: Date;
  previewUrl?: string;
  appleMusicUrl?: string;
  albumAppleMusicId?: string;
  albumId?: number;
}

export interface AlbumTrackData {
  trackAppleMusicId: string;
  name: string;
  trackNumber: number;
  durationInMillis: number;
  isrc?: string;
  previewUrl?: string;
}

export class DiscotecaDB {
  static createGenre = maybeTransaction('createGenre', async (client, name: string) => {
    return await client.insert(discotecaGenres).values({ name }).returning().then(a => a?.[0]);
  })

  static getGenre = maybeTransaction('getGenre', async (client, id: number) => {
    return await client.select().from(discotecaGenres).where(eq(discotecaGenres.id, id)).limit(1).then(a => a?.[0]);
  })

  static getGenreByName = maybeTransaction('getGenreByName', async (client, name: string) => {
    return await client.select().from(discotecaGenres).where(eq(discotecaGenres.name, name)).limit(1).then(a => a?.[0]);
  })

  static getGenres = maybeTransaction('getGenres', async (client) => {
    return await client.select().from(discotecaGenres);
  })

  static upsertGenreAlias = maybeTransaction('upsertGenreAlias', async (client, alias: string, genreId: number) => {
    const normalized = alias.trim().toLowerCase();
    return await client
      .insert(discotecaGenreAliases)
      .values({ alias: normalized, genreId })
      .onConflictDoUpdate({ target: discotecaGenreAliases.alias, set: { genreId } })
      .returning()
      .then(a => a?.[0]);
  })

  static createSubcategory = maybeTransaction('createSubcategory', async (client, genreId: number, name: string, emoji: string, isAlbum: boolean) => {
    return await client.insert(discotecaSubcategories).values({ genreId, name, emoji, isAlbum }).returning().then(a => a?.[0]);
  })

  static getSubcategory = maybeTransaction('getSubcategory', async (client, id: number) => {
    return await client.select().from(discotecaSubcategories).where(eq(discotecaSubcategories.id, id)).limit(1).then(a => a?.[0]);
  })

  static getSubcategories = maybeTransaction('getSubcategories', async (client) => {
    return await client.select().from(discotecaSubcategories);
  })

  static getSubcategoryByName = maybeTransaction('getSubcategoryByName', async (client, name: string) => {
    return await client.select().from(discotecaSubcategories).where(eq(discotecaSubcategories.name, name)).limit(1).then(a => a?.[0]);
  })

  // one alias covers both the album and single variant of a genre - the raw string maps to the
  // genre itself, and the matching (genreId, isAlbum) subcategory is picked for the current context.
  static resolveGenresByAliases = maybeTransaction('resolveGenresByAliases', async (client, rawStrings: string[], isAlbum: boolean) => {
    const resolved: { id: number; name: string }[] = [];
    const unmapped: string[] = [];

    for (const raw of rawStrings) {
      const normalized = raw.trim().toLowerCase();
      const viaAlias = await client
        .select({ id: discotecaSubcategories.id, name: discotecaSubcategories.name })
        .from(discotecaGenreAliases)
        .innerJoin(discotecaSubcategories, and(eq(discotecaSubcategories.genreId, discotecaGenreAliases.genreId), eq(discotecaSubcategories.isAlbum, isAlbum)))
        .where(eq(discotecaGenreAliases.alias, normalized))
        .limit(1)
        .then(a => a?.[0]);

      if (viaAlias) { resolved.push(viaAlias); continue; }

      // no alias needed when the raw string already matches the canonical genre name
      const viaGenreName = await client
        .select({ id: discotecaSubcategories.id, name: discotecaSubcategories.name })
        .from(discotecaGenres)
        .innerJoin(discotecaSubcategories, and(eq(discotecaSubcategories.genreId, discotecaGenres.id), eq(discotecaSubcategories.isAlbum, isAlbum)))
        .where(sql`lower(${discotecaGenres.name}) = ${normalized}`)
        .limit(1)
        .then(a => a?.[0]);

      if (viaGenreName) resolved.push(viaGenreName);
      else unmapped.push(raw);
    }

    return { resolved, unmapped };
  })

  static createEntry = maybeTransaction('createEntry', async (client, data: CreateDiscotecaEntryData) => {
    return await client.insert(discotecaEntries).values(data).returning().then(a => a?.[0]);
  })

  static getEntry = maybeTransaction('getEntry', async (client, id: number) => {
    return await client.select().from(discotecaEntries).where(eq(discotecaEntries.id, id)).limit(1).then(a => a?.[0]);
  })

  static getEntryWithDetails = maybeTransaction('getEntryWithDetails', async (client, id: number) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        type: discotecaEntries.type,
        artworkUrl: discotecaEntries.artworkUrl,
        previewUrl: discotecaEntries.previewUrl,
        appleMusicUrl: discotecaEntries.appleMusicUrl,
        artistId: discotecaArtists.id,
        artistName: discotecaArtists.name,
        rarityEmoji: rarities.emoji,
      })
      .from(discotecaEntries)
      .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
      .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
      .where(eq(discotecaEntries.id, id))
      .limit(1)
      .then(a => a?.[0]);
  })

  static getGenreNamesForEntry = maybeTransaction('getGenreNamesForEntry', async (client, entryId: number) => {
    return await client
      .select({ name: discotecaSubcategories.name })
      .from(discotecaEntrySubcategories)
      .innerJoin(discotecaSubcategories, eq(discotecaSubcategories.id, discotecaEntrySubcategories.subcategoryId))
      .where(eq(discotecaEntrySubcategories.entryId, entryId))
      .then(rows => rows.map(r => r.name));
  })

  static getGenresForEntry = maybeTransaction('getGenresForEntry', async (client, entryId: number) => {
    return await client
      .select({ id: discotecaSubcategories.id, name: discotecaSubcategories.name })
      .from(discotecaEntrySubcategories)
      .innerJoin(discotecaSubcategories, eq(discotecaSubcategories.id, discotecaEntrySubcategories.subcategoryId))
      .where(eq(discotecaEntrySubcategories.entryId, entryId));
  })

  static getLinkedSingles = maybeTransaction('getLinkedSingles', async (client, albumId: number, userId: number) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        rarityEmoji: rarities.emoji,
        ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
      })
      .from(discotecaEntries)
      .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
      .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
      .where(and(eq(discotecaEntries.albumId, albumId), eq(discotecaEntries.type, 'single')))
      .orderBy(discotecaEntries.id);
  })

  static getEntriesForGenre = maybeTransaction('getEntriesForGenre', async (client, subcategoryId: number, userId: number, limit: number, offset: number) => {
    const [rows, totalRow] = await Promise.all([
      client
        .select({
          id: discotecaEntries.id,
          name: discotecaEntries.name,
          type: discotecaEntries.type,
          rarityEmoji: rarities.emoji,
          ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
        })
        .from(discotecaEntrySubcategories)
        .innerJoin(discotecaEntries, eq(discotecaEntries.id, discotecaEntrySubcategories.entryId))
        .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .where(eq(discotecaEntrySubcategories.subcategoryId, subcategoryId))
        .orderBy(discotecaEntries.id)
        .limit(limit)
        .offset(offset),
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.subcategoryId, subcategoryId)).then(a => a?.[0]),
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  })

  static getEntryByAppleMusicId = maybeTransaction('getEntryByAppleMusicId', async (client, appleMusicId: string) => {
    return await client.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, appleMusicId)).limit(1).then(a => a?.[0]);
  })

  static getOrCreateArtist = maybeTransaction('getOrCreateArtist', async (client, appleMusicArtistId: string, name: string) => {
    const existing = await client.select().from(discotecaArtists).where(eq(discotecaArtists.appleMusicArtistId, appleMusicArtistId)).limit(1).then(a => a?.[0]);
    if (existing) return existing;

    const musicCategory = await client.select({ id: categories.id }).from(categories).where(eq(categories.name, 'Música')).limit(1).then(a => a?.[0]);

    let cardId: number | undefined;
    if (musicCategory) {
      const matches = await client
        .select({ id: cards.id })
        .from(cards)
        .innerJoin(cardSubcategories, eq(cardSubcategories.cardId, cards.id))
        .innerJoin(subcategories, eq(subcategories.id, cardSubcategories.subcategoryId))
        .where(and(eq(subcategories.categoryId, musicCategory.id), sql`immutable_unaccent(${cards.name}) = immutable_unaccent(${name})`));
      if (matches.length === 1) cardId = matches[0]!.id;
    }

    const inserted = await client
      .insert(discotecaArtists)
      .values({ appleMusicArtistId, name, cardId })
      .onConflictDoNothing({ target: discotecaArtists.appleMusicArtistId })
      .returning()
      .then(a => a?.[0]);
    if (inserted) return inserted;

    // another concurrent call won the insert race - return the row it created
    return await client.select().from(discotecaArtists).where(eq(discotecaArtists.appleMusicArtistId, appleMusicArtistId)).limit(1).then(a => a?.[0]);
  })

  static setArtistCard = maybeTransaction('setArtistCard', async (client, artistId: number, cardId: number | null) => {
    return await client.update(discotecaArtists).set({ cardId }).where(eq(discotecaArtists.id, artistId)).returning().then(a => a?.[0]);
  })

  static getArtist = maybeTransaction('getArtist', async (client, id: number) => {
    return await client.select().from(discotecaArtists).where(eq(discotecaArtists.id, id)).limit(1).then(a => a?.[0]);
  })

  static getUserDiscoteca = maybeTransaction('getUserDiscoteca', async (client, userId: number, entryId: number) => {
    return await client.select().from(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, entryId))).limit(1).then(a => a?.[0]);
  })

  static hasAnyUserDiscoteca = maybeTransaction('hasAnyUserDiscoteca', async (client, userId: number) => {
    return !!(await client.select({ x: sql`1` }).from(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), gt(userDiscoteca.count, 0))).limit(1).then(a => a?.[0]));
  })

  static getArtistWorkCounts = maybeTransaction('getArtistWorkCounts', async (client, userId: number, artistId: number) => {
    const [totalRow, ownedRow] = await Promise.all([
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaEntries).where(eq(discotecaEntries.artistId, artistId)).then(a => a?.[0]),
      client
        .select({ owned: sql<number>`count(*)::int` })
        .from(userDiscoteca)
        .innerJoin(discotecaEntries, eq(discotecaEntries.id, userDiscoteca.entryId))
        .where(and(eq(discotecaEntries.artistId, artistId), eq(userDiscoteca.userId, userId), gt(userDiscoteca.count, 0)))
        .then(a => a?.[0]),
    ]);
    return { owned: ownedRow?.owned ?? 0, total: totalRow?.total ?? 0 };
  })

  static getArtistsPage = maybeTransaction('getArtistsPage', async (client, userId: number, limit: number, offset: number) => {
    const [rows, totalRow] = await Promise.all([
      client
        .select({
          id: discotecaArtists.id,
          name: discotecaArtists.name,
          cardId: discotecaArtists.cardId,
          rarityEmoji: rarities.emoji,
          totalWorks: sql<number>`count(distinct ${discotecaEntries.id})::int`,
          ownedWorks: sql<number>`count(distinct ${userDiscoteca.entryId}) filter (where ${userDiscoteca.count} > 0)::int`,
        })
        .from(discotecaArtists)
        .leftJoin(cards, eq(cards.id, discotecaArtists.cardId))
        .leftJoin(rarities, eq(rarities.id, cards.rarityId))
        .leftJoin(discotecaEntries, eq(discotecaEntries.artistId, discotecaArtists.id))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .groupBy(discotecaArtists.id, rarities.emoji)
        .orderBy(discotecaArtists.id)
        .limit(limit)
        .offset(offset),
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaArtists).then(a => a?.[0]),
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  })

  static searchEntriesByName = maybeTransaction('searchEntriesByName', async (client, query: string, limit: number = 100) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        artistName: discotecaArtists.name,
        type: discotecaEntries.type,
      })
      .from(discotecaEntries)
      .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
      .where(sql`immutable_unaccent(${discotecaEntries.name}) ilike immutable_unaccent(${'%' + query + '%'})`)
      .limit(limit);
  })

  static setEntryGenres = maybeTransaction('setEntryGenres', async (client, entryId: number, subcategoryIds: number[]) => {
    await client.delete(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entryId));
    if (subcategoryIds.length === 0) return;
    await client.insert(discotecaEntrySubcategories).values(subcategoryIds.map(subcategoryId => ({ entryId, subcategoryId })));
  })

  static addUserDiscoteca = maybeTransaction('addUserDiscoteca', async (client, userId: number, entryId: number) => {
    return await client
      .insert(userDiscoteca)
      .values({ userId, entryId })
      .onConflictDoUpdate({
        target: [userDiscoteca.userId, userDiscoteca.entryId],
        set: { count: sql`${userDiscoteca.count} + 1`, updatedAt: sql`now()` },
      })
      .returning({ count: userDiscoteca.count })
      .then(a => a?.[0]?.count);
  })

  static setFavoriteDiscoteca = maybeTransaction('setFavoriteDiscoteca', async (client, userId: number, entryId: number) => {
    await client.update(userProfiles).set({ favoriteDiscotecaId: entryId }).where(eq(userProfiles.userId, userId));
  })

  static cacheAlbumTracks = maybeTransaction('cacheAlbumTracks', async (client, entryId: number, tracks: AlbumTrackData[]) => {
    if (tracks.length === 0) return;
    await client.insert(discotecaAlbumTracks).values(tracks.map(t => ({ entryId, ...t })));
  })

  static getAlbumTracks = maybeTransaction('getAlbumTracks', async (client, entryId: number) => {
    return await client
      .select()
      .from(discotecaAlbumTracks)
      .where(eq(discotecaAlbumTracks.entryId, entryId))
      .orderBy(discotecaAlbumTracks.trackNumber);
  })

  static getPreviewCacheEntry = maybeTransaction('getPreviewCacheEntry', async (client, appleMusicTrackId: string) => {
    return await client
      .select()
      .from(discotecaPreviewCache)
      .where(eq(discotecaPreviewCache.appleMusicTrackId, appleMusicTrackId))
      .limit(1)
      .then(a => a?.[0]);
  })

  static setPreviewCacheEntry = maybeTransaction('setPreviewCacheEntry', async (client, appleMusicTrackId: string, cdnUrl: string) => {
    return await client
      .insert(discotecaPreviewCache)
      .values({ appleMusicTrackId, cdnUrl })
      .onConflictDoUpdate({ target: discotecaPreviewCache.appleMusicTrackId, set: { cdnUrl } })
      .returning()
      .then(a => a?.[0]);
  })
}
