import { maybeTransaction } from "./decorators";
import {
  discotecaGenres,
  discotecaGenreAliases,
  discotecaEntries,
  discotecaEntryGenres,
  discotecaAlbumTracks,
  discotecaPreviewCache,
  userDiscoteca,
} from "./schemas/discoteca";
import { userProfiles } from "./schemas/users";
import { eq, sql } from "drizzle-orm";

export interface CreateDiscotecaEntryData {
  name: string;
  artistName: string;
  appleMusicId: string;
  type: 'single' | 'album';
  rarityId: number;
  artworkUrl?: string;
  releaseDate?: Date;
  previewUrl?: string;
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
  static createGenre = maybeTransaction('createGenre', async (client, name: string, emoji: string) => {
    return await client.insert(discotecaGenres).values({ name, emoji }).returning().then(a => a?.[0]);
  })

  static getGenreByName = maybeTransaction('getGenreByName', async (client, name: string) => {
    return await client.select().from(discotecaGenres).where(eq(discotecaGenres.name, name)).limit(1).then(a => a?.[0]);
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

  static resolveGenresByAliases = maybeTransaction('resolveGenresByAliases', async (client, rawStrings: string[]) => {
    const resolved: { id: number; name: string }[] = [];
    const unmapped: string[] = [];

    for (const raw of rawStrings) {
      const normalized = raw.trim().toLowerCase();
      const match = await client
        .select({ id: discotecaGenres.id, name: discotecaGenres.name })
        .from(discotecaGenreAliases)
        .innerJoin(discotecaGenres, eq(discotecaGenres.id, discotecaGenreAliases.genreId))
        .where(eq(discotecaGenreAliases.alias, normalized))
        .limit(1)
        .then(a => a?.[0]);

      if (match) resolved.push(match);
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

  static searchEntriesByName = maybeTransaction('searchEntriesByName', async (client, query: string, limit: number = 100) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        artistName: discotecaEntries.artistName,
        type: discotecaEntries.type,
      })
      .from(discotecaEntries)
      .where(sql`immutable_unaccent(${discotecaEntries.name}) ilike immutable_unaccent(${'%' + query + '%'})`)
      .limit(limit);
  })

  static setEntryGenres = maybeTransaction('setEntryGenres', async (client, entryId: number, genreIds: number[]) => {
    await client.delete(discotecaEntryGenres).where(eq(discotecaEntryGenres.entryId, entryId));
    if (genreIds.length === 0) return;
    await client.insert(discotecaEntryGenres).values(genreIds.map(genreId => ({ entryId, genreId })));
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
