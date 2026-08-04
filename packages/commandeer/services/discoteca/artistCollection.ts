import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { applyFilters, parseFilterArg, type FilterDef } from '@girae/common/utilities/pageFilters'

export type ArtistEntryRow = Awaited<ReturnType<typeof DiscotecaDB.getEntriesForArtist>>[number]

export const ARTIST_FILTERS: FilterDef<ArtistEntryRow>[] = [
  { id: 'a', emoji: '💽', description: 'que são álbuns', match: e => e.type === 'album' },
  { id: 's', emoji: '🎵', description: 'que são singles', match: e => e.type === 'single' },
  { id: '1', emoji: '☀', description: 'que você possui', match: e => e.ownedCount > 0 },
  { id: '2', emoji: '🌙', description: 'que você não possui', match: e => e.ownedCount === 0 },
  { id: '3', emoji: '🥉', description: 'com raridade comum', match: e => e.rarityName === 'Comum' },
  { id: '4', emoji: '🥈', description: 'com raridade rara', match: e => e.rarityName === 'Raro' },
  { id: '5', emoji: '🥇', description: 'com raridade lendária', match: e => e.rarityName === 'Lendário' },
]

export async function loadArtistCollection(rawArg: string, viewerTelegramId: string, platform: 'telegram' | 'discord') {
  const { active, rest } = parseFilterArg(rawArg)
  const artistId = parseInt(rest, 10)

  const artist = await DiscotecaDB.getArtist(artistId)
  if (!artist) return null

  const viewer = await UsersDB.getUserByPlatformAccount(platform, viewerTelegramId)
  // getArtistWorkCounts already computes owned/total in the DB query - no need to re-derive them from allEntries
  const [allEntries, counts] = await Promise.all([
    DiscotecaDB.getEntriesForArtist(artistId, viewer?.id ?? 0),
    DiscotecaDB.getArtistWorkCounts(viewer?.id ?? 0, artistId),
  ])

  const entries = applyFilters(allEntries, ARTIST_FILTERS, active)

  return { artist, entries, owned: counts.owned, total: counts.total, active, rest }
}
