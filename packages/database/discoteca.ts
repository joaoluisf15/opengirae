import { maybeTransaction } from "./decorators";
import {
  discotecaGenres,
  discotecaGenreAliases,
  discotecaSubcategories,
  discotecaEntries,
  discotecaEntrySubcategories,
  discotecaPreviewCache,
  discotecaArtists,
  discotecaAlbumTracks,
  userDiscoteca,
} from "./schemas/discoteca";
import { userProfiles } from "./schemas/users";
import { cards, categories, subcategories, cardSubcategories, rarities } from "./schemas/cards";
import { eq, and, or, sql, gt, isNull, inArray } from "drizzle-orm";

export interface CreateDiscotecaEntryData {
  name: string;
  artistId: number;
  appleMusicId: string;
  type: 'single' | 'album';
  rarityId: number;
  artworkUrl?: string;
  animatedArtworkUrl?: string;
  releaseDate?: Date;
  previewUrl?: string;
  appleMusicUrl?: string;
  albumAppleMusicId?: string;
  albumId?: number;
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

  static setGenreImage = maybeTransaction('setGenreImage', async (client, genreId: number, imageUrl: string) => {
    await client.update(discotecaGenres).set({ imageUrl }).where(eq(discotecaGenres.id, genreId));
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

  static setSubcategoryImage = maybeTransaction('setSubcategoryImage', async (client, subcategoryId: number, imageUrl: string) => {
    await client.update(discotecaSubcategories).set({ imageUrl }).where(eq(discotecaSubcategories.id, subcategoryId));
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

  // one alias covers both variants - it maps to the genre, then isAlbum picks the subcategory
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
        albumId: discotecaEntries.albumId,
        artworkUrl: discotecaEntries.artworkUrl,
        animatedArtworkUrl: discotecaEntries.animatedArtworkUrl,
        previewUrl: discotecaEntries.previewUrl,
        telegramFileId: discotecaEntries.telegramFileId,
        telegramFileUniqueId: discotecaEntries.telegramFileUniqueId,
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
      .select({ id: discotecaGenres.id, name: discotecaGenres.name })
      .from(discotecaEntrySubcategories)
      .innerJoin(discotecaSubcategories, eq(discotecaSubcategories.id, discotecaEntrySubcategories.subcategoryId))
      .innerJoin(discotecaGenres, eq(discotecaGenres.id, discotecaSubcategories.genreId))
      .where(eq(discotecaEntrySubcategories.entryId, entryId))
      .orderBy(discotecaGenres.name);
  })

  static getLinkedSingles = maybeTransaction('getLinkedSingles', async (client, albumId: number, userId: number) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        artistName: discotecaArtists.name,
        categoryEmoji: categories.emoji,
        rarityEmoji: rarities.emoji,
        ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
      })
      .from(discotecaEntries)
      .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
      .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
      .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
      .leftJoin(cards, eq(cards.id, discotecaArtists.cardId))
      .leftJoin(cardSubcategories, and(eq(cardSubcategories.cardId, cards.id), eq(cardSubcategories.isMain, true)))
      .leftJoin(subcategories, eq(subcategories.id, cardSubcategories.subcategoryId))
      .leftJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(discotecaEntries.albumId, albumId), eq(discotecaEntries.type, 'single')))
      .orderBy(rarities.weight, discotecaEntries.name);
  })

  static getEntriesForGenre = maybeTransaction('getEntriesForGenre', async (client, subcategoryId: number, userId: number, limit: number, offset: number, filters: { ownedFilter?: 'owned' | 'missing'; rarityNames?: string[] } = {}) => {
    const ownedCondition = filters.ownedFilter === 'owned' ? gt(userDiscoteca.count, 0)
      : filters.ownedFilter === 'missing' ? isNull(userDiscoteca.count)
      : undefined
    const rarityCondition = filters.rarityNames && filters.rarityNames.length > 0 ? inArray(rarities.name, filters.rarityNames) : undefined
    const filteredWhere = and(eq(discotecaEntrySubcategories.subcategoryId, subcategoryId), ownedCondition, rarityCondition)

    const [rows, totalRow, ownedRow, filteredTotalRow] = await Promise.all([
      client
        .select({
          id: discotecaEntries.id,
          name: discotecaEntries.name,
          type: discotecaEntries.type,
          artistName: discotecaArtists.name,
          categoryEmoji: categories.emoji,
          rarityEmoji: rarities.emoji,
          ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
        })
        .from(discotecaEntrySubcategories)
        .innerJoin(discotecaEntries, eq(discotecaEntries.id, discotecaEntrySubcategories.entryId))
        .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
        .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .leftJoin(cards, eq(cards.id, discotecaArtists.cardId))
        .leftJoin(cardSubcategories, and(eq(cardSubcategories.cardId, cards.id), eq(cardSubcategories.isMain, true)))
        .leftJoin(subcategories, eq(subcategories.id, cardSubcategories.subcategoryId))
        .leftJoin(categories, eq(categories.id, subcategories.categoryId))
        .where(filteredWhere)
        .orderBy(rarities.weight, discotecaEntries.name)
        .limit(limit)
        .offset(offset),
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.subcategoryId, subcategoryId)).then(a => a?.[0]),
      client
        .select({ owned: sql<number>`count(*)::int` })
        .from(discotecaEntrySubcategories)
        .innerJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntrySubcategories.entryId), eq(userDiscoteca.userId, userId), gt(userDiscoteca.count, 0)))
        .where(eq(discotecaEntrySubcategories.subcategoryId, subcategoryId))
        .then(a => a?.[0]),
      client
        .select({ total: sql<number>`count(*)::int` })
        .from(discotecaEntrySubcategories)
        .innerJoin(discotecaEntries, eq(discotecaEntries.id, discotecaEntrySubcategories.entryId))
        .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .where(filteredWhere)
        .then(a => a?.[0]),
    ]);
    return { rows, total: totalRow?.total ?? 0, owned: ownedRow?.owned ?? 0, filteredTotal: filteredTotalRow?.total ?? 0 };
  })

  static getEntriesByType = maybeTransaction('getEntriesByType', async (client, type: 'single' | 'album', userId: number, limit: number, offset: number, filters: { ownedFilter?: 'owned' | 'missing'; rarityNames?: string[] } = {}) => {
    const ownedCondition = filters.ownedFilter === 'owned' ? gt(userDiscoteca.count, 0)
      : filters.ownedFilter === 'missing' ? isNull(userDiscoteca.count)
      : undefined
    const rarityCondition = filters.rarityNames && filters.rarityNames.length > 0 ? inArray(rarities.name, filters.rarityNames) : undefined
    const filteredWhere = and(eq(discotecaEntries.type, type), ownedCondition, rarityCondition)

    const [rows, totalRow, ownedRow, filteredTotalRow] = await Promise.all([
      client
        .select({
          id: discotecaEntries.id,
          name: discotecaEntries.name,
          artistName: discotecaArtists.name,
          categoryEmoji: categories.emoji,
          rarityEmoji: rarities.emoji,
          ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
        })
        .from(discotecaEntries)
        .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
        .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .leftJoin(cards, eq(cards.id, discotecaArtists.cardId))
        .leftJoin(cardSubcategories, and(eq(cardSubcategories.cardId, cards.id), eq(cardSubcategories.isMain, true)))
        .leftJoin(subcategories, eq(subcategories.id, cardSubcategories.subcategoryId))
        .leftJoin(categories, eq(categories.id, subcategories.categoryId))
        .where(filteredWhere)
        .orderBy(rarities.weight, discotecaEntries.name)
        .limit(limit)
        .offset(offset),
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaEntries).where(eq(discotecaEntries.type, type)).then(a => a?.[0]),
      client
        .select({ owned: sql<number>`count(*)::int` })
        .from(userDiscoteca)
        .innerJoin(discotecaEntries, eq(discotecaEntries.id, userDiscoteca.entryId))
        .where(and(eq(discotecaEntries.type, type), eq(userDiscoteca.userId, userId), gt(userDiscoteca.count, 0)))
        .then(a => a?.[0]),
      client
        .select({ total: sql<number>`count(*)::int` })
        .from(discotecaEntries)
        .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
        .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
        .where(filteredWhere)
        .then(a => a?.[0]),
    ]);
    return { rows, total: totalRow?.total ?? 0, owned: ownedRow?.owned ?? 0, filteredTotal: filteredTotalRow?.total ?? 0 };
  })

  static getOverallCounts = maybeTransaction('getOverallCounts', async (client, userId: number) => {
    const [totalRow, ownedRow] = await Promise.all([
      client.select({ total: sql<number>`count(*)::int` }).from(discotecaEntries).then(a => a?.[0]),
      client
        .select({ owned: sql<number>`count(*)::int` })
        .from(userDiscoteca)
        .where(and(eq(userDiscoteca.userId, userId), gt(userDiscoteca.count, 0)))
        .then(a => a?.[0]),
    ]);
    return { total: totalRow?.total ?? 0, owned: ownedRow?.owned ?? 0 };
  })

  static getEntryByAppleMusicId = maybeTransaction('getEntryByAppleMusicId', async (client, appleMusicId: string) => {
    return await client.select().from(discotecaEntries).where(eq(discotecaEntries.appleMusicId, appleMusicId)).limit(1).then(a => a?.[0]);
  })

  static getOrCreateArtist = maybeTransaction('getOrCreateArtist', async (client, appleMusicArtistId: string, name: string) => {
    const existing = await client.select().from(discotecaArtists).where(eq(discotecaArtists.appleMusicArtistId, appleMusicArtistId)).limit(1).then(a => a?.[0]);
    if (existing) return existing;

    // artist cards can be filed under either the general music category or the girasia (idol) one
    const musicCategories = await client.select({ id: categories.id }).from(categories).where(inArray(categories.name, ['Música', 'GIRÁSIA']));

    let cardId: number | undefined;
    if (musicCategories.length > 0) {
      const matches = await client
        .select({ id: cards.id })
        .from(cards)
        .innerJoin(cardSubcategories, eq(cardSubcategories.cardId, cards.id))
        .innerJoin(subcategories, eq(subcategories.id, cardSubcategories.subcategoryId))
        .where(and(inArray(subcategories.categoryId, musicCategories.map(c => c.id)), sql`immutable_unaccent(${cards.name}) = immutable_unaccent(${name})`));
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

  static setArtistCard = maybeTransaction('setArtistCard', async (client, artistId: number, cardId: number | null, cardName?: string) => {
    return await client.update(discotecaArtists).set(cardName ? { cardId, name: cardName } : { cardId }).where(eq(discotecaArtists.id, artistId)).returning().then(a => a?.[0]);
  })

  static getArtist = maybeTransaction('getArtist', async (client, id: number) => {
    return await client.select().from(discotecaArtists).where(eq(discotecaArtists.id, id)).limit(1).then(a => a?.[0]);
  })

  static getArtistByCardId = maybeTransaction('getArtistByCardId', async (client, cardId: number) => {
    return await client.select().from(discotecaArtists).where(eq(discotecaArtists.cardId, cardId)).limit(1).then(a => a?.[0]);
  })

  static setArtistImage = maybeTransaction('setArtistImage', async (client, artistId: number, imageUrl: string) => {
    await client.update(discotecaArtists).set({ imageUrl }).where(eq(discotecaArtists.id, artistId));
  })

  // WHERE expression must match discoteca_artists_name_trgm_idx's expression exactly for the index to be used
  static searchArtistsByName = maybeTransaction('searchArtistsByName', async (client, query: string, limit: number = 100) => {
    return await client
      .select({ id: discotecaArtists.id, name: discotecaArtists.name, cardId: discotecaArtists.cardId })
      .from(discotecaArtists)
      .where(sql`immutable_unaccent(${discotecaArtists.name}) ilike immutable_unaccent(${'%' + query + '%'})`)
      .limit(limit);
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

  static getEntriesForArtist = maybeTransaction('getEntriesForArtist', async (client, artistId: number, userId: number) => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        type: discotecaEntries.type,
        rarityEmoji: rarities.emoji,
        rarityName: rarities.name,
        ownedCount: sql<number>`coalesce(${userDiscoteca.count}, 0)::int`,
      })
      .from(discotecaEntries)
      .innerJoin(rarities, eq(rarities.id, discotecaEntries.rarityId))
      .leftJoin(userDiscoteca, and(eq(userDiscoteca.entryId, discotecaEntries.id), eq(userDiscoteca.userId, userId)))
      .where(eq(discotecaEntries.artistId, artistId))
      .orderBy(discotecaEntries.type, rarities.weight, discotecaEntries.name);
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

  static searchEntriesByName = maybeTransaction('searchEntriesByName', async (client, query: string, limit: number = 100, type?: 'single' | 'album') => {
    return await client
      .select({
        id: discotecaEntries.id,
        name: discotecaEntries.name,
        artistName: discotecaArtists.name,
        type: discotecaEntries.type,
      })
      .from(discotecaEntries)
      .innerJoin(discotecaArtists, eq(discotecaArtists.id, discotecaEntries.artistId))
      .where(and(
        or(
          sql`immutable_unaccent(${discotecaEntries.name}) ilike immutable_unaccent(${'%' + query + '%'})`,
          sql`immutable_unaccent(${discotecaArtists.name}) ilike immutable_unaccent(${'%' + query + '%'})`,
        ),
        type ? eq(discotecaEntries.type, type) : undefined,
      ))
      .limit(limit);
  })

  static findDuplicateEntry = maybeTransaction('findDuplicateEntry', async (client, name: string, artistId: number, type: 'single' | 'album') => {
    return await client
      .select({ id: discotecaEntries.id, name: discotecaEntries.name })
      .from(discotecaEntries)
      .where(and(
        eq(discotecaEntries.artistId, artistId),
        eq(discotecaEntries.type, type),
        sql`immutable_unaccent(lower(${discotecaEntries.name})) = immutable_unaccent(lower(${name}))`,
      ))
      .limit(1)
      .then(a => a?.[0]);
  })

  static getAlbumsByArtist = maybeTransaction('getAlbumsByArtist', async (client, artistId: number) => {
    return await client
      .select({ id: discotecaEntries.id, appleMusicId: discotecaEntries.appleMusicId })
      .from(discotecaEntries)
      .where(and(eq(discotecaEntries.artistId, artistId), eq(discotecaEntries.type, 'album')));
  })

  static getUnlinkedSinglesByArtist = maybeTransaction('getUnlinkedSinglesByArtist', async (client, artistId: number) => {
    return await client
      .select({ id: discotecaEntries.id, name: discotecaEntries.name })
      .from(discotecaEntries)
      .where(and(eq(discotecaEntries.artistId, artistId), eq(discotecaEntries.type, 'single'), isNull(discotecaEntries.albumId)));
  })

  static linkSingleToAlbum = maybeTransaction('linkSingleToAlbum', async (client, entryId: number, albumId: number) => {
    await client.update(discotecaEntries).set({ albumId }).where(eq(discotecaEntries.id, entryId));
  })

  static updateEntry = maybeTransaction('updateEntry', async (client, id: number, data: { name: string; rarityId: number; albumId?: number | null }) => {
    return await client.update(discotecaEntries).set(data).where(eq(discotecaEntries.id, id)).returning().then(a => a?.[0]);
  })

  static cacheAlbumTracks = maybeTransaction('cacheAlbumTracks', async (client, entryId: number, tracks: { trackAppleMusicId: string; name: string }[]) => {
    if (tracks.length === 0) return;
    await client.insert(discotecaAlbumTracks).values(tracks.map(t => ({ entryId, trackAppleMusicId: t.trackAppleMusicId, name: t.name })));
  })

  static findAlbumTrackMatch = maybeTransaction('findAlbumTrackMatch', async (client, artistId: number, trackName: string) => {
    return await client
      .select({ id: discotecaEntries.id, name: discotecaEntries.name })
      .from(discotecaAlbumTracks)
      .innerJoin(discotecaEntries, eq(discotecaEntries.id, discotecaAlbumTracks.entryId))
      .where(and(
        eq(discotecaEntries.artistId, artistId),
        eq(discotecaEntries.type, 'album'),
        sql`lower(trim(${discotecaAlbumTracks.name})) = lower(trim(${trackName}))`,
      ))
      .limit(1)
      .then(a => a?.[0]);
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

  static setFavoriteAlbum = maybeTransaction('setFavoriteAlbum', async (client, userId: number, entryId: number) => {
    await client.update(userProfiles).set({ favoriteDiscotecaAlbumId: entryId }).where(eq(userProfiles.userId, userId));
  })

  static setFavoriteSingle = maybeTransaction('setFavoriteSingle', async (client, userId: number, entryId: number) => {
    await client.update(userProfiles).set({ favoriteDiscotecaSingleId: entryId }).where(eq(userProfiles.userId, userId));
  })

  static getPreviewCacheEntry = maybeTransaction('getPreviewCacheEntry', async (client, appleMusicTrackId: string) => {
    return await client
      .select()
      .from(discotecaPreviewCache)
      .where(eq(discotecaPreviewCache.appleMusicTrackId, appleMusicTrackId))
      .limit(1)
      .then(a => a?.[0]);
  })

  static setPreviewCacheEntry = maybeTransaction('setPreviewCacheEntry', async (client, appleMusicTrackId: string, mediaRef: string) => {
    return await client
      .insert(discotecaPreviewCache)
      .values({ appleMusicTrackId, mediaRef })
      .onConflictDoUpdate({ target: discotecaPreviewCache.appleMusicTrackId, set: { mediaRef } })
      .returning()
      .then(a => a?.[0]);
  })

  static setEntryTelegramFileId = maybeTransaction('setEntryTelegramFileId', async (client, entryId: number, fileId: string, fileUniqueId: string) => {
    await client
      .update(discotecaEntries)
      .set({ telegramFileId: fileId, telegramFileUniqueId: fileUniqueId })
      .where(eq(discotecaEntries.id, entryId));
  })
}
